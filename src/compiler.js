const MAX_DEPTH = 42;
const KEYWORDS = [
    "PRINT", "INPUT", "TO",
    "GOTO", "IF", "ELSE", "END", "WHILE", "FOR", "IN",
    "RANDOM", "DIM",
    "ROUND", "FLOOR", "SQRT",
    "SIN", "SINH", "ASIN", "COS", "COSH", "ACOS", "TAN", "ATAN",
    "LOWERCASE", "UPPERCASE", "TONUMBER", "MATCH",
    "REM", 
    "DEFINE", "EXPAND"];

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
// - variable = the variable to which to write
// - indexExpression = the index expression. null if it was a variable
// - ixDependents = the index expression dependents. null if it was a variable
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
        ixDependents.add(head.value); // the array should already exist
        let indexExpression = await compileExpression(lnm, tokens, io, ixDependents, 1 /* consume matching closing bracket */);

        return [head.value, indexExpression, ixDependents];
    }
    // variable target
    else {
        return [head.value, null, null];
    }
}

// Read a variable target from the tokens
// Either a variable, or an array/string, indexed.
// Parameters
// - lnm = the linenumber of this instruction
// - variable = the variable to assign
// - indexExpression = the expression to access the index, or null if assigning a variable
// Returns
// - a function to create a variable assign instruction
//    * arg0: expression [vars => value]. The function to determine what to assign the variable to.
//    * arg1: the dependents of the expression.
function assignVarTarget(lnm, variable, indexExpression) {
    if (indexExpression === null) {
        return (expression, dependents) =>
            [
                assertVariablesExist(lnm, dependents),
                {"type": "VAR", "line": lnm, "var": variable, "expression": expression}
            ];
    } else {
        return (expression, dependents) =>
            [
                assertVariablesExist(lnm, dependents),
                {"type": "ASSIGN_ELEMENT", "line": lnm, "var": variable, "index": indexExpression, "expression": expression}
            ];
    }
}

// Parameters
// - lnm = the line number of this instruction
// - tokens = the tokens to parse
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instructions for this line or a string of extra lines to parse
async function decode(lnm, tokens, globals, io) {
	// initialise globals if first time
	if (globals.blockstack == undefined) globals.blockstack = []; // if/while/for stack
	if (globals.ifid == undefined) globals.ifid = 0; // free if id tracker, for sections. To ensure unique names.
	if (globals.whileid == undefined) globals.whileid = 0; // free while id tracker, for sections. To ensure unique names.
	if (globals.forid == undefined) globals.forid = 0; // free for id tracker, for sections. To ensure unique names.
	if (globals.defines == undefined) globals.defines = {}; // For preproccesor macros

	let head = tokens.shift(); // remove first token
    
    if (head.type === "VAR") {
        // Target
        const [variable, indexExpression, ixDependents] = await readVarTarget(lnm, head, tokens, io);

        // next should be =
        if (tokens.length === 0) throw exception(lnm, `Unexpected token '${head.value}'. Did you mean to assign a variable?`);

        // variable assignment. expect '='
        let operation = tokens.shift();

        if (operation.type !== "OPERATOR" || operation.value !== "=") {
            throw exception(lnm, `Unexpected token '${operation.value}'. Expected '='.`);
        }

        // Compile expression
        const dependents = ixDependents ?? new Set();
        const expression = await compileExpression(lnm, tokens, io, dependents);

        const assignFactory = assignVarTarget(lnm, variable, indexExpression);
        return assignFactory(expression, dependents);
    }
    else if (head.type === "KEYWORD") {
        // Instructions are case sensitive
        switch (head.value) {
            case "PRINT":
                if (tokens.length === 0) throw exception(lnm, "PRINT requires an operand but none given!");
                return await simpleExpression(lnm, "PRINT", tokens, io);
            case "RANDOM":
                return await transformExpression(lnm, "RANDOM", tokens, io, old => Math.random());
            case "ROUND":
                return await transformExpression(lnm, "ROUND", tokens, io, old => Math.round(old));
            case "FLOOR":
                return await transformExpression(lnm, "FLOOR", tokens, io, old => Math.floor(old));
            case "SQRT":
                return await transformExpression(lnm, "SQRT", tokens, io, old => Math.sqrt(old));
            case "SIN":
                return await transformExpression(lnm, "SIN", tokens, io, old => Math.sin(old));
            case "SINH":
                return await transformExpression(lnm, "SINH", tokens, io, old => Math.sinh(old));
            case "ASIN":
                return await transformExpression(lnm, "ASIN", tokens, io, old => Math.asin(old));
            case "COS":
                return await transformExpression(lnm, "COS", tokens, io, old => Math.cos(old));
            case "COSH":
                return await transformExpression(lnm, "COSH", tokens, io, old => Math.cosh(old));
            case "ACOS":
                return await transformExpression(lnm, "ACOS", tokens, io, old => Math.acos(old));
            case "TAN":
                return await transformExpression(lnm, "TAN", tokens, io, old => Math.tan(old));
            case "ATAN":
                return await transformExpression(lnm, "ATAN", tokens, io, old => Math.atan(old));
            case "LOWERCASE":
                return await transformExpression(lnm, "LOWERCASE", tokens, io, old => old.toString().toLowerCase());
            case "UPPERCASE":
                return await transformExpression(lnm, "UPPERCASE", tokens, io, old => old.toString().toUpperCase());
            case "TONUMBER":
                return await transformExpression(lnm, "TONUMBER", tokens, io, old => parseFloat(old));
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
            case "INPUT": {
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

                let printExpression = tokens.splice(0, toIndex);
                
                // remainder should be "TO" + variable
                // remove TO token
                tokens.shift();

                // Target
                let [variable, indexExpression, dependents] = await readVarTarget(lnm, tokens.shift(), tokens, io);

                // Should have no more arguments
                if (tokens.length > 0) {
                    throw exception(lnm, `Too many operands! INPUT requires exactly one target and no other operands.`);
                }

                if (!dependents) dependents = new Set();
                let compiledExpression = await compileExpression(lnm, printExpression, io, dependents); // splice the expression to compile out

                let inputToken = {"type": "INPUT", "line": lnm, "expression": compiledExpression, "var": variable, "index": indexExpression};

                return [
                    assertVariablesExist(lnm, dependents),
                    inputToken
                ];
            } case "GOTO":
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
                const forId = globals.forid++;
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
            case "DEFINE":
                // DEFINE is a bit special since its a preproccesor and not real code
                if (tokens.length !== 2) {
                    throw exception(lnm, "DEFINE not of form DEFINE name evaulation!");
                }
                if (tokens[0].type !== "VAR") {
                    throw exception(lnm, "DEFINE name is not a name!");
                }
                if (tokens[1].type !== "STRING") {
                    throw exception(lnm, "DEFINE value is not a string!");
                }
                globals.defines[tokens[0].value] = tokens[1].value;
                globals.defines["hi"] = "hello";
                return [];
            case "EXPAND":
                if (tokens.length === 0) {
                    throw exception(lnm, "EXPAND doesn't have define name to expand!");
                }
                name = tokens[0].value;
                define = globals.defines[name];
                args = [];
                if (tokens.length > 1) {
                    for (var i = 1; i < tokens.length; i++) {
                        define = define.replaceAll("{{" + i + "}}", tokens[i].value);
                    }
                }
                return define;
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
			} else if (token.value === "/=") {
                jsExpression += "!==";
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

// transformExpression
// lnm = the line number
// name = the name of the operation, for debug messages
// tokens = the tokens after the initial operation
// 
async function transformExpression(lnm, name, tokens, io, transform) {
    if (tokens.length === 0) throw exception(lnm, name + " requires a variable but none given!");
                
    // need var to start. readVarTarget already checks that
    const [variable, indexExpression, ixDependents] = await readVarTarget(lnm, tokens.shift(), tokens, io);

    if (tokens.length > 0) { // tokens should be consumed
        throw exception(lnm, `Too many operands! ${name} requires exactly one target and no other operands.`);
    }

    const assignFactory = assignVarTarget(lnm, variable, indexExpression);
    
    if (indexExpression) {
        return assignFactory(vars => transform(vars[variable][indexExpression(vars)]), ixDependents);
    } else {
        return assignFactory(vars => transform(vars[variable]), new Set());
    }
}

// define module exports

module.exports = {
    decode,
    KEYWORDS
};
