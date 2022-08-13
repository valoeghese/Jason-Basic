fs = require('fs');
const LABEL_REGEX = /[A-z0-9 ]+/;
const KEYWORDS = ["PRINT", "INPUT", "TO", "GOTO", "IF", "ELSE", "END"];

// https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
const readline = require('readline');

// This is the easiest way to do it I swear
// Source: https://stackoverflow.com/questions/2878703/split-string-once-in-javascript
// This always returns a size-2 array of strings
String.prototype.splitOnce = function(on) {
	let i = this.indexOf(on);
	// handle the case that the character is not present
	return i == -1 ? [this.slice(0, this.length), ""] : [this.slice(0, i), this.slice(i + 1)];
};

// i comment my code very well thank you

async function run(procedure, io) {
	let variables = {};
	let instructions = [];
	let labels = {};

	// decode into interpretable instructions
	// pseudocompilation
	let i = 0;
	let decode_Globals = {}; // for keeping track of state line-to-line for this procedure purely from decode

	io.debug("Parsing...");

	function vars2str(vars) {
		result = "";

		for (let key in vars) {
			result += key + "=" + vars[key] + ", ";
		}

		if (result != "") {
			result = result.substring(0, result.length - 2);// cut off last ", "
		}

		return result;
	}

	while (i < procedure.length) {
		//console.log(i + 1, " ", procedure[i]);
		let line = procedure[i].trim();

		// handle breakpoints first. done by placing * at the end of a line. breaks BEFORE the line.
		if (line[line.length - 1] == '*') {
			instructions.push({"type": "INPUT_DISCARD", "line": i + 1, "expression": vars => "Breakpoint @ line " + (i + 1) + ", " + vars2str(vars)});
			line = line.substring(0, line.length - 1); // remove the * at the end for main decoding
		}

 		let decoded = decode(i + 1, line, decode_Globals, io); // decode into list of instructions
		instructions.push.apply(instructions, decoded); // append

		i++; // increment index
	}

	i = 0; // rewind for labling
	io.debug("Indexing Labels...");

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

	//console.log(instructions);
	i = 0; // rewind again, this time for execution
	console.log("====================")

	while (i < instructions.length) {
		let instruction = instructions[i];

		switch (instruction.type) {
			case "LABEL":
				// labels are handled prior to execution
				break;
			case "PRINT":
				io.out(instruction.expression(variables));
				break;
			case "INPUT_DISCARD":
				await io.in(instruction.expression(variables));
				break;
			case "INPUT":
				variables[instruction.var] = await io.in(instruction.expression(variables));
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
			case "VAR":
				variables[instruction.var] = instruction.expression(variables);
				break;
			case "TERMINATE":
				process.exit();
				break;
			default:
				io.error("Could not handle instruction type \"" + instruction.type + "\"...");
				break;
		}
		
		i++;
	}

	//console.log(variables);
}

function exception(lineNum, msg) {
	return "Exception at line " + lineNum + ":\n>> " + msg;
}

const IDENTIFIER_START_REGEX = /[A-z]/;
const IDENTIFIER_CHAR_REGEX = /[A-z0-9_]/;
const IDENTIFIER_REGEX = /[A-z][A-z0-9_]*/;

const SPACE_OPERATORS_REGEX = /[\t \+\-\*\/\!\&\|\=\>\<\%]/;
const BRACKETS_OPERATORS_REGEX = /[\(\)\+\-\*\/\!\&\|\=\>\<\%]/;
const SPACE_BRACKETS_OPERATORS_REGEX = /[\t \(\)\+\-\*\/\!\&\|\=\>\<\%]/;
const NUMBERS_REGEX = /[0-9]/;

// tokeniser
// yes this is needed to prevent spaghetti
function tokenise(lnm, expression) {
	let tokens = [];
	let varIndex = -1; // for slicing
	let stringMode = 0; // 1 = string, 2 = escape
	let numberMode = 0; // literally stringmode for numbers. 1 = can tolerate a decimal point, 2 = cannot tolerate one anymore
	let stringAccumulator = ""; // for accumulating strings or numbers

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
		else if (numberMode) {
			if (NUMBERS_REGEX.test(c)) {
				stringAccumulator += c;
			}
			else if (c == '.') {
				// decimal point only once!
				// tracked in the number mode
				if (numberMode == 2) {
					throw exception(lnm, "A number cannot have two decimal points!");
				}
				else {
					numberMode = 2;
					stringAccumulator += c;
				}
			}
			else if (SPACE_BRACKETS_OPERATORS_REGEX.test(c)) {
				// number ends
				tokens.push({"type": "NUMBER", "value": stringAccumulator});
				// reset number info to prepare for future use
				stringAccumulator = "";
				numberMode = 0;
				// rewind so it can be read again out of number mode
				i--;
			}
			else {
				throw exception(lnm, "Unexpected character while parsing number: \"" + c + '"');
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
					throw exception(lnm, "Unexpected character while parsing variable name: \"" + c + '"');
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
				if (i != expression.length - 1 && (c == '>' || c == '<')) { // "defer judgement"... if it's > or < it should not be at the end but idc ur problem (not a problem for tokeniser)
					if (expression[i + 1] == '=') {
						i++; // skip 2 characters, not one, bc this is a 2 character token
						c += '='; // and add the equals to the tokenz
					}
				}

				tokens.push({"type": "OPERATOR", "value": c});
			}
			else if (c == '"') {
				stringMode = 1;
			}
			else if (NUMBERS_REGEX.test(c)) {
				numberMode = 1;
				i--; // rewind to get the number mode parser to read that instead (to prevent spaghetti by fracturing the parsers for each type)
			}
			else {
				throw exception(lnm, "Unexpected character \"" + c + '"');
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

	// push any numbers still being accumulated
	if (numberMode) {
		tokens.push({"type": "NUMBER", "value": stringAccumulator});
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

// expression translator to js
// what are you talking about, unsafely using eval? who could ever
// returns the expression to evaluate as a javascript function, transformed from the input
// dont do this
function compileExpression(lnm, tokens, io) {
	let jsExpression = "vars => ";

	for (let i = 0; i < tokens.length; i++) {
		let token = tokens[i];

		// keywords that are allowed inline must be handled before expression translation
		if (token.type == "KEYWORD") {
			throw exception(lnm, "Unexpected keyword \"" + token.value + '"');
		}
		else if (token.type == "OPERATOR") {
			if (token.value.length == 1 && /[\&\|\=]/.test(token.value)) {
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
		else if (token.type == "NUMBER") {
			jsExpression += token.value;
		}

		jsExpression += " ";
	}

	try{
		return eval(jsExpression);
	}
	catch (e) {
		io.error("Translator Error on line " + lnm);
		io.error(">> CONTEXT: Translating DJ/BASIC tokens " + JSON.stringify(tokens) + " to JavaScript Expression as " + jsExpression);
		io.error("Caused By: ");
		throw e;
	}
}

// combo
function translateExpression(lnm, expression, io) {
	return compileExpression(lnm, tokenise(lnm, expression), io);
}

// a common operation
function simpleExpression(lnm, keyword, expression, io) {
	return {"type": keyword, "line": lnm, "expression": translateExpression(lnm, expression, io)};
}

// Parameters
// - lnm = line number (0-indexed)
// - instruction = the instruction on that line
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instruction
function decode(lnm, instruction, globals, io) {
	// initialise globals if first time
	if (globals.blockstack == undefined) globals.blockstack = []; // if stack
	if (globals.ifid == undefined) globals.ifid = 0; // free if id tracker, for sections
	if (globals.whileid == undefined) globals.whileid = 0; // free while id tracker, for sections
	
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

	if (splitInstr[1][0] == "=") {
		// treat as assignment
		let expression = splitInstr[1].substring(1).trim();
		
		if (KEYWORDS.indexOf(splitInstr[0]) == -1) {
			if (IDENTIFIER_REGEX.test(splitInstr[0])) {
				return [{"type": "VAR", "line": lnm, "var": splitInstr[0], "expression": translateExpression(lnm, expression, io)}];
			}
			else {
				throw exception(lnm, "Invalid variable name \"" + splitInstr[0] + "\". Must start with A-z and can only contain A-z, 0-9 and _ characters.");
			}
		}
		else {
			throw exception(lnm, "Cannot define variable with same name as a keyword!");
		}
	}

	let expression = splitInstr[1].trim();

	// yes these are case sensitive cope
	// allow string and num mixing
	// todo does javascript have formatting. if so how do we stop them exploiting it. ig escape stuff
	switch (splitInstr[0]) {
		case "REM":
			return []; // comment 2 electric boogaloo
		case "PRINT":
			if (expression == '') throw exception(lnm, "PRINT requires an operand but none given!");
			return [simpleExpression(lnm, "PRINT", expression, io)];
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

			if (toIndex == -1) return [{"type": "INPUT_DISCARD", "line": lnm, "expression": compileExpression(lnm, tokens, io)}];

			let spliced = tokens.splice(0, toIndex);
			//console.log(spliced);
			let compiledExpression = compileExpression(lnm, spliced, io); // splice the expression to compile out

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

			ifJmp = simpleExpression(lnm, "JUMP_IFN", expression, io);
			ifJmp.block = "IF";
			ifJmp.label = "@IF" + (globals.ifid++); // set to current and increment to next free one. @ for synthetic sections as it's an invalid label character

			globals.blockstack.push(ifJmp); // push this onto the block stack
			return [ifJmp];
		case "WHILE":
			if (expression == '') throw exception(lnm, "WHILE requires an operand but none given!");

			whileJmp = simpleExpression(lnm, "JUMP_IFN", expression, io);
			whileJmp.block = "WHILE";
			whileJmp.whileid = globals.whileid++; // next one
			whileJmp.label = "@WHILE_END" + whileJmp.whileid; // jump to here if false

			globals.blockstack.push(whileJmp); // push this onto the block stack
			return [{"type": "LABEL", "line": lnm, "label": "@WHILE_START" + whileJmp.whileid}, whileJmp];
		case "ELSE":
			if (expression == '') {
				if (globals.blockstack.length == 0) {
					throw exception(lnm, "ELSE with no matching IF!");
				}

				// switchemeroo
				// pop the if statement and set its label target to here, and place this one on the if stack here as a JUMP
				// make sure to put the JUMP before the else label as if jumps before it reaches else label
				let ifToElse = globals.blockstack.pop();
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
			switch (expression) {
				case "":
					return [{"type": "TERMINATE", "line": lnm}];
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
					// cannot end if if there's no if
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
					throw exception(lnm, "Unknown block construction \"" + expression + '"');
			}
		default: // catch-all
			throw exception(lnm, "Unable to parse line \"" + instruction + "\" (with assumed instruction of \"" + splitInstr[0] + "\")... is this correct syntax for DJ BASIC?");
	}
}

// main code
// File Intepreter Mode

const testProcedure = fs.readFileSync(process.argv[2], 'utf8', function (err,data) {
	if (err) {
		console.log("Error loading lecturers.json");
		console.log(err);
		process.exit();
	}
}).split(/\r?\n/); // stolen regex

const fileInterpreterIO = {
	"out": console.log,
	"debug": console.log,
	"error": console.error,
	"in": (query) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
	
		return new Promise(resolve => rl.question(query, ans => {
			rl.close();
			resolve(ans);
		}))
	} 
};

// hack to not get horrible "exception in promise" errors
async function asdfasdf() {
	try {
		await run(testProcedure, fileInterpreterIO);
	}
	catch(e) {
		console.error(e);
	}
}; asdfasdf();