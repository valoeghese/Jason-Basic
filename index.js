fs = require('fs');
const { Client, GatewayIntentBits, Partials, MessageEmbed } = require('discord.js');

// https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
const readline = require('readline');
const fetch = require('node-fetch');
const { parse } = require('path');
require("dotenv").config();

const runtime = require("./src/runtime.js");

// https://amiradata.com/javascript-sleep-function/
const sleep = (milliseconds) => {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
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

const ALLOWED_MENTIONS = {
	"parse": ["users"]
};

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

async function djMsg(message, content, send_response, initial_state = null) {
	if (message.reference && !initial_state) {
		message.channel.messages.fetch(message.reference.messageId)
			.then(_replied => djMsg(message, content, send_response, _replied.content ?? ""));
		return;
	}

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
		await runtime.run(script, messageContextIO, initial_state ?? {});
	} catch (e) {
		console.log(e);

		// ensure it actually caps it at 1024
		if (resultMsg.length > 1024) {
			resultMsg = resultMsg.substring(0, Math.max(1, 1024 - e.toString().length));
		}

		await messageContextIO.error(e);
	}

	// send the message and/or errors
	send_response(message, {
		content: removeNonBlank(resultMsg),
		allowedMentions: ALLOWED_MENTIONS
	});
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

				let fileParts = file.split(/[\/\?]/);

				const thread = await message.startThread({
					"name": fileParts[fileParts.length - 2],
					"autoArchiveDuration": 60,
					"reason": "script evaluation"
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
							await thread.send({
								content: removeNonBlank(msg.toString()),
								allowedMentions: ALLOWED_MENTIONS
							});
						},
						"debug": async (msg) => await thread.send({
							content: removeNonBlank(msg.toString()),
							allowedMentions: ALLOWED_MENTIONS
						}),
						"error": async (msg) => await thread.send({
							content: removeNonBlank(msg.toString()),
							allowedMentions: ALLOWED_MENTIONS
						}),
						"in": async (query) => {
							await thread.send({
								content: removeNonBlank(query),
								allowedMentions: ALLOWED_MENTIONS
							});

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
						await runtime.run(script.split(/\r?\n/), scriptContextIO, {});
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
			await djMsg(message, contentCased, (msg, body) => msg.reply(body));
		}
		else if (content.split('\n')[0].trim() == process.env.prefix + "/MSG DETACH") {
			await djMsg(message, contentCased, (msg, body) => msg.channel.send(body));
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
