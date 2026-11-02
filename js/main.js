// ==========================
// main.js
// ==========================
// 画面の流れ全体（仕様書の第10節）。
// 1. 運営者の画面 → 2. 参加者への説明と音量の確認 → 3. 練習 → 4. 第1部 → 5. 第2部 →
// 6. 第3部（練習と5ブロック） → 7. 第4部 → 8. アンケート → 9. 終了の画面。
//
// 試行の列は design.js の buildPlan が参加者番号から決定的に作る。IndexedDB に保存済みの試行
// （文書 ID が同じもの）は飛ばすので、途中で中断しても同じ参加者番号で続きから再開できる。
//
// 試行中の時刻はすべて performance.now の時間軸で記録し、Date は試行の開始時刻の1回だけにする。
// ==========================

import {
  APP_VERSION, GROUPS, INSTRUCTIONS, TIMING, TEST_MODE,
} from "./config.js";
import { buildPlan, splitPlanByPart, PART_ORDER, candidatesAfterTones } from "./design.js";
import { unlockAudio, setGain, getGain, scheduleTones, stopAllTones, playSoundCheck } from "./audio.js";
import { Board } from "./board.js";
import { PointerRecorder, buildTrialRecord } from "./recorder.js";
import {
  saveTrialLocal, sendTrial, sendSession, saveSessionLocal, loadSessionLocal,
  loadTrialsForSession, loadAllSessions, loadAllTrials, resendUnsent, uploadEnabled, uploadTargetLabel,
  downloadAllJson, downloadTrialsCsv, downloadPathsCsv, loadSettings, saveSettings,
} from "./storage.js";
import { mountCalibration, currentCalibration } from "./calibration.js";

// ---------- 状態 ----------

const params = new URLSearchParams(location.search);
const TEST = params.get("test") === "1";

const state = {
  session: null,      // いまのセッション（参加者）の文書
  plan: null,         // 試行の列
  savedDocIds: new Set(), // 保存済みの試行の文書 ID
  current: null,      // いま実行中の試行
  lastTones: null,    // 直前の試行の音の予約
  board: null,
  recorder: null,
  running: false,
  abort: false,
};

// デバッグと自動の確認のために、状態と主要な関数を公開する。
window.__collectionB = { state, TEST, APP_VERSION };

const $ = (sel) => document.querySelector(sel);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 利用者のクリックを待つ。
function waitForClick(el) {
  return new Promise((resolve) => {
    const handler = (ev) => { el.removeEventListener("click", handler); resolve(ev); };
    el.addEventListener("click", handler);
  });
}

function slug(text) {
  return String(text).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "event";
}

function formatT(t) {
  return `${t} 秒`;
}

// ---------- 環境の記録 ----------

function collectEnv() {
  const recorder = state.recorder || new PointerRecorder();
  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform ?? null,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    hasCoalescedEvents: recorder.hasCoalesced,
    hasPointerRawUpdate: recorder.hasRawUpdate,
    timeOrigin: performance.timeOrigin,
    audioGain: getGain(),
    calibration: currentCalibration(),
    appVersion: APP_VERSION,
    testMode: TEST,
  };
}

// ---------- 運営者の画面 ----------

async function refreshOperatorStatus() {
  const sessions = await loadAllSessions();
  const trials = await loadAllTrials();
  const unsent = trials.filter((t) => !t.sent).length;
  const unsentSessions = sessions.filter((s) => !s.sent).length;
  const enabled = await uploadEnabled();
  $("#operator-status").textContent =
    `送信先: ${uploadTargetLabel()}。` +
    `この PC の記録: セッション ${sessions.length} 件、試行 ${trials.length} 件` +
    (enabled ? `（未送信: 試行 ${unsent} 件、セッション ${unsentSessions} 件）。` : "。");
  const list = $("#session-list");
  if (sessions.length === 0) {
    list.innerHTML = "<p class='muted'>まだ記録はありません。</p>";
  } else {
    list.innerHTML = "<ul>" + sessions.map((s) => {
      const n = trials.filter((t) => t.sessionId === s.sessionId).length;
      return `<li>${s.sessionId}（参加者 ${s.participantId}、${s.group}、${s.startedAt}）: 試行 ${n} 件 / 予定 ${s.planLength}${s.finishedAt ? "、終了" : ""}</li>`;
    }).join("") + "</ul>";
  }
}

function setupOperatorScreen() {
  const groupSel = $("#in-group");
  groupSel.innerHTML = GROUPS.map((g) => `<option value="${g.value}">${g.label}</option>`).join("");
  const settings = loadSettings();
  if (settings.eventName) $("#in-event").value = settings.eventName;
  if (settings.gain !== undefined) $("#in-gain").value = String(settings.gain);
  if (settings.lastParticipantId) $("#in-participant").placeholder = `前回は ${settings.lastParticipantId}`;

  $("#in-participant").addEventListener("input", checkResume);
  $("#in-event").addEventListener("input", checkResume);

  $("#btn-sound-test").addEventListener("click", async () => {
    await unlockAudio();
    setGain($("#in-gain").value);
    playSoundCheck();
  });

  $("#operator-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await unlockAudio();
    setGain($("#in-gain").value);
    await startSession({
      participantId: Number($("#in-participant").value),
      group: groupSel.value,
      eventName: $("#in-event").value,
    });
  });

  $("#btn-calibration").addEventListener("click", () => {
    showScreen("screen-calibration");
    mountCalibration($("#screen-calibration"), () => { showScreen("screen-operator"); refreshOperatorStatus(); });
  });
  $("#btn-export-json").addEventListener("click", async () => {
    const data = await downloadAllJson();
    $("#operator-status").textContent = `JSON を書き出しました（セッション ${data.sessions.length} 件、試行 ${data.trials.length} 件）。`;
  });
  $("#btn-export-csv").addEventListener("click", async () => {
    const n = await downloadTrialsCsv();
    $("#operator-status").textContent = `試行の CSV を書き出しました（${n} 行）。`;
  });
  $("#btn-export-paths").addEventListener("click", async () => {
    const n = await downloadPathsCsv();
    $("#operator-status").textContent = `軌道の CSV を書き出しました（${n} 試行分）。`;
  });
  $("#btn-resend").addEventListener("click", async () => {
    $("#operator-status").textContent = "再送しています…";
    const r = await resendUnsent({ onProgress: ({ done, total, sent }) => { $("#operator-status").textContent = `再送 ${done}/${total}（成功 ${sent}）`; } });
    if (r.skipped) $("#operator-status").textContent = "送信先が設定されていないので再送しません。";
    else $("#operator-status").textContent = `再送しました: 試行 ${r.sent}/${r.attempted} 件、セッション ${r.sessionsSent}/${r.sessionsAttempted} 件。`;
    refreshOperatorStatus();
  });
}

// 参加者番号とイベント名から、保存済みの記録があるかを調べて知らせる。
async function checkResume() {
  const pid = Number($("#in-participant").value);
  const notice = $("#resume-notice");
  if (!Number.isInteger(pid) || pid < 1) { notice.hidden = true; return; }
  const sessionId = makeSessionId($("#in-event").value, pid);
  const saved = await loadTrialsForSession(sessionId);
  const session = await loadSessionLocal(sessionId);
  if (saved.length > 0) {
    notice.hidden = false;
    notice.textContent = `参加者 ${pid} の記録が ${saved.length} 試行分あります${session?.finishedAt ? "（終了済み）" : ""}。開始すると、保存済みの試行を飛ばして続きから始めます。`;
  } else {
    notice.hidden = true;
  }
}

function makeSessionId(eventName, pid) {
  return `${slug(eventName)}_p${pid}${TEST ? "_test" : ""}`;
}

// ---------- セッションの開始 ----------

async function startSession({ participantId, group, eventName }) {
  if (!Number.isInteger(participantId) || participantId < 1) {
    alert("参加者番号は 1 以上の整数にしてください。");
    return;
  }
  saveSettings({ eventName, gain: Number($("#in-gain").value), lastParticipantId: participantId });

  const sessionId = makeSessionId(eventName, participantId);
  const plan = buildPlan({ participantId, testMode: TEST });
  const saved = await loadTrialsForSession(sessionId);
  state.savedDocIds = new Set(saved.map((t) => t.docId));
  state.plan = plan;

  const existing = await loadSessionLocal(sessionId);
  const env = collectEnv();
  state.session = {
    sessionId,
    participantId,
    group,
    eventName,
    testMode: TEST,
    appVersion: APP_VERSION,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    resumedAt: existing ? new Date().toISOString() : null,
    resumeCount: (existing?.resumeCount ?? 0) + (existing ? 1 : 0),
    planLength: plan.length,
    completedTrialCount: saved.length,
    env,
    survey: existing?.survey ?? null,
    finishedAt: existing?.finishedAt ?? null,
    status: "running",
    sent: false,   // 開始の記録を送るので、送信済みの印を下ろす
  };
  await saveSessionLocal(state.session);
  // 開始の記録を送る。待たない（回線が無くても参加者を待たせないため）。失敗しても再送のときに一緒に送る。
  sendSession(state.session).catch(() => {});

  state.board = state.board || new Board($("#stage"));
  state.recorder = state.recorder || new PointerRecorder(document);

  showScreen("screen-intro");
  $("#btn-intro-next").disabled = true;
  await runIntro();
  await runAllParts();
  await runSurvey();
  await showDone();
}

async function runIntro() {
  const soundBtn = $("#btn-intro-sound");
  const nextBtn = $("#btn-intro-next");
  const onSound = async () => { await unlockAudio(); playSoundCheck(); nextBtn.disabled = false; };
  soundBtn.addEventListener("click", onSound);
  await waitForClick(nextBtn);
  soundBtn.removeEventListener("click", onSound);
}

// 教示やブロックの知らせを出し、「次へ」を待つ。
async function showMessage(title, paragraphs) {
  $("#message-title").textContent = title;
  $("#message-body").innerHTML = paragraphs.map((p) => `<p>${p}</p>`).join("");
  showScreen("screen-message");
  await waitForClick($("#btn-message-next"));
}

// ---------- 部とブロックの流れ ----------

const PART_TITLES = {
  practice: "練習",
  part1: "第1部",
  part2: "第2部",
  part3practice: "第3部の練習",
  part3: "第3部",
  part4: "第4部",
};

async function runAllParts() {
  const parts = splitPlanByPart(state.plan);
  for (const key of PART_ORDER) {
    const remaining = parts.get(key).filter((t) => !state.savedDocIds.has(t.docId));
    if (remaining.length === 0) continue; // この部は保存済みなので飛ばす
    await showPartInstruction(key, remaining);
    await runPart(key, remaining);
  }
}

async function showPartInstruction(key, remaining) {
  const n = remaining.length;
  switch (key) {
    case "practice":
      return showMessage("練習", [
        `まず練習です。音の間隔は ${formatT(remaining[0].t)} で、${n} 回行います。`,
        INSTRUCTIONS.part1,
      ]);
    case "part1":
      return showMessage("第1部", [
        INSTRUCTIONS.part1,
        "音の間隔は、まとまりごとに変わります。まとまりの最初に音の間隔をお知らせし、1 回の練習のあと、本番を行います。",
      ]);
    case "part2":
      return showMessage("第2部", [
        INSTRUCTIONS.part2,
        `音の間隔は ${formatT(remaining[0].t)} です。${n} 回行います。`,
      ]);
    case "part3practice":
      return showMessage("第3部", [
        INSTRUCTIONS.part3,
        `まず、音の間隔 ${formatT(remaining[0].t)} で ${n} 回の練習を行います。練習では、いま乗るべき札を黄色い枠で示します。`,
      ]);
    case "part3":
      return showMessage("第3部 本番", [
        INSTRUCTIONS.part3,
        "音の間隔は、まとまりごとに変わります。まとまりの最初に音の間隔をお知らせし、1 回の練習のあと、本番を行います。",
      ]);
    case "part4":
      return showMessage("第4部", [
        INSTRUCTIONS.part4,
        `${n} 回行います。`,
      ]);
    default:
      return showMessage(PART_TITLES[key] || key, []);
  }
}

async function runPart(key, trials) {
  // ブロックごとにまとめる。第1部と第3部は、ブロックの最初に t を知らせる。
  const blocks = new Map();
  for (const t of trials) {
    if (!blocks.has(t.blockIndex)) blocks.set(t.blockIndex, []);
    blocks.get(t.blockIndex).push(t);
  }
  const announce = key === "part1" || key === "part3" || key === "part4";
  const totalBlocks = key === "part1" || key === "part3" ? 5 : key === "part4" ? 2 : 1;
  for (const [blockIndex, blockTrials] of blocks) {
    if (announce) {
      await showMessage(`${PART_TITLES[key]}　まとまり ${blockIndex + 1} / ${totalBlocks}`, [
        `次は音の間隔が <strong>${formatT(blockTrials[0].t)}</strong> です。`,
        blockTrials[0].isPractice ? "最初の 1 回は練習です。" : "",
      ].filter(Boolean));
    }
    for (const trial of blockTrials) {
      if (state.abort) return;
      await runTrial(trial, { key, totalBlocks, blockTotal: blockTrials.length });
    }
  }
}

// ---------- 1試行 ----------

function progressText(trial, { key, totalBlocks }) {
  const partLabel = PART_TITLES[key] || key;
  const blockLabel = totalBlocks > 1 ? `　まとまり ${trial.blockIndex + 1}/${totalBlocks}` : "";
  const kind = trial.isPractice ? "練習" : `試行 ${trial.trialIndex}`;
  return `${partLabel}${blockLabel}　${kind}　t = ${trial.t} s　配置 ${trial.layoutId}${TEST ? `　読み ${trial.target}` : ""}`;
}

// 第3部の練習で、いま乗るべき札（候補のうち最小の値）を音に合わせて示す。
function scheduleGuide(trial, tones) {
  const values = trial.rows.flat();
  const timers = [];
  const show = (k) => {
    const cands = candidatesAfterTones(values, k, trial.target);
    state.board.setGuide(cands.length > 0 ? Math.min(...cands) : null);
  };
  show(0);
  tones.toneTimesPerf.forEach((tt, i) => {
    const delay = Math.max(0, tt - performance.now());
    timers.push(setTimeout(() => show(i + 1), delay));
  });
  return () => timers.forEach(clearTimeout);
}

async function runTrial(trial, meta) {
  const board = state.board;
  const recorder = state.recorder;
  const screenEl = $("#screen-trial");
  state.current = trial;

  showScreen("screen-trial");
  $("#trial-progress").textContent = progressText(trial, meta);
  board.clearMarks();
  board.render(trial.rows);
  board.showStartButton(true);

  // 1. 開始ボタンのクリックを待つ。この位置と時刻が試行の開始になる。
  const startEv = await new Promise((resolve) => {
    const handler = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      board.startButton.removeEventListener("pointerdown", handler);
      resolve(ev);
    };
    board.startButton.addEventListener("pointerdown", handler);
  });
  const start = {
    x: startEv.clientX,
    y: startEv.clientY,
    perf: performance.now(),
    timeStamp: startEv.timeStamp,
    isoTime: new Date().toISOString(),   // Date を読むのは試行の中でここだけ
  };
  board.showStartButton(false);
  board.measure();

  // 2. 軌道の記録を始め、開始位置を最初の点にする。
  recorder.start();
  recorder.push(start.x, start.y, start.timeStamp);

  // 3. 無作為の待ちのあとに電子音が始まるように、すべての音を予約する。
  const waitMs = TIMING.waitMinMs + Math.random() * (TIMING.waitMaxMs - TIMING.waitMinMs);
  const tones = scheduleTones({ count: trial.toneCount, t: trial.t, delayMs: waitMs });
  state.lastTones = tones;
  const clearGuide = trial.part === "part3practice" ? scheduleGuide(trial, tones) : () => {};

  // 4. 札のクリック（pointerdown）または打ち切りを待つ。
  //    札の外（札と札のすき間や盤面の外）のクリックは、お手つきにせず試行を続け、位置と時刻だけを残す
  //    （2026-11-02 に栗原さんが決めた。競技かるたで畳に触れてもお手つきにならないのと同じ扱い）。
  const offCardClicks = [];
  const result = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      screenEl.removeEventListener("pointerdown", onDown);
      clearTimeout(timer);
      resolve(value);
    };
    const onDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      const perf = performance.now();
      const card = board.hitTest(ev.clientX, ev.clientY);
      if (card === null) {
        offCardClicks.push({ x: ev.clientX, y: ev.clientY, perf, timeStamp: ev.timeStamp });
        return;
      }
      finish({
        click: { x: ev.clientX, y: ev.clientY, perf, timeStamp: ev.timeStamp, card },
        timedOut: false,
      });
    };
    // 開始ボタンの pointerdown がこの待ちに拾われないよう、次のフレームから聞く。
    requestAnimationFrame(() => screenEl.addEventListener("pointerdown", onDown));
    const timeoutAt = tones.lastTonePerf + TIMING.responseTimeoutMs;
    const timer = setTimeout(() => finish({ click: null, timedOut: true }), Math.max(0, timeoutAt - performance.now()));
  });

  const endPerf = performance.now();
  recorder.stop();
  clearGuide();
  stopAllTones();
  board.setGuide(null);

  // 5. 記録を組み立てて保存する。
  const record = buildTrialRecord({
    trial,
    session: state.session,
    start,
    tones,
    waitMs,
    click: result.click,
    offCardClicks,
    timedOut: result.timedOut,
    recorder,
    board,
    env: state.session.env,
    endPerf,
  });
  await saveTrialLocal(record);
  state.savedDocIds.add(trial.docId);
  state.session.completedTrialCount = state.savedDocIds.size;
  state.session.lastTrialDocId = trial.docId;
  await saveSessionLocal(state.session);
  window.__collectionB.lastRecord = record;

  // 6. 結果を即座に表示する。
  const feedbackMs = TEST ? TEST_MODE.feedbackMs : TIMING.feedbackMs;
  if (result.timedOut) {
    board.showFeedback("時間切れ", "timeout");
    board.markResult(null, trial.target);
  } else if (record.click.correct) {
    board.showFeedback("正解", "ok");
    board.markResult(record.click.card, trial.target);
  } else {
    board.showFeedback("お手つき", "miss");
    board.markResult(record.click.card, trial.target);
  }

  // 7. 結果を表示したあとで送信を始める。送信（JSON の組み立てと fetch）が試行中の時刻の計測を
  //    邪魔しないよう、試行の中では行わず、結果の表示から次の試行の開始までの間（約 2.5 秒）に始める。
  //    送信の完了は待たない。失敗しても IndexedDB に未送信のまま残り、起動時や「再送」で送り直す。
  //    セッションの行（進捗）は毎試行では送らず、開始とアンケートのあとだけ送る（GAS への要求を 1 試行 1 回に抑える）。
  setTimeout(() => { sendTrial(record).catch((e) => console.warn("送信に失敗しました", e)); }, 0);
  await sleep(feedbackMs);
  board.hideFeedback();
  board.clearMarks();
}

// ---------- アンケート ----------

async function runSurvey() {
  if (state.session.survey) return; // 既に答えている
  showScreen("screen-survey");
  const form = $("#survey-form");
  const detail = $("#experience-detail");
  form.querySelectorAll("input[name=experience]").forEach((r) => {
    r.addEventListener("change", () => { detail.hidden = form.experience.value !== "yes"; });
  });
  const data = await new Promise((resolve) => {
    const onSubmit = (ev) => {
      ev.preventDefault();
      form.removeEventListener("submit", onSubmit);
      const fd = new FormData(form);
      resolve({
        experience: fd.get("experience"),
        years: fd.get("years") ? Number(fd.get("years")) : null,
        grade: fd.get("grade") || null,
        ageBand: fd.get("ageBand"),
        handedness: fd.get("handedness"),
        playedMajikaruta: fd.get("playedMajikaruta"),
        answeredAt: new Date().toISOString(),
      });
    };
    form.addEventListener("submit", onSubmit);
  });
  state.session.survey = data;
  state.session.finishedAt = new Date().toISOString();
  state.session.status = "finished";
  state.session.sent = false;   // アンケートと終了の記録を送るので、送信済みの印を下ろす
  await saveSessionLocal(state.session);
  // 待たない。終了の画面は IndexedDB の状態を表示し、未送信なら「再送」で送り直せる。
  sendSession(state.session).catch(() => {});
}

// ---------- 終了の画面 ----------

async function showDone() {
  showScreen("screen-done");
  const render = async () => {
    const trials = await loadTrialsForSession(state.session.sessionId);
    const sent = trials.filter((t) => t.sent).length;
    const session = await loadSessionLocal(state.session.sessionId);
    const sessionSent = Boolean(session?.sent);
    const enabled = await uploadEnabled();
    const allSent = sent === trials.length && sessionSent;
    $("#done-status").innerHTML = [
      `<p>参加者番号 ${state.session.participantId}。試行 ${trials.length} 件をこの PC に保存しました。</p>`,
      enabled
        ? `<p>${uploadTargetLabel()} への送信: 試行 ${sent} / ${trials.length} 件、セッションの記録（アンケートを含む）${sessionSent ? "送信済み" : "未送信"}` +
          `${allSent ? "（すべて送信済み）" : "（未送信があります。回線がつながってから「再送」を押してください）"}。</p>`
        : "<p>送信先が設定されていないので、記録はこの PC にだけあります。運営者の画面から書き出してください。</p>",
    ].join("");
  };
  await render();
  const resendBtn = $("#btn-done-resend");
  const onResend = async () => { await resendUnsent(); await render(); };
  resendBtn.addEventListener("click", onResend);
  await waitForClick($("#btn-done-operator"));
  resendBtn.removeEventListener("click", onResend);
  state.session = null;
  state.plan = null;
  showScreen("screen-operator");
  $("#in-participant").value = "";
  $("#resume-notice").hidden = true;
  refreshOperatorStatus();
}

// ---------- 起動 ----------

function init() {
  $("#version-label").textContent = APP_VERSION;
  if (TEST) $("#test-mode-label").hidden = false;
  setupOperatorScreen();
  showScreen("screen-operator");
  refreshOperatorStatus();
  // 送信先が有効なら、起動時に未送信の記録を再送する。
  uploadEnabled().then((ok) => { if (ok) resendUnsent().then(refreshOperatorStatus); });
  // 試行中に右クリックのメニューが出ないようにする。
  $("#screen-trial").addEventListener("contextmenu", (ev) => ev.preventDefault());
}

init();
