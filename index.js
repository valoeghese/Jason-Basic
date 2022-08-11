fs = require('fs');
const LABEL_REGEX = /[A-z0-9 ]+/;
const KEYWORDS = ["PRINT", "INPUT", "TO", "GOTO", "IF", "ELSE", "END"];

// https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
const readline = require('readline');

function queryStdin(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}


// This is the easiest way to do it I swear
// Source: https://stackoverflow.com/questions/2878703/split-string-once-in-javascript
// This always returns a size-2 array of strings
String.prototype.splitOnce = function(on) {
	let i = this.indexOf(on);
	return [this.slice(0, i), this.slice(i + 1)];
};

// i comment my code very well thank you

async function run(procedure) {
	let variables = {};
	let instructions = [];
	let labels = {};

	// decode into interpretable instructions
	// pseudocompilation
	let i = 0;
	let decode_Globals = {}; // for keeping track of stuff line-to-line for this procedure purely from decode

	console.log("Parsing...");

	while (i < procedure.length) {
		let decoded = decode(i + 1, procedure[i].trim(), decode_Globals); // decode into list of instructions
		instructions.push.apply(instructions, decoded); // append
		i++; // increment index
	}

	i = 0; // rewind for labling
	console.log("Indexing Labels...");

	// assign labels
	// done separately for cleanliness
	while (i < instructions.length) {
		let instruction = instructions[i];

		if (instruction.type == "LABEL") {
			if (labels[instruction.label] == undefined) {
				labels[instruction.label] = i; // current index
			}
			else {
				throw exception(instruction.line, "Duplicate label " + instruction.label);
			}
		}

		i++;
	}

	i = 0; // rewind again, this time for execution
	console.log("====================")

	while (i < instructions.length) {
		let instruction = instructions[i];

		switch (instruction.type) {
			case "LABEL":
				// labels are handled prior to execution
				break;
			case "PRINT":
				console.log(instruction.expression(variables));
				break;
			case "INPUT_DISCARD":
				await queryStdin(instruction.expression(variables));
				break;
			case "INPUT":
				variables[instruction.var] = await queryStdin(instruction.expression(variables));
				break;
			case "JUMP":
				jmpIndex = labels[instruction.label];

				if (jmpIndex != undefined) {
					i = jmpIndex - 1; // thought this was neater than continue;
				}
				else {
					throw exception(instruction.line, "Unknown label \"" + instruction.label + '"');
				}
				break;
			case "JUMP_IF": // unused but kept just in case tm
			case "JUMP_IFN": // used in if statements
				let b = instruction.expression(variables);

				// swap for 'jump if not'
				if (instruction.type == "JUMP_IFN") b = !b;

				if (b) { // check
					jmpIndex = labels[instruction.label];

					if (jmpIndex != undefined) {
						i = jmpIndex - 1; // thought this was neater than continue;
					}
					else {
						throw exception(instruction.line, "Unknown label \"" + instruction.label + '"');
					}
				}
				break;
			case "TERMINATE":
				process.exit();
				break;
			default:
				console.error("Could not handle instruction type \"" + instruction.type + "\"...");
				break;
		}
		
		i++;
	}

	//console.log(variables);
}

function exception(lineNum, msg) {
	return "EXCEPTION at line " + lineNum + ":\n>> " + msg;
}

const IDENTIFIER_START_REGEX = /[A-z]/;
const IDENTIFIER_CHAR_REGEX = /[A-z0-9]/;
const SPACE_OPERATORS_REGEX = /[\t \+\-\*\/\!\&\|\=]/;
const BRACKETS_OPERATORS_REGEX = /[\(\)\+\-\*\/\!\&\|\=]/;
const NUMBERS_REGEX = /[0-9]/;

const IDENTIFIER_REGEX = /[A-z][A-z0-9]*/;

// expression translator to js
// what are you talking about, unsafely using eval? who could ever
// returns the expression to evaluate as a javascript function, transformed from the input
// dont do this
function compileExpression(lnm, tokens) {
	let jsExpression = "vars => ";

	for (let i = 0; i < tokens.length; i++) {
		let token = tokens[i];

		// keywords that are allowed inline must be handled before expression translation
		if (token.type == "KEYWORD") {
			throw exception(lnm, "Unexpected keyword \"" + token.value + '"');
		}
		else if (token.type == "OPERATOR") {
			if (/[\&\|\=]/.test(token.value)) {
				jsExpression += token.value + token.value;
			} else {
				jsExpression += token.value;
			}
		}
		else if (token.type == "STRING") {
			jsExpression += '"' + token.value + '"';
		}
		else if (token.type == "VAR") {
			jsExpression += "vars[\"" + token.value + "\"]";
		}

		jsExpression += " ";
	}

	return eval(jsExpression);
}

// tokeniser
// yes this is needed to prevent spaghetti
function tokenise(lnm, expression) {
	let tokens = [];
	let varIndex = -1; // for slicing
	let stringMode = 0; // 1 = string, 2 = escape
	let stringAccumulator = ""; // for accumulating strings

	for (let i = 0; i < expression.length; i++) {
		let c = expression[i]; // current char

		if (stringMode) {
			if (stringMode == 2) {
				// in this case we do want to add the escaped character, due to how strings are handled
				stringAccumulator += '\\' + c;
				stringMode = 1;
			}
			else if (c == '\\') {
				stringMode = 2; // escape character
			}
			else if (c == '"') {
				tokens.push({"type": "STRING", "value": stringAccumulator});
				// reset string info. string has ended!
				stringAccumulator = ""; // this has to be "" to prepare for the next one
				stringMode = 0;
			}
			else {
				stringAccumulator += c;
			}
		}
		else if (varIndex > -1) {
			if (!IDENTIFIER_CHAR_REGEX.test(c)) {
				if (SPACE_OPERATORS_REGEX.test(c)) {
					tokens.push({"type": "VAR", "value": expression.slice(varIndex, i)});
					varIndex = -1;
					i--; // take another look at the operator under a... different lens ;)
				}
				else {
					throw exception(lnm, "Unexpected character \"" + c + '"');
				}
			}
		}
		else if (c == ' ' || c == '\t') {
			// no-op
		}
		else {
			if (IDENTIFIER_START_REGEX.test(c)) {
				varIndex = i;
			}
			else if (BRACKETS_OPERATORS_REGEX.test(c)) {
				tokens.push({"type": "OPERATOR", "value": c});
			}
			else if (c == '"') {
				stringMode = 1;
			}
			else {
				throw exception(lnm + 1, "Unexpected character \"" + c + '"');
			}
		}
	}

	// don't leave your strings hanging for goodness sake
	if (stringMode) {
		throw exception(lnm, "Unclosed string!");
	}

	// push any variables still being accumulated
	if (varIndex > -1) {
		tokens.push({"type": "VAR", "value": expression.slice(varIndex, expression.length)});
	}

	// detect keywords
	for (let i = 0; i < tokens.length; i++) {
		let token = tokens[i];

		if (token.type == "VAR" && KEYWORDS.indexOf(token.value) != -1) {
			token.type = "KEYWORD";
		}
	}

	return tokens;
}

// combo
function translateExpression(lnm, expression) {
	return compileExpression(lnm, tokenise(lnm, expression));
}

// a common operation
function simpleExpression(lnm, keyword, expression) {
	return [{"type": keyword, "line": lnm, "expression": translateExpression(lnm, expression)}];
}
// Parameters
// - lnm = line number (0-indexed)
// - instruction = the instruction on that line
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instruction
function decode(lnm, instruction, globals) {
	// initialise globals if first time
	if (globals.ifstack == undefined) globals.ifstack = []; // if stack
	if (globals.ifid == undefined) globals.ifid = 0; // free if id tracker, for sections

	// empty lines and comments are No-Op
	// comments can be done with #, %, or //
	// or with the REM keyword which is also reserved.
	// Also inline comments are not supported
	if (instruction.length == 0 || instruction[0] == '#' || instruction[0] == '%' || (instruction.length > 1 && instruction[0] == '/' && instruction[1] == '/')) {
		return [];
	}

	// who needs tokenisers anyway
	// (this is BASIC so im not bothering with tokenising the main code. I will for expressions though)

	// handle variable assignment and labels first

	// assume all lines ending in : are labels
	if (instruction[instruction.length - 1] == ':') {
		let labelName = instruction.slice(0, instruction.length - 1).trim();

		if (LABEL_REGEX.test(labelName)) {
			return [{"type": "LABEL", "label": labelName, "line": lnm}]; // no-op line, merely a label definition for later jumping.
		}
		else {
			throw exception(lnm, "Invalid label \"" + labelName + "\". Only A-z, 0-9, and space characters are permitted!")
		}
	}

	let splitInstr = instruction.splitOnce(" ");
	let expression = splitInstr[1].trim();

	// yes these are case sensitive cope
	// allow string and num mixing
	// todo does javascript have formatting. if so how do we stop them exploiting it. ig escape stuff
	switch (splitInstr[0]) {
		case "REM":
			return []; // comment 2 electric boogaloo
		case "PRINT":
			if (expression == '') throw exception(lnm, "PRINT requires an operand but none given!");
			return simpleExpression(lnm, "PRINT", expression);
		case "INPUT":
			if (expression == '') throw exception(lnm, "INPUT requires an operand but none given!");
			let tokens = tokenise(lnm, expression);
			let toIndex = -1;

			for (let i = 0; i < tokens.length; i++) {
				let token = tokens[i];

				if (token.type == "KEYWORD" && token.value == "TO") {
					toIndex = i;
					break;
				}
			}

			if (toIndex == -1) return [{"type": "INPUT_DISCARD", "line": lnm, "expression": compileExpression(lnm, tokens)}];

			let spliced = tokens.splice(0, toIndex);
			//console.log(spliced);
			let compiledExpression = compileExpression(lnm, spliced); // splice the expression to compile out

			// remainder should be "TO" + variable
			if (tokens.length != 2) {
				throw exception(lnm, "Incorrect number of operands after INPUT ... TO. Must have exactly ONE variable to store in.")
			}

			let variable = tokens[1];

			if (variable.type != "VAR") throw exception(lnm, "Operand after INPUT ... TO is not a valid variable name!");

			return [{"type": "INPUT", "line": lnm, "expression": compiledExpression, "var": variable.value}];
		case "GOTO":
			if (expression == '') throw exception(lnm, "GOTO requires a label but none given!");
			return [{"type": "JUMP", "line": lnm, "label": expression}];
		case "IF":
			if (expression == '') throw exception(lnm, "IF requires an operand but none given!");
			ifJmp = simpleExpression(lnm, "JUMP_IFN", expression);
			
			ifJmp[0].label = "@IF" + (globals.ifid++); // set to current and increment to next free one. @ for synthetic sections as it's an invalid label character
			globals.ifstack.push(ifJmp[0]); // push this onto the if stack
			return ifJmp;
		case "ELSE":
			if (expression == '') {
				if (globals.ifstack.length == 0) {
					throw exception(lnm, "ELSE with no matching IF!");
				}

				// switchemeroo
				// pop the if statement and set its label target to here, and place this one on the if stack here as a JUMP
				// make sure to put the JUMP before the else label as if jumps before it reaches else label
				let ifToElse = globals.ifstack.pop();
				let elseJmp = {"type": "JUMP", "line": lnm, "label": "ELSE" + ifToElse.label}; // see comment above and/or comments on return for more detail
				globals.ifstack.push(elseJmp); // push else as an imposter onto the if stack (sus)

				return [
					elseJmp, // eg if the if is @IF1, the matching else is ELSE@IF1. This jumps away from else execution
					{"type": "LABEL", "line": lnm, "label": ifToElse.label} // the if statement's jump for if false, aka this is where to start else execution
				];
			}
			else throw exception(lnm, "ELSE does not take any operands!");
		case "END":
			switch (expression) {
				case "":
					return {"type": "TERMINATE", "line": lnm};
				case "IF":
					// cannot end if if there's no if
					if (globals.ifstack.length == 0) {
						throw exception(lnm, "Ending if when there's no matching IF to end!");
					}

					let ifToEnd = globals.ifstack.pop();
					// create label to jump to for 'else'. If the if has an else block we've done earlier the hack of replacing the item on the if stack with an else jump after setting the real if to the else. Little switchermeroo.

					return [{"type": "LABEL", "line": lnm, "label": ifToEnd.label}]; // the jump target for an if ending with an else, or an if with no else
				default:
					throw exception(lnm, "Unknown block construction \"" + expression + '"');
			}
		default: // catch-all
			throw exception(lnm, "Unable to parse line \"" + instruction + "\" (with assumed instruction of \"" + splitInstr[0] + "\")... is this correct syntax for DJ BASIC?");
	}
}

// main code

const testProcedure = fs.readFileSync('procedure.bsc', 'utf8', function (err,data) {
	if (err) {
		console.log("Error loading lecturers.json");
		console.log(err);
		process.exit();
	}
}).split(/\r?\n/); // stolen regex

try {
	run(testProcedure);
}
catch(e) {
	console.error(e);
}