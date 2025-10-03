/**
 * MCriot_methods.js
 * Multiple safe bot-join methods for legitimate load testing.
 *
 * Usage:
 *  node MCriot_methods.js (ip) (port) (bot name) (bot count) (version) (method)
 *
 * Methods: stagger | burst | steady | backoff | polite
 *
 * NOTE: Do NOT use proxies or attempt to bypass throttling on servers you don't own.
 */

const mineflayer = require('mineflayer');
const args = process.argv.slice(2);
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

if (!args[0] || !args[1] || !args[2] || !args[3] || !args[4]) {
  console.log("usage: node MCriot_methods.js (ip) (port) (bot name) (bot count) (version) (method)");
  console.log("methods: stagger | burst | steady | backoff | polite");
  process.exit(1);
}

const host = args[0];
const port = parseInt(args[1], 10);
const baseName = args[2];
const totalBots = parseInt(args[3], 10);
const version = args[4];
const method = (args[5] || 'stagger').toLowerCase();

if (Number.isNaN(totalBots) || totalBots <= 0) {
  console.log("bot count must be a positive integer");
  process.exit(1);
}

// --- Tunable defaults (safe values) ---
const defaults = {
  stagger:     { joinRate: 2,    maxConcurrent: 6,   jitterMs: 400, baseBackoffMs: 1000, maxRetries: 6 },
  burst:       { joinRate: 20,   maxConcurrent: 25,  jitterMs: 200, baseBackoffMs: 800,  maxRetries: 6 },
  steady:      { joinRate: 5,    maxConcurrent: 8,   jitterMs: 300, baseBackoffMs: 1000, maxRetries: 6 },
  backoff:     { joinRate: 3,    maxConcurrent: 6,   jitterMs: 300, baseBackoffMs: 1200, maxRetries: 10 },
  polite:      { joinRate: 1,    maxConcurrent: 3,   jitterMs: 800, baseBackoffMs: 2000, maxRetries: 8 }
};

// Validate method
if (!defaults[method]) {
  console.log("unknown method:", method);
  console.log("valid methods:", Object.keys(defaults).join(', '));
  process.exit(1);
}

const cfg = defaults[method];
console.log(`* method=${method}  joinRate=${cfg.joinRate}/s  maxConcurrent=${cfg.maxConcurrent}  jitter=${cfg.jitterMs}ms`);

const bots = []; // store bot objects (or nulls during creation)
let created = 0; // how many bot instances have been requested/created
let starting = 0; // how many are currently in the process of starting

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function makeUsername() {
  return `${baseName}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripReason(r) {
  try { return typeof r === 'string' ? r : JSON.stringify(r); } catch (e) { return String(r); }
}

// create one bot instance with internal reconnect/backoff logic
function createBotInstance(index) {
  let attempt = 0;
  let destroyed = false;
  let bot = null;

  function tryCreate() {
    attempt++;
    const username = makeUsername();
    bot = mineflayer.createBot({ host, port, username, version });

    bot._meta = { index, username, attempt };
    bot._ready = false;

    bot.once('spawn', () => {
      bot._ready = true;
      console.log(`+ [#${index}] spawned (${username})`);
    });

    bot.on('kicked', reason => {
      console.log(`! [#${index}] kicked: ${stripReason(reason)}`);
    });

    bot.on('end', async (reason) => {
      console.log(`! [#${index}] disconnected: ${stripReason(reason)}`);
      bot._ready = false;
      if (destroyed) return;
      await handleReconnect(stripReason(reason));
    });

    bot.on('error', async (err) => {
      const msg = err && err.message ? err.message : String(err);
      console.log(`! [#${index}] error: ${msg}`);
      bot._ready = false;
      if (destroyed) return;
      await handleReconnect(msg);
    });

    // chat listener only on bot #1
    if (index === 1) {
      bot.on('chat', (username, message) => {
        if (!bot.username) return;
        if (username === bot.username) return;
        console.log("[CHAT]", username, "->", message);
      });
    }

    bots[index - 1] = bot;
  }

  async function handleReconnect(errorMsg) {
    if (attempt >= cfg.maxRetries) {
      console.log(`! [#${index}] reached max retries (${cfg.maxRetries}). Giving up.`);
      return;
    }

    // basic throttle detection
    let extra = 0;
    if (errorMsg && /throttl|wait|rate limit|too many/i.test(errorMsg)) {
      extra = 1500;
      console.log(`! [#${index}] detected throttle-like message; backing off extra.`);
    }

    // method-specific adaptions:
    // - backoff method increases aggressiveness of backoff count
    // - polite method adds extra wait
    let methodExtra = 0;
    if (method === 'polite') methodExtra = 1000;
    if (method === 'backoff') methodExtra = 0; // nothing special here; maxRetries higher

    const backoff = Math.round(cfg.baseBackoffMs * (2 ** (attempt - 1))) + extra + methodExtra;
    console.log(`* [#${index}] reconnect attempt ${attempt + 1} in ${backoff}ms`);
    await sleep(backoff);

    // ensure old object cleaned
    try { bot && bot.end(); } catch (e) {}

    tryCreate();
  }

  tryCreate();

  return {
    stop() { destroyed = true; try { bot && bot.end(); } catch (e) {} }
  };
}

// --- Scheduler / orchestrator with selectable methods
async function orchestrator() {
  console.log(`* starting up to ${totalBots} bots against ${host}:${port}`);

  // Helpers to compute scheduling behavior per-method
  const interArrivalMs = Math.max(1, Math.round(1000 / cfg.joinRate)); // nominal ms between planned starts

  while (created < totalBots) {
    // rough concurrency: number of bots currently spawned or starting
    const activeReady = bots.filter(b => b && b._ready).length;
    const activeStarting = starting;
    const activeTotal = activeReady + activeStarting;

    // method-specific flow control
    if (method === 'stagger' || method === 'polite') {
      // conservative: respect maxConcurrent strictly and wait between joins
      if (activeTotal >= cfg.maxConcurrent) {
        await sleep(150);
        continue;
      }
      created++;
      starting++;
      const idx = created;
      const jitter = Math.floor(Math.random() * cfg.jitterMs);
      setTimeout(() => {
        console.log(`* creating bot #${idx} (stagger)`);
        createBotInstance(idx);
        starting--;
      }, jitter);
      await sleep(interArrivalMs);
    } else if (method === 'burst') {
      // create up to maxConcurrent as fast as possible until total reached
      if (activeTotal >= cfg.maxConcurrent) {
        await sleep(200);
        continue;
      }
      created++;
      const idx = created;
      console.log(`* creating bot #${idx} (burst)`);
      createBotInstance(idx);
      // very small pause to allow sockets to be scheduled
      await sleep(Math.max(10, Math.round(cfg.jitterMs / 4)));
    } else if (method === 'steady') {
      // keep a steady arrival rate, but avoid exceeding maxConcurrent
      if (activeTotal >= cfg.maxConcurrent) {
        await sleep(100);
        continue;
      }
      created++;
      starting++;
      const idx = created;
      const jitter = Math.floor(Math.random() * cfg.jitterMs);
      setTimeout(() => {
        console.log(`* creating bot #${idx} (steady)`);
        createBotInstance(idx);
        starting--;
      }, jitter);
      await sleep(interArrivalMs);
    } else if (method === 'backoff') {
      // similar to stagger but allow longer waits if many failures (handled by per-bot backoff)
      if (activeTotal >= cfg.maxConcurrent) {
        await sleep(200);
        continue;
      }
      created++;
      starting++;
      const idx = created;
      const jitter = Math.floor(Math.random() * cfg.jitterMs);
      setTimeout(() => {
        console.log(`* creating bot #${idx} (backoff)`);
        createBotInstance(idx);
        starting--;
      }, jitter);
      await sleep(Math.max(100, interArrivalMs)); // slower than burst
    } else {
      // fallback safe behavior
      await sleep(200);
    }
  }

  console.log(`* requested creation of ${created} bots; they may still be retrying/spawning.`);
}

// chat sending: send from bots that are ready; schedule for those not ready
function chatAll(text) {
  bots.forEach((bot, idx) => {
    if (!bot) return;
    if (bot._ready) {
      try { bot.chat(text); } catch (e) { /* ignore send errors */ }
    } else {
      // send once on spawn
      const onceSpawn = () => {
        try { bot.chat(text); } catch (e) {}
      };
      try { bot.once('spawn', onceSpawn); } catch (e) {}
    }
  });
}

// prompt loop
function promptCMD(){
  readline.question('', command => {
    if (command.trim().length === 0) { promptCMD(); return; }
    console.log(`+ sending "${command}" to all bots..`);
    chatAll(command);
    // local echo via first ready bot (if any)
    const firstReady = bots.find(b => b && b._ready);
    if (firstReady) try { firstReady.chat(command); } catch (e) {}
    promptCMD();
  });
}

// graceful shutdown
process.on('SIGINT', () => {
  console.log("\n* shutting down bots...");
  readline.close();
  bots.forEach(b => { try { b && b.end(); } catch (e) {} });
  setTimeout(() => process.exit(0), 400);
});

// start orchestrator and prompt
orchestrator().catch(err => console.error("orchestrator failed:", err));
promptCMD();
