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
//
// オンラインの流れ（v0.5.0）。URL に ?wid=（Yahoo!クラウドソーシングの作業者ID）があると、運営者の画面と較正を飛ばし、
// 参加の確認と端末の確認の画面から始める。端末の制限、練習の合格条件、完了コードの条件は、オンラインの流れでだけ働く。
// ?wid= が無いときは、これまでどおりの対面の流れ（12/6 と 12/13 の会場の PC）で動く。
// タブの背面とフォーカスの喪失の記録、ポインタの種類の記録、最後の音より前のクリックの印は、両方の流れで記録する。
//
// v0.5.1。承認済みの倫理審査の申請「候補縮小課題」（2026-10-27 承認）の説明文書と手続きに、オンラインの流れを合わせた。
// 同意の画面に参加者説明文書と同意のチェックボックスを置き、チェックを入れて「同意して開始」を押すまで先へ進めない。
// 同意の前には何も送信しない（端末の条件で止めた人と二重の参加の人の記録は作らず、Firebase の初期化と再送も同意のあとに行う）。
// 最後の質問と同意の画面の申告は任意にし、「答えない」を選べるようにした。部と部の間に休憩の画面を置いた。
// 対面の流れの動きは変えていない。
// ==========================

import {
  APP_VERSION, GROUPS, MACHINES, INSTRUCTIONS, TIMING, TEST_MODE, ONLINE, AUDIO, ONLINE_AGE_BANDS,
} from "./config.js";
import {
  parseWid, participantIdFromWid, envProblems, practiceDecision, completionDecision, duplicateDecision,
  restAfter, surveyValue,
} from "./online.js";
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
// オンラインの流れの作業者ID。null なら対面の流れ。
const WID = parseWid(params);
const ONLINE_MODE = WID !== null;

// タブの背面とフォーカスの喪失の回数（ページを開いてからの累計）。試行の前後の差で、試行中に起きたかを判定する。
const focusLog = { hiddenCount: 0, blurCount: 0 };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") focusLog.hiddenCount++; });
window.addEventListener("blur", () => { focusLog.blurCount++; });

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
window.__collectionB = { state, TEST, APP_VERSION, WID, ONLINE_MODE, focusLog };

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
    maxTouchPoints: navigator.maxTouchPoints || 0,
    uadMobile: navigator.userAgentData ? Boolean(navigator.userAgentData.mobile) : null,
    // ポインタの種類の手がかり（v0.5.0）。主なポインタが細かい（マウスかタッチパッド）か、ホバーできるか、粗いポインタ（指）が有るか。
    pointerFine: window.matchMedia ? window.matchMedia("(pointer: fine)").matches : null,
    hoverHover: window.matchMedia ? window.matchMedia("(hover: hover)").matches : null,
    anyPointerCoarse: window.matchMedia ? window.matchMedia("(any-pointer: coarse)").matches : null,
    timeZone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || null,
    audioGain: getGain(),
    calibration: currentCalibration(),
    appVersion: APP_VERSION,
    testMode: TEST,
    mode: ONLINE_MODE ? "online" : "onsite",
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
  const machineSel = $("#in-machine");
  machineSel.innerHTML = MACHINES.map((m) => `<option value="${m.value}">${m.label}</option>`).join("");
  const settings = loadSettings();
  // 機械の名前は PC ごとに一度選べば、次からはその PC に保存した値が入る（v0.4.0）。
  if (settings.machine) machineSel.value = settings.machine;
  if (settings.eventName) $("#in-event").value = settings.eventName;
  if (settings.gain !== undefined) $("#in-gain").value = String(settings.gain);
  if (settings.lastParticipantId) $("#in-participant").placeholder = `前回は ${settings.lastParticipantId}`;
  // 参加用の URL（?pid=901&event=pilot-2026-11-02&group=general）で、参加者番号、イベント名、群を埋める。
  // 研究室のメンバーが自分のブラウザで参加するオンラインのパイロットのため（v0.3.0 で足した）。
  // 番号を配る側が決めておくと、番号の重なりで記録が上書きされるのを防げる。
  if (params.get("pid")) $("#in-participant").value = params.get("pid");
  if (params.get("event")) $("#in-event").value = params.get("event");
  if (params.get("group") && GROUPS.some((g) => g.value === params.get("group"))) groupSel.value = params.get("group");
  if (params.get("machine") && MACHINES.some((m) => m.value === params.get("machine"))) machineSel.value = params.get("machine");
  if (params.get("pid")) checkResume();

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
      machine: machineSel.value,
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

async function startSession({ participantId, group, machine = "", eventName, online = null, sessionId: givenSessionId = null }) {
  if (!Number.isInteger(participantId) || participantId < 1) {
    alert("参加者番号は 1 以上の整数にしてください。");
    return;
  }
  if (!online) saveSettings({ eventName, machine, gain: Number($("#in-gain").value), lastParticipantId: participantId });

  const sessionId = givenSessionId || makeSessionId(eventName, participantId);
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
    machine,
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
    // オンラインの流れ（v0.5.0）。mode は "online" か "onsite"。online には作業者ID、申告（ポインタ、音の機器）、ルールの確認の回数が入る。
    mode: online ? "online" : "onsite",
    wid: online ? online.wid : null,
    online: online ? { ...(existing?.online || {}), ...online } : null,
    focus: existing?.focus ?? null,
    pointerTypes: existing?.pointerTypes ?? {},
    sent: false,   // 開始の記録を送るので、送信済みの印を下ろす
  };
  // 練習で打ち切った参加者が読み込み直したときは、先へ進めない。
  if (online && existing?.status === "failed_practice") {
    state.session.status = "failed_practice";
    await saveSessionLocal(state.session);
    showPracticeFailed();
    return;
  }
  await saveSessionLocal(state.session);
  // 開始の記録を送る。待たない（回線が無くても参加者を待たせないため）。失敗しても再送のときに一緒に送る。
  sendSession(state.session).catch(() => {});

  state.board = state.board || new Board($("#stage"));
  state.recorder = state.recorder || new PointerRecorder(document);

  showScreen("screen-intro");
  $("#btn-intro-next").disabled = true;
  await runIntro();
  const passed = await runAllParts();
  if (!passed) return;   // 練習で打ち切った（オンラインの流れだけ）
  await runSurvey();
  await finalizeSession();
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

// 返り値は、最後の部まで進んだら true、練習で打ち切ったら false。
async function runAllParts() {
  const parts = splitPlanByPart(state.plan);
  let restPending = null;   // 直前に終えた部のあとに出す休憩（v0.5.1、オンラインの流れだけ）
  for (const key of PART_ORDER) {
    const remaining = parts.get(key).filter((t) => !state.savedDocIds.has(t.docId));
    if (remaining.length > 0) {
      if (restPending) { await runRest(restPending); restPending = null; }
      await showPartInstruction(key, remaining);
      await runPart(key, remaining);
      if (ONLINE_MODE && restAfter(key)) restPending = key;
    }
    // オンラインの流れでは、最初の練習のあとに合格条件を確かめる（v0.5.0）。
    if (key === "practice" && ONLINE_MODE) {
      const ok = await runPracticeGate(parts.get("practice"));
      if (!ok) return false;
    }
  }
  return true;
}

// 部と部の間の休憩（v0.5.1、オンラインの流れだけ）。承認済みの参加者説明文書の「途中に休憩があります」と、
// 申請書と研究計画書の「途中に休憩を設ける」「本試行（途中に休憩）」に合わせた。休憩の長さは決めず、
// 参加者が「次へ」を押すと再開する。休憩の開始と終了の時刻と長さを、セッションの online.rests に残す（同意のあとの記録）。
// 第1部、第2部、第3部（第3部の練習のあとの本番まで）のそれぞれのあとに出す。読み込み直して途中から再開した部のあとには出さない。
async function runRest(partKey) {
  const info = restAfter(partKey);
  if (!info) return;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  await showMessage("休憩", [
    `${PART_TITLES[partKey]}が終わりました（全 ${info.total} 部のうち ${info.done} 部）。`,
    "ここで休憩できます。休憩の長さは自由です。目や手を休めてから、続きを始めてください。このページは閉じずに、そのままにしておいてください。",
    `ただし、Yahoo!クラウドソーシングの制限時間（${ONLINE.timeLimitMinutes} 分）を過ぎると完了コードを提出できなくなるので、休憩が長くなりすぎないようにご注意ください。`,
    "再開するときは「次へ」を押してください。",
  ]);
  const rest = { afterPart: partKey, startedAt, endedAt: new Date().toISOString(), ms: Math.round(performance.now() - t0) };
  state.session.online = { ...(state.session.online || {}), rests: [...((state.session.online && state.session.online.rests) || []), rest] };
  await saveSessionLocal(state.session);
}

// 練習の合格条件（v0.5.0、オンラインの流れだけ）。予定の練習（5回）で正解が ONLINE.practicePassCorrect 回に
// 届かなければ、届くまで練習を1回ずつ足す。練習の合計が ONLINE.practiceMaxTrials 回に達しても届かなければ
// 打ち切り、status を failed_practice にして完了コードを出さない。足した練習は、予定の練習を順に繰り返した内容で、
// 文書 ID は practice_0_6、practice_0_7、… になる（読み込み直しても続きから数える）。
async function runPracticeGate(planned) {
  const loadPractice = async () => (await loadTrialsForSession(state.session.sessionId))
    .filter((r) => r.part === "practice")
    .sort((a, b) => a.trialIndex - b.trialIndex);
  let records = await loadPractice();
  let decision = practiceDecision(records, { planned: planned.length });
  let announced = false;
  while (decision === "more") {
    if (!announced) {
      await showMessage("練習をもう少し続けます", [
        `正解が ${ONLINE.practicePassCorrect} 回になると、本番に進みます。`,
        "電子音の回数を数え、最後の高い音が鳴ったら、その数の札をクリックしてください。",
      ]);
      announced = true;
    }
    const k = records.length + 1;
    const base = planned[(k - 1) % planned.length];
    const trial = { ...base, rows: base.rows.map((r) => r.slice()), docId: `practice_0_${k}`, trialIndex: k, extraPractice: true };
    await runTrial(trial, { key: "practice", totalBlocks: 1, blockTotal: 1 });
    records = await loadPractice();
    decision = practiceDecision(records, { planned: planned.length });
  }
  state.session.practice = {
    trials: records.length,
    correct: records.filter((r) => r.click && r.click.correct).length,
    passed: decision === "pass",
  };
  if (decision === "fail") {
    state.session.status = "failed_practice";
    state.session.finishedAt = new Date().toISOString();
    state.session.focus = { ...focusLog };
    state.session.sent = false;
    await saveSessionLocal(state.session);
    sendSession(state.session).catch(() => {});
    rememberDone("failed_practice");
    showPracticeFailed();
    return false;
  }
  return true;
}

function showPracticeFailed() {
  showStop("ここで終了です", [
    `練習で正解が ${ONLINE.practicePassCorrect} 回に届かなかったため、ここで課題を終了します。完了コードは表示されません。`,
    "ご協力ありがとうございました。このページを閉じてください。",
  ]);
}

// オンラインの流れで、先へ進めないことを知らせる画面。
function showStop(title, paragraphs) {
  $("#online-stop-title").textContent = title;
  $("#online-stop-body").innerHTML = paragraphs.map((p) => `<p>${p}</p>`).join("");
  showScreen("screen-online-stop");
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
  const kind = trial.isPractice ? (trial.extraPractice ? `練習 ${trial.trialIndex}` : "練習") : `試行 ${trial.trialIndex}`;
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

  // 0. タブが背面にある間は、開始のボタンを出さずに待つ（v0.5.0）。
  await waitUntilVisible();
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
  // 試行の開始の時点の、タブの背面とフォーカスの喪失の累計（v0.5.0）。
  const focusAtStart = { ...focusLog, hasFocus: document.hasFocus(), visible: document.visibilityState === "visible" };

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
        pointerType: ev.pointerType || null,
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
  // v0.5.0 で足した項目。
  //   pointerTypeStart と pointerTypeClick … 開始のボタンと札のクリックの PointerEvent.pointerType（mouse、pen、touch）。
  //   earlyClick … 最後の電子音より前に札をクリックした。まじかるたでは囲い手の戦略として正当な行動になりうるので、
  //                 お手つきにも無効にもせず、印を付けるだけにする（丸山さんの Hick の実験の「早すぎる押下」とは扱いが違う）。
  //   focus … 試行の間（開始のボタンから結果まで）に、タブが背面になった回数（hiddenDuringTrial）とフォーカスが外れた回数（blurDuringTrial）。
  record.extraPractice = Boolean(trial.extraPractice);
  record.pointerTypeStart = startEv.pointerType || null;
  record.pointerTypeClick = result.pointerType || null;
  record.earlyClick = Boolean(result.click && record.click && record.click.beforeLastTone);
  record.focus = {
    hasFocusAtStart: focusAtStart.hasFocus,
    visibleAtStart: focusAtStart.visible,
    hiddenDuringTrial: focusLog.hiddenCount - focusAtStart.hiddenCount,
    blurDuringTrial: focusLog.blurCount - focusAtStart.blurCount,
  };
  record.mode = ONLINE_MODE ? "online" : "onsite";
  record.wid = WID;
  for (const pt of [record.pointerTypeStart, record.pointerTypeClick]) {
    if (pt) state.session.pointerTypes[pt] = (state.session.pointerTypes[pt] || 0) + 1;
  }
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

// オンラインの流れの最後の質問を、承認済みの説明文書の「回答はすべて任意」に合わせる（v0.5.1）。
// 必須の指定を外し、選択式の各問に「答えない」を足し、年齢層の選択肢を研究計画書の別紙の Q1 の区切り（18〜19歳から70代以上）にする。
// 対面の流れでは呼ばないので、対面の画面はこれまでどおり。
function prepareOnlineSurvey(form) {
  if (form.dataset.onlinePrepared) return;
  form.dataset.onlinePrepared = "1";
  $("#survey-optional-note").hidden = false;
  form.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required"));
  for (const name of ["experience", "handedness", "playedMajikaruta"]) {
    const radios = form.querySelectorAll(`input[name=${name}]`);
    const last = radios[radios.length - 1].closest("label");
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="${name}" value="noanswer"> 答えない`;
    last.after(label);
  }
  form.ageBand.innerHTML = `<option value="">選んでください</option>` +
    ONLINE_AGE_BANDS.map((b) => `<option value="${b.value}">${b.label}</option>`).join("");
}

async function runSurvey() {
  if (state.session.survey) return; // 既に答えている
  showScreen("screen-survey");
  const form = $("#survey-form");
  if (ONLINE_MODE) prepareOnlineSurvey(form);
  const detail = $("#experience-detail");
  form.querySelectorAll("input[name=experience]").forEach((r) => {
    r.addEventListener("change", () => { detail.hidden = form.experience.value !== "yes"; });
  });
  const data = await new Promise((resolve) => {
    const onSubmit = (ev) => {
      ev.preventDefault();
      form.removeEventListener("submit", onSubmit);
      const fd = new FormData(form);
      // 未回答は null、「答えない」は noanswer（v0.5.1。対面の流れでは必須なので、これまでと同じ値になる）。
      resolve({
        experience: surveyValue(fd.get("experience")),
        years: fd.get("years") ? Number(fd.get("years")) : null,
        grade: fd.get("grade") || null,
        ageBand: surveyValue(fd.get("ageBand")),
        handedness: surveyValue(fd.get("handedness")),
        playedMajikaruta: surveyValue(fd.get("playedMajikaruta")),
        answeredAt: new Date().toISOString(),
      });
    };
    form.addEventListener("submit", onSubmit);
  });
  state.session.survey = data;
  state.session.finishedAt = new Date().toISOString();
  await saveSessionLocal(state.session);
}

// 終了の記録を決めて送る（v0.5.0）。対面の流れでは status を finished にする。
// オンラインの流れでは、本試行のうち時間切れでない回の割合が ONLINE.minAnsweredRatio 以上なら finished
// （完了コードを出す）、届かなければ incomplete（完了コードを出さない）にする。
async function finalizeSession() {
  const s = state.session;
  if (ONLINE_MODE) {
    const records = await loadTrialsForSession(s.sessionId);
    const d = completionDecision(records);
    s.status = d.status;
    s.completion = { answered: d.answered, total: d.total, ratio: d.ratio, minRatio: ONLINE.minAnsweredRatio, codeShown: d.status === "finished" };
    rememberDone(d.status);
  } else {
    s.status = "finished";
  }
  if (!s.finishedAt) s.finishedAt = new Date().toISOString();
  s.focus = { ...focusLog };
  s.sent = false;   // アンケートと終了の記録を送るので、送信済みの印を下ろす
  await saveSessionLocal(s);
  // 待たない。終了の画面は IndexedDB の状態を表示し、未送信なら「再送」で送り直せる。
  sendSession(s).catch(() => {});
}

// 同じブラウザで完了したことを残す（オンラインの流れだけ。テストモードでは残さない）。
function rememberDone(status) {
  if (!ONLINE_MODE || TEST) return;
  try {
    localStorage.setItem(ONLINE.doneKey, JSON.stringify({ wid: WID, status, sessionId: state.session?.sessionId, at: new Date().toISOString() }));
  } catch (e) { /* localStorage が使えなくても続ける */ }
}

function loadDone() {
  try { return JSON.parse(localStorage.getItem(ONLINE.doneKey) || "null"); } catch (e) { return null; }
}

// タブが前面になるまで待つ。背面の間は、前面に戻すよう求める文を重ねて出す。
async function waitUntilVisible() {
  const overlay = $("#hidden-overlay");
  while (document.visibilityState !== "visible") {
    overlay.hidden = false;
    await new Promise((r) => document.addEventListener("visibilitychange", r, { once: true }));
  }
  overlay.hidden = true;
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
    const codeBox = $("#done-code");
    if (ONLINE_MODE) {
      const st = session?.status;
      codeBox.hidden = false;
      // v0.5.1: Yahoo の設問は完了コードを 1 桁ずつプルダウンで選ぶ形なので、「入力」ではなく「選んで」と書く。
      // 承認済みの説明文書の「9．記録の削除の請求」と「10．連絡先」に合わせ、削除の請求の宛先と、添えてもらう作業者IDも出す。
      const deletion = `<p class="muted">参加後に記録の削除を希望する場合は、参加した日時と、作業者ID（${WID}）を添えて、${ONLINE.contactEmail} までメールでご連絡ください。</p>`;
      codeBox.innerHTML = (st === "finished"
        ? `<p>完了コード</p><p class="code">${ONLINE.completionCode}</p><p>Yahoo!クラウドソーシングの設問の画面に戻り、この 3 桁の数字を 1 桁ずつ選んでください。下の送信の表示が「すべて送信済み」になってから、このページを閉じてください。</p>`
        : `<p>時間切れの回が多かったため、完了コードは表示されません。</p>`) + deletion;
    } else {
      codeBox.hidden = true;
    }
    $("#done-status").innerHTML = [
      ONLINE_MODE ? `<p>記録 ${trials.length} 件をこのブラウザに保存しました。</p>` : `<p>参加者番号 ${state.session.participantId}。試行 ${trials.length} 件をこの PC に保存しました。</p>`,
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
  if (ONLINE_MODE) {
    // オンラインの流れでは運営者の画面へ戻らない。送信の状況を数秒ごとに表示し直し、未送信が残れば再送する。
    $("#btn-done-operator").hidden = true;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const unsent = (await loadTrialsForSession(state.session.sessionId)).some((t) => !t.sent);
      if (unsent && tries % 3 === 0) await resendUnsent();
      await render();
      if (tries > 60) clearInterval(timer);
    }, 3000);
    return;
  }
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
  // 試行中に右クリックのメニューが出ないようにする。
  $("#screen-trial").addEventListener("contextmenu", (ev) => ev.preventDefault());
  if (ONLINE_MODE) {
    // v0.5.1: 同意の前には何も送信しないので、ここでは Firebase を初期化せず（匿名のログインもしない）、再送もしない。
    // 再送は同意のあと（startOnline）と、完了済みの人の終了の画面（showDone）で行う。
    startOnline();
    return;
  }
  setupOperatorScreen();
  showScreen("screen-operator");
  refreshOperatorStatus();
  // 送信先が有効なら、起動時に未送信の記録を再送する。
  uploadEnabled().then((ok) => { if (ok) resendUnsent().then(refreshOperatorStatus); });
}

// ---------- オンラインの流れ（v0.5.0） ----------

function onlineEventName() {
  return params.get("event") || ONLINE.defaultEvent;
}

function onlineSessionId(suffix = "") {
  return `${slug(onlineEventName())}_w${WID}${TEST ? "_test" : ""}${suffix}`;
}

// v0.5.0 では、端末の条件で止めた人（blocked_env）と二重の参加の人（duplicate_browser）の記録を、同意の前に別の文書へ送っていた。
// 承認済みの申請書と研究計画書の「判定の結果を含め、同意の前には記録を送信しない」に合わせ、v0.5.1 でこの記録をやめた。
// 端末の条件で一度止まってからウィンドウを広げて同意した人は、同意のあとのセッションの online.envProblemsBeforeConsent に残す。

async function startOnline() {
  // 同じブラウザで完了した記録があれば、二重の参加として止めるか、終了の画面を出し直す。
  const done = TEST ? null : loadDone();
  const dup = duplicateDecision(done, WID);
  if (dup === "same") {
    const session = await loadSessionLocal(done.sessionId || onlineSessionId());
    if (session) {
      state.session = session;
      await showDone();
      return;
    }
    showStop("この課題は終了しています", [
      done.status === "finished"
        ? `完了コードは <strong>${ONLINE.completionCode}</strong> です。Yahoo!クラウドソーシングの設問の画面で、この 3 桁の数字を 1 桁ずつ選んでください。`
        : "完了コードは表示されません。ご協力ありがとうございました。",
    ]);
    return;
  }
  if (dup === "other") {
    // 同意の前なので記録しない（v0.5.1）。
    showStop("すでに参加いただいています", [
      "このブラウザでは、すでにこの課題に参加いただいています。同じ方の2回目の参加はお受けできません。",
      "ご協力ありがとうございました。このページを閉じてください。",
    ]);
    return;
  }

  showScreen("screen-online-start");
  // 説明文書の中の作業者IDと承認番号を埋める（v0.5.1）。
  document.querySelectorAll(".js-wid").forEach((el) => { el.textContent = WID; });
  $("#ethics-number").textContent = ONLINE.ethicsApprovalNumber ? `（承認番号：${ONLINE.ethicsApprovalNumber}）` : "";
  const box = $("#env-check");
  const form = $("#online-env-form");
  const startBtn = $("#btn-online-start");
  const recheckBtn = $("#btn-env-recheck");
  const consentBox = $("#consent-check");
  // 端末の条件で止まったことがあるか。同意の前には送らず、同意したときだけセッションに残す（v0.5.1）。
  const envProblemsBeforeConsent = { narrow: false, short: false };
  let envOk = false;
  const updateStartButton = () => { startBtn.disabled = !(envOk && consentBox.checked); };
  const check = () => {
    const env = collectEnv();
    const r = envProblems(env);
    envOk = r.problems.length === 0;
    if (envOk) {
      box.className = "env-check ok";
      box.innerHTML = "<p>パソコンからの参加を確認しました。</p>";
    } else {
      box.className = "env-check ng";
      box.innerHTML = r.problems.map((p) => `<p>${p}</p>`).join("");
      if (r.narrow) envProblemsBeforeConsent.narrow = true;
      if (r.short) envProblemsBeforeConsent.short = true;
    }
    form.hidden = r.mobile;          // スマートフォンとタブレットは、開き直す以外に解決できない
    recheckBtn.hidden = envOk || r.mobile;
    updateStartButton();
    return envOk;
  };
  consentBox.addEventListener("change", updateStartButton);
  check();
  window.addEventListener("resize", check);
  recheckBtn.addEventListener("click", check);

  let quizAttempts = 0;
  const answers = await new Promise((resolve) => {
    const onSubmit = (ev) => {
      ev.preventDefault();
      if (!check()) return;
      if (!consentBox.checked) return;   // 同意のチェックボックスにチェックが無ければ先へ進めない（v0.5.1）
      const fd = new FormData(form);
      quizAttempts++;
      const fb = $("#quiz-feedback");
      if (fd.get("quiz") !== "7") {
        fb.hidden = false;
        fb.textContent = "違います。音の回数が、取る札の値です。もう一度選んでください。";
        return;
      }
      form.removeEventListener("submit", onSubmit);
      // 申告は任意（v0.5.1）。未回答は null、「答えない」は noanswer。
      resolve({ pointerDevice: surveyValue(fd.get("pointerDevice")), audioDevice: surveyValue(fd.get("audioDevice")) });
    };
    form.addEventListener("submit", onSubmit);
  });
  window.removeEventListener("resize", check);
  const consentedAt = new Date().toISOString();

  // 同意のあとで初めて送信先を初期化し、このブラウザに残った未送信の記録を再送する（v0.5.1）。
  uploadEnabled().then((ok) => { if (ok) resendUnsent(); });

  await unlockAudio();
  setGain(AUDIO.gain);
  await startSession({
    participantId: participantIdFromWid(WID),
    group: "online",
    machine: "",
    eventName: onlineEventName(),
    sessionId: onlineSessionId(),
    online: {
      wid: WID,
      pointerDevice: answers.pointerDevice,
      audioDevice: answers.audioDevice,
      quizAttempts,
      consentedAt,
      // 同意の取り方（v0.5.1）。チェックボックスにチェックを入れて「同意して開始」を押した。
      consent: { method: "checkbox_and_button", checked: true, at: consentedAt },
      envProblemsBeforeConsent,
    },
  });
}

init();
