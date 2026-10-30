// ==========================
// storage.js
// ==========================
// 記録の保存。3つの層からなる。
// 1. IndexedDB。すべての試行とセッションを、その PC に残す。これが運営中の正本で、
//    回線が無くても失わない。
// 2. Firestore。firebase-config.js に設定があるときだけ送る。設定が空ならスキップする。
//    送信が確認できた試行には sent: true の印を付け、未送信の試行はあとで再送する。
// 3. 書き出し。IndexedDB にある全記録を JSON と CSV にしてダウンロードする。
//
// Firebase の SDK は、設定があるときだけ動的に読み込む。設定が空のときに CDN へ
// 到達できなくても、アプリが動かなくなることはない。
// ==========================

import { STORAGE } from "./config.js";

// ---------- IndexedDB ----------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE.dbName, STORAGE.dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "sessionId" });
      }
      if (!db.objectStoreNames.contains("trials")) {
        const store = db.createObjectStore("trials", { keyPath: "key" });
        store.createIndex("bySession", "sessionId", { unique: false });
        store.createIndex("bySent", "sentFlag", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function trialKey(sessionId, docId) {
  return `${sessionId}/${docId}`;
}

export async function saveTrialLocal(record) {
  const db = await openDb();
  const row = {
    ...record,
    key: trialKey(record.sessionId, record.docId),
    sentFlag: record.sent ? 1 : 0,  // IndexedDB の索引は真偽値を受け付けないので数にする
  };
  await tx(db, "trials", "readwrite", (s) => s.put(row));
  return row.key;
}

export async function markTrialSent(sessionId, docId) {
  const db = await openDb();
  const key = trialKey(sessionId, docId);
  const t = db.transaction("trials", "readwrite");
  const s = t.objectStore("trials");
  const row = await requestToPromise(s.get(key));
  if (row) {
    row.sent = true;
    row.sentFlag = 1;
    s.put(row);
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(Boolean(row));
    t.onerror = () => reject(t.error);
  });
}

export async function loadTrialsForSession(sessionId) {
  const db = await openDb();
  const t = db.transaction("trials", "readonly");
  const idx = t.objectStore("trials").index("bySession");
  const rows = await requestToPromise(idx.getAll(sessionId));
  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

export async function loadAllTrials() {
  const db = await openDb();
  const t = db.transaction("trials", "readonly");
  const rows = await requestToPromise(t.objectStore("trials").getAll());
  rows.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : a.seq - b.seq));
  return rows;
}

export async function loadUnsentTrials() {
  const db = await openDb();
  const t = db.transaction("trials", "readonly");
  const idx = t.objectStore("trials").index("bySent");
  return requestToPromise(idx.getAll(0));
}

export async function saveSessionLocal(session) {
  const db = await openDb();
  await tx(db, "sessions", "readwrite", (s) => s.put(session));
  return session.sessionId;
}

export async function loadSessionLocal(sessionId) {
  const db = await openDb();
  const t = db.transaction("sessions", "readonly");
  return requestToPromise(t.objectStore("sessions").get(sessionId));
}

export async function loadAllSessions() {
  const db = await openDb();
  const t = db.transaction("sessions", "readonly");
  const rows = await requestToPromise(t.objectStore("sessions").getAll());
  rows.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  return rows;
}

// ---------- Firestore ----------

let fbPromise = null;

// 設定があるときだけ firebase-init.js を読み込む。無ければ null。
export function getFirebase() {
  if (fbPromise) return fbPromise;
  const cfg = window.FIREBASE_CONFIG || {};
  if (!cfg.apiKey || !cfg.projectId) {
    fbPromise = Promise.resolve(null);
  } else {
    fbPromise = import("./firebase-init.js")
      .then(async (mod) => { await mod.FB.signInAnon(); return mod.FB; })
      .catch((e) => { console.warn("Firebase の初期化に失敗しました。ローカル保存だけで続けます。", e); return null; });
  }
  return fbPromise;
}

export async function firebaseEnabled() {
  return Boolean(await getFirebase());
}

// オフラインのときの setDoc はサーバに届くまで解決しないので、時間を区切る。
// 時間切れは「待ち行列に残った」と見なし、sent の印は付けない（あとで再送して確かめる）。
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, timeout: true }), ms);
    promise.then(() => { clearTimeout(timer); resolve({ ok: true }); })
      .catch((e) => { clearTimeout(timer); resolve({ ok: false, error: e }); });
  });
}

export async function sendTrial(record, { timeoutMs = 8000 } = {}) {
  const fb = await getFirebase();
  if (!fb) return { ok: false, skipped: true };
  const result = await withTimeout(fb.saveTrial(record.sessionId, record), timeoutMs);
  if (result.ok) await markTrialSent(record.sessionId, record.docId);
  return result;
}

export async function sendSession(session, { timeoutMs = 8000 } = {}) {
  const fb = await getFirebase();
  if (!fb) return { ok: false, skipped: true };
  return withTimeout(fb.upsertSession(session.sessionId, session), timeoutMs);
}

// 未送信の試行をまとめて再送する。返り値は { attempted, sent }。
export async function resendUnsent({ onProgress } = {}) {
  const fb = await getFirebase();
  if (!fb) return { attempted: 0, sent: 0, skipped: true };
  const rows = await loadUnsentTrials();
  let sent = 0;
  for (let i = 0; i < rows.length; i++) {
    const { key, sentFlag, ...record } = rows[i];
    const r = await sendTrial(record, { timeoutMs: 5000 });
    if (r.ok) sent++;
    if (onProgress) onProgress({ done: i + 1, total: rows.length, sent });
  }
  return { attempted: rows.length, sent };
}

// ---------- 書き出し ----------

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// 全記録（セッションと試行）を1つの JSON にして返す。
export async function exportAllJson() {
  const sessions = await loadAllSessions();
  const trials = (await loadAllTrials()).map(({ key, sentFlag, ...r }) => r);
  return { exportedAt: new Date().toISOString(), sessions, trials };
}

export async function downloadAllJson() {
  const data = await exportAllJson();
  download(`collection-b_all_${stamp()}.json`, JSON.stringify(data), "application/json");
  return data;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 試行ごとに1行の CSV（軌道は含めない）。列の説明は README.md にある。
export const TRIAL_CSV_COLUMNS = [
  ["session_id", (r) => r.sessionId],
  ["participant_id", (r) => r.participantId],
  ["group", (r) => r.group],
  ["event_name", (r) => r.eventName],
  ["app_version", (r) => r.appVersion],
  ["test_mode", (r) => r.testMode],
  ["doc_id", (r) => r.docId],
  ["seq", (r) => r.seq],
  ["part", (r) => r.part],
  ["block_index", (r) => r.blockIndex],
  ["block_pos", (r) => r.blockPos],
  ["trial_index", (r) => r.trialIndex],
  ["is_practice", (r) => r.isPractice],
  ["t", (r) => r.t],
  ["layout_id", (r) => r.layoutId],
  ["layout_name", (r) => r.layoutName],
  ["layout_rows", (r) => (r.layoutRows || []).join(" / ")],
  ["n_cards", (r) => r.nCards],
  ["max_value", (r) => r.maxValue],
  ["target", (r) => r.target],
  ["is_max_target", (r) => r.isMaxTarget],
  ["tone_count", (r) => r.toneCount],
  ["started_at", (r) => r.startedAt],
  ["start_x", (r) => r.startClick?.x],
  ["start_y", (r) => r.startClick?.y],
  ["start_perf", (r) => r.startClick?.perf],
  ["wait_ms", (r) => r.waitMs],
  ["first_tone_perf", (r) => r.firstTonePerf],
  ["last_tone_perf", (r) => r.lastTonePerf],
  ["tone_times_perf", (r) => (r.toneTimesPerf || []).map((v) => v.toFixed(3)).join(" ")],
  ["tone_duration_ms", (r) => r.toneDurationMs],
  ["click_x", (r) => r.click?.x],
  ["click_y", (r) => r.click?.y],
  ["click_perf", (r) => r.click?.perf],
  ["click_card", (r) => r.click?.card],
  ["correct", (r) => r.click?.correct],
  ["tone_count_at_click", (r) => r.click?.toneCountAtClick],
  ["before_last_tone", (r) => r.click?.beforeLastTone],
  ["determined_at_click", (r) => r.click?.determinedAtClick],
  ["ms_from_last_tone", (r) => r.click?.msFromLastTone],
  ["ms_from_first_tone", (r) => r.click?.msFromFirstTone],
  ["timed_out", (r) => r.timedOut],
  ["movement_onset_perf", (r) => r.derived?.movementOnsetPerf],
  ["movement_onset_ms_from_first_tone", (r) => r.derived?.movementOnsetMsFromFirstTone],
  ["card_at_last_tone", (r) => r.derived?.cardAtLastTone],
  ["on_correct_card_at_last_tone", (r) => r.derived?.onCorrectCardAtLastTone],
  ["card_at_each_tone", (r) => (r.derived?.cardAtEachTone || []).map((v) => (v === null ? "-" : v)).join(" ")],
  ["acquisition_time_ms", (r) => r.derived?.acquisitionTimeMs],
  ["path_length_px", (r) => r.derived?.pathLengthPx],
  ["straight_line_px", (r) => r.derived?.straightLinePx],
  ["path_point_count", (r) => r.pathPointCount],
  ["raw_path_point_count", (r) => r.rawPathPointCount],
  ["move_event_count", (r) => r.moveEventCount],
  ["screen_width", (r) => r.env?.screenWidth],
  ["screen_height", (r) => r.env?.screenHeight],
  ["device_pixel_ratio", (r) => r.env?.devicePixelRatio],
  ["inner_width", (r) => r.env?.innerWidth],
  ["inner_height", (r) => r.env?.innerHeight],
  ["screen_px_per_mm", (r) => r.env?.calibration?.screenPxPerMm],
  ["mouse_px_per_mm", (r) => r.env?.calibration?.mousePxPerMm],
  ["mouse_cpi", (r) => r.env?.calibration?.mouseCpi],
  ["sent", (r) => r.sent],
];

export function trialsToCsv(trials) {
  const header = TRIAL_CSV_COLUMNS.map(([name]) => name).join(",");
  const lines = trials.map((r) => TRIAL_CSV_COLUMNS.map(([, fn]) => csvEscape(fn(r))).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

// 軌道の CSV（縦長の形。1点が1行）。src は 0 が pointermove、1 が coalesced、2 が pointerrawupdate。
export function pathsToCsv(trials) {
  const header = "session_id,doc_id,seq,part,t,layout_id,target,idx,x,y,t_perf,t_from_first_tone_ms,src";
  const lines = [header];
  for (const r of trials) {
    const addPath = (p, srcOf) => {
      for (let i = 0; i < p.t.length; i++) {
        const rel = r.firstTonePerf !== null && r.firstTonePerf !== undefined ? (p.t[i] - r.firstTonePerf).toFixed(3) : "";
        lines.push([r.sessionId, r.docId, r.seq, r.part, r.t, r.layoutId, r.target, i,
          p.x[i], p.y[i], p.t[i].toFixed(3), rel, srcOf(i)].map(csvEscape).join(","));
      }
    };
    if (r.path) addPath(r.path, (i) => r.path.src[i]);
    if (r.rawPath) addPath(r.rawPath, () => 2);
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function downloadTrialsCsv() {
  const trials = await loadAllTrials();
  download(`collection-b_trials_${stamp()}.csv`, trialsToCsv(trials), "text/csv");
  return trials.length;
}

export async function downloadPathsCsv() {
  const trials = await loadAllTrials();
  download(`collection-b_paths_${stamp()}.csv`, pathsToCsv(trials), "text/csv");
  return trials.length;
}

// ---------- 較正と設定（localStorage） ----------

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE.calibrationKey);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function saveCalibration(calibration) {
  localStorage.setItem(STORAGE.calibrationKey, JSON.stringify(calibration));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE.settingsKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE.settingsKey, JSON.stringify(settings));
}
