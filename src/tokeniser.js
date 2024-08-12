///// The Tokeniser /////
// now v2: a lot more readable

const TYPE_OPERATOR = "OPERATOR";
const TYPE_SEPARATOR = "SEPARATOR";
const TYPE_NUMBER = "NUMBER";
const TYPE_STRING = "STRING";
const TYPE_VAR = "VAR";
const TYPE_KEYWORD = "KEYWORD";

///// Utility Functions /////
function syntaxException(msg) {
	return {
		"type": "Syntax Error",
		"message": msg
	}
}

function tokeniserError(msg) {
	return {
		"type": "Tokeniser Error",
		"message": msg
	}
}

///// Tokenising Task Functions /////
function parseString(expression, ptr) {
	/* Tester */
	if (expression[ptr++] !== "\"") {
		return null; // try next parser
	}

	/* Parser */
	let escape = false;
	let stringAccumulator = "";

	while (ptr < expression.length) {
		let c = expression[ptr++];

		if (escape) {
			stringAccumulator += c;
			escape = false;
		} else if (c == "\"") {
			return [{
				"type": TYPE_STRING,
				"value": stringAccumulator
			}, ptr];
		} else if (c == "\\") {
			escape = true;
		} else {
			stringAccumulator += c;
		}
	}

	throw syntaxException("Unclosed string");
}

function createRegexParser(regex, type) {
	if (type === undefined) {
		throw "Both parameters of createRegexParser should be specified";
	}

	// prevent improper parsers being created
	if (!regex.source.startsWith("^")) {
		// add string start operator
		regex = new RegExp(`^${regex.source}`, regex.flags);
	}

	return (expression, ptr) => {
		const testString = expression.substring(ptr);
		const match = regex.exec(testString);

		/* Tester */
		if (!match || match.index !== 0) {
			return null;
		}
		
		/* Parser */
		let value = testString.substring(0, match[0].length);
		return [{type, value}, ptr + match[0].length]
	};
}

const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/;

const BRACKETS_OPERATORS_REGEX = /[\(\)\+\-\*\/\!\&\|\=\>\<\%]/;
const SEPARATORS_REGEX = /,/;
const NUMBERS_REGEX = /[0-9]+/;

// Define the handlers, in priority order
const HANDLERS = [
	createRegexParser(/\s+/, null), // whitespace consumer
	parseString,
	createRegexParser(IDENTIFIER_REGEX, TYPE_VAR),
	createRegexParser(BRACKETS_OPERATORS_REGEX, TYPE_OPERATOR),
	createRegexParser(SEPARATORS_REGEX, TYPE_SEPARATOR),
	createRegexParser(NUMBERS_REGEX, TYPE_NUMBER)
];

///// Actual Tokeniser Function /////
async function tokenise(lnm, expression, keywords) {
	try {
		let ptr = 0;
		let tokens = [];

		tokeniserLoop: while (ptr < expression.length) {
			for (let id in HANDLERS) {
				const handler = HANDLERS[id];
				const response = handler(expression, ptr);

				// null = cannot parse
				if (response !== null) {
					const [token, newPtr] = response;
					
					if (ptr == newPtr) {
						throw tokeniserError(`Tokeniser handler ${id} parsed expression but did not consume any characters?!`);
					}

					if (token.type) tokens.push(token);
					ptr = newPtr;
					continue tokeniserLoop; //handled. move on to handling next thing
				}
			}

			throw tokeniserError(`Unexpected character ${expression[ptr]}`);
		}

		// var -> keyword
		for (let idx in tokens) {
			if (tokens[idx].type === TYPE_VAR && keywords.indexOf(tokens[idx].value) !== -1) {
				tokens[idx].type = TYPE_KEYWORD;
			}
		}

		return tokens;
	} catch (e) {
		if (e.type) {
			throw `${e.type} Error at line ${lnm}:\n>> ${e.message}`;
		} else {
			throw e;
		}
	}
}

module.exports = {
    tokenise
};
