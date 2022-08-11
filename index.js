fs = require('fs');
const LABEL_REGEX = /[A-z0-9 ]+/;

// This is the easiest way to do it I swear
// Source: https://stackoverflow.com/questions/2878703/split-string-once-in-javascript
// This always returns a size-2 array of strings
String.prototype.splitOnce = function(on) {
	let i = this.indexOf(on);
	return [this.slice(0, i), this.slice(i + 1)];
};

// i comment my code very well thank you

function run(procedure) {
	let i = 0;
	variables = {};
	labels = {};
	instructions = [];

	while (i < procedure.length) {
		decodedInstr = instructions[i];
		
		if (decodedInstr == undefined) {
			decodedInstr = decode(i, procedure[i].trim(), labels);
			instructions[i] = decodedInstr;
		}
		
		i++;
	}
}

function exception(lineNum, msg) {
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
// returns the expression to evaluate, transformed from the input
// dont do this
function translateExpression(lnm, expression) {
	// tokeniser
	// yes this is needed to prevent spaghetti
	// todo
	let tokens = [];
	let varIndex = -1; // for slicing
	let stringMode = 0; // 1 = string, 2 = escape
	let stringAccumulator = ""; // for accumulating strings

	for (let i = 0; i < expression.length; i++) {
		let c = expression[i]; // current char

		if (stringMode) {
			if (stringMode == 2) {
				stringMode = 1;
			}
			else if (c == '"') {
				tokens.push({"type": "STRING", "name": stringAccumulator});
				stringAccumulator = "";
				stringMode = 0;
			}
			else {
				stringAccumulator += c;
			}
		}
		else if (varIndex > -1) {
			if (!IDENTIFIER_CHAR_REGEX.test(c)) {
				if (SPACE_OPERATORS_REGEX.test(c)) {
					tokens.push({"type": "VAR", "name": expression.slice(varIndex, i)});
					varIndex = -1;
					i--; // take another look at
				}
				else {
					throw exception(lnm + 1, "Unexpected character \"" + c + '"');
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
				tokens.push({"type": "OPERATOR", "operator": c});
			}
			else if (c == '"') {
				stringMode = 1;
			}
			else {
				throw exception(lnm + 1, "Unexpected character \"" + c + '"');
			}
		}
	}

	if (stringMode) {
		throw exception(lnm + 1, "Unclosed string!");
	}

	if (varIndex > -1) {
		tokens.push({"type": "VAR", "name": expression.slice(varIndex, expression.length)});
	}

	return tokens;
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
			throw exception(lnm + 1, "Invalid label \"" + labelName + "\". Only A-z, 0-9, and space characters are permitted!")
		}
	}

	splitInstr = instruction.splitOnce(" ");
	expression = splitInstr[1].trim();

	// yes these are case sensitive cope
	// allow string and num mixing
	// todo does javascript have formatting. if so how do we stop them exploiting it. ig escape stuff
	switch (splitInstr[0]) {
		case "REM":
			return null; // comment 2 electric boogaloo
		case "PRINT":
			if (expression == '') throw exception(lnm + 1, "PRINT requires an operand but none given!");
			console.log(translateExpression(lnm, expression));
			break;
		case "INPUT":
			if (expression == '') throw exception(lnm + 1, "INPUT requires an operand but none given!");
			console.log(translateExpression(lnm, expression));
			break;
		case "GOTO":
			if (expression == '') throw exception(lnm + 1, "GOTO requires an operand but none given!");
			console.log(translateExpression(lnm, expression));
			break;
		case "IF":
			if (expression == '') throw exception(lnm + 1, "IF requires an operand but none given!");
			console.log(translateExpression(lnm, expression));
			break;
		case "ELSE":
			break;
		case "END":
			break;
		default:
			throw exception(lnm + 1, "Unable to parse line \"" + instruction + "\" (with assumed instruction of \"" + splitInstr[0] + "\")... is this correct syntax for DJ BASIC?");
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