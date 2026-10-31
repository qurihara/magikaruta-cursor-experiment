// ==========================
// Code.gs
// ==========================
// 収集B（まじかるたの PC とマウスのアプリ）の記録を受け取る Google Apps Script。
// スプレッドシートに「コンテナバインド」で付けて、「ウェブアプリ」としてデプロイする
// （実行するユーザ: 自分、アクセスできるユーザ: 全員）。デプロイの手順は README.md にある。
//
// 受け取るもの（クライアントは Content-Type を text/plain にして JSON を POST する。
// text/plain にすると CORS の事前要求（OPTIONS）が出ないので、GAS でも受けられる）。
//
//   { type: "trial",   summary: {列名: 値, ...}, detail: {path, rawPath, cardRects, ...} }
//   { type: "session", session: {列名: 値, ...} }
//   { type: "ping" }
//
// 書く場所。
//   - 「trials」シート   … 1 試行が 1 行。列は TRIAL_COLUMNS で固定し、ヘッダ行を列名で照合して書く。
//   - 「sessions」シート … 1 セッションが 1 行。sessionId で行を探し、開始、環境、アンケート、終了を同じ行に上書きする。
//   - Drive のフォルダ   … スプレッドシートと同じフォルダに「collection-b-data」を作り（無ければ作る）、
//                          その下に sessionId のサブフォルダ、その中に docId.json を置く。同じ名前があれば上書きする。
//                          「trials」の行の detailFileId の列に、その JSON のファイル ID を入れる。
//
// 二重書き込みの防ぎ方。
//   - 「trials」は rowKey（sessionId/docId）の列を TextFinder で探し、あれば同じ行に上書きする。
//   - 「sessions」は sessionId の列を TextFinder で探し、あれば同じ行に上書きする。
//   - 探してから書くまでを LockService のスクリプトロックで囲む（待ちは 30 秒まで）。
//     10 台から同時に届いても、appendRow の競合で行が混ざることはない。
//
// 列の書き方の注意。Object.keys の順で書くと、送られてきたオブジェクトのキーの順が変わったときに
// 列がずれる（Kikiwake の appendBatchData で起きた不具合）。ここでは TRIAL_COLUMNS と SESSION_COLUMNS の
// 名前でヘッダを作り、ヘッダ行を読み直して、列名ごとに値を置く。ヘッダに無い名前が届いたら末尾に足す。
// ==========================

const APP_NAME = "collection-b";
const GAS_VERSION = "1.0.0";

// 通常は空のままでよい。スプレッドシートに付けた（コンテナバインドの）スクリプトなら、
// SpreadsheetApp.getActiveSpreadsheet() で、そのスプレッドシートが得られる。
// 独立したスクリプトとして作ったときだけ、書き込み先のスプレッドシートの ID をここに入れる。
const SPREADSHEET_ID = "";

const SHEET_TRIALS = "trials";
const SHEET_SESSIONS = "sessions";
const DATA_FOLDER_NAME = "collection-b-data";
const LOCK_WAIT_MS = 30000;

// 「trials」シートの列。js/summary.js の TRIAL_COLUMNS と同じ並びにする（test/summary.test.js が一致を検査する）。
const TRIAL_COLUMNS = [
  "rowKey", "sessionId", "docId", "seq", "participantId", "group", "eventName", "appVersion", "testMode",
  "part", "blockIndex", "blockPos", "trialIndex", "isPractice", "t",
  "layoutId", "layoutName", "layoutRows", "nCards", "maxValue", "target", "isMaxTarget", "toneCount",
  "startedAt", "startX", "startY", "startPerf", "waitMs",
  "firstTonePerf", "lastTonePerf", "toneTimesPerf", "toneDurationMs",
  "audioBasePerfNow", "audioBaseCtxTime", "audioBaseLatencySec", "audioOutputLatencySec", "audioSampleRate",
  "clickX", "clickY", "clickPerf", "clickCard", "correct", "toneCountAtClick", "beforeLastTone",
  "determinedAtClick", "candidatesAtClick", "msFromLastTone", "msFromFirstTone", "msFromStart",
  "timedOut", "endPerf",
  "movementOnsetPerf", "movementOnsetMsFromFirstTone", "cardAtLastTone", "onCorrectCardAtLastTone",
  "cardAtEachTone", "acquisitionTimeMs", "pathLengthPx", "straightLinePx",
  "pathPointCount", "rawPathPointCount", "moveEventCount",
  "screenWidth", "screenHeight", "devicePixelRatio", "innerWidth", "innerHeight",
  "screenPxPerMm", "mousePxPerMm", "mouseCpi", "audioGain", "userAgent",
  "detailFile", "detailFileId",
  "clientSentAt", "receivedAt",
];

// 「sessions」シートの列。js/summary.js の SESSION_COLUMNS と同じ並びにする。
const SESSION_COLUMNS = [
  "sessionId", "participantId", "group", "eventName", "appVersion", "testMode",
  "startedAt", "resumedAt", "resumeCount", "planLength", "completedTrialCount", "lastTrialDocId",
  "status", "finishedAt",
  "surveyExperience", "surveyYears", "surveyGrade", "surveyAgeBand", "surveyHandedness",
  "surveyPlayedMajikaruta", "surveyAnsweredAt",
  "screenWidth", "screenHeight", "availWidth", "availHeight", "devicePixelRatio",
  "innerWidth", "innerHeight", "outerWidth", "outerHeight",
  "userAgent", "platform", "language", "hardwareConcurrency",
  "hasCoalescedEvents", "hasPointerRawUpdate", "timeOrigin", "audioGain",
  "screenPxPerMm", "mousePxPerMm", "mouseCpi", "calibratedAt",
  "clientSentAt", "receivedAt",
];

// ---------- 入口 ----------

// ブラウザで /exec を開いたときの確認用。デプロイが生きているかを見るだけで、何も書かない。
function doGet() {
  return jsonResponse_({ ok: true, app: APP_NAME, gasVersion: GAS_VERSION, message: "POST で記録を受け取ります。" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonResponse_({ ok: false, error: "JSON を読めませんでした: " + String(err) });
  }
  const type = body.type;
  if (type === "ping") {
    return jsonResponse_({ ok: true, type: "ping", app: APP_NAME, gasVersion: GAS_VERSION, receivedAt: new Date().toISOString() });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (err) {
    // ロックが取れなかったときは失敗として返す。クライアントは未送信のまま残し、あとで再送する。
    return jsonResponse_({ ok: false, error: "ほかの送信を待っている間に時間切れになりました。再送してください。", retry: true });
  }
  try {
    const ss = getSpreadsheet_();
    if (type === "trial") return jsonResponse_(handleTrial_(ss, body));
    if (type === "session") return jsonResponse_(handleSession_(ss, body));
    return jsonResponse_({ ok: false, error: "知らない type です: " + String(type) });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- 試行 ----------

function handleTrial_(ss, body) {
  const summary = body.summary;
  const detail = body.detail;
  if (!summary || typeof summary !== "object") throw new Error("trial: summary がありません");
  if (!summary.sessionId || !summary.docId) throw new Error("trial: sessionId と docId が要ります");
  const rowKey = summary.rowKey || (summary.sessionId + "/" + summary.docId);
  summary.rowKey = rowKey;
  summary.receivedAt = new Date().toISOString();

  // 1. 詳細の JSON を Drive に置く（同じ名前があれば上書き）。
  let fileId = "";
  if (detail && typeof detail === "object") {
    const fileName = summary.detailFile || (summary.docId + ".json");
    summary.detailFile = fileName;
    const folder = getSessionFolder_(ss, summary.sessionId);
    fileId = writeJsonFile_(folder, fileName, detail);
  }
  summary.detailFileId = fileId;

  // 2. 要約の行を書く。rowKey が同じ行があれば上書き、無ければ追記。
  const sheet = getOrCreateSheet_(ss, SHEET_TRIALS);
  const headers = ensureHeader_(sheet, TRIAL_COLUMNS, Object.keys(summary));
  const rowIndex = findRowByColumn_(sheet, headers, "rowKey", rowKey);
  const written = writeRowByNames_(sheet, headers, summary, rowIndex);
  return { ok: true, type: "trial", rowKey: rowKey, row: written.row, replaced: written.replaced, detailFileId: fileId };
}

// ---------- セッション ----------

function handleSession_(ss, body) {
  const session = body.session;
  if (!session || typeof session !== "object") throw new Error("session: session がありません");
  if (!session.sessionId) throw new Error("session: sessionId が要ります");
  session.receivedAt = new Date().toISOString();

  const sheet = getOrCreateSheet_(ss, SHEET_SESSIONS);
  const headers = ensureHeader_(sheet, SESSION_COLUMNS, Object.keys(session));
  const rowIndex = findRowByColumn_(sheet, headers, "sessionId", session.sessionId);
  const written = writeRowByNames_(sheet, headers, session, rowIndex);
  return { ok: true, type: "session", sessionId: session.sessionId, row: written.row, replaced: written.replaced };
}

// ---------- シートの道具 ----------

// 書き込み先のスプレッドシート。
function getSpreadsheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("スプレッドシートが見つかりません。スプレッドシートの「拡張機能」→「Apps Script」から作ったスクリプトに貼るか、SPREADSHEET_ID を入れてください。");
  return ss;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ヘッダ行を整え、整えたあとのヘッダ（列名の配列）を返す。
// シートが空なら fixedColumns をヘッダにする。既にヘッダがあれば、fixedColumns と extraNames のうち
// 無い名前を末尾に足す（既存の列は動かさない）。
function ensureHeader_(sheet, fixedColumns, extraNames) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, fixedColumns.length).setValues([fixedColumns]);
    sheet.getRange(1, 1, 1, fixedColumns.length).setFontWeight("bold").setBackground("#eeeeee");
    sheet.setFrozenRows(1);
  }
  let existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const wanted = fixedColumns.concat(extraNames || []);
  const missing = [];
  for (const name of wanted) {
    if (existing.indexOf(name) === -1 && missing.indexOf(name) === -1) missing.push(name);
  }
  if (missing.length > 0) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, existing.length + 1, 1, missing.length).setFontWeight("bold").setBackground("#eeeeee");
    existing = existing.concat(missing);
  }
  return existing;
}

// 列名 columnName の列を、値 value で探す。見つかれば行番号（1 始まり）、無ければ 0。
function findRowByColumn_(sheet, headers, columnName, value) {
  const col = headers.indexOf(columnName) + 1;
  if (col === 0) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const range = sheet.getRange(2, col, lastRow - 1, 1);
  const found = range.createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findNext();
  return found ? found.getRow() : 0;
}

// obj の値を、ヘッダの列名ごとに置いて 1 行を書く。rowIndex が 0 なら末尾に追記、それ以外はその行に上書き。
// ヘッダに無い名前は ensureHeader_ が先に足してあるので、ここで取りこぼすことはない。
function writeRowByNames_(sheet, headers, obj, rowIndex) {
  const row = headers.map(function (name) {
    return Object.prototype.hasOwnProperty.call(obj, name) ? toCell_(obj[name]) : "";
  });
  let target = rowIndex;
  let replaced = true;
  if (!target) {
    target = sheet.getLastRow() + 1;
    replaced = false;
  }
  sheet.getRange(target, 1, 1, headers.length).setValues([row]);
  return { row: target, replaced: replaced };
}

// セルに入れられる値にする。null と undefined は空、配列とオブジェクトは JSON の文字列、
// 「=」で始まる文字列は数式として解釈されないように先頭にアポストロフィを付ける。
function toCell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.charAt(0) === "=" ? "'" + s : s;
}

// ---------- Drive の道具 ----------

// スプレッドシートと同じフォルダにある「collection-b-data」フォルダを返す。無ければ作る。
function getDataFolder_(ss) {
  const file = DriveApp.getFileById(ss.getId());
  const parents = file.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  return getOrCreateFolder_(parent, DATA_FOLDER_NAME);
}

// セッションごとのサブフォルダを返す。無ければ作る。
function getSessionFolder_(ss, sessionId) {
  const dataFolder = getDataFolder_(ss);
  return getOrCreateFolder_(dataFolder, safeName_(sessionId));
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// フォルダの中に name の JSON ファイルを書く。同じ名前があれば中身を置き換える（再送しても増えない）。
// 返り値はファイル ID。
function writeJsonFile_(folder, name, obj) {
  const text = JSON.stringify(obj);
  const it = folder.getFilesByName(name);
  if (it.hasNext()) {
    const file = it.next();
    file.setContent(text);
    // 同じ名前が 2 つ以上あれば（ロックの無い旧版で作られたときなど）、残りはごみ箱へ移す。
    while (it.hasNext()) it.next().setTrashed(true);
    return file.getId();
  }
  const created = folder.createFile(name, text, "application/json");
  return created.getId();
}

// フォルダ名に使えない文字を取り除く。
function safeName_(s) {
  return String(s).replace(/[\\\/:*?"<>|]/g, "_").slice(0, 200) || "unknown";
}

// ---------- 応答 ----------

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 手で動かす確認 ----------

// Apps Script のエディタから実行して、シートと Drive の書き込みを確かめる。
// 初回の実行で、スプレッドシートと Drive への権限の承認の画面が出る。デプロイの前に 1 回実行しておくと、
// ウェブアプリからの書き込みで権限の不足が起きない。
function selfTest() {
  const ss = getSpreadsheet_();
  const sessionId = "selftest_p0_test";
  const sessionResult = handleSession_(ss, { session: {
    sessionId: sessionId, participantId: 0, group: "general", eventName: "selftest", appVersion: "gas-selftest",
    testMode: true, startedAt: new Date().toISOString(), status: "running",
  } });
  const trialResult = handleTrial_(ss, {
    summary: { sessionId: sessionId, docId: "practice_0_1", seq: 0, part: "practice", t: 0.4, target: 7, testMode: true },
    detail: { path: { x: [0, 1], y: [0, 1], t: [0, 8], src: [0, 0] }, rawPath: { x: [], y: [], t: [] } },
  });
  Logger.log(JSON.stringify({ sessionResult: sessionResult, trialResult: trialResult }));
  return { sessionResult: sessionResult, trialResult: trialResult };
}
