// recorder.js の第2部の早い動きの判定（v0.6.0、I4）の検査。node --test test/*.test.js で実行する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { earlyLeaveFromStart, part2AttemptDecision, insideRect } from "../js/recorder.js";
import { PART2_EARLY_MOVE, BOARD } from "../js/config.js";
import { readFileSync } from "node:fs";

// 開始ボタンの四角（幅 160、高さ 56）。左上を (220, 600) とする。
const rect = { left: 220, top: 600, right: 220 + BOARD.startButtonWidth, bottom: 600 + BOARD.startButtonHeight };
const path = (pts) => ({ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), t: pts.map((p) => p[2]), src: pts.map(() => 0) });

test("開始ボタンの四角は幅 160px、高さ 56px で、境界は中に含める", () => {
  assert.equal(BOARD.startButtonWidth, 160);
  assert.equal(BOARD.startButtonHeight, 56);
  assert.equal(insideRect(rect, 220, 600), true);
  assert.equal(insideRect(rect, 380, 656), true);
  assert.equal(insideRect(rect, 381, 630), false);
  assert.equal(insideRect(rect, 300, 599), false);
});

test("最後の高い音の予定の時刻より前に四角の外へ出たら、早く動いたと判定する", () => {
  const p = path([[300, 628, 0], [310, 630, 500], [300, 560, 900], [300, 300, 1100]]);
  const e = earlyLeaveFromStart(p, rect, 1000);
  assert.deepEqual(e, { perf: 900, x: 300, y: 560, msBeforeLastTone: 100, source: "path" });
});

test("四角の中で動くだけなら、早く動いたとは判定しない", () => {
  const p = path([[300, 628, 0], [230, 605, 400], [375, 650, 800], [300, 300, 1000], [300, 200, 1200]]);
  // 最後の音の時刻ちょうどに外にいる点は、音より前ではないので数えない。
  assert.equal(earlyLeaveFromStart(p, rect, 1000), null);
});

test("札のクリックが最後の音より前なら、軌道に外の点が無くても早く動いたと判定する", () => {
  const p = path([[300, 628, 0]]);
  const e = earlyLeaveFromStart(p, rect, 1000, { x: 100, y: 100, perf: 700 });
  assert.equal(e.source, "click");
  assert.equal(e.perf, 700);
  assert.equal(earlyLeaveFromStart(p, rect, 1000, { x: 100, y: 100, perf: 1200 }), null);
});

test("やり直しは 2 回までで、3 回目は早く動いてもやり直さずに記録する（知らせを出す印 record_early を返す。v0.6.1、AA4）", () => {
  assert.equal(PART2_EARLY_MOVE.maxRetries, 2);
  const m = PART2_EARLY_MOVE.maxRetries;
  assert.equal(part2AttemptDecision({ early: true, attempt: 0, maxRetries: m }), "retry");
  assert.equal(part2AttemptDecision({ early: true, attempt: 1, maxRetries: m }), "retry");
  assert.equal(part2AttemptDecision({ early: true, attempt: 2, maxRetries: m }), "record_early");
  for (let a = 0; a <= 2; a++) assert.equal(part2AttemptDecision({ early: false, attempt: a, maxRetries: m }), "record");
  assert.equal(PART2_EARLY_MOVE.notice, "最後の高い音が鳴る前に、開始ボタンから離れました。高い音を聞いてから動かしてください。");
});

// ---------- v0.6.1（AA4） ----------

test("3 回目にも早く動いたときの知らせの文が決定のとおり", () => {
  assert.equal(PART2_EARLY_MOVE.finalNotice, "最後の高い音が鳴る前に動きました。これからの試行では、高い音を聞いてから動かしてください。");
});

test("main.js は、3 回目にも早く動いた回を記録したあとに知らせを出し、やり直さずに先へ進む", () => {
  const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const fn = main.slice(main.indexOf("async function runPart2Trial("), main.indexOf("// ---------- 1試行 ----------"));
  // 知らせを出したあとは return して、同じ試行を繰り返さない
  assert.match(fn, /if \(r && r\.earlyRecorded\) \{\s*await showMessage\("お知らせ", \[PART2_EARLY_MOVE\.finalNotice\]\);\s*return;\s*\}/);
  // runTrial は record_early のときに earlyRecorded を立て、記録には part2Outcome を残す
  assert.match(main, /earlyRecorded = outcome === "record_early";/);
  assert.match(main, /record\.part2Outcome = outcome;/);
  assert.match(main, /return \{ retry: false, earlyRecorded \};/);
});
