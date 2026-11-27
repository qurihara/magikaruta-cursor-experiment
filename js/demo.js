// ==========================
// demo.js
// ==========================
// 第3部の教示の画面に出す、動きの見本（v0.6.0、栗原さんの通しの確認 Y11 のあとの決定 I5）。
// 小さな盤面に札 5 6 7 8 を左から並べ、7 が読まれる場合を、音の間隔 0.8 秒で自動で動かす。
// 電子音に合わせて、カーソルの絵が最初の音の前から 5 の上で待ち、5 回目の低い音のあと 6 へ、
// 6 回目の低い音のあと 7 へ移り、7 回目の高い音でクリックの表示をする。
// カーソルの絵が動く時刻は、第3部の練習のハイライト（I6）と同じく、各音の鳴り終わり（音の鳴り始めから音の間隔の半分）にする。
// 時刻の計算は design.js の guideSchedule を使い、練習のハイライトと同じ規則で動くようにした。
// 映像のファイルは使わず、HTML と CSS と JavaScript だけで描く。
// ==========================

import { PART3_DEMO } from "./config.js";
import { guideSchedule } from "./design.js";
import { scheduleTones, stopAllTones } from "./audio.js";

const CARD_W = 66;
const CARD_H = 91;
const GAP = 22;

// 見本を container の中に作り、画面に見えたら自動で 1 回再生する。返り値は、見本を止めて片付ける関数。
export function mountPart3Demo(container, { rows = PART3_DEMO.rows, target = PART3_DEMO.target, t = PART3_DEMO.t } = {}) {
  const values = rows.flat();
  const wrap = document.createElement("div");
  wrap.className = "demo";
  wrap.innerHTML = `
    <div class="demo-title">動き方の見本（札 ${values.join("、")} の場で、${target} が読まれる場合。音の間隔 ${t} 秒）</div>
    <div class="demo-board"></div>
    <div class="demo-count"></div>
    <div class="demo-status" aria-live="polite"></div>
    <div class="row"><button type="button" class="demo-replay">もう一度見る</button></div>
  `;
  container.appendChild(wrap);

  const boardEl = wrap.querySelector(".demo-board");
  boardEl.style.width = `${values.length * CARD_W + (values.length - 1) * GAP}px`;
  boardEl.style.height = `${CARD_H + 40}px`;
  const cardEls = new Map();
  values.forEach((v, i) => {
    const el = document.createElement("div");
    el.className = "demo-card";
    el.textContent = String(v);
    el.style.left = `${i * (CARD_W + GAP)}px`;
    el.style.width = `${CARD_W}px`;
    el.style.height = `${CARD_H}px`;
    boardEl.appendChild(el);
    cardEls.set(v, { el, left: i * (CARD_W + GAP) });
  });
  // カーソルの絵（矢印）。札の中央の少し下に先端を置く。
  const cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  cursor.innerHTML = `<svg width="22" height="30" viewBox="0 0 22 30" aria-hidden="true"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 16 L20 16 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg><span class="demo-click-ring"></span>`;
  boardEl.appendChild(cursor);
  const statusEl = wrap.querySelector(".demo-status");
  const countEl = wrap.querySelector(".demo-count");
  const replayBtn = wrap.querySelector(".demo-replay");

  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const moveCursorTo = (value) => {
    const c = cardEls.get(value);
    if (!c) return;
    if (window.__collectionB && window.__collectionB.lastDemo) window.__collectionB.lastDemo.moves.push({ perf: performance.now(), value });
    cursor.style.left = `${c.left + CARD_W / 2 - 4}px`;
    cursor.style.top = `${CARD_H / 2 + 6}px`;
    for (const [v, x] of cardEls) x.el.classList.toggle("hover", v === value);
  };
  const reset = () => {
    clearTimers();
    stopAllTones();
    cursor.classList.remove("clicking");
    for (const [, x] of cardEls) x.el.classList.remove("clicked", "hover");
  };

  // 再生の前は、カーソルの絵をいちばん小さい札の上に置いておく。
  moveCursorTo(Math.min(...values));

  const play = () => {
    reset();
    countEl.textContent = "音：まだ鳴っていません";
    statusEl.textContent = `開始を押したところです。最初の音が鳴る前から、いちばん小さい ${Math.min(...values)} の上で待ちます。`;
    const tones = scheduleTones({ count: target, t, delayMs: 1200 });
    const schedule = guideSchedule({ values, target, toneTimesPerf: tones.toneTimesPerf, t });
    // 自動の確認のために、直前の見本の音の時刻と切り替えの時刻を公開する。
    if (window.__collectionB) window.__collectionB.lastDemo = { toneTimesPerf: tones.toneTimesPerf.slice(), schedule, moves: [] };
    // 最初の音の前（k = 0）は、すぐに 5 の上に置く。
    moveCursorTo(schedule[0].value);
    // 各音の鳴り始めに、何回目の音かを文字で示す。
    tones.toneTimesPerf.forEach((tt, i) => {
      const k = i + 1;
      timers.push(setTimeout(() => {
        countEl.textContent = k === target ? `音：${k} 回目（高い音）` : `音：${k} 回目（低い音）`;
      }, Math.max(0, tt - performance.now())));
    });
    // 各音の鳴り終わりに、いま乗せるべき札へカーソルの絵を移す。最後の高い音の鳴り終わりでクリックの表示をする。
    for (const step of schedule.slice(1)) {
      timers.push(setTimeout(() => {
        const last = step.k === target;
        const prev = schedule[step.k - 1].value;
        moveCursorTo(step.value);
        if (last) {
          cursor.classList.add("clicking");
          cardEls.get(step.value).el.classList.add("clicked");
          statusEl.textContent = `${step.k} 回目の高い音が鳴ったので、乗っている ${step.value} の札をクリックします。`;
        } else if (step.value !== prev) {
          statusEl.textContent = `${step.k} 回目も低い音だったので、${prev} は読まれていません。次に小さい ${step.value} へ移ります。`;
        }
      }, Math.max(0, step.atPerf - performance.now())));
    }
  };

  replayBtn.addEventListener("click", play);
  // 見本が画面に半分以上見えたときに、自動で 1 回再生する。教示の文が長く、見本が画面の下に隠れている間に
  // 再生が終わってしまわないようにするため。IntersectionObserver が無いブラウザでは、すぐに再生する。
  let observer = null;
  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); observer = null; play(); }
    }, { threshold: 0.5 });
    observer.observe(wrap);
  } else {
    play();
  }
  return () => { if (observer) observer.disconnect(); reset(); wrap.remove(); };
}
