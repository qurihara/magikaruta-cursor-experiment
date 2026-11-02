// ==========================
// design.js
// ==========================
// 実験の設計を試行の列に展開する純粋関数の集まり。DOM にも Web Audio にも触れないので、
// Node の test runner（node --test）でそのまま検査できる。
//
// 決めていること。
// - ブロックの順序は、5水準のウィリアムズ方陣の10通りの順序を参加者番号で巡回させる。
//   第1部と第3部で同じ順序を使う。
// - ブロック内の配置の順序、読まれる札の割り当て、練習の試行の内容は、
//   参加者番号と部の名前を種にした決定的な乱数（mulberry32）で作る。
//   同じ参加者番号なら同じ試行の列になるので、中断しても同じ列で再開できる。
// - 各ブロックの8試行のうち、読まれる札が盤面で最大の値の札である試行はちょうど2つ。
// - 4枚の配置では、5ブロックを通して4つの値が各1回以上読まれる。
// - 8枚の配置では、最大以外の値の順位を低・中・高の3つの帯に分け、ブロックごとに帯を回す。
// ==========================

import {
  T_LEVELS, PART2_T, PART3_PRACTICE_T, PART3_PRACTICE_TRIALS,
  INITIAL_PRACTICE_T, INITIAL_PRACTICE_TRIALS, PART4_T_LEVELS,
  TRIALS_PER_BLOCK, MAX_TARGET_TRIALS_PER_BLOCK, LAYOUTS, TEST_MODE,
} from "./config.js";

// ---------- 乱数 ----------

// mulberry32。32ビットの種から [0, 1) の浮動小数を返す関数を作る。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 参加者番号と文字列の組から 32 ビットの種を作る（FNV-1a）。
// 引数はいくつでもよく、数と文字列を混ぜてよい。
export function hashSeed(...parts) {
  const text = parts.map(String).join("\u001f");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 0 以上 n 未満の整数を返す。
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

// 配列の写しを Fisher–Yates で並べ替えて返す。元の配列は変えない。
export function shuffle(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

// ---------- ウィリアムズ方陣 ----------

// n 水準のウィリアムズ方陣。n が奇数のときは 2n 通り、偶数のときは n 通りの順序を返す。
// 各順序は 0 から n-1 の並べ替え。n が奇数のときは、1つ目の方陣とその各行を逆にした方陣を合わせる。
export function williamsSquare(n) {
  // 最初の行は 0, 1, n-1, 2, n-2, 3, n-3, ... の形。
  const first = [];
  let lo = 1, hi = n - 1;
  first.push(0);
  while (first.length < n) {
    if (first.length < n) first.push(lo++);
    if (first.length < n) first.push(hi--);
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(first.map((v) => (v + i) % n));
  }
  if (n % 2 === 1) {
    const reversed = rows.map((r) => r.slice().reverse());
    return rows.concat(reversed);
  }
  return rows;
}

// 参加者番号から、t のブロックの順序（T_LEVELS の添字の列）を返す。
// 参加者番号 1 が方陣の 1 行目、2 が 2 行目、…、11 が再び 1 行目になる。
export function blockOrderForParticipant(participantId) {
  const square = williamsSquare(T_LEVELS.length);
  const pid = Number(participantId);
  const index = ((pid - 1) % square.length + square.length) % square.length;
  return square[index].slice();
}

// ---------- 配置の補助 ----------

export function layoutValues(layout) {
  return layout.rows.flat();
}

export function layoutMax(layout) {
  return Math.max(...layoutValues(layout));
}

// 札の値を昇順に並べたときの、最大以外の値の列。
function nonMaxValuesAscending(layout) {
  const values = layoutValues(layout).slice().sort((a, b) => a - b);
  return values.slice(0, values.length - 1);
}

// 8枚の配置で、最大以外の7つの値（昇順）を低・中・高の3つの帯に分ける。
function rankBuckets(nonMaxAscending) {
  const n = nonMaxAscending.length;
  const cut1 = Math.ceil(n / 3);           // 7 なら 3
  const cut2 = cut1 + Math.ceil((n - cut1) / 2); // 7 なら 3 + 2 = 5
  return [
    nonMaxAscending.slice(0, cut1),
    nonMaxAscending.slice(cut1, cut2),
    nonMaxAscending.slice(cut2),
  ].filter((b) => b.length > 0);
}

// 最大以外の値を1つ、無作為に返す。
function randomNonMax(layout, rng) {
  const values = nonMaxValuesAscending(layout);
  return values[randInt(rng, values.length)];
}

// ---------- 読まれる札の割り当て ----------

// nBlocks 個のブロックそれぞれで、どの配置を「最大の札が読まれる試行」にするかを決める。
// 返り値は maxFlags[blockPos][layoutIndex] の真偽の表。各ブロックでちょうど
// MAX_TARGET_TRIALS_PER_BLOCK 個が真になる。配置の並べ替えを繰り返しつなげて切り分けるので、
// 配置ごとの最大の回数が偏らない（5ブロックなら、8配置が各1回以上、2配置だけが2回）。
export function chooseMaxLayouts(nBlocks, rng, perBlock = MAX_TARGET_TRIALS_PER_BLOCK) {
  const nLayouts = LAYOUTS.length;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const slots = [];
    while (slots.length < nBlocks * perBlock) {
      slots.push(...shuffle(range(nLayouts), rng));
    }
    const flags = [];
    let ok = true;
    for (let b = 0; b < nBlocks; b++) {
      const chosen = slots.slice(b * perBlock, (b + 1) * perBlock);
      if (new Set(chosen).size !== chosen.length) { ok = false; break; }
      const row = Array(nLayouts).fill(false);
      for (const l of chosen) row[l] = true;
      flags.push(row);
    }
    if (ok) return flags;
  }
  throw new Error("chooseMaxLayouts: 条件を満たす割り当てが作れませんでした");
}

// 1つの部（nBlocks 個のブロック、各ブロックに8配置が1回ずつ）の読まれる札を決める。
// 返り値は targets[blockPos][layoutIndex] = 読まれる札の値。
export function assignTargets({ participantId, partKey, nBlocks }) {
  const rng = mulberry32(hashSeed(participantId, partKey, "targets"));
  const maxFlags = chooseMaxLayouts(nBlocks, rng);
  const targets = Array.from({ length: nBlocks }, () => Array(LAYOUTS.length).fill(null));

  LAYOUTS.forEach((layout, l) => {
    const max = layoutMax(layout);
    const nonMaxBlocks = [];
    for (let b = 0; b < nBlocks; b++) {
      if (maxFlags[b][l]) targets[b][l] = max;
      else nonMaxBlocks.push(b);
    }
    const nonMax = nonMaxValuesAscending(layout);
    let sequence;
    if (nonMax.length <= 3) {
      // 4枚の配置。最大以外の3つの値をまず各1回ずつ並べ、足りない分は無作為に足す。
      // こうすると、5ブロックのうち最大が1回か2回なので、残りの3〜4ブロックで3つの値が全部読まれる。
      sequence = shuffle(nonMax, rng);
      while (sequence.length < nonMaxBlocks.length) {
        sequence.push(nonMax[randInt(rng, nonMax.length)]);
      }
      sequence = shuffle(sequence, rng);
    } else {
      // 8枚の配置。最大以外の値の順位を低・中・高の帯に分け、ブロックごとに帯を回す。
      const buckets = rankBuckets(nonMax);
      const start = randInt(rng, buckets.length);
      sequence = nonMaxBlocks.map((_, i) => {
        const bucket = buckets[(start + i) % buckets.length];
        return bucket[randInt(rng, bucket.length)];
      });
    }
    nonMaxBlocks.forEach((b, i) => { targets[b][l] = sequence[i]; });
  });
  return targets;
}

// 第4部。配置8通りを4通りずつ2つの t に割り当てる。各ブロック（4試行）のうち1試行は最大の札。
// 返り値は [{ t, layoutIndices, targets }, ...]（提示する順）。順序は参加者番号の偶奇で入れ替える。
export function assignPart4({ participantId }) {
  const rng = mulberry32(hashSeed(participantId, "part4", "assign"));
  const order = shuffle(range(LAYOUTS.length), rng);
  const half = LAYOUTS.length / 2;
  const groups = [order.slice(0, half), order.slice(half)];
  const tOrder = Number(participantId) % 2 === 0
    ? PART4_T_LEVELS.slice()
    : PART4_T_LEVELS.slice().reverse();
  return tOrder.map((t, g) => {
    const layoutIndices = groups[g];
    const maxIndex = randInt(rng, layoutIndices.length);
    const targets = layoutIndices.map((l, i) => {
      const layout = LAYOUTS[l];
      return i === maxIndex ? layoutMax(layout) : randomNonMax(layout, rng);
    });
    return { t, layoutIndices, targets };
  });
}

// ---------- 試行の列 ----------

// 1試行の設計。buildPlan が組み立て、main.js が順に実行する。
function makeTrial({ part, blockIndex, blockPos, trialIndex, isPractice, t, layoutIndex, target }) {
  const layout = LAYOUTS[layoutIndex];
  const max = layoutMax(layout);
  return {
    docId: `${part}_${blockIndex}_${trialIndex}`,
    part,
    blockIndex,        // その部の中でのブロックの番号（0 から）
    blockPos,          // ウィリアムズ方陣の順序の中での位置（第1部と第3部）。それ以外は blockIndex と同じ
    trialIndex,        // ブロック内の試行の番号。0 は練習、1 以上が本試行
    isPractice,
    t,
    layoutId: layout.id,
    layoutName: layout.name,
    rows: layout.rows.map((r) => r.slice()),
    nCards: layoutValues(layout).length,
    maxValue: max,
    target,
    isMaxTarget: target === max,
    toneCount: target,  // 電子音の回数は読まれる札の値に等しい
  };
}

// 練習の試行を n 個作る。配置と読まれる札は無作為（最大の札も含む）。
function practiceTrials({ part, t, n, rng, blockIndex = 0 }) {
  const trials = [];
  for (let i = 0; i < n; i++) {
    const layoutIndex = randInt(rng, LAYOUTS.length);
    const values = layoutValues(LAYOUTS[layoutIndex]);
    const target = values[randInt(rng, values.length)];
    trials.push(makeTrial({
      part, blockIndex, blockPos: blockIndex, trialIndex: i + 1, isPractice: true,
      t, layoutIndex, target,
    }));
  }
  return trials;
}

// 第1部または第3部（5ブロック、各ブロックに練習1試行と本試行8試行）を作る。
function blockedPart({ participantId, partKey, trialsPerBlock }) {
  const order = blockOrderForParticipant(participantId);
  const targets = assignTargets({ participantId, partKey, nBlocks: order.length });
  const trials = [];
  order.forEach((levelIndex, b) => {
    const t = T_LEVELS[levelIndex];
    const rng = mulberry32(hashSeed(participantId, partKey, "block", b));
    // ブロックの最初の1試行の練習。配置と読まれる札は無作為。
    const pLayout = randInt(rng, LAYOUTS.length);
    const pValues = layoutValues(LAYOUTS[pLayout]);
    trials.push(makeTrial({
      part: partKey, blockIndex: b, blockPos: b, trialIndex: 0, isPractice: true,
      t, layoutIndex: pLayout, target: pValues[randInt(rng, pValues.length)],
    }));
    // 本試行。配置の順序を無作為にする。
    const layoutOrder = shuffle(range(LAYOUTS.length), rng).slice(0, trialsPerBlock);
    layoutOrder.forEach((l, i) => {
      trials.push(makeTrial({
        part: partKey, blockIndex: b, blockPos: b, trialIndex: i + 1, isPractice: false,
        t, layoutIndex: l, target: targets[b][l],
      }));
    });
  });
  return trials;
}

// 参加者番号から、実験全体の試行の列を作る。
// 返り値の各要素には、画面の流れの区切りに使う part と、記録の文書 ID になる docId が入る。
export function buildPlan({ participantId, testMode = false }) {
  const pid = Number(participantId);
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error("参加者番号は 1 以上の整数にしてください");
  }
  const trialsPerBlock = testMode ? TEST_MODE.trialsPerBlock : TRIALS_PER_BLOCK;
  const nInitialPractice = testMode ? TEST_MODE.initialPracticeTrials : INITIAL_PRACTICE_TRIALS;
  const nPart3Practice = testMode ? TEST_MODE.part3PracticeTrials : PART3_PRACTICE_TRIALS;
  const part4PerBlock = testMode ? TEST_MODE.part4TrialsPerBlock : LAYOUTS.length / 2;

  const plan = [];

  // 最初の練習（0.4秒で5試行）。
  plan.push(...practiceTrials({
    part: "practice", t: INITIAL_PRACTICE_T, n: nInitialPractice,
    rng: mulberry32(hashSeed(pid, "practice")),
  }));

  // 第1部。
  plan.push(...blockedPart({ participantId: pid, partKey: "part1", trialsPerBlock }));

  // 第2部（t = 0.2秒、配置8通り、1ブロック）。
  {
    const rng = mulberry32(hashSeed(pid, "part2", "block", 0));
    const targets = assignTargets({ participantId: pid, partKey: "part2", nBlocks: 1 });
    const layoutOrder = shuffle(range(LAYOUTS.length), rng).slice(0, trialsPerBlock);
    layoutOrder.forEach((l, i) => {
      plan.push(makeTrial({
        part: "part2", blockIndex: 0, blockPos: 0, trialIndex: i + 1, isPractice: false,
        t: PART2_T, layoutIndex: l, target: targets[0][l],
      }));
    });
  }

  // 第3部の練習（1.6秒で3試行）。
  plan.push(...practiceTrials({
    part: "part3practice", t: PART3_PRACTICE_T, n: nPart3Practice,
    rng: mulberry32(hashSeed(pid, "part3practice")),
  }));

  // 第3部。
  plan.push(...blockedPart({ participantId: pid, partKey: "part3", trialsPerBlock }));

  // 第4部。
  assignPart4({ participantId: pid }).forEach((block, b) => {
    const rng = mulberry32(hashSeed(pid, "part4", "order", b));
    const order = shuffle(range(block.layoutIndices.length), rng).slice(0, part4PerBlock);
    order.forEach((k, i) => {
      plan.push(makeTrial({
        part: "part4", blockIndex: b, blockPos: b, trialIndex: i + 1, isPractice: false,
        t: block.t, layoutIndex: block.layoutIndices[k], target: block.targets[k],
      }));
    });
  });

  plan.forEach((trial, i) => { trial.seq = i; });
  return plan;
}

// 画面の流れの区切り。main.js は plan を part ごとに切って、部の教示を挟む。
export const PART_ORDER = ["practice", "part1", "part2", "part3practice", "part3", "part4"];

export function splitPlanByPart(plan) {
  const map = new Map();
  for (const key of PART_ORDER) map.set(key, []);
  for (const trial of plan) map.get(trial.part).push(trial);
  return map;
}

// ---------- 候補の札と確定の判定 ----------

// k 回鳴った時点での候補の札。
// k 回目の音が低い音（k < target）なら、値 k の札はその時点で外れるので、値が k より大きい札が候補である。
// k 回目の音が最後の高い音（k >= target）なら、候補は読まれた札だけである。
// target を省くと、k 回目までの音がすべて低い音だったとみなす（値が k より大きい札）。
// 2026-11-02 に直した。それまでは値が k 以上の札を候補としており、音 1 つ分だけ遅れていた。
export function candidatesAfterTones(values, k, target) {
  if (target !== undefined && k >= target) return values.filter((v) => v === target);
  return values.filter((v) => v > k);
}

// k 回鳴った時点で、読まれる札が確定しているかどうか。
// 候補が target だけになったとき、または最後の音（k === target）が鳴ったときに確定する。
// 例：場に 5 と 8 があり 8 が読まれるとき、5 回目の音が低い音だと分かった時点（k = 5）で確定する。
export function isDeterminedAfterTones(values, target, k) {
  if (k >= target) return true;
  return candidatesAfterTones(values, k, target).length === 1;
}
