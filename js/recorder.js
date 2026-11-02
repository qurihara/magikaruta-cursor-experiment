// ==========================
// recorder.js
// ==========================
// マウスカーソルの軌道とクリックを記録し、1試行の記録を組み立てる。
//
// 時刻はすべて performance.now の時間軸（ミリ秒）で記録する。PointerEvent.timeStamp は
// 同じ時間軸（timeOrigin からの経過）なので、そのまま使える。
// 軌道は pointermove の出来事ごとに記録し、getCoalescedEvents があれば、まとめられた
// 出来事を展開して記録する（これで毎秒 100 回以上になる）。pointerrawupdate が使える
// ブラウザでは、それも別の列（rawPath）に記録する。
// 軌道は Firestore に入れられる形（配列の中に配列を入れない）として、x、y、t、src の
// 4つの平らな配列で持つ。src は 0 が pointermove、1 が coalesced、2 が pointerrawupdate。
// ==========================

import { TIMING } from "./config.js";
import { isDeterminedAfterTones, candidatesAfterTones } from "./design.js";

export const PATH_SOURCE = { move: 0, coalesced: 1, raw: 2 };

export class PointerRecorder {
  constructor(targetEl = document) {
    this.targetEl = targetEl;
    this.recording = false;
    this.reset();
    this._onMove = (ev) => this._handleMove(ev);
    this._onRaw = (ev) => this._handleRaw(ev);
    this.hasRawUpdate = "onpointerrawupdate" in window;
    this.hasCoalesced = typeof PointerEvent !== "undefined" && "getCoalescedEvents" in PointerEvent.prototype;
  }

  reset() {
    this.path = { x: [], y: [], t: [], src: [] };
    this.rawPath = { x: [], y: [], t: [] };
    this.moveEventCount = 0;
  }

  start() {
    this.reset();
    this.recording = true;
    this.targetEl.addEventListener("pointermove", this._onMove, { passive: true });
    if (this.hasRawUpdate) this.targetEl.addEventListener("pointerrawupdate", this._onRaw, { passive: true });
  }

  stop() {
    this.recording = false;
    this.targetEl.removeEventListener("pointermove", this._onMove);
    if (this.hasRawUpdate) this.targetEl.removeEventListener("pointerrawupdate", this._onRaw);
  }

  // 位置を1点だけ記録する（開始のクリックの位置を軌道の最初の点にするために使う）。
  push(x, y, t, src = PATH_SOURCE.move) {
    this.path.x.push(x);
    this.path.y.push(y);
    this.path.t.push(t);
    this.path.src.push(src);
  }

  _handleMove(ev) {
    if (!this.recording) return;
    this.moveEventCount++;
    const coalesced = this.hasCoalesced ? ev.getCoalescedEvents() : [];
    if (coalesced.length > 0) {
      for (const c of coalesced) this.push(c.clientX, c.clientY, c.timeStamp, PATH_SOURCE.coalesced);
    } else {
      this.push(ev.clientX, ev.clientY, ev.timeStamp, PATH_SOURCE.move);
    }
  }

  _handleRaw(ev) {
    if (!this.recording) return;
    this.rawPath.x.push(ev.clientX);
    this.rawPath.y.push(ev.clientY);
    this.rawPath.t.push(ev.timeStamp);
  }
}

// 軌道の中で、時刻 t 以前の最後の点を返す。無ければ null。
export function positionAt(path, t) {
  let last = null;
  for (let i = 0; i < path.t.length; i++) {
    if (path.t[i] <= t) last = { x: path.x[i], y: path.y[i], t: path.t[i] };
    else break;
  }
  return last;
}

// 動き出しの時刻。開始位置から thresholdPx を超えて離れた最初の点の時刻（performance.now）。無ければ null。
export function movementOnset(path, start, thresholdPx = TIMING.movementOnsetThresholdPx) {
  for (let i = 0; i < path.t.length; i++) {
    const dx = path.x[i] - start.x, dy = path.y[i] - start.y;
    if (Math.hypot(dx, dy) > thresholdPx) return path.t[i];
  }
  return null;
}

// 軌道の長さ（CSSピクセル）。
export function pathLength(path) {
  let sum = 0;
  for (let i = 1; i < path.t.length; i++) {
    sum += Math.hypot(path.x[i] - path.x[i - 1], path.y[i] - path.y[i - 1]);
  }
  return sum;
}

// 1試行の記録を組み立てる。仕様書の第7節の項目と、アプリ内で計算できる導出の指標を入れる。
//
// trial     … design.js が作った試行の設計
// session   … { sessionId, participantId, group, eventName, testMode, appVersion }
// start     … { x, y, perf, timeStamp, isoTime } 開始ボタンのクリック
// tones     … audio.js の scheduleTones の返り値（toneTimesPerf ほか）と waitMs
// click     … { x, y, perf, timeStamp, card } または null（打ち切り）。card は札の値（札のクリックだけで試行が終わる）
// offCardClicks … 札の外のクリックの並び [{ x, y, perf, timeStamp }]。試行を終わらせず、記録だけに残す
// recorder  … PointerRecorder（path, rawPath）
// board     … Board（cardRects, boardRect, startButtonRect, hitTest）
// env       … 環境の記録
export function buildTrialRecord({ trial, session, start, tones, waitMs, click, offCardClicks = [], timedOut, recorder, board, env, endPerf }) {
  const values = trial.rows.flat();
  const toneTimes = tones ? tones.toneTimesPerf : [];
  const lastTonePerf = tones ? tones.lastTonePerf : null;
  const firstTonePerf = tones ? tones.firstTonePerf : null;

  let clickRecord = null;
  if (click) {
    const toneCountAtClick = toneTimes.filter((tt) => tt <= click.perf).length;
    clickRecord = {
      x: click.x,
      y: click.y,
      perf: click.perf,
      timeStamp: click.timeStamp,
      card: click.card,                                  // クリックした札の値。札の外なら null
      correct: click.card === trial.target,
      toneCountAtClick,                                  // クリックの時点までに鳴った音の数
      beforeLastTone: lastTonePerf === null ? true : click.perf < lastTonePerf,
      determinedAtClick: isDeterminedAfterTones(values, trial.target, toneCountAtClick),
      candidatesAtClick: candidatesAfterTones(values, toneCountAtClick, trial.target),
      msFromLastTone: lastTonePerf === null ? null : click.perf - lastTonePerf,
      msFromFirstTone: firstTonePerf === null ? null : click.perf - firstTonePerf,
      msFromStart: click.perf - start.perf,
    };
  }

  const path = recorder.path;
  const onsetPerf = movementOnset(path, start);
  const posAtLastTone = lastTonePerf === null ? null : positionAt(path, lastTonePerf);
  const cardAtLastTone = posAtLastTone ? board.hitTest(posAtLastTone.x, posAtLastTone.y) : null;

  // 音ごとの位置（各音の開始時点でカーソルがどの札の上にいたか）。最速囲い手の遵守の確認に使う。
  const cardAtEachTone = toneTimes.map((tt) => {
    const p = positionAt(path, tt);
    return p ? board.hitTest(p.x, p.y) : null;
  });

  return {
    // 識別
    docId: trial.docId,
    seq: trial.seq,
    sessionId: session.sessionId,
    participantId: session.participantId,
    group: session.group,
    eventName: session.eventName,
    appVersion: session.appVersion,
    testMode: !!session.testMode,

    // 試行の設計
    part: trial.part,
    blockIndex: trial.blockIndex,
    blockPos: trial.blockPos,
    trialIndex: trial.trialIndex,
    isPractice: trial.isPractice,
    t: trial.t,
    layoutId: trial.layoutId,
    layoutName: trial.layoutName,
    layoutRows: trial.rows.map((r) => r.join(" ")),   // Firestore は配列の入れ子を受け付けないので文字列にする
    nCards: trial.nCards,
    maxValue: trial.maxValue,
    target: trial.target,
    isMaxTarget: trial.isMaxTarget,
    toneCount: trial.toneCount,

    // 時刻の基準（Date はこの1回だけ）
    startedAt: start.isoTime,
    startClick: { x: start.x, y: start.y, perf: start.perf, timeStamp: start.timeStamp },
    waitMs,

    // 電子音
    toneTimesPerf: toneTimes,
    firstTonePerf,
    lastTonePerf,
    toneDurationMs: tones ? tones.toneDurationMs : null,
    audioBase: tones ? {
      basePerfNow: tones.basePerfNow,
      baseCtxTime: tones.baseCtxTime,
      baseLatencySec: tones.baseLatencySec,
      outputLatencySec: tones.outputLatencySec,
      sampleRate: tones.sampleRate,
    } : null,

    // クリック
    click: clickRecord,
    offCardClicks: offCardClicks.map((o) => ({
      x: o.x,
      y: o.y,
      perf: o.perf,
      timeStamp: o.timeStamp,
      msFromLastTone: lastTonePerf === null ? null : o.perf - lastTonePerf,
    })),
    offCardClickCount: offCardClicks.length,
    timedOut: !!timedOut,
    endPerf,

    // 盤面の幾何
    cardRects: board.cardRects,
    boardRect: board.boardRect,
    startButtonRect: board.startButtonRect,

    // 軌道
    path,
    rawPath: recorder.rawPath,
    pathPointCount: path.t.length,
    rawPathPointCount: recorder.rawPath.t.length,
    moveEventCount: recorder.moveEventCount,

    // 導出の指標
    derived: {
      movementOnsetPerf: onsetPerf,
      movementOnsetMsFromFirstTone: onsetPerf !== null && firstTonePerf !== null ? onsetPerf - firstTonePerf : null,
      cardAtLastTone,
      onCorrectCardAtLastTone: cardAtLastTone === trial.target,
      cardAtEachTone,
      acquisitionTimeMs: clickRecord ? clickRecord.msFromLastTone : null,
      pathLengthPx: pathLength(path),
      straightLinePx: clickRecord ? Math.hypot(clickRecord.x - start.x, clickRecord.y - start.y) : null,
    },

    env,
    sent: false,
  };
}
