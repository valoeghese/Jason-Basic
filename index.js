fs = require('fs');
const { Client, GatewayIntentBits, Partials, MessageEmbed } = require('discord.js');

// https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
const readline = require('readline');
const fetch = require('node-fetch');
const { parse } = require('path');
require("dotenv").config();

const LABEL_REGEX = /[A-z0-9 ]+/;
const KEYWORDS = ["PRINT", "INPUT", "TO", "GOTO", "IF", "ELSE", "END", "RANDOM", "ROUND", "LOWERCASE", "UPPERCASE", "DIM"];

// https://amiradata.com/javascript-sleep-function/
const sleep = (milliseconds) => {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
}

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
	//console.log("I am a dwarf");
	let variables = {};
	let instructions = [];
	let labels = {};

	// decode into interpretable instructions
	// pseudocompilation
	let i = 0;
	let decode_Globals = {}; // for keeping track of state line-to-line for this procedure purely from decode

	await io.debug("Parsing...");

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

 		let decoded = await decode(i + 1, line, decode_Globals, io); // decode into list of instructions
		instructions.push.apply(instructions, decoded); // append

		i++; // increment index
	}

	//console.log(instructions);

	i = 0; // rewind for labling
	await io.debug("Indexing Labels...");

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
				//console.log(instruction);
				//console.log(variables);
				await io.out(instruction.expression(variables));
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
				//console.log(instruction);
				variables[instruction.var] = instruction.expression(variables);
				break;
			case "TERMINATE":
				return;
			default:
				await io.error("Could not handle instruction type \"" + instruction.type + "\"...");
				break;
		}
		
		await io.onLineEnd(i++);
	}

	//console.log(variables);
}

function exception(lineNum, msg) {
	return "Exception at line " + lineNum + ":\n>> " + msg;
}

const IDENTIFIER_START_REGEX = /[A-z]/;
const IDENTIFIER_CHAR_REGEX = /[A-z0-9_]/;
const IDENTIFIER_REGEX = /[A-z][A-z0-9_]*/;

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
				if (SPACE_BRACKETS_OPERATORS_REGEX.test(c)) {
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
async function compileExpression(lnm, tokens, io) {
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

// combo
async function translateExpression(lnm, expression, io) {
	return await compileExpression(lnm, tokenise(lnm, expression), io);
}

// a common operation
async function simpleExpression(lnm, keyword, expression, io) {
	return {"type": keyword, "line": lnm, "expression": await translateExpression(lnm, expression, io)};
}

async function assignVariable(lnm, varName, expression, io) {
	if (KEYWORDS.indexOf(varName) == -1) {
		if (IDENTIFIER_REGEX.test(varName)) {
			return [{"type": "VAR", "line": lnm, "var": varName, "expression": await translateExpression(lnm, expression, io)}];
		}
		else {
			throw exception(lnm, "Invalid variable name \"" + varName + "\". Must start with A-z and can only contain A-z, 0-9 and _ characters.");
		}
	}
	else {
		throw exception(lnm, "Cannot define variable with same name as a keyword!");
	}
}

// Parameters
// - lnm = line number (0-indexed)
// - instruction = the instruction on that line
// - globals (READ/WRITE) = a map shared across the compilation of a procedure, to keep track of state
// Returns
// - the parsed executable instruction
async function decode(lnm, instruction, globals, io) {
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

	// space then eq
	if (splitInstr[1][0] == "=") {
		// treat as assignment
		let expression = splitInstr[1].substring(1).trim(); // remove the = and trim again for the expression

		return await assignVariable(lnm, splitInstr[0], expression, io);
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
			return [await simpleExpression(lnm, "PRINT", expression, io)];
		case "RANDOM":
			//console.log(expression);

			if (expression == '') throw exception(lnm, "RANDOM requires a variable but none given!");
			
			if (IDENTIFIER_REGEX.test(expression) && KEYWORDS.indexOf(expression) == -1) {
				return [{"type": "VAR", "line": lnm, "var": expression, "expression": vars => Math.random()}];
			}
			else {
				throw exception(lnm, "Invalid variable name to store RANDOM value in.")
			}
		case "ROUND":
			if (expression == '') throw exception(lnm, "ROUND requires a variable but none given!");

			if (IDENTIFIER_REGEX.test(expression) && KEYWORDS.indexOf(expression) == -1) {
				return [{"type": "VAR", "line": lnm, "var": expression, "expression": vars => Math.round(vars[expression])}];
			}
			else {
				throw exception(lnm, "Invalid variable name to perform ROUND operation on.")
			}
		case "LOWERCASE":
			if (expression == '') throw exception(lnm, "LOWERCASE requires a variable but none given!");

			if (IDENTIFIER_REGEX.test(expression) && KEYWORDS.indexOf(expression) == -1) {
				return [{"type": "VAR", "line": lnm, "var": expression, "expression": vars => vars[expression].toString().toLowerCase()}];
			}
			else {
				throw exception(lnm, "Invalid variable name to perform LOWERCASE operation on.")
			}
		case "UPPERCASE":
			if (expression == '') throw exception(lnm, "UPPERCASE requires a variable but none given!");

			if (IDENTIFIER_REGEX.test(expression) && KEYWORDS.indexOf(expression) == -1) {
				return [{"type": "VAR", "line": lnm, "var": expression, "expression": vars => vars[expression].toString().toUpperCase()}];
			}
			else {
				throw exception(lnm, "Invalid variable name to perform UPPERCASE operation on.")
			}
		case "DIM":
			let partition = expression.trim().split(" ", 2);
			
			let arrayVarName = partition[0];
			let arrayVarSizeExpr = partition[1];
			
			if (!arrayVarName) throw exception(lnm, "DIM requires a variable but none given!");
			if (!arrayVarSizeExpr) throw exception(lnm, "DIM requires a size expression but none given!");

			if (IDENTIFIER_REGEX.test(arrayVarName) && KEYWORDS.indexOf(arrayVarName) == -1) {
				let expressionCalculator = await translateExpression(lnm, expression, io);

				return [{"type": "VAR", "line": lnm, "var": expression, "expression": vars => {
					let size = expressionCalculator(vars);

					if (size < 0) {
						throw exception(lnm, `Invalid array size: ${size}`);
					} else if (size > 100) {
						throw exception(lnm, `Exceeds maximum array size (100): ${size}`);
					}

					let new_array = new Array(size);
					new_array.fill(0); // default values of 0

					Object.seal(new_array); // no more properties

					return new_array;
				}}];
			}
			else {
				throw exception(lnm, "Invalid variable name to define an array for.")
			}

			break;
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
			if (expression == '') throw exception(lnm, "GOTO requires a label but none given!");
			return [{"type": "JUMP", "line": lnm, "label": expression}];
		case "IF":
			if (expression == '') throw exception(lnm, "IF requires an operand but none given!");

			ifJmp = await simpleExpression(lnm, "JUMP_IFN", expression, io);
			ifJmp.block = "IF";
			ifJmp.label = "@IF" + (globals.ifid++); // set to current and increment to next free one. @ for synthetic sections as it's an invalid label character

			globals.blockstack.push(ifJmp); // push this onto the block stack
			return [ifJmp];
		case "WHILE":
			if (expression == '') throw exception(lnm, "WHILE requires an operand but none given!");

			whileJmp = await simpleExpression(lnm, "JUMP_IFN", expression, io);
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
			// handle potential variable assign with trash spaces
			let eqLocation = instruction.indexOf('=');

			if (eqLocation != -1) {
				trueSplit = instruction.splitOnce('=');

				if (IDENTIFIER_REGEX.test(trueSplit[0].trim())) {
					return await assignVariable(lnm, trueSplit[0].trim(), trueSplit[1].trim(), io);
				}
			}

			throw exception(lnm, "Unable to parse line \"" + instruction + "\" (with assumed instruction of \"" + splitInstr[0] + "\")... is this correct syntax for DJ BASIC?");
	}
}

// main code

//====================================================================================================
// File Intepreter Mode

// const testProcedure = fs.readFileSync(process.argv[2], 'utf8', function (err,data) {
// 	if (err) {
// 		console.log("Error loading lecturers.json");
// 		console.log(err);
// 		process.exit();
// 	}
// }).split(/\r?\n/); // stolen regex

// const fileInterpreterIO = {
// 	"out": console.log,
// 	"debug": console.log,
// 	"error": console.error,
// 	"in": (query) => {
// 		const rl = readline.createInterface({
// 			input: process.stdin,
// 			output: process.stdout,
// 		});
	
// 		return new Promise(resolve => rl.question(query, ans => {
// 			rl.close();
// 			resolve(ans);
// 		}))
// 	},
// 	"onLineEnd": async (lnm) => {}
// };

// // hack to not get horrible "exception in promise" errors
// async function asdfasdf() {
// 	try {
// 		await run(testProcedure, fileInterpreterIO);
// 	}
// 	catch(e) {
// 		fileInterpreterIO.error(e);
// 	}
// }; asdfasdf();
//====================================================================================================


//====================================================================================================
// Discord Bot Mode
// Parts copied from the main daddy jason bot

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
	partials: [Partials.Channel, Partials.Message]
});

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}! Using Prefix: ${process.env.prefix}`);
});

function removeNonBlank(msg) {
	return msg.trim() == "" ? "_ _" : msg; // hax
}

async function djMsg(message, content) {
	let script = "";
	let input = [];

	// try read a file
	const file = message.attachments.first()?.url;

	if (file) {
		const response = await fetch(file);

		if (response.ok) {
			script = await response.text();
			script = script.split(/\r?\n/);
			
			// read inputs
			input = content.split('\n');
			input.splice(0, 1); // ignore initial command
		}
		else {
			await message.reply("Failed to read file.");
		}
	}
	else {
		// script anstatt input
		script = content.split('\n');
		script.splice(0, 1); // ignore initial command
	}

	// only try run code if there *is* code.
	if (script == "") return;

	let resultMsg = "";
	let startTimeMillis = +new Date();
	
	// currently being read index
	let inputIndex = 0;

	// create context
	const messageContextIO = {
		"out": async (msg) => {
			resultMsg += msg.toString() + "\n";
		},
		"debug": async (msg) => {},
		"error": async (msg) => {
			resultMsg += msg.toString() + "\n";
		},
		"in": async (query) => {
			resultMsg += query + "\n";
			
			// get next prompt in input
			let next = input[inputIndex++];

			// default value of blank string
			if (!next) next = "";

			return next;
		},
		"onLineEnd": async (lnm) => {
			// check for force-terminations
			if (resultMsg.length > 1024) {
				throw "Output message is too long :( (Max 1024 characters for dj/msg)";
			}
			else {
				let now = +new Date();

				if ((now - startTimeMillis) > 15 * 1000) {
					throw "Script took too long to execute! (Max 15 seconds for dj/msg)"
				}
			}
		}
	};

	// run the script to create a message
	try {
		//console.log(script);
		await run(script, messageContextIO);
	} catch (e) {
		console.log(e);

		// ensure it actually caps it at 1024
		if (resultMsg.length > 1024) {
			resultMsg = resultMsg.substring(0, Math.max(1, 1024 - e.toString().length));
		}

		await messageContextIO.error(e);
	}

	// send the message and/or errors
	message.reply(removeNonBlank(resultMsg));
}

// Map of thread channels to latest message
var scriptLatestMessage = {};
// Map of thread channels to force exits
var scriptForceExits = {};
// Map of users to thread channels
var userScriptsRunning = {};

client.on("messageCreate", async (message) => {
	if (!message.author.bot) {
		const contentCased = message.content.replace('’', '\'').replace('”', '"').replace('“', '"');
		const content = contentCased.toUpperCase();
		//console.log(content, content.split('\n')[0], process.env.prefix + "/MSG");

		if (content == process.env.prefix + "/BASIC") {
			// check if they already have a script running
			if (userScriptsRunning[message.author.id]) {
				message.reply("You already have a DJ/BASIC script running in thread #" + userScriptsRunning[message.author.id].name + ". Use dj/terminate in that thread to force-stop it!");
				return;
			}

			if (!message.channel.isThread()) {
				const file = message.attachments.first()?.url;
				if (!file) return; // no file

				let fileParts = file.split("/");

				const thread = await message.startThread({
					"name": fileParts[fileParts.length - 1],
					"autoArchiveDuration": 60,
					type: "GUILD_PUBLIC_THREAD",
					reason: "script evaluation"
				});

				const response = await fetch(file);

				if (response.ok) {
					// initialise this to null, a value which means nothing but !== undefined.
					scriptLatestMessage[thread] = null;
					scriptForceExits[thread] = null;
					const owner = message.author.id;
					userScriptsRunning[owner] = thread;

					// create context
					const scriptContextIO = {
						"out": async (msg) => {
							await sleep(500);
							await thread.send(removeNonBlank(msg.toString()));
						},
						"debug": async (msg) => await thread.send(removeNonBlank(msg.toString())),
						"error": async (msg) => await thread.send(removeNonBlank(msg.toString())),
						"in": async (query) => {
							await thread.send(removeNonBlank(query));

							let readMsg = 0; // using number 0 as a magic constant to mean "seeking response"
							scriptLatestMessage[thread] = readMsg;

							while (!readMsg) {
								//console.log("seeking...");
								readMsg = scriptLatestMessage[thread];
								await sleep(100);
							}

							let result = scriptLatestMessage[thread];
							scriptLatestMessage[thread] = null; // whereas null just means "the session is in progress"
							return result;
						},
						"onLineEnd": async (lnm) => {
							// check for force-terminations
							if (scriptForceExits[thread]) {
								throw scriptForceExits[thread];
							}
						}
					};

					// run the script in the thread
					try {
						const script = await response.text();
						//console.log(script);
						await run(script.split(/\r?\n/), scriptContextIO);
					} catch (e) {
						console.log(e);
						scriptContextIO.error(e);
					}

					// remove this session regardless
					delete scriptLatestMessage[thread];
					delete scriptForceExits[thread];
					delete userScriptsRunning[owner];

					await thread.send("Archiving thread in 10s ...");
					await sleep(1000 * 10);
					// try archive thread
					thread.setArchived(true);
				}
				else {
					await thread.send("Failed to read file. Aborting...");
					thread.setArchived(true);
				}
			}
		}
		else if (content.split('\n')[0].trim() == process.env.prefix + "/MSG") {
			await djMsg(message, contentCased);
		}
		else if (content == process.env.prefix + "/SHUTBASICDOWN" && message.author.id == "521522396856057876") {
			await message.reply("sdfgsdfgsfdgsdfgsdfgsd");
			await client.destroy();
			process.exit();
		}
		else if (content == process.env.prefix + "/LOGSTATE" && message.author.id == "521522396856057876") {
			console.log(scriptLatestMessage, scriptForceExits, userScriptsRunning, message.channel.toString(), scriptLatestMessage[message.channel], scriptLatestMessage[message.channel] === NaN);
		}
		else if (message.channel.isThread() && content == process.env.prefix + "/TERMINATE") {
			let thread = message.channel;

			if (scriptForceExits[thread] !== undefined && (message.author.id == "521522396856057876" || message.channel == userScriptsRunning[message.author.id])) { // null !=== undefined. Also check if they own the thread or are me
				scriptForceExits[thread] = "Force exit by " + message.author.tag;
			}
		}
		else if (scriptLatestMessage[message.channel] === 0) {
			scriptLatestMessage[message.channel] = message.content.replace('’', '\'');
		}
	}
});

client.login(process.env.token);
//====================================================================================================


// ultra test code
// const asdf = `i = 1 
// IF i >= 1 
// i = i + 1
// END IF`.split('\n');
// let globals = {};
// const nothingIO = {
// 	"out": async (msg) => {},
// 	"debug": async (msg) => {},
// 	"error": async (msg) => {},
// 	"in": async (query) => {return "";},
// 	"onLineEnd": async (lnm) => {}
// };

// async function asdfg() {
// 	for (let l of asdf) {
// 		console.log(await decode(0, l, globals, nothingIO));
// 	}
// }; asdfg();
