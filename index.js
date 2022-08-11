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
	let i = 0;
	variables = {};
	labels = {};
	instructions = [];

	while (i < procedure.length) {
		decodedInstr = instructions[i];
		console.log(i);
		
		if (decodedInstr == undefined) {
			decodedInstr = decode(i, procedure[i].trim(), labels);
			instructions[i] = decodedInstr;
		}

		if (decodedInstr) {
			switch (decodedInstr.instruction) {
				case "PRINT":
					console.log(decodedInstr.expression(variables));
					break;
				case "INPUT_DISCARD":
					await queryStdin(decodedInstr.expression(variables));
					break;
				case "INPUT":
					variables[decodedInstr.var] = await queryStdin(decodedInstr.expression(variables));
					break;
				case "JUMP":
					if (decodedInstr.lineBefore) {
						i = decodedInstr.lineBefore;
					}
					else {
						// decode label to line
						linenum = labels[decodedInstr.label];

						if (linenum) {
							decodedInstr.lineBefore = linenum - 1; // thought this was neater than continue
							i = decodedInstr.lineBefore;
							console.log("asbawrberbaer", i);
						}
						else {
							// scan
							// TODO
							console.log("ebebsebse");
						}
					}
					break;
				default:
					console.error("Could not handle instruction type \"" + decodedInstr.instruction + "\"...");
			}
		}
		
		i++;
	}

	console.log(variables);
}

function exception(lineNum, msg) {
	lineNum += 1; // translate from interpreter lines to true lines.
	return "EXCEPTION at line " + lineNum + ":\n>> " + msg;
}

const IDENTIFIER_START_REGEX = /[A-z]/;
const IDENTIFIER_CHAR_REGEX = /[A-z0-9]/;
const SPACE_OPERATORS_REGEX = /[\t \+\-\*\/!&|=]/;
const BRACKETS_OPERATORS_REGEX = /[\(\)\+\-\*\/!&|=]/;
const NUMBERS_REGEX = /[0-9]/;

const IDENTIFIER_REGEX = /[A-z][A-z0-9]*/;
const SAFE_MATHS_CHARS_REGEX = /[\+\-\*\/ 0-9\(\)!&|]+/;

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
			jsExpression += token.value;
		}
		else if (token.type == "STRING") {
			jsExpression += '"' + token.value + '"';
		}
		else if (token.type == "VAR") {
			jsExpression += "vars[" + token.value + "]";
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
	return {"instruction": keyword, "expression": translateExpression(lnm, expression)};
}
// Parameters
// - lnm = line number (0-indexed)
// - instruction = the instruction on that line
// - labels (WRITE) = the labels map. can be written to.
// Returns
// - the parsed executable instruction
function decode(lnm, instruction, labels) {
	// empty lines and comments are No-Op
	// comments can be done with #, %, or //
	// or with the REM keyword which is also reserved.
	// Also inline comments are not supported
	if (instruction.length == 0 || instruction[0] == '#' || instruction[0] == '%' || (instruction.length > 1 && instruction[0] == '/' && instruction[1] == '/')) {
		return null;
	}

	// who needs tokenisers anyway
	// (this is BASIC so im not bothering with tokenising the main code. I will for expressions though)

	// handle variable assignment and labels first

	// assume all lines ending in : are labels
	if (instruction[instruction.length - 1] == ':') {
		let labelName = instruction.slice(0, instruction.length - 1).trim();

		if (LABEL_REGEX.test(labelName)) {
			labels[labelName] = lnm;
			return null; // no-op line, merely a label definition.
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
			return null; // comment 2 electric boogaloo
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

			if (toIndex == -1) return {"instruction": "INPUT_DISCARD", "expression": compileExpression(lnm, tokens)};

			let spliced = tokens.splice(0, toIndex);
			//console.log(spliced);
			let compiledExpression = compileExpression(lnm, spliced); // splice the expression to compile out

			// remainder should be "TO" + variable
			if (tokens.length != 2) {
				throw exception(lnm, "Incorrect number of operands after INPUT ... TO. Must have exactly ONE variable to store in.")
			}

			let variable = tokens[1];

			if (variable.type != "VAR") throw exception(lnm, "Operand after INPUT ... TO is not a valid variable name!");

			return {"instruction": "INPUT", "expression": compiledExpression, "var": variable.value};
		case "GOTO":
			if (expression == '') throw exception(lnm, "GOTO requires a label but none given!");
			return {"instruction": "JUMP", "label": expression};
		case "IF":
			if (expression == '') throw exception(lnm, "IF requires an operand but none given!");
			return simpleExpression(lnm, "IF", expression);
		case "ELSE":
			if (expression == '') return {"instruction": "ELSE"};
			else throw exception(lnm, "ELSE does not take any operands!");
		case "END":
			switch (expression) {
				case "":
					return {"instruction": "TERMINATE"};
				case "IF":
					return {"instruction": "END IF"}; // the jump target for an if ending with an else, or an if with no else
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