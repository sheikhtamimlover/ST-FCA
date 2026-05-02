"use strict";

const utils = require('../utils');
const log = require('npmlog');

const allowedProperties = {
    attachment: true,
    url: true,
    sticker: true,
    emoji: true,
    emojiSize: true,
    body: true,
    mentions: true,
    location: true,
    replyToMessage: true,
    forwardAttachmentIds: true,
};

const EMOJI_SIZES = { small: 1, medium: 2, large: 3 };

function toEmojiSize(size) {
    if (typeof size === "number" && !isNaN(size)) return Math.min(3, Math.max(1, size));
    if (typeof size === "string" && size in EMOJI_SIZES) return EMOJI_SIZES[size];
    return 1;
}

function hasLinks(text) {
    return /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(text);
}

function buildMentionData(msg, baseBody) {
    if (!Array.isArray(msg.mentions) || !msg.mentions.length) return null;
    var ids = [], offsets = [], lengths = [], types = [];
    var cursor = 0;
    for (var i = 0; i < msg.mentions.length; i++) {
        var mention = msg.mentions[i];
        var rawTag = String(mention.tag || "");
        var displayName = rawTag.replace(/^@+/, "");
        var start = Number.isInteger(mention.fromIndex) ? mention.fromIndex : cursor;
        var index = baseBody.indexOf(rawTag, start);
        var adjustment = 0;
        if (index === -1) {
            index = baseBody.indexOf(displayName, start);
        } else {
            adjustment = rawTag.length - displayName.length;
        }
        if (index < 0) { index = 0; adjustment = 0; }
        var offset = index + adjustment;
        ids.push(String(mention.id || 0));
        offsets.push(offset);
        lengths.push(displayName.length);
        types.push("p");
        cursor = offset + displayName.length;
    }
    return {
        mention_ids: ids.join(","),
        mention_offsets: offsets.join(","),
        mention_lengths: lengths.join(","),
        mention_types: types.join(",")
    };
}

function extractIdsFromPayload(payload) {
    var messageID = null, threadID = null;
    function walk(node) {
        if (!Array.isArray(node)) return;
        if (node[0] === 5 && (node[1] === "replaceOptimsiticMessage" || node[1] === "replaceOptimisticMessage")) {
            messageID = String(node[3]);
        }
        if (node[0] === 5 && node[1] === "writeCTAIdToThreadsTable") {
            var candidate = node[2];
            if (Array.isArray(candidate) && candidate[0] === 19) threadID = String(candidate[1]);
        }
        for (var i = 0; i < node.length; i++) walk(node[i]);
    }
    try { walk(payload && payload.step); } catch (_) { }
    return { threadID: threadID, messageID: messageID };
}

function publishLsRequestWithAck(mqttClient, content, requestId, timeout) {
    timeout = timeout || 15000;
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            mqttClient.removeListener('message', onMessage);
            reject(new Error('MQTT sendMessage timed out'));
        }, timeout);

        function onMessage(topic, message) {
            if (topic !== '/ls_resp') return;
            try {
                var data = JSON.parse(message.toString());
                if (String(data.request_id) === String(requestId)) {
                    clearTimeout(timer);
                    mqttClient.removeListener('message', onMessage);
                    var extracted = extractIdsFromPayload(
                        data.payload ? JSON.parse(data.payload) : {}
                    );
                    resolve({
                        threadID: extracted.threadID,
                        messageID: extracted.messageID
                    });
                }
            } catch (_) { }
        }

        mqttClient.on('message', onMessage);
        mqttClient.publish('/ls_req', JSON.stringify(content), { qos: 1 }, function (err) {
            if (err) {
                clearTimeout(timer);
                mqttClient.removeListener('message', onMessage);
                reject(err);
            }
        });
    });
}

module.exports = function (defaultFuncs, api, ctx) {
    var uploadAttachmentFn = require('./uploadAttachment')(defaultFuncs, api, ctx);

    async function uploadAttachments(attachments) {
        if (!Array.isArray(attachments)) attachments = [attachments];
        return await uploadAttachmentFn(attachments);
    }

    async function sendViaMqtt(msg, threadID, replyToMessage) {
        var mqttClient = ctx.mqttClient || global.mqttClient;
        if (!mqttClient) throw new Error('MQTT client not available');

        var baseBody = msg.body != null ? String(msg.body) : "";
        var requestId = Math.floor(100 + Math.random() * 900);
        var epoch = (BigInt(Date.now()) << 22n).toString();

        var payload0 = {
            thread_id: String(threadID),
            otid: utils.generateOfflineThreadingID(),
            source: 2097153,
            send_type: 1,
            sync_group: 1,
            mark_thread_read: 1,
            text: baseBody === "" ? null : baseBody,
            initiating_source: 0,
            skip_url_preview_gen: 0,
            text_has_links: hasLinks(baseBody) ? 1 : 0,
            multitab_env: 0,
            metadata_dataclass: JSON.stringify({ media_accessibility_metadata: { alt_text: null } })
        };

        var mentionData = buildMentionData(msg, baseBody);
        if (mentionData) payload0.mention_data = mentionData;

        if (msg.sticker) {
            payload0.send_type = 2;
            payload0.sticker_id = msg.sticker;
        }

        if (msg.emoji) {
            payload0.send_type = 1;
            payload0.text = msg.emoji;
            payload0.hot_emoji_size = toEmojiSize(msg.emojiSize);
        }

        if (msg.location && msg.location.latitude != null && msg.location.longitude != null) {
            payload0.send_type = 1;
            payload0.location_data = {
                coordinates: { latitude: msg.location.latitude, longitude: msg.location.longitude },
                is_current_location: Boolean(msg.location.current),
                is_live_location: Boolean(msg.location.live)
            };
        }

        var effectiveReplyTo = replyToMessage || msg.replyToMessage;
        if (effectiveReplyTo) {
            payload0.reply_metadata = {
                reply_source_id: effectiveReplyTo,
                reply_source_type: 1,
                reply_type: 0
            };
        }

        if (msg.attachment) {
            payload0.send_type = 3;
            if (payload0.text === "") payload0.text = null;
            payload0.attachment_fbids = [];

            var list = Array.isArray(msg.attachment) ? msg.attachment : [msg.attachment];
            var preuploaded = [];
            var toUpload = [];

            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (Array.isArray(item) && item.length >= 2 && typeof item[0] === "string") {
                    preuploaded.push(String(item[1]));
                } else if (utils.isReadableStream(item)) {
                    toUpload.push(item);
                }
            }

            if (preuploaded.length) {
                payload0.attachment_fbids = payload0.attachment_fbids.concat(preuploaded);
            }

            if (Array.isArray(msg.forwardAttachmentIds) && msg.forwardAttachmentIds.length) {
                payload0.attachment_fbids = payload0.attachment_fbids.concat(msg.forwardAttachmentIds.map(String));
            }

            if (toUpload.length) {
                var uploaded = await uploadAttachments(toUpload);
                for (var f = 0; f < uploaded.length; f++) {
                    var key = Object.keys(uploaded[f])[0];
                    payload0.attachment_fbids.push(String(uploaded[f][key]));
                }
            }
        }

        var content = {
            app_id: "2220391788200892",
            payload: {
                tasks: [
                    {
                        label: "46",
                        payload: payload0,
                        queue_name: String(threadID),
                        task_id: 400,
                        failure_count: null
                    },
                    {
                        label: "21",
                        payload: {
                            thread_id: String(threadID),
                            last_read_watermark_ts: Date.now(),
                            sync_group: 1
                        },
                        queue_name: String(threadID),
                        task_id: 401,
                        failure_count: null
                    }
                ],
                epoch_id: epoch,
                version_id: "24804310205905615",
                data_trace_id: "#" + Buffer.from(String(Math.random())).toString("base64").replace(/=+$/, "")
            },
            request_id: requestId,
            type: 3
        };

        content.payload.tasks = content.payload.tasks.map(function (task) {
            return Object.assign({}, task, { payload: JSON.stringify(task.payload) });
        });
        content.payload = JSON.stringify(content.payload);

        return await publishLsRequestWithAck(mqttClient, content, requestId);
    }

    return async function sendMessage(msg, threadID, callback, replyToMessage, isSingleUser) {
        if (typeof callback === "string") {
            isSingleUser = replyToMessage;
            replyToMessage = callback;
            callback = function () { };
        } else if (typeof callback !== "function") {
            callback = function () { };
        }

        var msgType = utils.getType(msg);
        var threadIDType = utils.getType(threadID);

        if (msgType !== "String" && msgType !== "Object") throw new Error("Message should be of type string or object and not " + msgType + ".");
        if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") throw new Error("ThreadID should be of type number, string, or array and not " + threadIDType + ".");
        if (replyToMessage && utils.getType(replyToMessage) !== "String") throw new Error("replyToMessage should be of type string.");

        if (msgType === "String") msg = { body: msg };

        var disallowedProperties = Object.keys(msg).filter(function (prop) { return !allowedProperties[prop]; });
        if (disallowedProperties.length > 0) throw new Error("Disallowed props: `" + disallowedProperties.join(", ") + "`");

        var configSource = (global.GoatBot && global.GoatBot.config) ? global.GoatBot.config : (ctx.config || {});
        var enableTypingIndicator = typeof configSource.enableTypingIndicator !== 'undefined' ? configSource.enableTypingIndicator : (ctx.config && ctx.config.enableTypingIndicator);
        var typingDuration = Number(configSource.typingDuration || (ctx.config && ctx.config.typingDuration) || 4000);

        if (enableTypingIndicator) {
            await api.sendTypingIndicator(true, threadID, function () { });
            await utils.delay(typingDuration);
        }

        try {
            var result = await sendViaMqtt(msg, threadID, replyToMessage);
            if (enableTypingIndicator) {
                api.sendTypingIndicator(false, threadID, function () { }).catch(function () { });
            }
            if (typeof callback === "function") callback(null, result);
            return result;
        } catch (mqttErr) {
            log.warn("sendMessage", "MQTT send failed, falling back to HTTP: " + (mqttErr && mqttErr.message));
            if (enableTypingIndicator) {
                api.sendTypingIndicator(false, threadID, function () { }).catch(function () { });
            }
            return api.OldMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        }
    };
};
