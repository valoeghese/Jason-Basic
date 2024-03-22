const MAX_DEPTH = 42;
const KEYWORDS = ["PRINT", "INPUT", "TO", "GOTO", "IF", "ELSE", "END", "RANDOM", "ROUND", "LOWERCASE", "UPPERCASE", "DIM", "WHILE", "REM"];

function exception(lineNum, msg) {
	return "Syntax Error at line " + lineNum + ":\n>> " + msg;
}

function runtimeException(lineNum, msg) {
	return "Exception at line " + lineNum + ":\n>> " + msg;
}

// Parameters
// - lnm = the line number of this instruction
// - tokens = the tokens to parse
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instruction for this line
async function decode(lnm, tokens, globals, io) {
	// initialise globals if first time
	if (globals.blockstack == undefined) globals.blockstack = []; // if stack
	if (globals.ifid == undefined) globals.ifid = 0; // free if id tracker, for sections. To ensure unique names.
	if (globals.whileid == undefined) globals.whileid = 0; // free while id tracker, for sections. To ensure unique names.

	let head = tokens.shift(); // remove first token
    
    if (head.type === "VAR") {
        if (tokens.length === 0) throw exception(lnm, `Unexpected token '${head.value}'. Did you mean to assign a variable?`);
        
        // variable assignment
        let operation = tokens.shift();

        if (operation.type !== "OPERATOR") {
            throw exception(lnm, `Unexpected token '${operation.value}'.`);
        }

        if (operation.value === "=") {
            // Regular variable assignment
            return await assignVariable(lnm, head.value, tokens, io);
        } else if (operation.value === "(") {
            // Element Assignment
            let indexExpression = await compileExpression(lnm, tokens, io, 1);

            // tokens should be at the closing bracket, next is =
            if (tokens.length === 0) throw exception(lnm, "Expected '=' for element assignment.");
            
            operation = tokens.shift();

            if (operation.type === "OPERATOR" && operation.value === '=') {
                return [{"type": "ASSIGN_ELEMENT", "line": lnm, "var": head.value, "index": indexExpression, "expression": await compileExpression(lnm, tokens, io)}];
            }
            else {
                throw exception(lnm, `Unexpected token '${operation.value}'.`);
            }
        } else {
            throw exception(lnm, `Unexpected token '${operation.value}'.`);
        }
    }
    else if (head.type === "KEYWORD") {
        // Instructions are case sensitive
        switch (head.value) {
            case "PRINT":
                if (tokens.length === 0) throw exception(lnm, "PRINT requires an operand but none given!");
                return [await simpleExpression(lnm, "PRINT", tokens, io)];
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
            case "DIM":
                if (tokens.length < 2) throw exception(lnm, "DIM requires a variable name and a size expression.");
                
                // get variable name and ensure it is a variable name
                let arrayVarToken = tokens.shift(); // pop variable name off the tokens array

                if (arrayVarToken.type !== "VAR")
                    throw exception(lnm, `Not a variable name: ${arrayVarToken.value}`);

                let expressionCalculator = await compileExpression(lnm, tokens, io);

                return [{"type": "VAR", "line": lnm, "var": arrayVarToken.value, "expression": vars => {
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
                break;
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

                if (toIndex == -1) return [{"type": "INPUT_DISCARD", "line": lnm, "expression": await compileExpression(lnm, tokens, io)}];

                let spliced = tokens.splice(0, toIndex);
                //console.log(spliced);
                let compiledExpression = await compileExpression(lnm, spliced, io); // splice the expression to compile out

                // remainder should be "TO" + variable
                if (tokens.length != 2) {
                    throw exception(lnm, "Incorrect number of operands after INPUT ... TO. Must have exactly ONE variable to store in.")
                }

                let variable = tokens[1];

                if (variable.type != "VAR") throw exception(lnm, "Operand after INPUT ... TO is not a valid variable name!");

                return [{"type": "INPUT", "line": lnm, "expression": compiledExpression, "var": variable.value}];
            case "GOTO":
                if (tokens.length === 0) throw exception(lnm, "GOTO requires a label but none given!");
                if (tokens.length > 1) throw exception(lnm, "Too many operands! GOTO requires exactly one label and no other operands.");
                
                let label = tokens[0];

                if (label.type !== "VAR") throw exception(lnm, `Not a valid label identifier: ${label.value}`);

                return [{"type": "JUMP", "line": lnm, "label": label.value}];
            case "IF":
                if (tokens.length === 0) throw exception(lnm, "IF requires an operand but none given!");

                ifJmp = await simpleExpression(lnm, "JUMP_IFN", tokens, io);
                ifJmp.block = "IF";
                ifJmp.label = "@IF" + (globals.ifid++); // set to current and increment to next free one. @ for synthetic sections as it's an invalid label character

                globals.blockstack.push(ifJmp); // push this onto the block stack
                return [ifJmp];
            case "WHILE":
                if (tokens.length === 0) throw exception(lnm, "WHILE requires an operand but none given!");

                whileJmp = await simpleExpression(lnm, "JUMP_IFN", tokens, io);
                whileJmp.block = "WHILE";
                whileJmp.whileid = globals.whileid++; // next one
                whileJmp.label = "@WHILE_END" + whileJmp.whileid; // jump to here if false

                globals.blockstack.push(whileJmp); // push this onto the block stack
                return [{"type": "LABEL", "line": lnm, "label": "@WHILE_START" + whileJmp.whileid}, whileJmp];
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

                if (target.type !== "KEYWORD" || (target.value !== "IF" && target.value !== "WHILE")) {
                    throw exception(lnm, `Unexpected token ${target.value} of type ${target.type} after END. Only IF and WHILE are allowed.`);
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
                    default:
                        throw exception(lnm, "This should be unreachable. Contact @Valoeghese if you see this.");
                }
            default: // catch-all
                throw exception(lnm, "Unable to parse line \"" + instruction + "\" (with assumed instruction of \"" + splitInstr[0] + "\")... is this correct syntax for DJ BASIC?");
        }
    } else {
        throw exception(lnm, `Unable to parse instruction with head token ${head}`);
    }
}

// Expression translator to js

// these functions are called by the translated javascript expression in the eval
function accessArray(lnm, arrayName, array, index) {
	console.log("Accessing array " + arrayName);
	
	if (index < array.length && index >= 0) {
		return array[index];
	} else {
		throw runtimeException(lnm, `Attempt to access array index out of bounds: ${index} (array ${arrayName} of length: ${array.length})`);
	}
}

// lnm: line number
// tokens: an array of the tokens to parse. tokens should be popped from the beginning
// io: access to io
// depth: the depth of the expression (in brackets.)
function compileExpressionComponent(lnm, tokens, io, depth = 0) {
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
				jsExpression += '(' + compileExpressionComponent(lnm, tokens, io, depth + 1) + ')';
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
			let varAccess = "vars[\"" + token.value + "\"]";

			// check token after in case it's indexing array '('
			if (tokens.length > 0 && tokens[0].type === "OPERATOR" && tokens[0].value === '(') {
				tokens.shift(); // consume the bracket to enter this array indexing state
				
				let indexExpression = compileExpressionComponent(lnm, tokens, io, depth + 1);
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
async function compileExpression(lnm, tokens, io, depth = 0) {
	let jsExpression = "vars => " + compileExpressionComponent(lnm, tokens, io, depth);

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

async function simpleExpression(lnm, keyword, tokens, io) {
	return {"type": keyword, "line": lnm, "expression": await compileExpression(lnm, tokens, io)};
}

async function assignVariable(lnm, varName, tokens, io) {
	return [{"type": "VAR", "line": lnm, "var": varName, "expression": await compileExpression(lnm, tokens, io)}];
}

// define module exports

module.exports = {
    decode,
    KEYWORDS
};
