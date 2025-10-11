"use strict";
const mqtt = require("mqtt");
const WebSocket = require("ws");
const HttpsProxyAgent = require("https-proxy-agent");
const EventEmitter = require("events");
const { parseAndCheckLogin } = require("../../utils/client");
const { buildProxy, buildStream } = require("./detail/buildStream");
const { topics } = require("./detail/constants");
const createParseDelta = require("./core/parseDelta");
const createListenMqtt = require("./core/connectMqtt");
const createGetSeqID = require("./core/getSeqID");
const markDelivery = require("./core/markDelivery");
const getTaskResponseData = require("./core/getTaskResponseData");
const parseDelta = createParseDelta({ markDelivery, parseAndCheckLogin });
const listenMqtt = createListenMqtt({ WebSocket, mqtt, HttpsProxyAgent, buildStream, buildProxy, topics, parseDelta, getTaskResponseData });
const getSeqIDFactory = createGetSeqID({ parseAndCheckLogin, listenMqtt });
module.exports = function (defaultFuncs, api, ctx) {
  const identity = function () { };
  let globalCallback = identity;
  function getSeqIDWrapper() {
    const form = {
      av: ctx.userID,
      queries: JSON.stringify({
        o0: { doc_id: "3336396659757871", query_params: { limit: 1, before: null, tags: ["INBOX"], includeDeliveryReceipts: false, includeSeqID: true } }
      })
    };
    console.log("[FCA-INFO] MQTT getSeqID call");
    return getSeqIDFactory(defaultFuncs, api, ctx, globalCallback, form).then(() => {
      console.log("[FCA-INFO] MQTT getSeqID done");
    }).catch(e => {
      console.error(`[FCA-ERROR] MQTT getSeqID error: ${e && e.message ? e.message : e}`);
    });
  }
  function isConnected() {
    return !!(ctx.mqttClient && ctx.mqttClient.connected);
  }
  function unsubAll(cb) {
    if (!isConnected()) return cb && cb();
    let pending = topics.length;
    if (!pending) return cb && cb();
    let done = false;
    topics.forEach(t => {
      ctx.mqttClient.unsubscribe(t, err => {
        const msg = String(err && err.message ? err.message : err || "");
        if (msg && /No subscription existed/i.test(msg)) err = null;
        if (--pending === 0 && !done) {
          done = true;
          cb && cb();
        }
      });
    });
  }
  function endQuietly(next) {
    const finish = () => {
      ctx.mqttClient = undefined;
      ctx.lastSeqId = null;
      ctx.syncToken = undefined;
      ctx.t_mqttCalled = false;
      ctx._ending = false;
      next && next();
    };
    try {
      if (ctx.mqttClient) {
        if (isConnected()) {
          try { ctx.mqttClient.publish("/browser_close", "{}"); } catch (_) { }
        }
        ctx.mqttClient.end(true, finish);
      } else finish();
    } catch (_) {
      finish();
    }
  }
  function delayedReconnect() {
    console.log("[FCA-INFO] MQTT reconnect in 2000ms");
    setTimeout(() => getSeqIDWrapper(), 2000);
  }
  function forceCycle() {
    ctx._ending = true;
    console.warn("[FCA-WARN] MQTT force cycle begin");
    unsubAll(() => {
      endQuietly(() => {
        delayedReconnect();
      });
    });
  }
  return function (callback) {
    class MessageEmitter extends EventEmitter {
      stopListening(callback2) {
        const cb = callback2 || function () { };
        console.log("[FCA-INFO] MQTT stop requested");
        globalCallback = identity;
        if (ctx._autoCycleTimer) {
          clearInterval(ctx._autoCycleTimer);
          ctx._autoCycleTimer = null;
          console.log("[FCA-INFO] MQTT auto-cycle cleared");
        }
        ctx._ending = true;
        unsubAll(() => {
          endQuietly(() => {
            console.log("[FCA-INFO] MQTT stopped");
            cb();
            delayedReconnect();
          });
        });
      }
      async stopListeningAsync() {
        return new Promise(resolve => { this.stopListening(resolve); });
      }
    }
    const msgEmitter = new MessageEmitter();
    globalCallback = callback || function (error, message) {
      if (error) { console.error("[FCA-ERROR] MQTT emit error"); return msgEmitter.emit("error", error); }
      msgEmitter.emit("message", message);
    };
    if (!ctx.firstListen) ctx.lastSeqId = null;
    ctx.syncToken = undefined;
    ctx.t_mqttCalled = false;
    if (ctx._autoCycleTimer) {
      clearInterval(ctx._autoCycleTimer);
      ctx._autoCycleTimer = null;
    }
    ctx._autoCycleTimer = setInterval(forceCycle, 60 * 60 * 1000);
    console.log("[FCA-INFO] MQTT auto-cycle enabled 1hour");
    if (!ctx.firstListen || !ctx.lastSeqId) getSeqIDWrapper();
    else {
      console.log("[FCA-INFO] MQTT starting listenMqtt");
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    }
    api.stopListening = msgEmitter.stopListening;
    api.stopListeningAsync = msgEmitter.stopListeningAsync;
    return msgEmitter;
  };
};