fs = require('fs');
const LABEL_REGEX = /[A-z0-9 ]+/;
const IDENTIFIER_REGEX = /[A-z0-9]+/;
const IDENTIFIER_START_REGEX = /[A-z]/;
const SAFE_MATHS_CHARS_REGEX = /[\+\-\*\/ 0-9\(\)!&|]+/;

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

// safety expression validator
// what are you talking about, unsafely using eval? who could ever
// returns the expression to evaluate, transformed from the input
// dont do this
function translateExpression(expression) {
	// tokeniser
	// yes this is needed to prevent spaghetti
	// todo


	// test the remaining 'mathematical' part of the expression
	// is this necessary with a tokeniser
	return SAFE_MATHS_CHARS_REGEX.test(mathsAccumulator);
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

	// yes these are case sensitive cope
	// allow string and num mixing
	// todo does javascript have formatting. if so how do we stop them exploiting it. ig escape stuff
	switch (splitInstr[0]) {
		case "REM":
			return null; // comment 2 electric boogaloo
		case "PRINT":

			break;
		case "INPUT":
			break;
		case "GOTO":
			break;
		case "IF":
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