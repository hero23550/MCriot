/*
MCriot (fixed) — made less busted by someone who enjoys breathing
*/

const mineflayer = require("mineflayer");
const args = process.argv.slice(2);
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const bots = [];
const desiredCount = parseInt(args[3], 10);

// usage check
if (!args[0] || !args[1] || !args[2] || !args[3] || !args[4] || Number.isNaN(desiredCount)) {
  console.log("usage: MCriot.js (ip) (port) (bot name) (bot count) (version)\nexample: MCriot.js localhost 25565 hello 10 1.8.9");
  process.exit(1);
}

console.log(`
$$\\      $$\\  $$$$$$\\            $$\\            $$
$$$\\    $$$ |$$  __$$\\           \\__|           $$ |
$$$$\\  $$$$ |$$ /  \\__| $$$$$$\\  $$\\  $$$$$$\\ $$$$$$\\
$$\\$$\\$$ $$ |$$ |      $$  __$$\\ $$ |$$  __$$\\\\_$$  _|
$$ \\$$$  $$ |$$ |      $$ |  \\__|$$ |$$ /  $$ | $$ |
$$ |\\$  /$$ |$$ |  $$\\ $$ |      $$ |$$ |  $$ | $$ |$$\\
$$ | \\_/ $$ |\\$$$$$$  |$$ |      $$ |\\$$$$$$  | \\$$$$  |
\\__|     \\__| \\______/ \\__|      \\__| \\______/   \\____/
            < MINECRAFT SPAMBOT BY N0NEXIST >
`);
console.log("* starting", desiredCount, "bots against", args[0] + ":" + args[1]);

// helper to create a bot object and register basic handlers
function createBot(host, port, baseName, version, index) {
  const username = `${baseName}_${Math.random().toString(36).slice(2, 7)}`;
  const bot = mineflayer.createBot({
    host,
    port: parseInt(port, 10),
    username,
    version
  });

  // track connection state
  bot._ready = false;

  bot.once('spawn', () => {
    bot._ready = true;
    console.log(`+ bot #${index} spawned (${username})`);
  });

  bot.on('kicked', (reason) => {
    console.log(`! bot #${index} (${username}) kicked: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(`! bot #${index} (${username}) error:`, err && err.message ? err.message : err);
  });

  bot.on('end', () => {
    console.log(`! bot #${index} (${username}) disconnected`);
    // optional: you could try to reconnect here
  });

  return bot;
}

// create all bots, including the special "chat-listener" bot
for (let i = 0; i < desiredCount; i++) {
  const bot = createBot(args[0], args[1], args[2], args[4], i + 1);
  bots.push(bot);
}

// choose the first bot in the array as the one that listens and prints chat
const chatevent = bots[0];

chatevent.on('chat', (username, message) => {
  // ignore messages from ourselves
  if (!chatevent.username) return;
  if (username === chatevent.username) return;
  console.log("[CHAT]", username, "->", message);
});

console.log("* bots are joining; you can now type commands");

// send a chat message from each bot, but only once the bot is spawned and ready
function chatAll(text) {
  bots.forEach((bot, idx) => {
    if (bot._ready) {
      try {
        bot.chat(text);
      } catch (e) {
        console.log(`! failed to chat from bot #${idx + 1}:`, e && e.message ? e.message : e);
      }
    } else {
      // not ready yet — schedule a one-time listener to send the message when spawned
      const onceSpawn = () => {
        try {
          bot.chat(text);
        } catch (e) {
          console.log(`! failed to chat from bot #${idx + 1} after spawn:`, e && e.message ? e.message : e);
        }
      };
      bot.once('spawn', onceSpawn);
    }
  });
}

function promptCMD(){
  readline.question('', command => {
    if (command.trim().length === 0) {
      promptCMD();
      return;
    }
    console.log(`+ sending "${command}" to all bots..`);
    chatAll(command);
    // also show locally what the designated listener bot will say (makes debugging clearer)
    if (chatevent._ready) {
      try { chatevent.chat(command); } catch(e) { /* silent */ }
    }
    promptCMD();
  });
}

// handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log("\n* shutting down bots...");
  readline.close();
  bots.forEach((b) => {
    try { b.end(); } catch (e) {}
  });
  setTimeout(() => process.exit(0), 500);
});

promptCMD();
