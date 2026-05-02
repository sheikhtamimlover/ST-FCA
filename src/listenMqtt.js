/* eslint-disable no-redeclare */
"use strict";
var utils = require("../utils");
var log = require("npmlog");
var mqtt = require('mqtt');
var WebSocket = require('ws');
var Transform = require('stream').Transform;
const EventEmitter = require('events');

// ─── ANSI colour helpers ───────────────────────────────────────────────────────
var C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    // foregrounds
    black:   '\x1b[30m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    // bright foregrounds
    bBlack:   '\x1b[90m',
    bRed:     '\x1b[91m',
    bGreen:   '\x1b[92m',
    bYellow:  '\x1b[93m',
    bBlue:    '\x1b[94m',
    bMagenta: '\x1b[95m',
    bCyan:    '\x1b[96m',
    bWhite:   '\x1b[97m',
    // backgrounds
    bgBlue:    '\x1b[44m',
    bgCyan:    '\x1b[46m',
    bgMagenta: '\x1b[45m',
    bgGreen:   '\x1b[42m',
    bgBlack:   '\x1b[40m',
};

// ─── MQTT Spinner ──────────────────────────────────────────────────────────────
var _mqttSpinner = null;

function startMqttSpinner(region) {
    var frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    var fi = 0;
    var regionStr = region ? (' ' + C.dim + C.bCyan + '[' + region.toUpperCase() + ']' + C.reset) : '';
    process.stdout.write('\n');
    _mqttSpinner = setInterval(function () {
        var frame = frames[fi++ % frames.length];
        process.stdout.write(
            '\r  ' +
            C.bold + C.bCyan + frame + C.reset + '  ' +
            C.cyan + 'ST-FCA' + C.reset + ' ' +
            C.dim + 'connecting to MQTT' + C.reset +
            regionStr +
            C.dim + ' ...' + C.reset +
            '   '
        );
    }, 80);
}

function stopMqttSpinner() {
    if (_mqttSpinner) {
        clearInterval(_mqttSpinner);
        _mqttSpinner = null;
    }
    // erase the spinner line completely
    process.stdout.write('\r\x1b[2K');
}

function printMqttBanner(region, autoReconnect) {
    stopMqttSpinner();

    // W = inner column width (between the two ║ borders, excluding the ║ chars themselves).
    // Emoji are double-width in terminals — each one occupies 2 columns but has
    // .length === 1, so we add +1 per emoji when computing the visible column width
    // so the padding math comes out right.
    var W = 50;

    var border    = C.bold + C.bCyan;
    var titleClr  = C.bold + C.bGreen;
    var labelClr  = C.bold + C.bWhite;
    var valClr    = C.bYellow;
    var accentClr = C.bold + C.bMagenta;
    var urlClr    = C.bBlue;
    var rst       = C.reset;

    var regionVal = (region ).toUpperCase();
    var reconnTxt = autoReconnect ? 'Enabled (3s)' : 'Disabled';
    var reconnClr = autoReconnect ? C.bGreen : C.bRed;
    var reconnVal = reconnClr + reconnTxt + rst;

    // Each row: [ ansiText, terminalColumnsUsed ]
    // terminalColumnsUsed = printable chars + 1 extra per emoji (double-width).
    var rows = [
        // ✅ = +1 extra col
        [ titleClr + '  ✅  ST-FCA MQTT Connected'           + rst,  27 ],
        [ '',                                                          0  ],
        // 📍 = +1 extra col
        [ labelClr + '  📍  Region         ' + rst + valClr + regionVal + rst,  22 + regionVal.length ],
        // 🔄 = +1 extra col
        [ labelClr + '  🔄  Auto-reconnect  ' + rst + reconnVal,          23 + reconnTxt.length ],
        // 🌐 = +1 extra col
        [ urlClr   + '  🌐  github.com/sheikhtamimlover/ST-BOT' + rst,  43 ],
        [ '',                                                          0  ],
        // 💎 = +1 extra col
        [ accentClr + '  💎  Maintained by ST | Sheikh Tamim'  + rst,  39 ],
    ];

    var tl = border + '╔' + '═'.repeat(W + 2) + '╗' + rst;
    var bl = border + '╚' + '═'.repeat(W + 2) + '╝' + rst;

    process.stdout.write('\n');
    console.log(tl);
    rows.forEach(function (r) {
        var text = r[0], cols = r[1];
        var pad = Math.max(0, W - cols);
        console.log(border + '║ ' + rst + text + ' '.repeat(pad) + ' ' + border + '║' + rst);
    });
    console.log(bl);
    process.stdout.write('\n');
}

/**
 * Facebook sends non-standard MQTT packets where PUBACK/SUBACK have
 * non-zero reserved flag bits (e.g. 0x4F instead of 0x40).
 * mqtt-packet strictly rejects these. This transform stream patches
 * the first byte of each MQTT frame to clear the lower nibble (flags),
 * keeping only the packet type (upper nibble).
 *
 * MQTT fixed header: byte[0] = (type << 4) | flags
 * For PUBACK (type=4): valid = 0x40, FB may send 0x4F → we clear to 0x40
 */
function createMqttPatchStream() {
    var buf = null;

    // Walk frame by frame. For types that must have flags=0 per the MQTT spec
    // (CONNACK=2, PUBACK=4, SUBACK=9, UNSUBACK=11, PINGRESP=13), clear the
    // lower nibble that Facebook sets to non-zero values.
    var stream = new Transform({
        transform: function (chunk, encoding, callback) {
            if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk, encoding);

            // Prepend any leftover bytes from the previous chunk
            var out;
            if (buf) {
                out = Buffer.concat([buf, chunk]);
                buf = null;
            } else {
                out = Buffer.from(chunk);
            }

            var i = 0;
            while (i < out.length) {
                var b = out[i];
                var type = (b >> 4) & 0x0F;
                var flags = b & 0x0F;
                // Types that MUST have flags=0:
                if (flags !== 0 && (type === 4 || type === 9 || type === 11 || type === 13 || type === 2)) {
                    out[i] = (b & 0xF0); // clear lower nibble
                }
                // Skip past this frame: read the varint length
                i++;
                var multiplier = 1;
                var frameLen = 0;
                var lenOk = false;
                while (i < out.length) {
                    var lb = out[i++];
                    frameLen += (lb & 0x7F) * multiplier;
                    multiplier *= 128;
                    if ((lb & 0x80) === 0) { lenOk = true; break; }
                    if (multiplier > 128 * 128 * 128) break; // malformed
                }
                if (!lenOk) {
                    // Incomplete frame — save remainder for next chunk
                    buf = out.slice(i - 1);
                    out = out.slice(0, i - 1);
                    break;
                }
                i += frameLen;
            }

            callback(null, out);
        },
        flush: function (callback) {
            if (buf && buf.length > 0) callback(null, buf);
            else callback();
            buf = null;
        }
    });
    return stream;
}

var identity = function () { };
var form = {};
var getSeqID = function () { };

var topics = [
    "/legacy_web",
    "/webrtc",
    "/rtc_multi",
    "/onevc",
    "/br_sr",
    "/sr_res",
    "/t_ms",
    "/thread_typing",
    "/orca_typing_notifications",
    "/notify_disconnect",
    "/orca_presence",
    "/inbox",
    "/mercury",
    "/messaging_events",
    "/orca_message_notifications",
    "/pp",
    "/webrtc_response",
    "/ls_resp"
];

function sanitizeHeaderValue(value) {
    if (value === null || value === undefined) return "";
    var str = String(value);
    if (str.trim().startsWith("[") && str.trim().endsWith("]")) {
        try {
            var parsed = JSON.parse(str);
            if (Array.isArray(parsed)) return "";
        } catch (_) { }
    }
    str = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F\r\n\[\]]/g, "").trim();
    return str;
}

function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
    var chatOn = ctx.globalOptions.online;
    var foreground = false;
    var sessionID = Math.floor(Math.random() * 9007199254740991) + 1;
    var GUID = utils.getGUID();

    var username = {
        u: ctx.userID,
        s: sessionID,
        chat_on: chatOn,
        fg: foreground,
        d: GUID,
        ct: 'websocket',
        aid: '219994525426954',
        aids: null,
        mqtt_sid: '',
        cp: 3,
        ecp: 10,
        st: [],
        pm: [],
        dc: '',
        no_auto_fg: true,
        gas: null,
        pack: [],
        p: null,
        php_override: ""
    };

    var cookies = ctx.jar.getCookies("https://www.facebook.com").join("; ");
    var host;
    if (ctx.mqttEndpoint) {
        // Ensure no duplicate sid/cid — strip any existing ones then append fresh
        var baseEndpoint = ctx.mqttEndpoint
            .replace(/[?&]sid=[^&]*/g, '')
            .replace(/[?&]cid=[^&]*/g, '');
        // Re-attach the ? if it was stripped along with the first param
        if (baseEndpoint.indexOf('?') === -1 && ctx.mqttEndpoint.indexOf('?') !== -1) {
            baseEndpoint = baseEndpoint.replace(/&/, '?');
        }
        var sep = baseEndpoint.indexOf('?') === -1 ? '?' : '&';
        host = baseEndpoint + sep + "sid=" + sessionID + "&cid=" + GUID;
    } else if (ctx.region) {
        host = "wss://edge-chat.facebook.com/chat?region=" + ctx.region.toLowerCase() + "&sid=" + sessionID + "&cid=" + GUID;
    } else {
        host = "wss://edge-chat.facebook.com/chat?sid=" + sessionID + "&cid=" + GUID;
    }

    var ua = ctx.globalOptions.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";

    var wsHeaders = {
        Cookie: sanitizeHeaderValue(cookies),
        Origin: "https://www.facebook.com",
        "User-Agent": sanitizeHeaderValue(ua),
        Referer: "https://www.facebook.com/",
        Host: "edge-chat.facebook.com",
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
    };

    if (ctx.region) wsHeaders["X-MSGR-Region"] = sanitizeHeaderValue(ctx.region);

    var wsOptions = {
        headers: wsHeaders,
        origin: "https://www.facebook.com",
        protocolVersion: 13,
        binaryType: "arraybuffer"
    };

    if (typeof ctx.globalOptions.proxy !== "undefined") {
        var { HttpsProxyAgent } = require('https-proxy-agent');
        wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    }

    var mqttOptions = {
        clientId: "mqttwsclient",
        protocolId: "MQIsdp",
        protocolVersion: 3,
        username: JSON.stringify(username),
        clean: true,
        keepalive: 30,
        reschedulePings: true,
        reconnectPeriod: 0,
        connectTimeout: 12000
    };

    // Use MqttClient with a proper Duplex:
    //   Write side: mqtt → duplex.write → wsStream.write → WebSocket (send to FB)
    //   Read side:  WebSocket msg → wsStream readable → patcher (fix FB header bits) → duplex.push → mqtt reads
    function buildStream() {
        var Duplex = require('stream').Duplex;
        var ws = new WebSocket(host, wsOptions);
        ws.on('error', function () { }); // suppress unhandled ws errors

        var wsStream = WebSocket.createWebSocketStream(ws, { objectMode: false });
        var patcher = createMqttPatchStream();

        // Wire: wsStream readable → patcher → push into duplex
        wsStream.pipe(patcher);

        var duplex = new Duplex({
            read: function () { },
            write: function (chunk, enc, cb) {
                wsStream.write(chunk, enc, cb);
            },
            final: function (cb) {
                wsStream.end(cb);
            },
            destroy: function (err, cb) {
                try { wsStream.destroy(err); } catch (_) { }
                cb(err);
            }
        });

        patcher.on('data', function (data) {
            if (!duplex.destroyed) duplex.push(data);
        });
        patcher.on('end', function () {
            if (!duplex.destroyed) duplex.push(null);
        });
        patcher.on('error', function (e) {
            if (!duplex.destroyed) duplex.destroy(e);
        });
        wsStream.on('error', function (e) {
            if (!duplex.destroyed) duplex.destroy(e);
        });

        return duplex;
    }

    startMqttSpinner(ctx.region);

    ctx.mqttClient = new mqtt.MqttClient(buildStream, mqttOptions);
    global.mqttClient = ctx.mqttClient;

    var mqttClient = ctx.mqttClient;

    mqttClient.on('error', function (err) {
        stopMqttSpinner();
        log.error("listenMqtt", err);
        mqttClient.end();
        if (ctx.globalOptions.autoReconnect) getSeqID();
        else globalCallback({ type: "stop_listen", error: "Connection refused: Server unavailable" }, null);
    });

    mqttClient.on('close', function () { });
    mqttClient.on('offline', function () { });
    mqttClient.on('reconnect', function () { });

    mqttClient.on('connect', function () {
        topics.forEach(function (topic) { mqttClient.subscribe(topic); });

        printMqttBanner(ctx.region, ctx.globalOptions.autoReconnect);

        var topic;
        var queue = {
            sync_api_version: 10,
            max_deltas_able_to_process: 1000,
            delta_batch_size: 500,
            encoding: "JSON",
            entity_fbid: ctx.userID,
        };

        if (ctx.syncToken) {
            topic = "/messenger_sync_get_diffs";
            queue.last_seq_id = ctx.lastSeqId;
            queue.sync_token = ctx.syncToken;
        } else {
            topic = "/messenger_sync_create_queue";
            queue.initial_titan_sequence_id = ctx.lastSeqId;
            queue.device_params = null;
        }

        mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });

        var rTimeout = setTimeout(function () {
            mqttClient.end();
            getSeqID();
        }, 5000);

        ctx.tmsWait = function () {
            clearTimeout(rTimeout);
            if (ctx.globalOptions.emitReady) globalCallback({ type: "ready", error: null });
            delete ctx.tmsWait;
        };
    });

    mqttClient.on('message', function (topic, message) {
        var jsonMessage;
        try {
            jsonMessage = JSON.parse(message.toString());
        } catch (ex) {
            return log.error("listenMqtt", ex);
        }

        if (topic === "/t_ms") {
            if (ctx.tmsWait && typeof ctx.tmsWait === "function") ctx.tmsWait();

            if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
                ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
                ctx.syncToken = jsonMessage.syncToken;
            }

            if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);

            for (var i in jsonMessage.deltas) {
                var delta = jsonMessage.deltas[i];
                parseDelta(defaultFuncs, api, ctx, globalCallback, { "delta": delta });
            }
        } else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
            var typ = {
                type: "typ",
                isTyping: !!jsonMessage.state,
                from: jsonMessage.sender_fbid.toString(),
                threadID: utils.formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
            };
            (function () { globalCallback(null, typ); })();
        } else if (topic === "/orca_presence") {
            if (!ctx.globalOptions.updatePresence) {
                for (var i in jsonMessage.list) {
                    var data = jsonMessage.list[i];
                    var presence = {
                        type: "presence",
                        userID: data["u"].toString(),
                        timestamp: data["l"] * 1000,
                        statuses: data["p"]
                    };
                    (function () { globalCallback(null, presence); })();
                }
            }
        }
    });

    mqttClient.on('close', function () { });
}

function attachImageUrlToAttachment(api, attachment) {
    if (!attachment || attachment.type !== "photo" || !attachment.url) return;
    if (api && api._imgUpload) {
        api._imgUpload(attachment.url).then(function (url) {
            if (url) attachment.imgUrl = url;
        }).catch(function () { });
    }
}

function parseDelta(defaultFuncs, api, ctx, globalCallback, v) {
    if (v.delta.class == "NewMessage") {
        if (ctx.globalOptions.pageID && ctx.globalOptions.pageID != v.queue) return;

        (function resolveAttachmentUrl(i) {
            if (i == (v.delta.attachments || []).length) {
                var fmtMsg;
                try {
                    fmtMsg = utils.formatDeltaMessage(v);
                    var otherUserFbId = v.delta.messageMetadata.threadKey.otherUserFbId;
                    var threadFbId = v.delta.messageMetadata.threadKey.threadFbId;
                    fmtMsg.isSingleUser = !!otherUserFbId && !threadFbId;
                    fmtMsg.isGroup = !!threadFbId;
                    if (!ctx.threadTypes) ctx.threadTypes = {};
                    ctx.threadTypes[fmtMsg.threadID] = fmtMsg.isSingleUser ? 'dm' : 'group';
                    if (fmtMsg.attachments && Array.isArray(fmtMsg.attachments)) {
                        fmtMsg.attachments.forEach(function (att) { attachImageUrlToAttachment(api, att); });
                    }
                } catch (err) {
                    return globalCallback({ error: "Problem parsing message object.", detail: err, res: v, type: "parse_error" });
                }
                if (fmtMsg && ctx.globalOptions.autoMarkDelivery) {
                    markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
                }
                return !ctx.globalOptions.selfListen &&
                    (fmtMsg.senderID === ctx.i_userID || fmtMsg.senderID === ctx.userID) ?
                    undefined :
                    (function () { globalCallback(null, fmtMsg); })();
            } else {
                if (v.delta.attachments[i].mercury.attach_type == "photo") {
                    api.resolvePhotoUrl(v.delta.attachments[i].fbid, function (err, url) {
                        if (!err) v.delta.attachments[i].mercury.metadata.url = url;
                        return resolveAttachmentUrl(i + 1);
                    });
                } else {
                    return resolveAttachmentUrl(i + 1);
                }
            }
        })(0);
    }

    if (v.delta.class == "ClientPayload") {
        var clientPayload = utils.decodeClientPayload(v.delta.payload);
        if (clientPayload && clientPayload.deltas) {
            for (var i in clientPayload.deltas) {
                var delta = clientPayload.deltas[i];
                if (delta.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
                    (function () {
                        globalCallback(null, {
                            type: "message_reaction",
                            threadID: (delta.deltaMessageReaction.threadKey.threadFbId ? delta.deltaMessageReaction.threadKey.threadFbId : delta.deltaMessageReaction.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaMessageReaction.messageId,
                            reaction: delta.deltaMessageReaction.reaction,
                            senderID: delta.deltaMessageReaction.senderId.toString(),
                            userID: delta.deltaMessageReaction.userId.toString()
                        });
                    })();
                } else if (delta.deltaRecallMessageData && !!ctx.globalOptions.listenEvents) {
                    (function () {
                        globalCallback(null, {
                            type: "message_unsend",
                            threadID: (delta.deltaRecallMessageData.threadKey.threadFbId ? delta.deltaRecallMessageData.threadKey.threadFbId : delta.deltaRecallMessageData.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaRecallMessageData.messageID,
                            senderID: delta.deltaRecallMessageData.senderID.toString(),
                            deletionTimestamp: delta.deltaRecallMessageData.deletionTimestamp,
                            timestamp: delta.deltaRecallMessageData.timestamp
                        });
                    })();
                } else if (delta.deltaMessageReply) {
                    var mdata = delta.deltaMessageReply.message === undefined ? [] :
                        delta.deltaMessageReply.message.data === undefined ? [] :
                            delta.deltaMessageReply.message.data.prng === undefined ? [] :
                                JSON.parse(delta.deltaMessageReply.message.data.prng);
                    var m_id = mdata.map(function (u) { return u.i; });
                    var m_offset = mdata.map(function (u) { return u.o; });
                    var m_length = mdata.map(function (u) { return u.l; });
                    var mentions = {};
                    for (var i = 0; i < m_id.length; i++) mentions[m_id[i]] = (delta.deltaMessageReply.message.body || "").substring(m_offset[i], m_offset[i] + m_length[i]);

                    var callbackToReturn = {
                        type: "message_reply",
                        threadID: (delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId ? delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId : delta.deltaMessageReply.message.messageMetadata.threadKey.otherUserFbId).toString(),
                        messageID: delta.deltaMessageReply.message.messageMetadata.messageId,
                        senderID: delta.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
                        attachments: (delta.deltaMessageReply.message.attachments || []).map(function (att) {
                            var mercury = JSON.parse(att.mercuryJSON);
                            Object.assign(att, mercury);
                            return att;
                        }).map(function (att) {
                            var x;
                            try { x = utils._formatAttachment(att); }
                            catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                            return x;
                        }),
                        args: (delta.deltaMessageReply.message.body || "").trim().split(/\s+/),
                        body: (delta.deltaMessageReply.message.body || ""),
                        isGroup: !!delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId,
                        mentions: mentions,
                        timestamp: delta.deltaMessageReply.message.messageMetadata.timestamp,
                        participantIDs: (delta.deltaMessageReply.message.messageMetadata.cid.canonicalParticipantFbids || delta.deltaMessageReply.message.participants || []).map(function (e) { return e.toString(); })
                    };

                    if (callbackToReturn.attachments && Array.isArray(callbackToReturn.attachments)) {
                        callbackToReturn.attachments.forEach(function (att) { attachImageUrlToAttachment(api, att); });
                    }

                    if (delta.deltaMessageReply.repliedToMessage) {
                        mdata = delta.deltaMessageReply.repliedToMessage === undefined ? [] :
                            delta.deltaMessageReply.repliedToMessage.data === undefined ? [] :
                                delta.deltaMessageReply.repliedToMessage.data.prng === undefined ? [] :
                                    JSON.parse(delta.deltaMessageReply.repliedToMessage.data.prng);
                        m_id = mdata.map(function (u) { return u.i; });
                        m_offset = mdata.map(function (u) { return u.o; });
                        m_length = mdata.map(function (u) { return u.l; });
                        var rmentions = {};
                        for (var i = 0; i < m_id.length; i++) rmentions[m_id[i]] = (delta.deltaMessageReply.repliedToMessage.body || "").substring(m_offset[i], m_offset[i] + m_length[i]);

                        callbackToReturn.messageReply = {
                            threadID: (delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId ? delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId : delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaMessageReply.repliedToMessage.messageMetadata.messageId,
                            senderID: delta.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
                            attachments: delta.deltaMessageReply.repliedToMessage.attachments.map(function (att) {
                                var mercury = JSON.parse(att.mercuryJSON);
                                Object.assign(att, mercury);
                                return att;
                            }).map(function (att) {
                                var x;
                                try { x = utils._formatAttachment(att); }
                                catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                                attachImageUrlToAttachment(api, x);
                                return x;
                            }),
                            args: (delta.deltaMessageReply.repliedToMessage.body || "").trim().split(/\s+/),
                            body: delta.deltaMessageReply.repliedToMessage.body || "",
                            isGroup: !!delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId,
                            mentions: rmentions,
                            timestamp: delta.deltaMessageReply.repliedToMessage.messageMetadata.timestamp
                        };
                    } else if (delta.deltaMessageReply.replyToMessageId) {
                        return defaultFuncs
                            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, {
                                "av": ctx.globalOptions.pageID,
                                "queries": JSON.stringify({
                                    "o0": {
                                        "doc_id": "2848441488556444",
                                        "query_params": {
                                            "thread_and_message_id": {
                                                "thread_id": callbackToReturn.threadID,
                                                "message_id": delta.deltaMessageReply.replyToMessageId.id,
                                            }
                                        }
                                    }
                                })
                            })
                            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
                            .then(function (resData) {
                                if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                                if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
                                var fetchData = resData[0].o0.data.message;
                                var mobj = {};
                                for (var n in fetchData.message.ranges) mobj[fetchData.message.ranges[n].entity.id] = (fetchData.message.text || "").substr(fetchData.message.ranges[n].offset, fetchData.message.ranges[n].length);
                                callbackToReturn.messageReply = {
                                    threadID: callbackToReturn.threadID,
                                    messageID: fetchData.message_id,
                                    senderID: fetchData.message_sender.id.toString(),
                                    attachments: fetchData.message.blob_attachment.map(function (att) {
                                        var x;
                                        try { x = utils._formatAttachment({ blob_attachment: att }); }
                                        catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                                        attachImageUrlToAttachment(api, x);
                                        return x;
                                    }),
                                    args: (fetchData.message.text || "").trim().split(/\s+/) || [],
                                    body: fetchData.message.text || "",
                                    isGroup: callbackToReturn.isGroup,
                                    mentions: mobj,
                                    timestamp: parseInt(fetchData.timestamp_precise)
                                };
                            })
                            .catch(function (err) { log.error("forcedFetch", err); })
                            .finally(function () {
                                if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                                !ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID ? undefined : (function () { globalCallback(null, callbackToReturn); })();
                            });
                    } else {
                        callbackToReturn.delta = delta;
                    }

                    if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                    return !ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID ? undefined : (function () { globalCallback(null, callbackToReturn); })();
                }
            }
            return;
        }
    }

    if (v.delta.class !== "NewMessage" && !ctx.globalOptions.listenEvents) return;

    switch (v.delta.class) {
        case "JoinableMode": {
            var fmtMsg;
            try { fmtMsg = utils.formatDeltaEvent(v.delta); }
            catch (err) {
                return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
            }
            return globalCallback(null, fmtMsg);
        }
        case "AdminTextMessage": {
            switch (v.delta.type) {
                case 'confirm_friend_request':
                case 'shared_album_delete':
                case 'shared_album_addition':
                case 'pin_messages_v2':
                case 'unpin_messages_v2':
                case "change_thread_theme":
                case "change_thread_nickname":
                case "change_thread_icon":
                case "change_thread_quick_reaction":
                case "change_thread_admins":
                case "group_poll":
                case "joinable_group_link_mode_change":
                case "magic_words":
                case "change_thread_approval_mode":
                case "messenger_call_log":
                case "participant_joined_group_call": {
                    var fmtMsg;
                    try { fmtMsg = utils.formatDeltaEvent(v.delta); }
                    catch (err) {
                        return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
                    }
                    return (function () { globalCallback(null, fmtMsg); })();
                }
                default: return;
            }
        }
        case "ForcedFetch": {
            if (!v.delta.threadKey) return;
            var mid = v.delta.messageId;
            var tid = v.delta.threadKey.threadFbId;
            if (mid && tid) {
                var fetchForm = {
                    "av": ctx.globalOptions.pageID,
                    "queries": JSON.stringify({
                        "o0": {
                            "doc_id": "2848441488556444",
                            "query_params": {
                                "thread_and_message_id": {
                                    "thread_id": tid.toString(),
                                    "message_id": mid
                                }
                            }
                        }
                    })
                };
                defaultFuncs
                    .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, fetchForm)
                    .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
                    .then(function (resData) {
                        if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                        if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
                        var fetchData = resData[0].o0.data.message;
                        if (utils.getType(fetchData) == "Object") {
                            switch (fetchData.__typename) {
                                case "ThreadImageMessage":
                                    (!ctx.globalOptions.selfListen && fetchData.message_sender.id.toString() === ctx.userID) ||
                                        !ctx.loggedIn ? undefined : (function () {
                                            globalCallback(null, {
                                                type: "change_thread_image",
                                                threadID: utils.formatID(tid.toString()),
                                                snippet: fetchData.snippet,
                                                timestamp: fetchData.timestamp_precise,
                                                author: fetchData.message_sender.id,
                                                image: {
                                                    attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                                                    width: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.x,
                                                    height: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.y,
                                                    url: fetchData.image_with_metadata && fetchData.image_with_metadata.preview.uri
                                                }
                                            });
                                        })();
                                    break;
                                case "UserMessage":
                                    globalCallback(null, {
                                        type: "message",
                                        senderID: utils.formatID(fetchData.message_sender.id),
                                        body: fetchData.message.text || "",
                                        threadID: utils.formatID(tid.toString()),
                                        messageID: fetchData.message_id,
                                        attachments: [{
                                            type: "share",
                                            ID: fetchData.extensible_attachment.legacy_attachment_id,
                                            url: fetchData.extensible_attachment.story_attachment.url,
                                            title: fetchData.extensible_attachment.story_attachment.title_with_entities.text,
                                            description: fetchData.extensible_attachment.story_attachment.description.text,
                                            source: fetchData.extensible_attachment.story_attachment.source,
                                            image: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).uri,
                                            width: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).width,
                                            height: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).height,
                                            playable: (fetchData.extensible_attachment.story_attachment.media || {}).is_playable || false,
                                            duration: (fetchData.extensible_attachment.story_attachment.media || {}).playable_duration_in_ms || 0,
                                            subattachments: fetchData.extensible_attachment.subattachments,
                                            properties: fetchData.extensible_attachment.story_attachment.properties,
                                        }],
                                        mentions: {},
                                        timestamp: parseInt(fetchData.timestamp_precise),
                                        isGroup: (fetchData.message_sender.id != tid.toString())
                                    });
                                    break;
                            }
                        } else log.error("forcedFetch", fetchData);
                    })
                    .catch(function (err) { log.error("forcedFetch", err); });
            }
            break;
        }
        case "ThreadName":
        case "ParticipantsAddedToGroupThread":
        case "ParticipantLeftGroupThread": {
            var formattedEvent;
            try { formattedEvent = utils.formatDeltaEvent(v.delta); }
            catch (err) {
                return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
            }
            return (!ctx.globalOptions.selfListen && formattedEvent.author.toString() === ctx.userID) || !ctx.loggedIn ? undefined : (function () { globalCallback(null, formattedEvent); })();
        }
    }
}

function markDelivery(ctx, api, threadID, messageID) {
    if (threadID && messageID) {
        api.markAsDelivered(threadID, messageID, function (err) {
            if (err) log.error("markAsDelivered", err);
            else if (ctx.globalOptions.autoMarkRead) {
                api.markAsRead(threadID, function (err) {
                    if (err) log.error("markAsDelivered", err);
                });
            }
        });
    }
}

module.exports = function (defaultFuncs, api, ctx) {
    var globalCallback = identity;

    getSeqID = function getSeqID() {
        ctx.t_mqttCalled = false;
        defaultFuncs
            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then(function (resData) {
                if (utils.getType(resData) != "Array") throw { error: "Not logged in", res: resData };
                if (resData && resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                if (resData[resData.length - 1].successful_results === 0) throw { error: "getSeqId: there was no successful_results", res: resData };
                if (resData[0].o0.data.viewer.message_threads.sync_sequence_id) {
                    ctx.lastSeqId = resData[0].o0.data.viewer.message_threads.sync_sequence_id;
                    listenMqtt(defaultFuncs, api, ctx, globalCallback);
                } else throw { error: "getSeqId: no sync_sequence_id found.", res: resData };
            })
            .catch(function (err) {
                log.error("getSeqId", err);
                if (utils.getType(err) == "Object" && err.error === "Not logged in") ctx.loggedIn = false;
                return globalCallback(err);
            });
    };

    return function (callback) {
        class MessageEmitter extends EventEmitter {
            stopListening(callback) {
                callback = callback || (function () { });
                globalCallback = identity;
                if (ctx.mqttClient) {
                    ctx.mqttClient.unsubscribe("/webrtc");
                    ctx.mqttClient.unsubscribe("/rtc_multi");
                    ctx.mqttClient.unsubscribe("/onevc");
                    ctx.mqttClient.publish("/browser_close", "{}");
                    ctx.mqttClient.end(false, function (...data) {
                        callback(data);
                        ctx.mqttClient = undefined;
                    });
                }
            }

            async stopListeningAsync() {
                return new Promise(function (resolve) {
                    this.stopListening(resolve);
                }.bind(this));
            }
        }

        var msgEmitter = new MessageEmitter();
        globalCallback = (callback || function (error, message) {
            if (error) return msgEmitter.emit("error", error);
            msgEmitter.emit("message", message);
        });

        if (!ctx.firstListen) ctx.lastSeqId = null;
        ctx.syncToken = undefined;
        ctx.t_mqttCalled = false;

        form = {
            "av": ctx.globalOptions.pageID,
            "queries": JSON.stringify({
                "o0": {
                    "doc_id": "3336396659757871",
                    "query_params": {
                        "limit": 1,
                        "before": null,
                        "tags": ["INBOX"],
                        "includeDeliveryReceipts": false,
                        "includeSeqID": true
                    }
                }
            })
        };

        if (!ctx.firstListen || !ctx.lastSeqId) {
            getSeqID(defaultFuncs, api, ctx, globalCallback);
        } else {
            listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }

        api.stopListening = msgEmitter.stopListening.bind(msgEmitter);
        api.stopListeningAsync = msgEmitter.stopListeningAsync.bind(msgEmitter);
        return msgEmitter;
    };
};
