// ==========================
// board.js
// ==========================
// 盤面の描画、札の当たり判定、開始ボタン。
// 寸法はすべて CSS ピクセルで固定し、画面の大きさに応じて拡大縮小しない（複数の PC で同じ寸法にするため）。
// 盤面の領域（stage）の高さは配置が4枚でも8枚でも同じにして、開始ボタンの位置が試行ごとに動かないようにする。
// 4枚の配置は、8枚の配置の上段と下段の中間（中段）に置く。
// ==========================

import { BOARD } from "./config.js";

const COLUMNS = 4;

// 盤面の寸法を計算する。
export function boardGeometry() {
  const boardWidth = COLUMNS * BOARD.cardWidth + (COLUMNS - 1) * BOARD.cardGap;
  const boardHeight = 2 * BOARD.cardHeight + BOARD.rowGap;
  const stageHeight = boardHeight + BOARD.startButtonOffset + BOARD.startButtonHeight;
  return { boardWidth, boardHeight, stageHeight };
}

// 配置（rows）から、各札の盤面内の位置（左上の座標、CSSピクセル）を計算する。
export function cardPositions(rows) {
  const { boardHeight } = boardGeometry();
  const positions = [];
  const nRows = rows.length;
  rows.forEach((row, r) => {
    // 1列のときは中段（盤面の縦の中央）に置く。2列のときは上段と下段。
    const top = nRows === 1
      ? (boardHeight - BOARD.cardHeight) / 2
      : r * (BOARD.cardHeight + BOARD.rowGap);
    row.forEach((value, c) => {
      positions.push({
        value,
        row: r,
        col: c,
        left: c * (BOARD.cardWidth + BOARD.cardGap),
        top,
        width: BOARD.cardWidth,
        height: BOARD.cardHeight,
      });
    });
  });
  return positions;
}

export class Board {
  // stageEl は盤面と開始ボタンを入れる要素。index.html の #stage。
  constructor(stageEl) {
    this.stageEl = stageEl;
    const g = boardGeometry();
    stageEl.style.width = `${g.boardWidth}px`;
    stageEl.style.height = `${g.stageHeight}px`;

    this.boardEl = document.createElement("div");
    this.boardEl.className = "board";
    this.boardEl.style.width = `${g.boardWidth}px`;
    this.boardEl.style.height = `${g.boardHeight}px`;
    stageEl.appendChild(this.boardEl);

    this.startButton = document.createElement("button");
    this.startButton.className = "start-button";
    this.startButton.type = "button";
    this.startButton.textContent = "開始";
    this.startButton.style.width = `${BOARD.startButtonWidth}px`;
    this.startButton.style.height = `${BOARD.startButtonHeight}px`;
    this.startButton.style.left = `${(g.boardWidth - BOARD.startButtonWidth) / 2}px`;
    this.startButton.style.top = `${g.boardHeight + BOARD.startButtonOffset}px`;
    stageEl.appendChild(this.startButton);

    // 開始ボタンのそばの案内（v0.6.0、I1 と I4）。盤面の下端と開始ボタンの間のすき間（200px）の下寄りに置く。
    this.hintEl = document.createElement("div");
    this.hintEl.className = "start-hint";
    this.hintEl.style.width = `${g.boardWidth}px`;
    this.hintEl.style.top = `${g.boardHeight + BOARD.startButtonOffset - 76}px`;
    stageEl.appendChild(this.hintEl);

    // 第3部の練習の目印の説明（v0.6.0、I6）。同じすき間の上寄りに置き、札には重ねない。
    this.noteEl = document.createElement("div");
    this.noteEl.className = "practice-note";
    this.noteEl.style.width = `${g.boardWidth}px`;
    this.noteEl.style.top = `${g.boardHeight + 16}px`;
    stageEl.appendChild(this.noteEl);

    this.feedbackEl = document.createElement("div");
    this.feedbackEl.className = "feedback";
    stageEl.appendChild(this.feedbackEl);

    this.cardEls = [];
    this.cardRects = [];
  }

  // 配置を描く。rows は design.js の試行の rows。
  render(rows) {
    this.boardEl.innerHTML = "";
    this.cardEls = [];
    for (const p of cardPositions(rows)) {
      const el = document.createElement("div");
      el.className = "card";
      el.dataset.value = String(p.value);
      el.style.left = `${p.left}px`;
      el.style.top = `${p.top}px`;
      el.style.width = `${p.width}px`;
      el.style.height = `${p.height}px`;
      el.textContent = String(p.value);
      this.boardEl.appendChild(el);
      this.cardEls.push({ value: p.value, row: p.row, col: p.col, el });
    }
    this.hideFeedback();
    this.measure();
  }

  // 各札の画面上の矩形（ビューポート座標、CSSピクセル）を測る。試行の記録に入れる。
  measure() {
    this.cardRects = this.cardEls.map(({ value, row, col, el }) => {
      const r = el.getBoundingClientRect();
      return { value, row, col, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
    const b = this.boardEl.getBoundingClientRect();
    this.boardRect = { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    const s = this.startButton.getBoundingClientRect();
    this.startButtonRect = { left: s.left, top: s.top, right: s.right, bottom: s.bottom, width: s.width, height: s.height };
    return this.cardRects;
  }

  // ビューポート座標 (x, y) がどの札の上にあるかを返す。無ければ null。
  hitTest(x, y) {
    for (const r of this.cardRects) {
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return r.value;
    }
    return null;
  }

  showStartButton(show) {
    this.startButton.style.visibility = show ? "visible" : "hidden";
  }

  // 第2部で、試行のあいだも開始ボタンを「ここで待つ」場所として残す（v0.6.0、I4）。
  // waiting が真なら、ボタンの文字を label にして見た目を待つ場所の形に替え、偽なら「開始」に戻す。
  setStartWaiting(waiting, label = "ここで待つ") {
    this.startButton.classList.toggle("waiting", waiting);
    this.startButton.textContent = waiting ? label : "開始";
  }

  // 開始ボタンのそばの案内を出す。lines は文の並び。空の並びなら消す。
  setStartHint(lines) {
    this.hintEl.innerHTML = "";
    for (const line of lines || []) {
      const p = document.createElement("div");
      p.textContent = line;
      this.hintEl.appendChild(p);
    }
    this.hintEl.classList.toggle("show", Boolean(lines && lines.length));
  }

  // 第3部の練習の目印の説明を出す。text が空なら消す。
  setPracticeNote(text) {
    this.noteEl.textContent = text || "";
    this.noteEl.classList.toggle("show", Boolean(text));
  }

  // 第3部の練習で「いま乗るべき札」を示す。value が null なら消す。
  setGuide(value) {
    for (const c of this.cardEls) c.el.classList.toggle("guide", c.value === value);
  }

  // クリックされた札と正解の札に印を付ける。
  markResult(clickedValue, targetValue) {
    for (const c of this.cardEls) {
      c.el.classList.toggle("clicked-wrong", clickedValue !== null && c.value === clickedValue && clickedValue !== targetValue);
      c.el.classList.toggle("correct", c.value === targetValue);
    }
  }

  clearMarks() {
    for (const c of this.cardEls) c.el.classList.remove("clicked-wrong", "correct", "guide");
  }

  showFeedback(text, kind) {
    this.feedbackEl.textContent = text;
    this.feedbackEl.className = `feedback show ${kind}`;
  }

  hideFeedback() {
    this.feedbackEl.className = "feedback";
    this.feedbackEl.textContent = "";
  }
}
