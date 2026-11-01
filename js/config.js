// ==========================
// config.js
// ==========================
// 収集B（PCとマウスのアプリ）の設定。実験の設計に関わる数値は、
// すべてこのファイルの1か所で管理する。仕様書（collection-b-app-spec.md）の
// 第2節から第6節と第10節の値を写してある。
// ==========================

// アプリの版の数字。直したら必ず上げる。画面の右下に出す。
export const APP_VERSION = "v0.2.1";

// 電子音の間隔 t の5水準（秒）。参加者内の要因。
export const T_LEVELS = [0.1, 0.2, 0.4, 0.8, 1.6];

// 第2部で固定する t（秒）。
export const PART2_T = 0.2;

// 第3部の練習で使う t（秒）と、その練習の試行数。
export const PART3_PRACTICE_T = 1.6;
export const PART3_PRACTICE_TRIALS = 3;

// 最初の練習で使う t（秒）と、その練習の試行数。
export const INITIAL_PRACTICE_T = 0.4;
export const INITIAL_PRACTICE_TRIALS = 5;

// 第4部で使う t の2水準（秒）。配置8通りを4通りずつ割り当てる。
export const PART4_T_LEVELS = [0.4, 0.8];

// 1ブロックの試行数（配置の数と同じ）。
export const TRIALS_PER_BLOCK = 8;

// 各ブロックの8試行のうち、読まれる札が盤面で最大の値の札である試行の数。
export const MAX_TARGET_TRIALS_PER_BLOCK = 2;

// 8通りの配置。row は 0 が上段（敵陣）、1 が下段（自陣）。4枚の配置は中段1列なので row は 0 だけ。
// cards は左から右の順に並べた札の値。仕様書の第5節の表と同じ。
export const LAYOUTS = [
  { id: 1, name: "4枚・密・値順", rows: [[5, 6, 7, 8]] },
  { id: 2, name: "4枚・密・散らばり", rows: [[6, 8, 5, 7]] },
  { id: 3, name: "4枚・疎・値順", rows: [[2, 5, 8, 11]] },
  { id: 4, name: "4枚・疎・散らばり", rows: [[5, 11, 2, 8]] },
  { id: 5, name: "8枚・密・値順", rows: [[1, 2, 3, 4], [5, 6, 7, 8]] },
  { id: 6, name: "8枚・密・散らばり", rows: [[1, 5, 7, 3], [4, 8, 6, 2]] },
  { id: 7, name: "8枚・疎・値順", rows: [[2, 3, 5, 6], [8, 9, 11, 12]] },
  { id: 8, name: "8枚・疎・散らばり", rows: [[2, 8, 11, 5], [6, 12, 9, 3]] },
];

// 札と盤面の寸法（CSSピクセル）。画面の大きさに応じて拡大縮小しない。
export const BOARD = {
  cardWidth: 120,      // 札の幅（実物の 52 mm に当たる）
  cardHeight: 165,     // 札の高さ（実物の 73 mm に当たる）
  cardGap: 40,         // 横に並ぶ札どうしの間隔
  rowGap: 60,          // 上段と下段の間隔
  startButtonOffset: 200, // 盤面の下端から開始ボタンまでの距離
  startButtonWidth: 160,
  startButtonHeight: 56,
};

// 電子音。
export const AUDIO = {
  toneHz: 880,          // 通常の音の高さ
  lastToneHz: 1760,     // 最後の音の高さ（1オクターブ上）
  maxToneDurationSec: 0.08, // 各音の長さの上限。実際の長さは min(t/2, この値)
  gain: 0.3,            // 音量（0から1）。運営者の画面で変えられる
  attackSec: 0.005,     // 音の立ち上がり（クリック音を避けるための短い傾斜）
  releaseSec: 0.01,     // 音の減衰
};

// 試行の進め方（ミリ秒）。
export const TIMING = {
  waitMinMs: 500,        // 開始のクリックから最初の音までの無作為の待ちの下限
  waitMaxMs: 1000,       // 同じく上限
  feedbackMs: 1200,      // 結果（正解、お手つき）を表示する時間
  responseTimeoutMs: 6000, // 最後の音のあと、クリックが無いまま試行を打ち切るまでの時間
  movementOnsetThresholdPx: 8, // 動き出しと判定する、開始位置からの距離
};

// テストモード（URL に ?test=1）の設定。各ブロックの試行を減らし、2分ほどで全体を通せるようにする。
export const TEST_MODE = {
  trialsPerBlock: 2,
  initialPracticeTrials: 2,
  part3PracticeTrials: 1,
  part4TrialsPerBlock: 2,
  feedbackMs: 500,
};

// 試行の記録の保存先（IndexedDB）。
export const STORAGE = {
  dbName: "collection-b",
  dbVersion: 1,
  calibrationKey: "collectionB.calibration",
  settingsKey: "collectionB.settings",
};

// 群の値（参加者間の要因）。アンケートの申告で決める。
export const GROUPS = [
  { value: "general", label: "一般" },
  { value: "experienced", label: "競技かるたの経験者" },
];

// 教示の文。仕様書の第3節の文をそのまま使う。
export const INSTRUCTIONS = {
  part1: "最後の高い音が鳴ったら、正しい札をできるだけ早くクリックしてください。違う札をクリックするとお手つきです。",
  part2: "音が鳴っている間はカーソルを動かさず、最後の高い音を聞いてから札へ動かしてください。",
  part3: "音が鳴り続けている間は、いま候補になっている札のうち最も小さい値の札の上にカーソルを置いて待ち、音が続いたら次に小さい札へ移ってください。最後の高い音が鳴ったら、そのとき乗っている札をクリックしてください。",
  part4: "ここからは、どの動き方でもかまいません。最後の高い音が鳴ったら、正しい札をできるだけ早くクリックしてください。",
};
