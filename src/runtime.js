const tokeniser = require("./tokeniser.js");
const compiler = require("./compiler.js");

const LABEL_REGEX = /[A-z0-9 ]+/;

// i comment my code very well thank you

async function run(procedure, io) {
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
        let lnm = i + 1; // the actual line number

		// handle breakpoints first. done by placing * at the end of a line. breaks BEFORE the line.
		if (line[line.length - 1] == '*') {
			instructions.push({"type": "INPUT_DISCARD", "line": lnm, "expression": vars => "Breakpoint @ line " + (lnm) + ", " + vars2str(vars)});
			line = line.substring(0, line.length - 1); // remove the * at the end for main decoding
		}

		// empty lines and comments are No-Op
		// comments can be done with #, %, or //
		// or with the REM keyword which is also reserved.
		// Also inline comments are not supported
		if (line.length == 0 || line[0] == '#' || line[0] == '%' || (line.length > 1 && line[0] == '/' && line[1] == '/') || (line.startsWith("REM "))) {
			// do nothing. this is a comment.
		} else if (line[line.length - 1] == ':') {
            // handle labels first
            // assume all lines ending in : are labels
            let labelName = line.slice(0, line.length - 1).trim();

            if (LABEL_REGEX.test(labelName)) {
                instructions.push({"type": "LABEL", "label": labelName, "line": lnm}); // no-op line, merely a label definition for later jumping.
            }
            else {
                throw exception(lnm, "Invalid label \"" + labelName + "\". Only A-z, 0-9, and space characters are permitted!")
            }
		} else {
            let tokens = await tokeniser.tokenise(lnm, line, compiler.KEYWORDS);
			let decoded = await compiler.decode(lnm, tokens, decode_Globals, io); // decode into list of instructions
			instructions.push(...decoded); // append
        }

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
			case "ASSIGN_ELEMENT":
				variables[instruction.var][instruction.index(variables)] = instruction.expression(variables);
				break;
			case "LABEL":
				// labels are handled prior to execution
				break;
			case "ASSERT":
				// can be used by the compiler to verify things at runtime
				// simply throw a runtime exception in the expression evaluation
				instruction.expression(variables);
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
				jmpIndex = labels[instruction.expression(variables)];
				await yieldControl();

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

				await yieldControl();

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

// to prevent infinte loops in BASIC code from denial-of-servicing other subprocesses in the program.
function yieldControl() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function exception(lineNum, msg) {
	return "Exception at line " + lineNum + ":\n>> " + msg;
}

module.exports = {
    run
};
