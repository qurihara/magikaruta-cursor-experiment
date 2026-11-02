// ==========================
// test/design.test.js
// ==========================
// design.js の純粋関数を Node の組み込みの test runner で検査する。
// 実行は、リポジトリの根で `node --test test/`。
// ==========================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mulberry32, hashSeed, williamsSquare, blockOrderForParticipant,
  buildPlan, splitPlanByPart, assignTargets, layoutMax, layoutValues,
  isDeterminedAfterTones, candidatesAfterTones,
} from "../js/design.js";
import { T_LEVELS, LAYOUTS, TRIALS_PER_BLOCK, MAX_TARGET_TRIALS_PER_BLOCK, TEST_MODE } from "../js/config.js";

const PIDS = Array.from({ length: 30 }, (_, i) => i + 1);

test("mulberry32 は同じ種から同じ列を返し、[0,1) に収まる", () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("hashSeed は引数の順序と区切りを区別する", () => {
  assert.notEqual(hashSeed(1, "part1"), hashSeed(1, "part3"));
  assert.notEqual(hashSeed(1, "part1"), hashSeed("part1", 1));
  assert.notEqual(hashSeed(12, "a"), hashSeed(1, "2a"));
});

test("5水準のウィリアムズ方陣は10通りの順序で、各行が 0..4 の並べ替え", () => {
  const sq = williamsSquare(5);
  assert.equal(sq.length, 10);
  const seen = new Set();
  for (const row of sq) {
    assert.deepEqual(row.slice().sort(), [0, 1, 2, 3, 4]);
    seen.add(row.join(","));
  }
  assert.equal(seen.size, 10, "10行がすべて異なる");
  // 各水準が各位置に1回ずつ現れる（ラテン方陣の性質）。
  for (let pos = 0; pos < 5; pos++) {
    const first = sq.slice(0, 5).map((r) => r[pos]).sort();
    assert.deepEqual(first, [0, 1, 2, 3, 4]);
  }
});

test("参加者番号 1 から 10 で 10 通りのブロック順序が全部現れ、11 は 1 と同じ", () => {
  const orders = new Set();
  for (let pid = 1; pid <= 10; pid++) {
    const o = blockOrderForParticipant(pid);
    assert.equal(o.length, T_LEVELS.length);
    orders.add(o.join(","));
  }
  assert.equal(orders.size, 10);
  assert.deepEqual(blockOrderForParticipant(11), blockOrderForParticipant(1));
});

test("同じ参加者番号なら同じ試行の列になる", () => {
  for (const pid of [1, 7, 23]) {
    assert.deepEqual(buildPlan({ participantId: pid }), buildPlan({ participantId: pid }));
    assert.deepEqual(buildPlan({ participantId: pid, testMode: true }), buildPlan({ participantId: pid, testMode: true }));
  }
  assert.notDeepEqual(buildPlan({ participantId: 1 }), buildPlan({ participantId: 2 }));
});

test("文書 ID は試行の列の中で一意", () => {
  for (const pid of PIDS) {
    const plan = buildPlan({ participantId: pid });
    const ids = new Set(plan.map((t) => t.docId));
    assert.equal(ids.size, plan.length);
  }
});

test("第1部と第3部で、5水準 × 8配置が各1回ずつ現れる（本試行のみ）", () => {
  for (const pid of PIDS) {
    const parts = splitPlanByPart(buildPlan({ participantId: pid }));
    for (const key of ["part1", "part3"]) {
      const main = parts.get(key).filter((t) => !t.isPractice);
      assert.equal(main.length, T_LEVELS.length * LAYOUTS.length);
      const seen = new Set(main.map((t) => `${t.t}/${t.layoutId}`));
      assert.equal(seen.size, T_LEVELS.length * LAYOUTS.length);
      // 練習はブロックごとに1試行、trialIndex 0。
      const practice = parts.get(key).filter((t) => t.isPractice);
      assert.equal(practice.length, T_LEVELS.length);
      assert.ok(practice.every((t) => t.trialIndex === 0));
    }
  }
});

test("第1部と第3部は同じブロックの順序（t の列）を使う", () => {
  for (const pid of PIDS) {
    const parts = splitPlanByPart(buildPlan({ participantId: pid }));
    const tSeq = (key) => {
      const main = parts.get(key).filter((t) => !t.isPractice);
      const byBlock = [];
      for (const tr of main) byBlock[tr.blockIndex] = tr.t;
      return byBlock;
    };
    assert.deepEqual(tSeq("part1"), tSeq("part3"));
    assert.deepEqual(tSeq("part1"), blockOrderForParticipant(pid).map((i) => T_LEVELS[i]));
  }
});

test("各ブロックの8試行のうち、最大の値の札が読まれる試行はちょうど2つ", () => {
  for (const pid of PIDS) {
    const parts = splitPlanByPart(buildPlan({ participantId: pid }));
    for (const key of ["part1", "part2", "part3"]) {
      const main = parts.get(key).filter((t) => !t.isPractice);
      const blocks = new Map();
      for (const tr of main) {
        if (!blocks.has(tr.blockIndex)) blocks.set(tr.blockIndex, []);
        blocks.get(tr.blockIndex).push(tr);
      }
      for (const [b, trials] of blocks) {
        assert.equal(trials.length, TRIALS_PER_BLOCK, `${key} block ${b}`);
        const nMax = trials.filter((t) => t.isMaxTarget).length;
        assert.equal(nMax, MAX_TARGET_TRIALS_PER_BLOCK, `${key} block ${b} pid ${pid}`);
        // isMaxTarget の印が、実際の値と矛盾しない。
        for (const t of trials) {
          assert.equal(t.isMaxTarget, t.target === t.maxValue);
          assert.ok(t.rows.flat().includes(t.target), "読まれる札は盤面にある");
        }
      }
    }
  }
});

test("4枚の配置では、5ブロックを通して4つの値が各1回以上読まれる", () => {
  for (const pid of PIDS) {
    const parts = splitPlanByPart(buildPlan({ participantId: pid }));
    for (const key of ["part1", "part3"]) {
      const main = parts.get(key).filter((t) => !t.isPractice);
      for (const layout of LAYOUTS.filter((l) => layoutValues(l).length === 4)) {
        const read = new Set(main.filter((t) => t.layoutId === layout.id).map((t) => t.target));
        assert.deepEqual([...read].sort((a, b) => a - b), layoutValues(layout).slice().sort((a, b) => a - b),
          `${key} layout ${layout.id} pid ${pid}`);
      }
    }
  }
});

test("8枚の配置では、5ブロックを通して最大が1回以上、最大以外の低・中・高の帯が全部現れる", () => {
  for (const pid of PIDS) {
    const parts = splitPlanByPart(buildPlan({ participantId: pid }));
    for (const key of ["part1", "part3"]) {
      const main = parts.get(key).filter((t) => !t.isPractice);
      for (const layout of LAYOUTS.filter((l) => layoutValues(l).length === 8)) {
        const targets = main.filter((t) => t.layoutId === layout.id).map((t) => t.target);
        assert.equal(targets.length, 5);
        assert.ok(targets.includes(layoutMax(layout)), `最大が1回以上 ${key} layout ${layout.id} pid ${pid}`);
        const nonMax = layoutValues(layout).slice().sort((a, b) => a - b).slice(0, 7);
        const low = nonMax.slice(0, 3), mid = nonMax.slice(3, 5), high = nonMax.slice(5);
        const others = targets.filter((v) => v !== layoutMax(layout));
        // 最大が1回なら残り4、2回なら残り3。帯は3つなので、どちらの場合も3つの帯が全部現れる。
        assert.ok(others.some((v) => low.includes(v)), `低の帯 ${key} layout ${layout.id} pid ${pid}`);
        assert.ok(others.some((v) => mid.includes(v)), `中の帯 ${key} layout ${layout.id} pid ${pid}`);
        assert.ok(others.some((v) => high.includes(v)), `高の帯 ${key} layout ${layout.id} pid ${pid}`);
      }
    }
  }
});

test("第2部は t = 0.2 の 8 試行で、8 配置が1回ずつ", () => {
  for (const pid of PIDS) {
    const part2 = splitPlanByPart(buildPlan({ participantId: pid })).get("part2");
    assert.equal(part2.length, 8);
    assert.ok(part2.every((t) => t.t === 0.2 && !t.isPractice));
    assert.equal(new Set(part2.map((t) => t.layoutId)).size, 8);
  }
});

test("第4部は 0.4 と 0.8 の 4 試行ずつで、8 配置を分け合い、順序は参加者番号の偶奇で入れ替わる", () => {
  for (const pid of PIDS) {
    const part4 = splitPlanByPart(buildPlan({ participantId: pid })).get("part4");
    assert.equal(part4.length, 8);
    assert.equal(new Set(part4.map((t) => t.layoutId)).size, 8);
    const byT = new Map();
    for (const tr of part4) byT.set(tr.t, (byT.get(tr.t) || 0) + 1);
    assert.deepEqual([...byT.entries()].sort(), [[0.4, 4], [0.8, 4]]);
    // 混ぜずに 4 試行ずつのブロックになっている。
    const firstT = part4[0].t;
    assert.ok(part4.slice(0, 4).every((t) => t.t === firstT));
    assert.ok(part4.slice(4).every((t) => t.t !== firstT));
    assert.equal(firstT, pid % 2 === 0 ? 0.4 : 0.8);
    // 各ブロックに最大の札の試行が1つ。
    assert.equal(part4.slice(0, 4).filter((t) => t.isMaxTarget).length, 1);
    assert.equal(part4.slice(4).filter((t) => t.isMaxTarget).length, 1);
  }
});

test("練習の試行数と t が仕様どおり", () => {
  const parts = splitPlanByPart(buildPlan({ participantId: 3 }));
  assert.equal(parts.get("practice").length, 5);
  assert.ok(parts.get("practice").every((t) => t.t === 0.4 && t.isPractice));
  assert.equal(parts.get("part3practice").length, 3);
  assert.ok(parts.get("part3practice").every((t) => t.t === 1.6 && t.isPractice));
});

test("全体の試行数は 5 + 45 + 8 + 3 + 45 + 8 = 114", () => {
  assert.equal(buildPlan({ participantId: 1 }).length, 114);
});

test("テストモードでは各ブロックの本試行が 2 試行になる", () => {
  const plan = buildPlan({ participantId: 1, testMode: true });
  const parts = splitPlanByPart(plan);
  assert.equal(parts.get("practice").length, TEST_MODE.initialPracticeTrials);
  assert.equal(parts.get("part1").filter((t) => !t.isPractice).length, 5 * TEST_MODE.trialsPerBlock);
  assert.equal(parts.get("part1").filter((t) => t.isPractice).length, 5);
  assert.equal(parts.get("part2").length, TEST_MODE.trialsPerBlock);
  assert.equal(parts.get("part3practice").length, TEST_MODE.part3PracticeTrials);
  assert.equal(parts.get("part3").filter((t) => !t.isPractice).length, 5 * TEST_MODE.trialsPerBlock);
  assert.equal(parts.get("part4").length, 2 * TEST_MODE.part4TrialsPerBlock);
  // テストモードの試行は、本番の試行の列の先頭を切り取ったもの（文書 ID が本番と同じ）。
  const full = new Set(buildPlan({ participantId: 1 }).map((t) => t.docId));
  assert.ok(plan.every((t) => full.has(t.docId)));
});

test("assignTargets は配置ごとに読まれる札を返し、各ブロックで最大が2つ", () => {
  const targets = assignTargets({ participantId: 5, partKey: "part1", nBlocks: 5 });
  assert.equal(targets.length, 5);
  for (const row of targets) {
    assert.equal(row.length, LAYOUTS.length);
    const nMax = row.filter((v, l) => v === layoutMax(LAYOUTS[l])).length;
    assert.equal(nMax, 2);
  }
});

test("候補と確定の判定", () => {
  const values = [2, 5, 8, 11];
  assert.deepEqual(candidatesAfterTones(values, 0), [2, 5, 8, 11]);
  assert.deepEqual(candidatesAfterTones(values, 3), [5, 8, 11]);
  // 5 回目の音が低い音なら、5 の札はその時点で外れる。
  assert.deepEqual(candidatesAfterTones(values, 5, 8), [8, 11]);
  assert.deepEqual(candidatesAfterTones(values, 9), [11]);
  // 最後の高い音のあとは、読まれた札だけが候補である。
  assert.deepEqual(candidatesAfterTones(values, 8, 8), [8]);
  // 最大の札 11 が読まれるとき、2 番目の 8 の回数の音（8 回目）が低い音だと分かった時点で確定する。
  assert.equal(isDeterminedAfterTones(values, 11, 7), false);
  assert.equal(isDeterminedAfterTones(values, 11, 8), true);
  // 最大でない札 8 が読まれるときは、最後の音（8 回目）まで確定しない。
  assert.equal(isDeterminedAfterTones(values, 8, 7), false);
  assert.equal(isDeterminedAfterTones(values, 8, 8), true);
  // 場に 5 と 8 しか無く 8 が読まれるとき、5 回目の音が低い音だと分かった時点で確定する。
  assert.equal(isDeterminedAfterTones([5, 8], 8, 4), false);
  assert.equal(isDeterminedAfterTones([5, 8], 8, 5), true);
});
