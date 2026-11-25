// online.js の判定の検査（v0.5.0）。node --test test/*.test.js で実行する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWid, participantIdFromWid, isMobileEnv, envProblems, practiceDecision, completionDecision, duplicateDecision,
} from "../js/online.js";
import { ONLINE } from "../js/config.js";

const P = (q) => new URLSearchParams(q);

test("作業者IDは半角英数 1〜20 文字だけを受ける", () => {
  assert.equal(parseWid(P("wid=k7m2qx")), "k7m2qx");
  assert.equal(parseWid(P("wid=ab-cd")), null);
  assert.equal(parseWid(P("wid=")), null);
  assert.equal(parseWid(P("")), null);
  assert.equal(parseWid(P("wid=" + "a".repeat(21))), null);
});

test("作業者IDから決まる参加者番号は 10000〜99999 で、同じ wid なら同じ値", () => {
  for (const w of ["k7m2qx", "test01", "a", "ZZZZZZ"]) {
    const n = participantIdFromWid(w);
    assert.ok(Number.isInteger(n) && n >= 10000 && n <= 99999);
    assert.equal(n, participantIdFromWid(w));
  }
  // 100 個の wid で、ウィリアムズ方陣の 10 通りの行が偏りすぎないこと（各行 2 人以上）
  const counts = Array(10).fill(0);
  for (let i = 0; i < 100; i++) counts[(participantIdFromWid("w" + i) - 1) % 10]++;
  assert.ok(Math.min(...counts) >= 2, counts.join(","));
});

const pc = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131", maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080, innerWidth: 1600, innerHeight: 900 };

test("スマートフォンとタブレットの判定", () => {
  assert.equal(isMobileEnv(pc), false);
  assert.equal(isMobileEnv({ ...pc, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }), true);
  assert.equal(isMobileEnv({ ...pc, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" }), true);
  // iPad が Mac を名乗る場合
  assert.equal(isMobileEnv({ ...pc, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }), true);
  // タッチ画面の付いた Windows のノートは弾かない
  assert.equal(isMobileEnv({ ...pc, maxTouchPoints: 10 }), false);
  assert.equal(isMobileEnv({ ...pc, uadMobile: true }), true);
});

test("画面の幅と高さの判定", () => {
  assert.equal(envProblems(pc).problems.length, 0);
  const n = envProblems({ ...pc, innerWidth: 700 });
  assert.equal(n.narrow, true);
  assert.equal(n.mobile, false);
  const s = envProblems({ ...pc, innerHeight: ONLINE.minInnerHeight - 1 });
  assert.equal(s.short, true);
  assert.equal(envProblems({ ...pc, innerHeight: ONLINE.minInnerHeight }).short, false);
});

const pr = (correct) => ({ isPractice: true, click: { correct }, timedOut: false });
const to = () => ({ isPractice: true, click: null, timedOut: true });

test("練習の合格条件", () => {
  assert.equal(practiceDecision([pr(true), pr(true)], { planned: 5 }), "pending");
  assert.equal(practiceDecision([pr(true), pr(false), pr(true), to(), to()], { planned: 5 }), "pass");
  assert.equal(practiceDecision([pr(true), to(), to(), to(), pr(false)], { planned: 5 }), "more");
  const fifteen = [pr(true), ...Array(14).fill(0).map(() => to())];
  assert.equal(practiceDecision(fifteen, { planned: 5 }), "fail");
  assert.equal(practiceDecision([...fifteen.slice(0, 14), pr(true)], { planned: 5 }), "pass");
});

const main = (timedOut) => ({ isPractice: false, timedOut });

test("完了コードを出す条件（時間切れでない回の割合）", () => {
  const records = [pr(true), ...Array(7).fill(0).map(() => main(false)), ...Array(3).fill(0).map(() => main(true))];
  const d = completionDecision(records, { minRatio: 0.7 });
  assert.equal(d.total, 10);
  assert.equal(d.answered, 7);
  assert.equal(d.status, "finished");
  assert.equal(completionDecision([...records, main(true)], { minRatio: 0.7 }).status, "incomplete");
  assert.equal(completionDecision([pr(true)]).status, "incomplete");
});

test("同じブラウザでの二重の参加の判定", () => {
  assert.equal(duplicateDecision(null, "a1"), "new");
  assert.equal(duplicateDecision({ wid: "a1" }, "a1"), "same");
  assert.equal(duplicateDecision({ wid: "a1" }, "b2"), "other");
});
