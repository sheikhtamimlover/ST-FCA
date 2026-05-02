"use strict";

const fs = require('fs');
const path = require('path');
const fca = require('./index');

const PREFIX = '!';
const THREAD_ID = ""; //your group/thread tid id add 
const COOKIE_FILE = path.join(__dirname, 'cookie.txt'); // account connect  json cookie add
const TST = path.join(__dirname, 'tst'); // your attahement test send folder

// ─── Command definitions ───────────────────────────────────────────────────────
const commands = {
    help: {
        desc: 'Show all commands',
        usage: '!help',
        run: async (api, event) => {
            const list = Object.entries(commands)
                .map(([n, c]) => `${PREFIX}${n} — ${c.desc}`)
                .join('\n');
            await send(api, event.threadID, `📋 Commands:\n\n${list}`);
        }
    },
    ping: {
        desc: 'Check if bot is alive',
        usage: '!ping',
        run: async (api, event) => {
            await send(api, event.threadID, '🏓 Pong! Bot is online.');
        }
    },
    tc: {
        desc: 'Run full send test suite (text, images, video, audio)',
        usage: '!tc',
        run: async (api, event) => {
            await send(api, event.threadID, '🧪 Starting test suite...');
            await runTests(api, event.threadID);
        }
    },
    img: {
        desc: 'Send a test image (img.png from tst/)',
        usage: '!img [img2]',
        run: async (api, event, args) => {
            const file = args[0] === 'img2' ? 'img2.png' : 'img.png';
            const p = path.join(TST, file);
            if (!fs.existsSync(p)) return send(api, event.threadID, `❌ File not found: tst/${file}`);
            await sendAttachment(api, event.threadID, '', [fs.createReadStream(p)]);
        }
    },
    imgs: {
        desc: 'Send both test images at once',
        usage: '!imgs',
        run: async (api, event) => {
            const files = ['img.png', 'img2.png'].map(f => path.join(TST, f));
            const missing = files.filter(f => !fs.existsSync(f));
            if (missing.length) return send(api, event.threadID, `❌ Missing: ${missing.join(', ')}`);
            await sendAttachment(api, event.threadID, '📷 Two images!', files.map(f => fs.createReadStream(f)));
        }
    },
    video: {
        desc: 'Send test video (vid.mp4 from tst/)',
        usage: '!video',
        run: async (api, event) => {
            const p = path.join(TST, 'vid.mp4');
            if (!fs.existsSync(p)) return send(api, event.threadID, '❌ File not found: tst/vid.mp4');
            await sendAttachment(api, event.threadID, '🎬 Video!', [fs.createReadStream(p)]);
        }
    },
    audio: {
        desc: 'Send test audio (audio.mp3 from tst/)',
        usage: '!audio',
        run: async (api, event) => {
            const p = path.join(TST, 'audio.mp3');
            if (!fs.existsSync(p)) return send(api, event.threadID, '❌ File not found: tst/audio.mp3');
            await sendAttachment(api, event.threadID, '🔊 Audio!', [fs.createReadStream(p)]);
        }
    },
    upload: {
        desc: 'Test uploadAttachment API with img.png',
        usage: '!upload',
        run: async (api, event) => {
            const p = path.join(TST, 'img.png');
            if (!fs.existsSync(p)) return send(api, event.threadID, '❌ File not found: tst/img.png');
            const result = await api.uploadAttachment([fs.createReadStream(p)]);
            await send(api, event.threadID, `✅ Upload OK:\n${JSON.stringify(result, null, 2)}`);
        }
    },
    echo: {
        desc: 'Echo back a message',
        usage: '!echo <text>',
        run: async (api, event, args) => {
            if (!args.length) return send(api, event.threadID, '⚠️ Usage: !echo <text>');
            await send(api, event.threadID, args.join(' '));
        }
    },
    reply: {
        desc: 'Reply to the message that triggered this command',
        usage: '!reply <text>',
        run: async (api, event, args) => {
            if (!args.length) return send(api, event.threadID, '⚠️ Usage: !reply <text>');
            await api.sendMessage(
                { body: args.join(' ') },
                event.threadID,
                null,
                event.messageID
            );
        }
    },
    uid: {
        desc: 'Show bot userID and thread info',
        usage: '!uid',
        run: async (api, event) => {
            await send(api, event.threadID,
                `🤖 Bot UID: ${api.getCurrentUserID()}\n📌 Thread: ${event.threadID}`
            );
        }
    },
    thread: {
        desc: 'Show info about this thread',
        usage: '!thread',
        run: async (api, event) => {
            api.getThreadInfo(event.threadID, async (err, info) => {
                if (err) return send(api, event.threadID, '❌ ' + err.message);
                await send(api, event.threadID,
                    `📌 Thread: ${info.name || '(unnamed)'}\n` +
                    `👥 Members: ${info.participantIDs.length}\n` +
                    `🔑 ID: ${info.threadID}\n` +
                    `👤 Group: ${info.isGroup ? 'Yes' : 'No'}`
                );
            });
        }
    },
    mqtt: {
        desc: 'Show MQTT connection status',
        usage: '!mqtt',
        run: async (api, event) => {
            const mc = api.mqttClient || (api.ctx && api.ctx.mqttClient);
            if (!mc) return send(api, event.threadID, '❓ MQTT client not exposed');
            await send(api, event.threadID,
                `📡 MQTT Status:\n` +
                `  connected: ${mc.connected}\n` +
                `  reconnecting: ${mc.reconnecting}`
            );
        }
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function send(api, threadID, body) {
    return new Promise((res, rej) => {
        api.sendMessage({ body }, threadID, (err, r) => err ? rej(err) : res(r));
    });
}

function sendAttachment(api, threadID, body, attachments) {
    return new Promise((res, rej) => {
        api.sendMessage({ body, attachment: attachments }, threadID, (err, r) => err ? rej(err) : res(r));
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Test suite ───────────────────────────────────────────────────────────────
async function runTests(api, threadID) {
    const tid = threadID || THREAD_ID;
    const steps = [
        {
            label: '1/5 Text',
            run: () => send(api, tid, 'Hello from ST-FCA v1.0.28! ✅')
        },
        {
            label: '2/5 Two images',
            run: () => {
                const p1 = path.join(TST, 'img.png');
                const p2 = path.join(TST, 'img2.png');
                if (!fs.existsSync(p1) || !fs.existsSync(p2)) throw new Error('img.png or img2.png missing in tst/');
                return sendAttachment(api, tid, '📷 Two images!', [
                    fs.createReadStream(p1),
                    fs.createReadStream(p2)
                ]);
            }
        },
        {
            label: '3/5 Video',
            run: () => {
                const p = path.join(TST, 'vid.mp4');
                if (!fs.existsSync(p)) throw new Error('vid.mp4 missing in tst/');
                return sendAttachment(api, tid, '🎬 Video!', [fs.createReadStream(p)]);
            }
        },
        {
            label: '4/5 Audio',
            run: () => {
                const p = path.join(TST, 'audio.mp3');
                if (!fs.existsSync(p)) throw new Error('audio.mp3 missing in tst/');
                return sendAttachment(api, tid, '🔊 Audio!', [fs.createReadStream(p)]);
            }
        },
        {
            label: '5/5 uploadAttachment',
            run: () => {
                const p = path.join(TST, 'img.png');
                if (!fs.existsSync(p)) throw new Error('img.png missing in tst/');
                return api.uploadAttachment([fs.createReadStream(p)]);
            }
        }
    ];

    for (const step of steps) {
        process.stdout.write(`  [TEST ${step.label}]... `);
        try {
            const r = await step.run();
            console.log('✅ OK', typeof r === 'object' ? JSON.stringify(r).slice(0, 80) : '');
        } catch (e) {
            console.log('❌ FAILED:', e && e.message || String(e));
        }
        await sleep(1200);
    }
    console.log('\n[ALL TESTS DONE]\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    let appState;
    try {
        appState = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    } catch (e) {
        console.error('[BOT] Failed to read cookie.txt:', e.message);
        process.exit(1);
    }

    fca({ appState }, {
        selfListen: false,
        listenEvents: true,
        autoMarkDelivery: false,
        autoMarkRead: false,
        autoReconnect: true
    }, async (err, api) => {
        if (err) {
            console.error('[BOT] Login failed:', err.message || err);
            return process.exit(1);
        }

        console.log(`[BOT] ✅ Logged in! UID: ${api.getCurrentUserID()}`);
        console.log(`[BOT] Prefix: "${PREFIX}" | Thread: ${THREAD_ID}`);
        console.log(`[BOT] Send "${PREFIX}help" to see all commands.\n`);

        api.listen((err, event) => {
            if (err) return console.error('[BOT] Listen error:', err.message || err);
            if (!event) return;

            const type = event.type;

            // Log incoming messages
            if (type === 'message' || type === 'message_reply') {
                console.log(`[MSG] [${event.threadID}] ${event.senderID}: ${event.body || '(attachment)'}`);

                const body = (event.body || '').trim();
                if (!body.startsWith(PREFIX)) return;

                const parts = body.slice(PREFIX.length).trim().split(/\s+/);
                const cmdName = parts[0].toLowerCase();
                const args = parts.slice(1);
                const cmd = commands[cmdName];

                if (!cmd) {
                    send(api, event.threadID, `❓ Unknown command: ${PREFIX}${cmdName}\nType ${PREFIX}help for list.`).catch(() => {});
                    return;
                }

                cmd.run(api, event, args).catch(e => {
                    console.error(`[CMD ERROR] ${cmdName}:`, e && e.message || e);
                    send(api, event.threadID, `❌ Error in ${PREFIX}${cmdName}: ${e && e.message || String(e)}`).catch(() => {});
                });

            } else if (type === 'typ') {
                // Silently log typing
            } else if (type === 'message_reaction') {
                console.log(`[REACT] ${event.senderID} → ${event.reaction} on ${event.messageID}`);
            }
        });
    });
}

main().catch(e => {
    console.error('[BOT] Fatal:', e.message || e);
    process.exit(1);
});
