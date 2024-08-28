// preProcess
// Takes in a stream of tokens for a line and outputs the replacement tokens
// Inputs
// - lnm: the line number
// - tokens: the tokens for the line
// - globals: the globals for the preprocessor and compiler
// - compilerKeywords: compiler keywords, for passing to the tokeniser
async function preProcess(lnm, tokens, globals, compilerKeywords) {
    // Initialise preprocessor globals if first time
    if (globals.defines == undefined) globals.defines = {}; // For preproccesor macros
    if (globals.expandCount === undefined) globals.expandCount = {}; // For expansion "depth" checking

    if (tokens.length > 0 && tokens[0].type === "PREPROCESSOR") {
        const instruction = tokens.shift();

        // modify tokens
        switch (instruction.value) {
        case ":DEFINE":
            if (tokens.length !== 2) {
                throw exception(lnm, "DEFINE not of form DEFINE name evaulation! Correct syntax: `:DEFINE <MACRO_NAME> \"evaluation\"");
            }
            if (tokens[0].type !== "VAR") {
                throw exception(lnm, "DEFINE macro name is not a valid identifier!");
            }
            if (tokens[1].type !== "STRING") {
                throw exception(lnm, "DEFINE value is not a string!");
            }
            globals.defines[tokens[0].value] = tokens[1].value;
            return "";
        case ":EXPAND":
            // syntax check
            if (tokens.length === 0) {
                throw exception(lnm, "EXPAND doesn't have DEFINE macro name to expand!");
            }

            // check depth
            if (globals.expandCount[lnm] !== undefined) {
                if (++globals.expandCount[lnm] > 100) {
                    throw exception(lnm, "Cannot EXPAND more than 100 times for the same line. Is your macro recursive?");
                }
            } else {
                globals.expandCount[lnm] = 0;
            }

            // actual execution
            let name = tokens[0].value;
            let define = globals.defines[name];
            
            if (tokens.length > 1) {
                for (var i = 1; i < tokens.length; i++) {
                    define = define.replaceAll("{{" + i + "}}", tokens[i].value);
                }
            }
            return define;
        default:
            throw exception(lnm, "Preprocessor Direction " + instruction.value + " has no defined behaviour.");
        }
    }

    return null; // nothing changed
}

function exception(lineNum, msg) {
	return "Preprocessor Error at line " + lineNum + ":\n>> " + msg;
}

// define module exports

module.exports = {
    preProcess
};
