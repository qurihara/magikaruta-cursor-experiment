// ==========================
// audio.js
// ==========================
// Web Audio で電子音を作る。すべての音を試行の開始時に AudioContext の時刻で予約し、
// 各音の予約時刻を performance.now の時間軸に換算して返す。
// 換算は Kikiwake の script_v6.js と同じ形
//   perfTime = performance.now() + (ctxTime - ctx.currentTime) * 1000
// で行う。performance.now() と ctx.currentTime を同じ瞬間に読むことが要点なので、
// 予約の直前に1回だけ読んで、すべての音に同じ基準を使う。
// ==========================

import { AUDIO } from "./config.js";

let ctx = null;
let masterGain = null;
let scheduled = []; // いま鳴っている（または予約中の）オシレータ。中断のために持つ

// AudioContext を用意する。ブラウザの制約で、最初の呼び出しは利用者の操作の中で行う必要がある。
export function getAudioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctor({ latencyHint: "interactive" });
    masterGain = ctx.createGain();
    masterGain.gain.value = AUDIO.gain;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

// 利用者の操作の中で呼び、停止している AudioContext を再開する。
export async function unlockAudio() {
  const c = getAudioContext();
  if (c.state === "suspended") await c.resume();
  return c.state;
}

// 音量（0 から 1）を変える。
export function setGain(value) {
  getAudioContext();
  masterGain.gain.value = Math.max(0, Math.min(1, Number(value)));
}

export function getGain() {
  return masterGain ? masterGain.gain.value : AUDIO.gain;
}

// 各音の長さ（秒）。t の半分か AUDIO.maxToneDurationSec の短いほう。
export function toneDurationSec(t) {
  return Math.min(t / 2, AUDIO.maxToneDurationSec);
}

// 1つの音を ctx の時刻 when に予約する。
function scheduleTone(c, when, durationSec, hz) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  // 立ち上がりと減衰に短い傾斜を付けて、クリック音を避ける。
  const attack = Math.min(AUDIO.attackSec, durationSec / 4);
  const release = Math.min(AUDIO.releaseSec, durationSec / 4);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(1, when + attack);
  env.gain.setValueAtTime(1, when + durationSec - release);
  env.gain.linearRampToValueAtTime(0, when + durationSec);
  osc.connect(env);
  env.connect(masterGain);
  osc.start(when);
  osc.stop(when + durationSec + 0.01);
  scheduled.push(osc);
  osc.onended = () => { scheduled = scheduled.filter((o) => o !== osc); };
}

// 読まれる札の値 count 回の電子音を、いまから delayMs 後に始まるように予約する。
// 最後の音だけ1オクターブ上。返り値は各音の開始時刻（performance.now の時間軸、ミリ秒）の配列と、
// 予約に使った基準の値。
export function scheduleTones({ count, t, delayMs }) {
  const c = getAudioContext();
  const durationSec = toneDurationSec(t);
  // 同じ瞬間の performance.now と ctx.currentTime を読む。
  const perfNow = performance.now();
  const ctxNow = c.currentTime;
  // 予約が過去にならないよう、ごく短い余白を足す。
  const firstCtx = ctxNow + Math.max(0.02, delayMs / 1000);
  const toneTimesPerf = [];
  const toneTimesCtx = [];
  for (let i = 0; i < count; i++) {
    const when = firstCtx + i * t;
    const hz = i === count - 1 ? AUDIO.lastToneHz : AUDIO.toneHz;
    scheduleTone(c, when, durationSec, hz);
    toneTimesCtx.push(when);
    toneTimesPerf.push(perfNow + (when - ctxNow) * 1000);
  }
  return {
    toneTimesPerf,
    toneTimesCtx,
    lastTonePerf: toneTimesPerf[toneTimesPerf.length - 1],
    firstTonePerf: toneTimesPerf[0],
    toneDurationMs: durationSec * 1000,
    basePerfNow: perfNow,
    baseCtxTime: ctxNow,
    baseLatencySec: c.baseLatency ?? null,
    outputLatencySec: c.outputLatency ?? null,
    sampleRate: c.sampleRate,
  };
}

// 予約済みの音をすべて止める（試行が途中で終わったときに使う）。
export function stopAllTones() {
  for (const osc of scheduled) {
    try { osc.stop(); } catch (_) { /* 既に止まっている */ }
  }
  scheduled = [];
}

// 音量の確認のために、通常の音と最後の音を1回ずつ鳴らす。
export function playSoundCheck() {
  const c = getAudioContext();
  const now = c.currentTime + 0.05;
  scheduleTone(c, now, 0.08, AUDIO.toneHz);
  scheduleTone(c, now + 0.4, 0.08, AUDIO.toneHz);
  scheduleTone(c, now + 0.8, 0.08, AUDIO.lastToneHz);
}
