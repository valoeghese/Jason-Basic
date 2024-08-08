const MAX_DEPTH = 42;
const KEYWORDS = [
    "PRINT", "INPUT", "TO",
    "GOTO", "IF", "ELSE", "END", "WHILE", "FOR", "IN",
    "RANDOM", "DIM",
    "ROUND", "LOWERCASE", "UPPERCASE", "TONUMBER", "MATCH",
    "REM"];

function exception(lineNum, msg) {
	return "Syntax Error at line " + lineNum + ":\n>> " + msg;
}

function runtimeException(lineNum, msg) {
	return "Exception at line " + lineNum + ":\n>> " + msg;
}

// https://stackoverflow.com/questions/18884249/checking-whether-something-is-iterable
function isIterable(obj) {
    // checks for null and undefined
    if (obj == null) {
        return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
}


// Read a variable target from the tokens
// Either a variable, or an array/string, indexed.
// Parameters
// - lnm = the linenumber of this instruction
// - head = the head token
// - tokens = the remaining tokens
// Returns
// - a function to create a variable assign instruction
//    * arg0: expression [vars => value]. The function to determine what to assign the variable to.
//    * arg1: the dependents of the expression.
async function readVarTarget(lnm, head, tokens, io) {
    // ensure head token is variable
    if (head.type !== "VAR") {
        throw exception(lnm, `Unexpected token '${head.value}'; expected variable target.`);
    }
    
    // detect array target
    if (tokens.length > 0 && tokens[0].type === "OPERATOR" && tokens[0].value === "(") {
        tokens.shift(); // consume the '('

        // Element Assignment
        const ixDependents = new Set();
        let indexExpression = await compileExpression(lnm, tokens, io, ixDependents, 1 /* consume matching closing bracket */);

        return (expression, dependents) => {
            const allDependents = new Set([...dependents, ...ixDependents]);

            return [
                assertVariablesExist(lnm, allDependents),
                {"type": "ASSIGN_ELEMENT", "line": lnm, "var": head.value, "index": indexExpression, "expression": expression}
            ];
        };
    }
    // variable target
    else {
        return (expression, dependents) =>
            [
                assertVariablesExist(lnm, dependents),
                {"type": "VAR", "line": lnm, "var": head.value, "expression": expression}
            ];
    }
}

// Parameters
// - lnm = the line number of this instruction
// - tokens = the tokens to parse
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instructions for this line
async function decode(lnm, tokens, globals, io) {
	// initialise globals if first time
	if (globals.blockstack == undefined) globals.blockstack = []; // if/while/for stack
	if (globals.ifid == undefined) globals.ifid = 0; // free if id tracker, for sections. To ensure unique names.
	if (globals.whileid == undefined) globals.whileid = 0; // free while id tracker, for sections. To ensure unique names.
	if (globals.forid == undefined) globals.forid = 0; // free for id tracker, for sections. To ensure unique names.

	let head = tokens.shift(); // remove first token
    
    if (head.type === "VAR") {
        // Target
        const assignFactory = await readVarTarget(lnm, head, tokens, io);

        // next should be =
        if (tokens.length === 0) throw exception(lnm, `Unexpected token '${head.value}'. Did you mean to assign a variable?`);

        // variable assignment. expect '='
        let operation = tokens.shift();

        if (operation.type !== "OPERATOR" || operation.value !== "=") {
            throw exception(lnm, `Unexpected token '${operation.value}'. Expected '='.`);
        }

        // Compile expression
        const dependents = new Set();
        const expression = await compileExpression(lnm, tokens, io, dependents);
        return assignFactory(expression, dependents);
    }
    else if (head.type === "KEYWORD") {
        // Instructions are case sensitive
        switch (head.value) {
            case "PRINT":
                if (tokens.length === 0) throw exception(lnm, "PRINT requires an operand but none given!");
                return await simpleExpression(lnm, "PRINT", tokens, io);
            case "RANDOM":
                //console.log(expression);
                if (tokens.length === 0) throw exception(lnm, "RANDOM requires a variable but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! RANDOM requires exactly one variable and no other operands.");
                
                if (tokens[0].type === "VAR") {
                    return [{"type": "VAR", "line": lnm, "var": tokens[0].value, "expression": vars => Math.random()}];
                }
                else {
                    throw exception(lnm, "Invalid variable name to store RANDOM value in.")
                }
            case "ROUND":
                if (tokens.length === 0) throw exception(lnm, "ROUND requires a variable but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! ROUND requires exactly one variable and no other operands.");

                if (tokens[0].type === "VAR") {
                    return [{"type": "VAR", "line": lnm, "var": tokens[0].value, "expression": vars => Math.round(vars[tokens[0].value])}];
                }
                else {
                    throw exception(lnm, "Invalid variable name to perform ROUND operation on.")
                }
            case "LOWERCASE":
                if (tokens.length === 0) throw exception(lnm, "LOWERCASE requires a variable but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! LOWERCASE requires exactly one variable and no other operands.");

                if (tokens[0].type === "VAR") {
                    return [{"type": "VAR", "line": lnm, "var": tokens[0].value, "expression": vars => vars[tokens[0].value].toString().toLowerCase()}];
                }
                else {
                    throw exception(lnm, "Invalid variable name to perform LOWERCASE operation on.")
                }
            case "UPPERCASE":
                if (tokens.length === 0) throw exception(lnm, "UPPERCASE requires a variable but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! UPPERCASE requires exactly one variable and no other operands.");

                if (tokens[0].type === "VAR") {
                    return [{"type": "VAR", "line": lnm, "var": tokens[0].value, "expression": vars => vars[tokens[0].value].toString().toUpperCase()}];
                }
                else {
                    throw exception(lnm, "Invalid variable name to perform UPPERCASE operation on.")
                }
            case "TONUMBER":
                if (tokens.length === 0) throw exception(lnm, "TONUMBER requires a variable but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! TONUMBER requires exactly one variable and no other operands.");

                if (tokens[0].type === "VAR") {
                    return [{"type": "VAR", "line": lnm, "var": tokens[0].value, "expression": vars => {
                        let val = vars[tokens[0].value];
                        try {
                            return parseFloat(val);
                        } catch (e) {
                            throw runtimeException(lnm, "Not a number: " + val);
                        }
                    }}];
                }
                else {
                    throw exception(lnm, "Invalid variable name to perform TONUMBER operation on.")
                }
                // TODO regex MATCH
            case "DIM": {
                if (tokens.length < 2) throw exception(lnm, "DIM requires a variable name and a size expression.");
                
                // get variable name and ensure it is a variable name
                let arrayVarToken = tokens.shift(); // pop variable name off the tokens array

                if (arrayVarToken.type !== "VAR")
                    throw exception(lnm, `Not a variable name: ${arrayVarToken.value}`);

                const dependents = new Set();
                let expressionCalculator = await compileExpression(lnm, tokens, io, dependents);

                return [assertVariablesExist(lnm, dependents), {"type": "VAR", "line": lnm, "var": arrayVarToken.value, "expression": vars => {
                    let size = expressionCalculator(vars);

                    if (size < 0) {
                        throw runtimeException(lnm, `Invalid array size: ${size}`);
                    } else if (size > 100) {
                        throw runtimeException(lnm, `Exceeds maximum array size (100): ${size}`);
                    }

                    let new_array = new Array(size);
                    new_array.fill(0); // default values of 0

                    Object.seal(new_array); // no more properties

                    return new_array;
                }}];
            }
            case "INPUT":
                if (tokens.length === 0) throw exception(lnm, "INPUT requires an operand but none given!");

                let toIndex = -1;

                for (let i = 0; i < tokens.length; i++) {
                    let token = tokens[i];

                    if (token.type == "KEYWORD" && token.value == "TO") {
                        toIndex = i;
                        break;
                    }
                }

                if (toIndex == -1) {
                    return await simpleExpression(lnm, "INPUT_DISCARD", tokens, io);
                };

                let spliced = tokens.splice(0, toIndex);
                //console.log(spliced);

                const dependents = new Set();
                let compiledExpression = await compileExpression(lnm, spliced, io, dependents); // splice the expression to compile out

                // remainder should be "TO" + variable
                if (tokens.length != 2) {
                    throw exception(lnm, "Incorrect number of operands after INPUT ... TO. Must have exactly ONE variable to store in.")
                }

                let variable = tokens[1];

                if (variable.type != "VAR") throw exception(lnm, "Operand after INPUT ... TO is not a valid variable name!");

                return [{"type": "INPUT", "line": lnm, "expression": compiledExpression, "var": variable.value}];
            case "GOTO":
                if (tokens.length === 0) throw exception(lnm, "GOTO requires a label but none given!");
                if (tokens.length > 1) {
                    // dynamic jump

                    // compile tokens to expression and use as jump target
                    return await simpleExpression(lnm, "JUMP_DYNAMIC", tokens, io);
                } else {
                    // static jump
                    let label = tokens[0];

                    if (label.type !== "VAR") throw exception(lnm, `Not a valid label identifier: ${label.value}`);

                    return [{"type": "JUMP", "line": lnm, "label": label.value}];
                }
            case "IF":
                if (tokens.length === 0) throw exception(lnm, "IF requires an operand but none given!");

                const ifTokens = await simpleExpression(lnm, "JUMP_IFN", tokens, io);
                const ifJmp = ifTokens[SIMPLE_EXPR_INSTRUCTION_INDEX];
                ifJmp.block = "IF";
                ifJmp.label = "@IF" + (globals.ifid++); // set to current and increment to next free one. @ for synthetic sections as it's an invalid label character

                globals.blockstack.push(ifJmp); // push this onto the block stack
                return ifTokens;
            case "WHILE":
                if (tokens.length === 0) throw exception(lnm, "WHILE requires an operand but none given!");

                const whileTokens = await simpleExpression(lnm, "JUMP_IFN", tokens, io);
                const whileJmp = whileTokens[SIMPLE_EXPR_INSTRUCTION_INDEX];
                whileJmp.block = "WHILE";
                whileJmp.whileid = globals.whileid++; // next one
                whileJmp.label = "@WHILE_END" + whileJmp.whileid; // jump to here if false

                globals.blockstack.push(whileJmp); // push this onto the block stack
                return [{"type": "LABEL", "line": lnm, "label": "@WHILE_START" + whileJmp.whileid}, ...whileTokens];
            case "FOR":
                if (tokens.length !== 3) throw exception(lnm, "FOR requires four operands: FOR iter IN array");

                // read tokens
                let iterator = tokens[0];
                if (iterator.type != "VAR") throw exception(lnm, "FOR iterator variable is not a valid variable name!");

                // read IN
                let token_in = tokens[1];
                if (token_in.type !== "KEYWORD" || token_in.value !== "IN") throw exception(lnm, "Invalid FOR syntax. Valid syntax: FOR iter IN array");

                // read array
                let iterated = tokens[2];
                if (iterated.type != "VAR") throw exception(lnm, "FOR array variable is not a valid variable name!");

                // numerical iterator name
                const forId = globals.forId++;
                let forIterVarName = `@FOR_I${forId}`;
                
                // create jump
                const forJmp = {"type": "JUMP_IFN", "line": lnm, "expression": vars => vars[forIterVarName] < vars[iterated.value].length};
                forJmp.block = "FOR";
                forJmp.forId = forId; // next one
                forJmp.label = "@FOR_END" + forId; // jump to here if false

                globals.blockstack.push(forJmp); // push this onto the block stack

                // 5 instructions: iterator initialisation, start label, array verification, conditional jump to end, and element-iterator assign

                return [
                    // pre-loop
                    {"type": "VAR", "line": lnm, "var": forIterVarName, "expression": vars => 0},
                    {"type": "LABEL", "line": lnm, "label": `@FOR_START${forId}`},
                    // loop start
                    {"type": "ASSERT", "line": lnm, "expression": vars => {
                        if (vars[iterated.value] == null) {
                            throw runtimeException(lnm, `Variable ${iterated.value} is not defined!`);
                        }
                        if (!isIterable(vars[iterated.value])) {
                            throw runtimeException(lnm, `Variable ${iterated.value} is not iterable!`);
                        }
                    }},
                    forJmp,
                    {"type": "VAR", "line": lnm, "var": iterator.value, "expression": vars => vars[iterated.value][vars[forIterVarName]]}
                ];
            case "ELSE":
                if (tokens.length === 0) {
                    if (globals.blockstack.length == 0) {
                        throw exception(lnm, "ELSE with no matching IF!");
                    }
                    
                    // ensure ELSE matches an IF
                    let ifToElse = globals.blockstack.pop();

                    if (ifToElse.block !== "IF") {
                        throw exception(lnm, `ELSE can only be used with a matching IF (found ${blockType})`);
                    }

                    // switchemeroo
                    // pop the if statement and set its label target to here, and place this one on the if stack here as a JUMP
                    // make sure to put the JUMP before the else label as if jumps before it reaches else label
                    
                    let elseJmp = {"type": "JUMP", "line": lnm, "label": "ELSE" + ifToElse.label}; // see comment above and/or comments on return for more detail
                    elseJmp.block = "IF"; // yessir this is indeed an if
                    globals.blockstack.push(elseJmp); // push else as an imposter onto the if stack (sus)

                    return [
                        elseJmp, // eg if the if is @IF1, the matching else is ELSE@IF1. This jumps away from else execution
                        {"type": "LABEL", "line": lnm, "label": ifToElse.label} // the if statement's jump for if false, aka this is where to start else execution
                    ];
                }
                else {
                    throw exception(lnm, "ELSE does not take any operands!");
                }
            case "END":
                // end on its own is a termination instruction
                if (tokens.length === 0) {
                    return [{"type": "TERMINATE", "line": lnm}];
                }

                let target = tokens.shift(); // remove next token as the target of END

                if (target.type !== "KEYWORD" || (target.value !== "IF" && target.value !== "WHILE" && target.value !== "FOR")) {
                    throw exception(lnm, `Unexpected token ${target.value} of type ${target.type} after END. Only IF, FOR and WHILE are allowed.`);
                }

                if (tokens.length > 0) {
                    throw exception(lnm, `Unexpected tokens after END ${target.value}`);
                }

                switch (target.value) {
                    case "IF":
                        // cannot end if if there's no if
                        if (globals.blockstack.length == 0) {
                            throw exception(lnm, "Ending if when there's no matching IF to end!");
                        }

                        let ifToEnd = globals.blockstack.pop();
                        if (ifToEnd.block != "IF") throw exception(lnm, "Current block being ended is not an IF block!");

                        // create label to jump to for 'else'. If the if has an else block we've done earlier the hack of replacing the item on the if stack with an else jump after setting the real if to the else. Little switchermeroo.
                        return [{"type": "LABEL", "line": lnm, "label": ifToEnd.label}]; // the jump target for an if ending with an else, or an if with no else
                    case "WHILE":
                        // cannot end while if there's no while
                        if (globals.blockstack.length == 0) {
                            throw exception(lnm, "Ending while when there's no matching WHILE to end!");
                        }

                        let whileToEnd = globals.blockstack.pop();
                        if (whileToEnd.block != "WHILE") throw exception(lnm, "Current block being ended is not a WHILE block!");
                        
                        // create the GOTO to loop to the top, and a label to jump to for when the condition is false
                        return [
                            {"type": "JUMP", "line": lnm, "label": "@WHILE_START" + whileToEnd.whileid},
                            {"type": "LABEL", "line": lnm, "label": whileToEnd.label}
                        ];
                    case "FOR":
                        // cannot end for if there's no for
                        if (globals.blockstack.length == 0) {
                            throw exception(lnm, "Ending for when there's no matching FOR to end!");
                        }

                        let forToEnd = globals.blockstack.pop();
                        if (forToEnd.block != "FOR") throw exception(lnm, "Current block being ended is not a FOR block!");
                        
                        // create the increment, the GOTO to loop to the top, and a label to jump to when the condition is false
                        const forI = `@FOR_I${forToEnd.forId}`;

                        return [
                            {"type": "VAR", "line": lnm, "var": forI, "expression": vars => vars[forI] + 1},
                            {"type": "JUMP", "line": lnm, "label": "@FOR_START" + forToEnd.forId},
                            {"type": "LABEL", "line": lnm, "label": forToEnd.label}
                        ];
                    default:
                        throw exception(lnm, "This should be unreachable. Contact @Valoeghese if you see this.");
                }
            default: // catch-all
                throw exception(lnm, "Unable to parse line starting with token \""  + `${head.value} (${head.type.toLowerCase()})` + "\"" + "... is this correct syntax for DJ BASIC?");
        }
    } else {
        throw exception(lnm, `Unable to parse instruction with head token ${head}`);
    }
}

// Expression translator to js

// these functions are called by the translated javascript expression in the eval
function accessArray(lnm, arrayName, array, index) {
	if (index < array.length && index >= 0) {
		return array[index];
	} else {
		throw runtimeException(lnm, `Attempt to access array index out of bounds: ${index} (array ${arrayName} of length: ${array.length})`);
	}
}

// lnm: line number
// tokens: an array of the tokens to parse. tokens should be popped from the beginning
// io: access to io
// dependents: a set to store variables that need to exist
// depth: the depth of the expression (in brackets.)
function compileExpressionComponent(lnm, tokens, io, dependents, depth = 0) {
	// max depth
	if (depth > MAX_DEPTH) {
		throw runtimeException(lnm, "Exceeded max bracket depth! (42)");
	}

	let jsExpression = "";

	while (tokens.length > 0) {
		// get first element of the array and remove it.
		let token = tokens.shift();

		// keywords that are allowed inline must be handled before expression translation
		if (token.type == "KEYWORD") {
			throw exception(lnm, "Unexpected keyword \"" + token.value + '"');
		}
		else if (token.type == "OPERATOR") {
			if (token.value.length == 1 && /[\&\|\=]/.test(token.value)) {
				jsExpression += token.value + token.value;
			} else if (token.value === '(') {
				// increase depth
				jsExpression += '(' + compileExpressionComponent(lnm, tokens, io, dependents, depth + 1) + ')';
			} else if (token.value === ')') {
                // if at root depth, unmatched )!
                if (depth === 0) {
                    throw exception(lnm, "Unmatched closing bracket");
                }

				// decrease depth
				return jsExpression; // READERS NOTE EARLY RETURN HERE!!
			} else {
				jsExpression += token.value;
			}
		}
		else if (token.type == "STRING") {
			jsExpression += '"' + token.value + '"';
		}
		else if (token.type == "VAR") {
            dependents.add(token.value); // dependent variable.
			let varAccess = "vars[\"" + token.value + "\"]";

			// check token after in case it's indexing array '('
			if (tokens.length > 0 && tokens[0].type === "OPERATOR" && tokens[0].value === '(') {
				tokens.shift(); // consume the bracket to enter this array indexing state
				
				let indexExpression = compileExpressionComponent(lnm, tokens, io, dependents, depth + 1);
				varAccess = `accessArray(${lnm}, "${token.value}", ${varAccess}, ${indexExpression})`;
			}

			jsExpression += varAccess;
		}
		else if (token.type == "NUMBER") {
			jsExpression += token.value;
		}

		jsExpression += " ";
	}

	// this should only be reached at depth 0. other depths should decrease depth at )
	if (depth !== 0) {
		//console.log(tokens);
		//console.log(jsExpression);
		throw exception(lnm, `Unmatched bracket on line! Expected ')' (Depth: ${depth})`);
	}

	return jsExpression;
}

// what are you talking about, unsafely using eval? who could ever
// returns the expression to evaluate as a javascript function, transformed from the input
// dont do this
// we must be careful to not let people break the sandbox
async function compileExpression(lnm, tokens, io, dependents, depth = 0) {
	let jsExpression = "vars => " + compileExpressionComponent(lnm, tokens, io, dependents, depth);

	try{
		//console.log(jsExpression);
		return eval(jsExpression);
	}
	catch (e) {
		await io.error("Translator Error on line " + lnm);
		await io.error(">> CONTEXT: Translating DJ/BASIC tokens " + JSON.stringify(tokens) + " to JavaScript Expression as " + jsExpression);
		await io.error("Caused By: ");
		throw e;
	}
}

// common operations

function assertVariablesExist(lnm, dependents) {
    return {"type": "ASSERT", "line": lnm, "expression": vars => {
        for (const dependent of dependents) {
            if (vars[dependent] === undefined) {
                throw runtimeException(lnm, `Undefined variable ${dependent}`);
            }
        }
    }};
}

const SIMPLE_EXPR_INSTRUCTION_INDEX = 1;

async function simpleExpression(lnm, type, tokens, io) {
    const dependents = new Set();
    const expression = await compileExpression(lnm, tokens, io, dependents);
	return [
        assertVariablesExist(lnm, dependents),
        {"type": type, "line": lnm, "expression": expression}
    ];
}

// define module exports

module.exports = {
    decode,
    KEYWORDS
};
