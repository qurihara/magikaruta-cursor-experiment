// ==========================
// summary.js
// ==========================
// 1 試行の記録を、スプレッドシートの 1 行（要約）と、Drive に置く JSON（詳細）に分ける純粋関数。
// DOM もブラウザの API も使わないので、node --test で検査できる（test/summary.test.js）。
//
// 要約の行は、スカラの値と、短い配列を空白区切りにした文字列だけでできている。
// 大きい配列（path、rawPath、cardRects、boardRect、startButtonRect）は詳細の JSON へ移し、
// 要約の行には、その JSON のファイル名（detailFile）と、GAS が付けるファイル ID（detailFileId）を入れる。
//
// 列の名前と順序は TRIAL_COLUMNS で固定する。gas/Code.gs の TRIAL_COLUMNS と同じ並びにしてあり、
// test/summary.test.js が両者の一致を検査する。GAS 側は、ヘッダ行を列名で照合して書くので、
// ここに列を足したときも、古いシートの末尾に列が足されるだけで、列がずれることはない。
// ==========================

// 試行の要約の列。順序はこのままスプレッドシートの左から右になる。
export const TRIAL_COLUMNS = [
  // 識別
  "rowKey", "sessionId", "docId", "seq", "participantId", "group", "eventName", "appVersion", "testMode",
  // 試行の設計
  "part", "blockIndex", "blockPos", "trialIndex", "isPractice", "t",
  "layoutId", "layoutName", "layoutRows", "nCards", "maxValue", "target", "isMaxTarget", "toneCount",
  // 開始と待ち
  "startedAt", "startX", "startY", "startPerf", "waitMs",
  // 電子音
  "firstTonePerf", "lastTonePerf", "toneTimesPerf", "toneDurationMs",
  "audioBasePerfNow", "audioBaseCtxTime", "audioBaseLatencySec", "audioOutputLatencySec", "audioSampleRate",
  // クリック
  "clickX", "clickY", "clickPerf", "clickCard", "correct", "toneCountAtClick", "beforeLastTone",
  "determinedAtClick", "candidatesAtClick", "msFromLastTone", "msFromFirstTone", "msFromStart",
  "timedOut", "endPerf", "offCardClickCount",
  // 導出の指標
  "movementOnsetPerf", "movementOnsetMsFromFirstTone", "cardAtLastTone", "onCorrectCardAtLastTone",
  "cardAtEachTone", "acquisitionTimeMs", "pathLengthPx", "straightLinePx",
  // 軌道の大きさ
  "pathPointCount", "rawPathPointCount", "moveEventCount",
  // 環境
  "screenWidth", "screenHeight", "devicePixelRatio", "innerWidth", "innerHeight",
  "screenPxPerMm", "mousePxPerMm", "mouseCpi", "audioGain", "userAgent",
  // 詳細の JSON（GAS が detailFileId を埋める）
  "detailFile", "detailFileId",
  // 送信の時刻（クライアントが付ける）と、GAS が受け取った時刻（GAS が付ける）
  "clientSentAt", "receivedAt",
];

// セッションの行の列。開始、環境、アンケート、終了を同じ行に上書きする。
export const SESSION_COLUMNS = [
  "sessionId", "participantId", "group", "eventName", "appVersion", "testMode",
  "startedAt", "resumedAt", "resumeCount", "planLength", "completedTrialCount", "lastTrialDocId",
  "status", "finishedAt",
  // アンケート
  "surveyExperience", "surveyYears", "surveyGrade", "surveyAgeBand", "surveyHandedness",
  "surveyPlayedMajikaruta", "surveyAnsweredAt",
  // 環境
  "screenWidth", "screenHeight", "availWidth", "availHeight", "devicePixelRatio",
  "innerWidth", "innerHeight", "outerWidth", "outerHeight",
  "userAgent", "platform", "language", "hardwareConcurrency",
  "hasCoalescedEvents", "hasPointerRawUpdate", "timeOrigin", "audioGain",
  "screenPxPerMm", "mousePxPerMm", "mouseCpi", "calibratedAt",
  "clientSentAt", "receivedAt",
];

// 詳細の JSON へ移す項目。要約の行には入れない。
export const DETAIL_KEYS = ["path", "rawPath", "cardRects", "boardRect", "startButtonRect"];

// 要約の行の中で、文字列にして入れる配列の項目と、その区切り。
function joinNumbers(arr, digits) {
  if (!Array.isArray(arr)) return "";
  return arr.map((v) => (v === null || v === undefined ? "-" : typeof v === "number" && digits !== undefined ? v.toFixed(digits) : String(v))).join(" ");
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : (v === null || v === undefined ? null : v);
}

// 詳細の JSON のファイル名。セッションごとのフォルダの中に置くので、docId だけで一意になる。
export function detailFileName(record) {
  return `${record.docId}.json`;
}

// IndexedDB の key と同じ形。GAS 側で二重書き込みを見つける鍵にする。
export function rowKeyOf(record) {
  return `${record.sessionId}/${record.docId}`;
}

// 1 試行の記録から、スプレッドシートの 1 行（要約）を作る。返り値のキーは TRIAL_COLUMNS に含まれる名前だけである。
// detailFileId と receivedAt は GAS が埋めるので、ここでは入れない。
export function buildTrialSummary(record, { clientSentAt = null } = {}) {
  const c = record.click || null;
  const d = record.derived || {};
  const env = record.env || {};
  const cal = env.calibration || {};
  const a = record.audioBase || {};
  const summary = {
    rowKey: rowKeyOf(record),
    sessionId: record.sessionId,
    docId: record.docId,
    seq: record.seq,
    participantId: record.participantId,
    group: record.group,
    eventName: record.eventName,
    appVersion: record.appVersion,
    testMode: Boolean(record.testMode),

    part: record.part,
    blockIndex: record.blockIndex,
    blockPos: record.blockPos,
    trialIndex: record.trialIndex,
    isPractice: Boolean(record.isPractice),
    t: record.t,
    layoutId: record.layoutId,
    layoutName: record.layoutName,
    layoutRows: Array.isArray(record.layoutRows) ? record.layoutRows.join(" / ") : (record.layoutRows ?? ""),
    nCards: record.nCards,
    maxValue: record.maxValue,
    target: record.target,
    isMaxTarget: Boolean(record.isMaxTarget),
    toneCount: record.toneCount,

    startedAt: record.startedAt,
    startX: num(record.startClick?.x),
    startY: num(record.startClick?.y),
    startPerf: num(record.startClick?.perf),
    waitMs: num(record.waitMs),

    firstTonePerf: num(record.firstTonePerf),
    lastTonePerf: num(record.lastTonePerf),
    toneTimesPerf: joinNumbers(record.toneTimesPerf, 3),
    toneDurationMs: num(record.toneDurationMs),
    audioBasePerfNow: num(a.basePerfNow),
    audioBaseCtxTime: num(a.baseCtxTime),
    audioBaseLatencySec: num(a.baseLatencySec),
    audioOutputLatencySec: num(a.outputLatencySec),
    audioSampleRate: num(a.sampleRate),

    clickX: c ? num(c.x) : null,
    clickY: c ? num(c.y) : null,
    clickPerf: c ? num(c.perf) : null,
    clickCard: c ? num(c.card) : null,
    correct: c ? Boolean(c.correct) : null,
    toneCountAtClick: c ? num(c.toneCountAtClick) : null,
    beforeLastTone: c ? Boolean(c.beforeLastTone) : null,
    determinedAtClick: c ? Boolean(c.determinedAtClick) : null,
    candidatesAtClick: c ? joinNumbers(c.candidatesAtClick) : "",
    msFromLastTone: c ? num(c.msFromLastTone) : null,
    msFromFirstTone: c ? num(c.msFromFirstTone) : null,
    msFromStart: c ? num(c.msFromStart) : null,
    timedOut: Boolean(record.timedOut),
    endPerf: num(record.endPerf),
    offCardClickCount: num(record.offCardClickCount ?? 0),

    movementOnsetPerf: num(d.movementOnsetPerf),
    movementOnsetMsFromFirstTone: num(d.movementOnsetMsFromFirstTone),
    cardAtLastTone: num(d.cardAtLastTone),
    onCorrectCardAtLastTone: d.onCorrectCardAtLastTone === undefined ? null : Boolean(d.onCorrectCardAtLastTone),
    cardAtEachTone: joinNumbers(d.cardAtEachTone),
    acquisitionTimeMs: num(d.acquisitionTimeMs),
    pathLengthPx: num(d.pathLengthPx),
    straightLinePx: num(d.straightLinePx),

    pathPointCount: num(record.pathPointCount),
    rawPathPointCount: num(record.rawPathPointCount),
    moveEventCount: num(record.moveEventCount),

    screenWidth: num(env.screenWidth),
    screenHeight: num(env.screenHeight),
    devicePixelRatio: num(env.devicePixelRatio),
    innerWidth: num(env.innerWidth),
    innerHeight: num(env.innerHeight),
    screenPxPerMm: num(cal.screenPxPerMm),
    mousePxPerMm: num(cal.mousePxPerMm),
    mouseCpi: num(cal.mouseCpi),
    audioGain: num(env.audioGain),
    userAgent: env.userAgent ?? null,

    detailFile: detailFileName(record),
    clientSentAt,
  };
  return summary;
}

// 1 試行の記録から、Drive に置く詳細の JSON の中身を作る。
// 要約から復元できない大きい配列と、照合に要る識別の項目を入れる。
// 同じ docId で再送しても同じ内容になるので、Drive 側で上書きしても情報は失われない。
export function buildTrialDetail(record) {
  const detail = {
    rowKey: rowKeyOf(record),
    sessionId: record.sessionId,
    docId: record.docId,
    seq: record.seq,
    participantId: record.participantId,
    part: record.part,
    t: record.t,
    layoutId: record.layoutId,
    target: record.target,
    startedAt: record.startedAt,
    firstTonePerf: record.firstTonePerf ?? null,
    lastTonePerf: record.lastTonePerf ?? null,
    toneTimesPerf: record.toneTimesPerf ?? [],
    startClick: record.startClick ?? null,
    click: record.click ?? null,
    offCardClicks: record.offCardClicks ?? [],
    appVersion: record.appVersion,
  };
  for (const k of DETAIL_KEYS) detail[k] = record[k] ?? null;
  return detail;
}

// セッションの記録から、スプレッドシートの 1 行を作る。返り値のキーは SESSION_COLUMNS に含まれる名前だけである。
export function buildSessionRow(session, { clientSentAt = null } = {}) {
  const env = session.env || {};
  const cal = env.calibration || {};
  const sv = session.survey || {};
  return {
    sessionId: session.sessionId,
    participantId: session.participantId,
    group: session.group,
    eventName: session.eventName,
    appVersion: session.appVersion,
    testMode: Boolean(session.testMode),
    startedAt: session.startedAt ?? null,
    resumedAt: session.resumedAt ?? null,
    resumeCount: num(session.resumeCount),
    planLength: num(session.planLength),
    completedTrialCount: num(session.completedTrialCount),
    lastTrialDocId: session.lastTrialDocId ?? null,
    status: session.status ?? null,
    finishedAt: session.finishedAt ?? null,

    surveyExperience: sv.experience ?? null,
    surveyYears: num(sv.years),
    surveyGrade: sv.grade ?? null,
    surveyAgeBand: sv.ageBand ?? null,
    surveyHandedness: sv.handedness ?? null,
    surveyPlayedMajikaruta: sv.playedMajikaruta ?? null,
    surveyAnsweredAt: sv.answeredAt ?? null,

    screenWidth: num(env.screenWidth),
    screenHeight: num(env.screenHeight),
    availWidth: num(env.availWidth),
    availHeight: num(env.availHeight),
    devicePixelRatio: num(env.devicePixelRatio),
    innerWidth: num(env.innerWidth),
    innerHeight: num(env.innerHeight),
    outerWidth: num(env.outerWidth),
    outerHeight: num(env.outerHeight),
    userAgent: env.userAgent ?? null,
    platform: env.platform ?? null,
    language: env.language ?? null,
    hardwareConcurrency: num(env.hardwareConcurrency),
    hasCoalescedEvents: env.hasCoalescedEvents === undefined ? null : Boolean(env.hasCoalescedEvents),
    hasPointerRawUpdate: env.hasPointerRawUpdate === undefined ? null : Boolean(env.hasPointerRawUpdate),
    timeOrigin: num(env.timeOrigin),
    audioGain: num(env.audioGain),
    screenPxPerMm: num(cal.screenPxPerMm),
    mousePxPerMm: num(cal.mousePxPerMm),
    mouseCpi: num(cal.mouseCpi),
    calibratedAt: cal.calibratedAt ?? null,
    clientSentAt,
  };
}

// GAS へ送る 1 試行分の本文。1 回の POST で要約と詳細の両方を送る。
export function buildTrialPayload(record, { clientSentAt = new Date().toISOString() } = {}) {
  return {
    type: "trial",
    summary: buildTrialSummary(record, { clientSentAt }),
    detail: buildTrialDetail(record),
  };
}

// GAS へ送るセッションの本文。
export function buildSessionPayload(session, { clientSentAt = new Date().toISOString() } = {}) {
  return {
    type: "session",
    session: buildSessionRow(session, { clientSentAt }),
  };
}
