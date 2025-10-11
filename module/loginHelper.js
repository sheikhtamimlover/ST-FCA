const fs = require("fs");
const path = require("path");
const models = require("../src/database/models");
const { get, post, jar, makeDefaults } = require("../src/utils/request");
const { saveCookies, getAppState } = require("../src/utils/client");
const { getFrom } = require("../src/utils/constants");
const { loadConfig } = require("./config");
const { config } = loadConfig();
const { v4: uuidv4 } = require("uuid");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const axiosBase = require("axios");
const qs = require("querystring");
const crypto = require("crypto");
const { TOTP } = require("totp-generator");

const regions = [
  { code: "PRN", name: "Pacific Northwest Region", location: "Khu vực Tây Bắc Thái Bình Dương" },
  { code: "VLL", name: "Valley Region", location: "Valley" },
  { code: "ASH", name: "Ashburn Region", location: "Ashburn" },
  { code: "DFW", name: "Dallas/Fort Worth Region", location: "Dallas/Fort Worth" },
  { code: "LLA", name: "Los Angeles Region", location: "Los Angeles" },
  { code: "FRA", name: "Frankfurt", location: "Frankfurt" },
  { code: "SIN", name: "Singapore", location: "Singapore" },
  { code: "NRT", name: "Tokyo", location: "Japan" },
  { code: "HKG", name: "Hong Kong", location: "Hong Kong" },
  { code: "SYD", name: "Sydney", location: "Sydney" },
  { code: "PNB", name: "Pacific Northwest - Beta", location: "Pacific Northwest " }
];

const REGION_MAP = new Map(regions.map(r => [r.code, r]));

function parseRegion(html) {
  try {
    const m1 = html.match(/"endpoint":"([^"]+)"/);
    const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
    const raw = (m1 && m1[1]) || (m2 && m2[1]);
    if (!raw) return "PRN";
    const endpoint = raw.replace(/\\\//g, "/");
    const url = new URL(endpoint);
    const rp = url.searchParams ? url.searchParams.get("region") : null;
    return rp ? rp.toUpperCase() : "PRN";
  } catch {
    return "PRN";
  }
}

function mask(s, keep = 3) {
  if (!s) return "";
  const n = s.length;
  return n <= keep ? "*".repeat(n) : s.slice(0, keep) + "*".repeat(Math.max(0, n - keep));
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function randomString(length = 24) {
  let s = "abcdefghijklmnopqrstuvwxyz";
  let out = s.charAt(Math.floor(Math.random() * s.length));
  for (let i = 1; i < length; i++) out += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(36 * Math.random()));
  return out;
}

function sortObject(o) {
  const keys = Object.keys(o).sort();
  const x = {};
  for (const k of keys) x[k] = o[k];
  return x;
}

function encodeSig(obj) {
  let data = "";
  for (const k of Object.keys(obj)) data += `${k}=${obj[k]}`;
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBuildId() {
  const prefixes = ["QP1A", "RP1A", "SP1A", "TP1A", "UP1A", "AP4A"];
  return `${choice(prefixes)}.${rand(180000, 250000)}.${rand(10, 99)}`;
}

function randomResolution() {
  const presets = [{ w: 720, h: 1280, d: 2.0 }, { w: 1080, h: 1920, d: 2.625 }, { w: 1080, h: 2400, d: 3.0 }, { w: 1440, h: 3040, d: 3.5 }, { w: 1440, h: 3200, d: 4.0 }];
  return choice(presets);
}

function randomFbav() {
  return `${rand(390, 499)}.${rand(0, 3)}.${rand(0, 2)}.${rand(10, 60)}.${rand(100, 999)}`;
}

function randomOrcaUA() {
  const androidVersions = ["8.1.0", "9", "10", "11", "12", "13", "14"];
  const devices = [{ brand: "samsung", model: "SM-G996B" }, { brand: "samsung", model: "SM-S908E" }, { brand: "Xiaomi", model: "M2101K9AG" }, { brand: "OPPO", model: "CPH2219" }, { brand: "vivo", model: "V2109" }, { brand: "HUAWEI", model: "VOG-L29" }, { brand: "asus", model: "ASUS_I001DA" }, { brand: "Google", model: "Pixel 6" }, { brand: "realme", model: "RMX2170" }];
  const carriers = ["Viettel Telecom", "Mobifone", "Vinaphone", "T-Mobile", "Verizon", "AT&T", "Telkomsel", "Jio", "NTT DOCOMO", "Vodafone", "Orange"];
  const locales = ["vi_VN", "en_US", "en_GB", "id_ID", "th_TH", "fr_FR", "de_DE", "es_ES", "pt_BR"];
  const archs = ["arm64-v8a", "armeabi-v7a"];
  const a = choice(androidVersions);
  const d = choice(devices);
  const b = randomBuildId();
  const r = randomResolution();
  const fbav = randomFbav();
  const fbbv = rand(320000000, 520000000);
  const arch = `${choice(archs)}:${choice(archs)}`;
  const ua = `Dalvik/2.1.0 (Linux; U; Android ${a}; ${d.model} Build/${b}) [FBAN/Orca-Android;FBAV/${fbav};FBPN/com.facebook.orca;FBLC/${choice(locales)};FBBV/${fbbv};FBCR/${choice(carriers)};FBMF/${d.brand};FBBD/${d.brand};FBDV/${d.model};FBSV/${a};FBCA/${arch};FBDM/{density=${r.d.toFixed(1)},width=${r.w},height=${r.h}};FB_FW/1;]`;
  return ua;
}

const MOBILE_UA = randomOrcaUA();

function buildHeaders(url, extra = {}) {
  const u = new URL(url);
  return { "content-type": "application/x-www-form-urlencoded", "x-fb-http-engine": "Liger", "user-agent": MOBILE_UA, Host: u.host, Origin: "https://www.facebook.com", Referer: "https://www.facebook.com/", Connection: "keep-alive", ...extra };
}

const genTotp = async secret => {
  const cleaned = String(secret || "").replace(/\s+/g, "").toUpperCase();
  const r = await TOTP.generate(cleaned);
  return typeof r === "object" ? r.otp : r;
};

function normalizeCookieHeaderString(s) {
  let str = String(s || "").trim();
  if (!str) return [];
  if (/^cookie\s*:/i.test(str)) str = str.replace(/^cookie\s*:/i, "").trim();
  str = str.replace(/\r?\n/g, " ").replace(/\s*;\s*/g, ";");
  const parts = str.split(";").map(v => v.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!k) continue;
    out.push(`${k}=${v}`);
  }
  return out;
}

function setJarFromPairs(j, pairs, domain) {
  const expires = new Date(Date.now() + 31536e6).toUTCString();
  for (const kv of pairs) {
    const cookieStr = `${kv}; expires=${expires}; domain=${domain}; path=/;`;
    try {
      if (typeof j.setCookieSync === "function") j.setCookieSync(cookieStr, "https://www.facebook.com");
      else j.setCookie(cookieStr, "https://www.facebook.com");
    } catch { }
  }
}

function cookieHeaderFromJar(j) {
  const urls = ["https://www.facebook.com", "https://www.messenger.com"];
  const seen = new Set();
  const parts = [];
  for (const u of urls) {
    let s = "";
    try {
      s = typeof j.getCookieStringSync === "function" ? j.getCookieStringSync(u) : "";
    } catch { }
    if (!s) continue;
    for (const kv of s.split(";")) {
      const t = kv.trim();
      const name = t.split("=")[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      parts.push(t);
    }
  }
  return parts.join("; ");
}

let uniqueIndexEnsured = false;

function getBackupModel() {
  if (!models || !models.sequelize || !models.Sequelize) return null;
  const sequelize = models.sequelize;
  const { DataTypes } = models.Sequelize;
  if (sequelize.models && sequelize.models.AppStateBackup) return sequelize.models.AppStateBackup;
  const dialect = typeof sequelize.getDialect === "function" ? sequelize.getDialect() : "sqlite";
  const LongText = (dialect === "mysql" || dialect === "mariadb") ? DataTypes.TEXT("long") : DataTypes.TEXT;
  const AppStateBackup = sequelize.define(
    "AppStateBackup",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userID: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      data: { type: LongText }
    },
    { tableName: "app_state_backups", timestamps: true, indexes: [{ unique: true, fields: ["userID", "type"] }] }
  );
  return AppStateBackup;
}

async function ensureUniqueIndex(sequelize) {
  if (uniqueIndexEnsured) return;
  try {
    await sequelize.getQueryInterface().addIndex("app_state_backups", ["userID", "type"], { unique: true, name: "app_state_user_type_unique" });
  } catch { }
  uniqueIndexEnsured = true;
}

async function upsertBackup(Model, userID, type, data) {
  const where = { userID: String(userID || ""), type };
  const row = await Model.findOne({ where });
  if (row) {
    await row.update({ data });
    console.log(`[FCA-INFO] Overwrote existing ${type} backup for user ${where.userID}`);
    return;
  }
  await Model.create({ ...where, data });
  console.log(`[FCA-INFO] Created new ${type} backup for user ${where.userID}`);
}

async function backupAppStateSQL(j, userID) {
  try {
    const Model = getBackupModel();
    if (!Model) return;
    await Model.sync();
    await ensureUniqueIndex(models.sequelize);
    const appJson = getAppState(j);
    const ck = cookieHeaderFromJar(j);
    await upsertBackup(Model, userID, "appstate", JSON.stringify(appJson));
    await upsertBackup(Model, userID, "cookie", ck);
    console.log("[FCA-INFO] Backup stored (overwrite mode)");
  } catch (e) {
    console.warn(`[FCA-WARN] Failed to save appstate backup ${e && e.message ? e.message : String(e)}`);
  }
}

async function getLatestBackup(userID, type) {
  try {
    const Model = getBackupModel();
    if (!Model) return null;
    const row = await Model.findOne({ where: { userID: String(userID || ""), type } });
    return row ? row.data : null;
  } catch {
    return null;
  }
}

async function getLatestBackupAny(type) {
  try {
    const Model = getBackupModel();
    if (!Model) return null;
    const row = await Model.findOne({ where: { type }, order: [["updatedAt", "DESC"]] });
    return row ? row.data : null;
  } catch {
    return null;
  }
}

async function tokens(username, password, twofactor = null) {
  const t0 = process.hrtime.bigint();
  if (!username || !password) {
    console.error("[FCA-ERROR] Missing email or password");
    return { status: false, message: "Please provide email and password" };
  }
  console.log(`[FCA-INFO] AUTO-LOGIN: Initialize login ${mask(username, 2)}`);
  const cj = new CookieJar();
  const axios = wrapper(axiosBase.create({ jar: cj, withCredentials: true, validateStatus: () => true, timeout: 30000 }));
  const loginUrl = "https://b-graph.facebook.com/auth/login";
  const baseForm = { adid: uuidv4(), email: username, password: password, format: "json", device_id: uuidv4(), cpl: "true", family_device_id: uuidv4(), locale: "en_US", client_country_code: "US", credentials_type: "device_based_login_password", generate_session_cookies: "1", generate_analytics_claim: "1", generate_machine_id: "1", currently_logged_in_userid: "0", irisSeqID: 1, try_num: "1", enroll_misauth: "false", meta_inf_fbmeta: "", source: "login", machine_id: randomString(24), fb_api_req_friendly_name: "authenticate", fb_api_caller_class: "com.facebook.account.login.protocol.Fb4aAuthHandler", api_key: "882a8490361da98702bf97a021ddc14d", access_token: "350685531728%7C62f8ce9f74b12f84c123cc23437a4a32" };
  try {
    const form1 = { ...baseForm };
    form1.sig = encodeSig(sortObject(form1));
    console.log("[FCA-INFO] AUTO-LOGIN: Send login request");
    const r0 = process.hrtime.bigint();
    const res1 = await axios.post(loginUrl, qs.stringify(form1), { headers: buildHeaders(loginUrl, { "x-fb-friendly-name": form1.fb_api_req_friendly_name }) });
    const dt1 = Number(process.hrtime.bigint() - r0) / 1e6;
    console.log(`[FCA-INFO] AUTO-LOGIN: Received response ${res1.status} ${Math.round(dt1)}ms`);
    if (res1.status >= 400) throw { response: res1 };
    if (res1.data && res1.data.session_cookies) {
      const cookies = res1.data.session_cookies.map(e => ({ key: e.name, value: e.value, domain: "facebook.com", path: e.path, hostOnly: false }));
      console.log(`[FCA-INFO] AUTO-LOGIN: Login success (first attempt) ${cookies.length} cookies`);
      const t1 = Number(process.hrtime.bigint() - t0) / 1e6;
      console.log(`[FCA-INFO] Done success login ${Math.round(t1)}ms`);
      return { status: true, cookies };
    }
    throw { response: res1 };
  } catch (err) {
    const e = err && err.response ? err.response : null;
    const code = e && e.data && e.data.error ? e.data.error.code : null;
    const message = e && e.data && e.data.error ? e.data.error.message : "";
    if (code) console.warn(`[FCA-WARN] AUTO-LOGIN: Error on request #1 ${code} ${message}`);
    console.log("[FCA-INFO] AUTO-LOGIN: Processing twofactor...");
    if (code === 401) return { status: false, message: message || "Unauthorized" };
    if (!config.credentials?.twofactor) {
      console.warn("[FCA-WARN] AUTO-LOGIN: 2FA required but secret missing");
      return { status: false, message: "Please provide the 2FA secret!" };
    }
    try {
      const dataErr = e && e.data && e.data.error && e.data.error.error_data ? e.data.error_data : {};
      const codeTotp = await genTotp(config.credentials.twofactor);
      console.log(`[FCA-INFO] AUTO-LOGIN: Performing 2FA ${mask(codeTotp, 2)}`);
      const form2 = { ...baseForm, twofactor_code: codeTotp, encrypted_msisdn: "", userid: dataErr.uid || "", machine_id: dataErr.machine_id || baseForm.machine_id, first_factor: dataErr.login_first_factor || "", credentials_type: "two_factor" };
      form2.sig = encodeSig(sortObject(form2));
      const r1 = process.hrtime.bigint();
      const res2 = await axios.post(loginUrl, qs.stringify(form2), { headers: buildHeaders(loginUrl, { "x-fb-friendly-name": form2.fb_api_req_friendly_name }) });
      const dt2 = Number(process.hrtime.bigint() - r1) / 1e6;
      console.log(`[FCA-INFO] AUTO-LOGIN: Received 2FA response ${res2.status} ${Math.round(dt2)}ms`);
      if (res2.status >= 400 || !(res2.data && res2.data.session_cookies)) throw new Error("2FA failed");
      const cookies = res2.data.session_cookies.map(e => ({ key: e.name, value: e.value, domain: "facebook.com", path: e.path, hostOnly: false }));
      console.log(`[FCA-INFO] AUTO-LOGIN: Login success with 2FA ${cookies.length} cookies`);
      const t1 = Number(process.hrtime.bigint() - t0) / 1e6;
      console.log(`[FCA-INFO] AUTO-LOGIN: Done success login with 2FA ${Math.round(t1)}ms`);
      return { status: true, cookies };
    } catch {
      console.error("[FCA-ERROR] AUTO-LOGIN: 2FA failed");
      return { status: false, message: "Invalid two-factor code!" };
    }
  }
}

async function hydrateJarFromDB(userID) {
  try {
    let ck = null;
    let app = null;
    if (userID) {
      ck = await getLatestBackup(userID, "cookie");
      app = await getLatestBackup(userID, "appstate");
    } else {
      ck = await getLatestBackupAny("cookie");
      app = await getLatestBackupAny("appstate");
    }
    if (ck) {
      const pairs = normalizeCookieHeaderString(ck);
      if (pairs.length) {
        setJarFromPairs(jar, pairs, ".facebook.com");
        return true;
      }
    }
    if (app) {
      let parsed = null;
      try {
        parsed = JSON.parse(app);
      } catch { }
      if (Array.isArray(parsed)) {
        const pairs = parsed.map(c => [c.name || c.key, c.value].join("="));
        setJarFromPairs(jar, pairs, ".facebook.com");
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function tryAutoLoginIfNeeded(currentHtml, currentCookies, globalOptions, ctxRef) {
  const getUID = cs =>
    cs.find(c => c.key === "i_user")?.value ||
    cs.find(c => c.key === "c_user")?.value ||
    cs.find(c => c.name === "i_user")?.value ||
    cs.find(c => c.name === "c_user")?.value;
  let userID = getUID(currentCookies);
  if (userID) return { html: currentHtml, cookies: currentCookies, userID };
  const hydrated = await hydrateJarFromDB(null);
  if (hydrated) {
    console.log("[FCA-INFO] AppState backup live — proceeding to login");
    const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
    const resB = (await ctxRef.bypassAutomation(initial, jar)) || initial;
    const htmlB = resB && resB.data ? resB.data : "";
    if (htmlB.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
    const cookiesB = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
    const uidB = getUID(cookiesB);
    if (uidB) return { html: htmlB, cookies: cookiesB, userID: uidB };
  }
  if (config.autoLogin !== true) throw new Error("AppState backup die — Auto-login is disabled");
  console.warn("[FCA-WARN] AppState backup die — proceeding to email/password login");
  const u = config.credentials?.email;
  const p = config.credentials?.password;
  const tf = config.credentials?.twofactor || null;
  if (!u || !p) throw new Error("Missing user cookie");
  const r = await tokens(u, p, tf);
  if (!(r && r.status && Array.isArray(r.cookies))) throw new Error(r && r.message ? r.message : "Login failed");
  const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
  setJarFromPairs(jar, pairs, ".facebook.com");
  const initial2 = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
  const res2 = (await ctxRef.bypassAutomation(initial2, jar)) || initial2;
  const html2 = res2 && res2.data ? res2.data : "";
  if (html2.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
  const cookies2 = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
  const uid2 = getUID(cookies2);
  if (!uid2) throw new Error("Login failed");
  return { html: html2, cookies: cookies2, userID: uid2 };
}

function makeLogin(j, email, password, globalOptions) {
  return async function () {
    const u = email || config.credentials?.email;
    const p = password || config.credentials?.password;
    const tf = config.credentials?.twofactor || null;
    if (!u || !p) return;
    const r = await tokens(u, p, tf);
    if (r && r.status && Array.isArray(r.cookies)) {
      const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
      setJarFromPairs(j, pairs, ".facebook.com");
      await get("https://www.facebook.com/", j, null, globalOptions).then(saveCookies(j));
    } else {
      throw new Error(r && r.message ? r.message : "Login failed");
    }
  };
}

function loginHelper(appState, Cookie, email, password, globalOptions, callback) {
  try {
    const domain = ".facebook.com";
    try {
      if (appState) {
        if (typeof appState === "string") {
          let parsed = appState;
          try {
            parsed = JSON.parse(appState);
          } catch { }
          if (Array.isArray(parsed)) {
            const pairs = parsed.map(c => [c.name || c.key, c.value].join("="));
            setJarFromPairs(jar, pairs, domain);
          } else if (typeof parsed === "string") {
            const pairs = normalizeCookieHeaderString(parsed);
            if (!pairs.length) throw new Error("Empty appState cookie header");
            setJarFromPairs(jar, pairs, domain);
          } else {
            throw new Error("Invalid appState format");
          }
        } else if (Array.isArray(appState)) {
          const pairs = appState.map(c => [c.name || c.key, c.value].join("="));
          setJarFromPairs(jar, pairs, domain);
        } else {
          throw new Error("Invalid appState format");
        }
      }
      if (Cookie) {
        let cookiePairs = [];
        if (typeof Cookie === "string") cookiePairs = normalizeCookieHeaderString(Cookie);
        else if (Array.isArray(Cookie)) cookiePairs = Cookie.map(String).filter(Boolean);
        else if (Cookie && typeof Cookie === "object") cookiePairs = Object.entries(Cookie).map(([k, v]) => `${k}=${v}`);
        if (cookiePairs.length) setJarFromPairs(jar, cookiePairs, domain);
      }
    } catch (e) {
      return callback(e);
    }
    (async () => {
      const ctx = { globalOptions, options: globalOptions, reconnectAttempts: 0 };
      ctx.bypassAutomation = async function (resp, j) {
        global.fca = global.fca || {};
        global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
        const s = x => (typeof x === "string" ? x : String(x ?? ""));
        const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
        const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
        const cookieUID = async () => {
          try {
            const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
            return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
          } catch { return undefined; }
        };
        const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
        const getUID = async body => (await cookieUID()) || htmlUID(body);
        const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
        const bypass = async body => {
          const b = s(body);
          const UID = await getUID(b);
          const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
          const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
          const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
          const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
          await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
          console.warn("[FCA-WARN] Facebook automation warning detected, handling...");
          this.reconnectAttempts = 0;
        };
        try {
          if (resp) {
            if (isCp(resp)) {
              await bypass(s(resp.data));
              const refreshed = await refreshJar();
              if (isCp(refreshed)) console.warn("Checkpoint still present after refresh");
              else console.log("Bypass complete, cookies refreshed");
              return refreshed;
            }
            return resp;
          }
          const first = await get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          if (isCp(first)) {
            await bypass(s(first.data));
            const refreshed = await refreshJar();
            if (!isCp(refreshed)) console.log("Bypass complete, cookies refreshed");
            else console.warn("Checkpoint still present after refresh");
            return refreshed;
          }
          console.log("No checkpoint detected");
          return first;
        } catch (e) {
          logger(`Bypass automation error: ${e && e.message ? e.message : String(e)}`, "error");
          return resp;
        }
      };
      if (appState || Cookie) {
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      const hydrated = await hydrateJarFromDB(null);
      if (hydrated) {
        console.log("[FCA-INFO] AppState backup live — proceeding to login");
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      console.warn("[FCA-WARN] AppState backup die — proceeding to email/password login");
      return get("https://www.facebook.com/", null, null, globalOptions)
        .then(saveCookies(jar))
        .then(makeLogin(jar, email, password, globalOptions))
        .then(function () {
          return get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        });
    })()
      .then(async function (res) {
        const ctx = {};
        ctx.options = globalOptions;
        ctx.bypassAutomation = async function (resp, j) {
          global.fca = global.fca || {};
          global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
          const s = x => (typeof x === "string" ? x : String(x ?? ""));
          const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
          const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
          const cookieUID = async () => {
            try {
              const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
              return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
            } catch { return undefined; }
          };
          const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
          const getUID = async body => (await cookieUID()) || htmlUID(body);
          const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          const bypass = async body => {
            const b = s(body);
            const UID = await getUID(b);
            const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
            const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
            const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
            const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
            await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
            logger("Facebook automation warning detected, handling...", "warn");
          };
          try {
            if (res && isCp(res)) {
              await bypass(s(res.data));
              const refreshed = await refreshJar();
              if (!isCp(refreshed)) console.log("Bypass complete, cookies refreshed");
              return refreshed;
            }
            console.log("No checkpoint detected");
            return res;
          } catch {
            return res;
          }
        };
        const processed = (await ctx.bypassAutomation(res, jar)) || res;
        let html = processed && processed.data ? processed.data : "";
        let cookies = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
        let userID =
          cookies.find(c => c.key === "i_user")?.value ||
          cookies.find(c => c.key === "c_user")?.value ||
          cookies.find(c => c.name === "i_user")?.value ||
          cookies.find(c => c.name === "c_user")?.value;
        if (!userID) {
          const retried = await tryAutoLoginIfNeeded(html, cookies, globalOptions, ctx);
          html = retried.html;
          cookies = retried.cookies;
          userID = retried.userID;
        }
        if (html.includes("/checkpoint/block/?next")) {
          console.error("[FCA-ERROR] Appstate die, vui lòng thay cái mới!");
          throw new Error("Checkpoint");
        }
        let mqttEndpoint;
        let region = "PRN";
        let fb_dtsg;
        let irisSeqID;
        try {
          const m1 = html.match(/"endpoint":"([^"]+)"/);
          const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
          const raw = (m1 && m1[1]) || (m2 && m2[1]);
          if (raw) mqttEndpoint = raw.replace(/\\\//g, "/");
          region = parseRegion(html);
          const rinfo = REGION_MAP.get(region);
          if (rinfo) console.log(`[FCA-INFO] Server region ${region} - ${rinfo.name}`);
          else console.log(`[FCA-INFO] Server region ${region}`);
        } catch {
          console.warn("[FCA-WARN] Not MQTT endpoint");
        }
        try {
          const userDataMatch = String(html).match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
          if (userDataMatch) {
            const info = JSON.parse(userDataMatch[1]);
            console.log(`[FCA-INFO] Đăng nhập tài khoản: ${info.NAME} (${info.USER_ID})`);
          } else if (userID) {
            console.log(`[FCA-INFO] ID người dùng: ${userID}`);
          }
        } catch { }
        const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
        if (tokenMatch) fb_dtsg = tokenMatch[1];
        try {
          if (userID) await backupAppStateSQL(jar, userID);
        } catch { }
        Promise.resolve()
          .then(function () {
            if (models && models.sequelize && typeof models.sequelize.authenticate === "function") {
              return models.sequelize.authenticate();
            }
          })
          .then(function () {
            if (models && typeof models.syncAll === "function") {
              return models.syncAll();
            }
          })
          .catch(function (error) {
            console.error(error);
            console.error("Database connection failed:", error && error.message ? error.message : String(error));
          });
        console.log("[FCA-INFO] FCA fix/update by DongDev (Donix-VN)");
        const ctxMain = {
          userID,
          jar,
          globalOptions,
          loggedIn: true,
          access_token: "NONE",
          clientMutationId: 0,
          mqttClient: undefined,
          lastSeqId: irisSeqID,
          syncToken: undefined,
          mqttEndpoint,
          region,
          firstListen: true,
          fb_dtsg,
          clientID: ((Math.random() * 2147483648) | 0).toString(16),
          clientId: getFrom(html, '["MqttWebDeviceID",[],{"clientID":"', '"}') || "",
          wsReqNumber: 0,
          wsTaskNumber: 0,
          tasks: new Map()
        };
        ctxMain.options = globalOptions;
        ctxMain.bypassAutomation = ctx.bypassAutomation.bind(ctxMain);
        ctxMain.performAutoLogin = async () => {
          try {
            const u = config.credentials?.email || email;
            const p = config.credentials?.password || password;
            const tf = config.credentials?.twofactor || null;
            if (!u || !p) return false;
            const r = await tokens(u, p, tf);
            if (!(r && r.status && Array.isArray(r.cookies))) return false;
            const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
            setJarFromPairs(jar, pairs, ".facebook.com");
            await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
            return true;
          } catch {
            return false;
          }
        };
        const api = {
          setOptions: require("./options").setOptions.bind(null, globalOptions),
          getCookies: function () {
            return cookieHeaderFromJar(jar);
          },
          getAppState: function () {
            return getAppState(jar);
          },
          getLatestAppStateFromDB: async function (uid = userID) {
            const data = await getLatestBackup(uid, "appstate");
            return data ? JSON.parse(data) : null;
          },
          getLatestCookieFromDB: async function (uid = userID) {
            return await getLatestBackup(uid, "cookie");
          }
        };
        const defaultFuncs = makeDefaults(html, userID, ctxMain);
        const srcRoot = path.join(__dirname, "../src/api");
        let loaded = 0;
        let skipped = 0;
        fs.readdirSync(srcRoot, { withFileTypes: true }).forEach((sub) => {
          if (!sub.isDirectory()) return;
          const subDir = path.join(srcRoot, sub.name);
          fs.readdirSync(subDir, { withFileTypes: true }).forEach((entry) => {
            if (!entry.isFile() || !entry.name.endsWith(".js")) return;
            const p = path.join(subDir, entry.name);
            const key = path.basename(entry.name, ".js");
            if (api[key]) {
              skipped++;
              return;
            }
            api[key] = require(p)(defaultFuncs, api, ctxMain);
            loaded++;
          });
        });
        console.log(`[FCA-INFO] Loaded ${loaded} FCA API methods${skipped ? `, skipped ${skipped} duplicates` : ""}`);
        if (api.listenMqtt) api.listen = api.listenMqtt;
        if (api.refreshFb_dtsg) {
          setInterval(function () {
            api.refreshFb_dtsg().then(function () {
              console.log("[FCA-INFO] Successfully refreshed fb_dtsg");
            }).catch(function () {
              console.error("[FCA-ERROR] An error occurred while refreshing fb_dtsg");
            });
          }, 86400000);
        }
        console.log("[FCA-INFO] Login successful!");
        callback(null, api);
      })
      .catch(function (e) {
        callback(e);
      });
  } catch (e) {
    callback(e);
  }
}

module.exports = loginHelper;