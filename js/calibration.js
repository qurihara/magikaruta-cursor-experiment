// ==========================
// calibration.js
// ==========================
// 運営者用の較正画面（仕様書の第9節）。
// (1) 画面の較正。画面に出した枡の幅を、定規で測った 100 mm に合わせてもらい、1 mm あたりの CSS ピクセル数を得る。
// (2) マウスの較正。マウスを定規に沿って 100 mm 動かす操作を 3 回行い、カーソルの移動量（CSS ピクセル）から、
//     手の 1 mm あたりのカーソルの移動ピクセル数を得る。
// (3) 任意。Pointer Lock の unadjustedMovement で生のカウントを読み、マウスの CPI を推定する。
// 較正の値は localStorage に保存し、各セッションの環境の記録に含める。
// ==========================

import { loadCalibration, saveCalibration } from "./storage.js";

const REFERENCE_MM = 100;

export function currentCalibration() {
  return loadCalibration() || {
    screenPxPerMm: null,
    screenBoxPx: null,
    mousePxPerMm: null,
    mouseTrialsPx: [],
    mouseCpi: null,
    mouseCpiCounts: null,
    calibratedAt: null,
    devicePixelRatio: null,
  };
}

// container に較正の画面を描く。onBack は「戻る」が押されたときに呼ぶ。
export function mountCalibration(container, onBack) {
  const cal = currentCalibration();
  const boxPx = cal.screenBoxPx || Math.round(REFERENCE_MM * (96 / 25.4));

  container.innerHTML = `
    <h2>較正（運営者用）</h2>
    <p>この画面の値は、画面上の距離、手の移動量、実物のかるたの寸法の関係を分析で復元するために使います。
    較正の値はこの PC の localStorage に保存され、各セッションの環境の記録に含まれます。</p>

    <section class="cal-section">
      <h3>1. 画面の較正</h3>
      <p>下の枡の幅を、定規で測って <strong>100 mm</strong> になるように、数値を変えてください。</p>
      <div class="cal-box-wrap"><div id="cal-box" class="cal-box" style="width:${boxPx}px"></div></div>
      <label>枡の幅（CSS ピクセル）
        <input id="cal-box-px" type="number" min="100" max="2000" step="1" value="${boxPx}">
      </label>
      <input id="cal-box-range" type="range" min="200" max="800" step="1" value="${boxPx}" style="width:100%">
      <p>1 mm あたり <strong id="cal-screen-result">${cal.screenPxPerMm ? cal.screenPxPerMm.toFixed(3) : "—"}</strong> CSS ピクセル
        （devicePixelRatio = ${window.devicePixelRatio}）</p>
      <button id="cal-screen-save" type="button">画面の較正を保存</button>
    </section>

    <section class="cal-section">
      <h3>2. マウスの較正</h3>
      <p>マウスの横に定規を置きます。「開始」を押してから、マウスを定規に沿って <strong>100 mm</strong> だけ右へ動かし、
      その位置でそのままクリックしてください（画面のどこでもかまいません）。これを 3 回行います。カーソルが画面の端に当たらないよう、開始のときはカーソルを左寄りに置いてください。</p>
      <div id="cal-mouse-area" class="cal-mouse-area">
        <button id="cal-mouse-btn" type="button" class="cal-mouse-btn">開始</button>
        <span id="cal-mouse-status">記録した回数: ${cal.mouseTrialsPx ? cal.mouseTrialsPx.length : 0}</span>
      </div>
      <p>各回の移動量（CSS ピクセル）: <span id="cal-mouse-list">${(cal.mouseTrialsPx || []).map((v) => v.toFixed(1)).join(", ") || "—"}</span></p>
      <p>手の 1 mm あたり <strong id="cal-mouse-result">${cal.mousePxPerMm ? cal.mousePxPerMm.toFixed(3) : "—"}</strong> CSS ピクセル</p>
      <button id="cal-mouse-reset" type="button">マウスの較正をやり直す</button>
    </section>

    <section class="cal-section">
      <h3>3. マウスの CPI の推定（任意）</h3>
      <p>下の枠をクリックするとポインタがロックされ、生の移動カウントを読みます。マウスを定規に沿って <strong>100 mm</strong> 動かしてから、
      もう一度クリックしてください（Esc で中止）。このブラウザでは unadjustedMovement が
      <strong id="cal-cpi-support">確認中</strong> です。</p>
      <div id="cal-cpi-area" class="cal-cpi-area">クリックしてロック</div>
      <p>生のカウント: <span id="cal-cpi-counts">${cal.mouseCpiCounts ?? "—"}</span>、推定 CPI: <strong id="cal-cpi-result">${cal.mouseCpi ? cal.mouseCpi.toFixed(0) : "—"}</strong></p>
    </section>

    <p><button id="cal-back" type="button" class="primary">運営者の画面へ戻る</button></p>
  `;

  const state = { ...cal };

  // ---- 画面の較正 ----
  const box = container.querySelector("#cal-box");
  const pxInput = container.querySelector("#cal-box-px");
  const range = container.querySelector("#cal-box-range");
  const screenResult = container.querySelector("#cal-screen-result");
  const setBox = (px) => {
    const v = Math.max(50, Math.round(Number(px) || 0));
    box.style.width = `${v}px`;
    pxInput.value = String(v);
    range.value = String(Math.min(800, Math.max(200, v)));
    screenResult.textContent = (v / REFERENCE_MM).toFixed(3);
  };
  pxInput.addEventListener("input", () => setBox(pxInput.value));
  range.addEventListener("input", () => setBox(range.value));
  container.querySelector("#cal-screen-save").addEventListener("click", () => {
    const px = Number(pxInput.value);
    state.screenBoxPx = px;
    state.screenPxPerMm = px / REFERENCE_MM;
    state.devicePixelRatio = window.devicePixelRatio;
    state.calibratedAt = new Date().toISOString();
    saveCalibration(state);
    screenResult.textContent = state.screenPxPerMm.toFixed(3);
    flash(container.querySelector("#cal-screen-save"), "保存しました");
  });

  // ---- マウスの較正 ----
  const mouseBtn = container.querySelector("#cal-mouse-btn");
  const mouseStatus = container.querySelector("#cal-mouse-status");
  const mouseList = container.querySelector("#cal-mouse-list");
  const mouseResult = container.querySelector("#cal-mouse-result");
  let mouseStart = null;
  const refreshMouse = () => {
    const list = state.mouseTrialsPx || [];
    mouseList.textContent = list.map((v) => v.toFixed(1)).join(", ") || "—";
    mouseStatus.textContent = `記録した回数: ${list.length}`;
    if (list.length > 0) {
      const mean = list.reduce((a, b) => a + b, 0) / list.length;
      state.mousePxPerMm = mean / REFERENCE_MM;
      mouseResult.textContent = state.mousePxPerMm.toFixed(3);
    } else {
      state.mousePxPerMm = null;
      mouseResult.textContent = "—";
    }
  };
  // 「開始」を押した位置を起点にし、マウスを 100 mm 動かした先で、画面のどこでもよいのでクリックした位置を終点にする。
  // 終点はボタンの上ではないので、document 全体の pointerdown で受ける。
  const onMouseEnd = (ev) => {
    if (!mouseStart) return;
    document.removeEventListener("pointerdown", onMouseEnd, true);
    const dx = ev.clientX - mouseStart.x, dy = ev.clientY - mouseStart.y;
    const dist = Math.hypot(dx, dy);
    state.mouseTrialsPx = [...(state.mouseTrialsPx || []), dist];
    mouseStart = null;
    mouseBtn.textContent = "開始";
    mouseBtn.classList.remove("armed");
    refreshMouse();
    state.calibratedAt = new Date().toISOString();
    saveCalibration(state);
  };
  mouseBtn.addEventListener("click", (ev) => {
    if (mouseStart) return;
    mouseStart = { x: ev.clientX, y: ev.clientY };
    mouseBtn.textContent = "計測中";
    mouseBtn.classList.add("armed");
    mouseStatus.textContent = "マウスを 100 mm 動かした位置で、そのままクリックしてください（画面のどこでもかまいません）";
    // この click 自体を終点として拾わないよう、次のフレームから聞く。
    requestAnimationFrame(() => document.addEventListener("pointerdown", onMouseEnd, true));
  });
  container.querySelector("#cal-mouse-reset").addEventListener("click", () => {
    state.mouseTrialsPx = [];
    mouseStart = null;
    mouseBtn.textContent = "開始";
    mouseBtn.classList.remove("armed");
    refreshMouse();
    saveCalibration(state);
  });

  // ---- CPI の推定（Pointer Lock） ----
  const cpiArea = container.querySelector("#cal-cpi-area");
  const cpiSupport = container.querySelector("#cal-cpi-support");
  const cpiCounts = container.querySelector("#cal-cpi-counts");
  const cpiResult = container.querySelector("#cal-cpi-result");
  let cpiAccum = 0;
  let cpiLocked = false;
  const supportsUnadjusted = "requestPointerLock" in Element.prototype;
  cpiSupport.textContent = supportsUnadjusted ? "使える可能性があります（ロック時に確認します）" : "使えません";
  const onLockMove = (ev) => {
    if (!cpiLocked) return;
    cpiAccum += ev.movementX;
    cpiCounts.textContent = String(cpiAccum);
  };
  const onLockChange = () => {
    cpiLocked = document.pointerLockElement === cpiArea;
    if (cpiLocked) {
      cpiAccum = 0;
      cpiArea.textContent = "ロック中。100 mm 動かして、もう一度クリック";
      cpiArea.classList.add("locked");
    } else {
      cpiArea.textContent = "クリックしてロック";
      cpiArea.classList.remove("locked");
    }
  };
  document.addEventListener("pointermove", onLockMove);
  document.addEventListener("pointerlockchange", onLockChange);
  cpiArea.addEventListener("click", async () => {
    if (!supportsUnadjusted) return;
    if (!cpiLocked) {
      try {
        const p = cpiArea.requestPointerLock({ unadjustedMovement: true });
        if (p && p.then) await p;
        cpiSupport.textContent = "使えます";
      } catch (e) {
        cpiSupport.textContent = `使えません（${e.name}）。加速の掛かった値になります`;
        try { cpiArea.requestPointerLock(); } catch (_) { /* 無視 */ }
      }
    } else {
      document.exitPointerLock();
      const counts = Math.abs(cpiAccum);
      state.mouseCpiCounts = counts;
      state.mouseCpi = counts / (REFERENCE_MM / 25.4);
      cpiResult.textContent = state.mouseCpi.toFixed(0);
      state.calibratedAt = new Date().toISOString();
      saveCalibration(state);
    }
  });

  container.querySelector("#cal-back").addEventListener("click", () => {
    document.removeEventListener("pointermove", onLockMove);
    document.removeEventListener("pointerlockchange", onLockChange);
    if (document.pointerLockElement) document.exitPointerLock();
    onBack();
  });
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1200);
}
