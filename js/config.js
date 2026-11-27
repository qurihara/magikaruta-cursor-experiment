// ==========================
// config.js
// ==========================
// 収集B（PCとマウスのアプリ）の設定。実験の設計に関わる数値は、
// すべてこのファイルの1か所で管理する。仕様書（collection-b-app-spec.md）の
// 第2節から第6節と第10節の値を写してある。
// ==========================

// アプリの版の数字。直したら必ず上げる。画面の右下に出す。
export const APP_VERSION = "v0.6.2";

// 電子音の間隔 t の5水準（秒）。参加者内の要因。
// v0.6.0 で 1.6 秒をやめて 0.6 秒を足した（栗原さんの通しの確認 Y11 のあとの決定）。予測の表で、値が隣り合う札への
// 移動が間に合う境目が 0.4 秒と 0.8 秒の間にあったので、その間を 1 水準で測る。水準の数は 5 のままなので、
// ウィリアムズ方陣の 10 通りの巡回は同じ形で使う。
export const T_LEVELS = [0.1, 0.2, 0.4, 0.6, 0.8];

// 第2部で固定する t（秒）。
export const PART2_T = 0.2;

// 第3部の練習で使う t（秒）と、その練習の試行数。v0.6.0 で 1.6 秒から 0.8 秒にした（t の水準から 1.6 秒を外したため）。
export const PART3_PRACTICE_T = 0.8;
export const PART3_PRACTICE_TRIALS = 3;

// 最初の練習で使う t（秒）と、その練習の試行数。
export const INITIAL_PRACTICE_T = 0.4;
export const INITIAL_PRACTICE_TRIALS = 5;

// 第4部で使う t の2水準（秒）。配置8通りを4通りずつ割り当てる。
export const PART4_T_LEVELS = [0.4, 0.8];

// 第2部の早い動きの判定（v0.6.0、I4）。最後の高い音の予定の時刻より前に、カーソルが開始ボタンの四角の外へ出た試行は、
// 試行のあとに知らせて、同じ試行をやり直す。やり直しは maxRetries 回までとし、その次の回（3 回目の試行）は、
// 早く動いてもそのまま記録して先へ進む。やり直した回の記録も、文書 ID の末尾に _early1、_early2 を付けて残す。
// v0.6.1（AA4）。3 回目にも早く動いたときは、やり直さずに記録して先へ進むが、finalNotice の知らせを出す（「次へ」で進む）。
export const PART2_EARLY_MOVE = {
  maxRetries: 2,
  notice: "最後の高い音が鳴る前に、開始ボタンから離れました。高い音を聞いてから動かしてください。",
  finalNotice: "最後の高い音が鳴る前に動きました。これからの試行では、高い音を聞いてから動かしてください。",
};

// 開始ボタンのそばに出す案内（v0.6.0、I1 と I4）。開始のあとの無作為の待ち（TIMING.waitMinMs〜waitMaxMs）は変えない。
export const START_HINTS = {
  all: "札の配置を覚えたら、開始を押してください",
  part2: "開始ボタンの真ん中あたりを押してください",
  part2Waiting: "ここで待つ",
};

// 第3部の練習の画面に出す、ハイライトの説明（v0.6.0、I6）。
export const PART3_PRACTICE_GUIDE_NOTE = "練習の目印：いま乗せるべき札を光らせています。光っている札にカーソルを移してください（本番では光りません）";

// 第3部の教示の画面に出す動きの見本（v0.6.0、I5）。札 5 6 7 8 の小さな盤面で、7 が読まれる場合を、音の間隔 0.8 秒で自動で動かす。
export const PART3_DEMO = { rows: [[5, 6, 7, 8]], target: 7, t: 0.8 };

// 最初の練習の前に見せる、ルール紹介の映像の基本の部分（v0.6.0、I3）。
// v0.6.0 では majikaruta-reader/video/magikaruta-rules.mp4 の 18.0 秒から 41.05 秒（場面 s03「音の聞き方」）を切り出していた。
// v0.6.1（AA5）で、demo-video の作品 majikaruta-rules-task の場面 s03task（s03 のナレーションと図を課題の操作に合わせた変種。
// 「開始」を押すと、少し待ってから電子音が鳴る。準備の音と「読む」のボタンは無い）を書き出し、960×540 に縮めたものに替えた。
export const RULES_VIDEO = {
  src: "video/rules-basic.mp4",
  durationSec: 23.0,
};

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
  // 8枚・疎の集合は 2026-11-02 に {2,3,5,6,8,9,11,12} から替えた。値の差 2 の札を小さい側にまとめ、
  // 読まれる札が 1、3、5、7、9 の試行では値の差 2 の移動だけで囲い手が進むようにした（予測の表で、旧集合は
  // 2 と 3 の差 1 のために 8枚・密と区別されなかった）。散らばりの並びは配置 6 と同じ位置の並び。
  { id: 7, name: "8枚・疎・値順", rows: [[1, 3, 5, 7], [9, 10, 11, 12]] },
  { id: 8, name: "8枚・疎・散らばり", rows: [[1, 9, 11, 5], [7, 12, 10, 3]] },
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

// 計測に使う機械の名前（v0.4.0）。会場の PC ごとに運営者の画面で選ぶか、参加用の URL の ?machine= で渡す。
// A と B は omen1 と同じ型の Windows、C と D は古い Surface。機械の違いを分析で取り除くために記録する。
export const MACHINES = [
  { value: "", label: "（選ぶ）" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "other", label: "そのほか" },
];

// 教示の文。仕様書の第3節の文をそのまま使う。
// v0.6.0 で、栗原さんの通しの確認（Y11）のあとの決定 I3、I4、I5、I8、I9 に合わせて書き替えた。
// part3 と part4 は段落の配列で、画面では 1 つの要素を 1 つの段落にする。
export const INSTRUCTIONS = {
  part1: "最後の高い音が鳴ったら、正しい札をできるだけ早くクリックしてください。違う札をクリックするとお手つきです。正しい札が分かったら、最後の高い音を待たずにクリックしてもかまいません。",
  part2: "開始を押したら、カーソルを開始ボタンの上に置いたまま待ち、最後の高い音が聞こえたら札へ動かしてください。",
  part3: [
    "第3部では、次の動き方を試していただきます。",
    "開始を押したら、最初の音が鳴る前から、いちばん小さい数字の札の上で待ってかまいません。",
    "1. 音が鳴っている間は、まだ読まれる可能性のある札のうち、いちばん小さい数字の札の上にカーソルを乗せて待ちます。",
    "2. その数字の回数まで鳴っても低い音が続いたら、その札は読まれていません。次に小さい札へカーソルを移します。",
    "3. 最後の高い音が鳴ったら、そのとき乗っている札をクリックします。",
    "音の間隔が短いと、手を移すのが間に合わないことがあります。間に合わなくてもかまわないので、なるべくこの動き方を試してください。",
  ],
  part4: [
    "ここからは、どの動き方でもかまいません。第2部のように最後の高い音を聞いてから動いても、第3部のように候補の札の上で待ちながら動いても、それ以外の動き方でもかまいません。",
    "正しい札を、できるだけ早くクリックしてください。正しい札が分かったら、最後の高い音を待たずにクリックしてもかまいません。",
  ],
};

// オンラインの募集（Yahoo!クラウドソーシング）の設定（v0.5.0）。
// URL に ?wid=（作業者ID、半角英数 1〜20 文字）が付いているときだけ、オンラインの流れになる。
// ?wid= が無いときは、これまでどおり運営者の画面から始める対面の流れで、ここの制限と完了コードの条件は働かない。
// 手本は丸山さんの Hick の実験（magicalta-study/MJKaruta/experiment/lamp-rt/app.js）。
export const ONLINE = {
  // オンラインの流れのイベント名の既定。URL の ?event= で替えられる。
  defaultEvent: "yahoo-2026-12",
  // Yahoo のチェック設問の解答にする、全員共通の3桁の完了コード（仮の値）。
  // 設問ファイル（Y9）を作るときに決め直し、ここと設問ファイルの両方を同じ値にする。
  completionCode: "582",
  // 端末の条件。幅は丸山さんの実験と同じ 760px。高さは盤面と開始ボタン（board.js の stageHeight = 646px）が
  // 画面に収まる値にした。高さが足りないときは、全画面表示（F11）かウィンドウを広げるよう案内する。
  minInnerWidth: 760,
  minInnerHeight: 660,
  // 練習の合格条件。最初の練習（5回）のあとで正解が practicePassCorrect 回に届かなければ、
  // 届くまで練習を1回ずつ足す。練習の合計が practiceMaxTrials 回に達しても届かなければ打ち切る（failed_practice）。
  practicePassCorrect: 2,
  practiceMaxTrials: 15,
  // 完了コードを出す条件。本試行（練習を除く）のうち、時間切れでない回の割合がこの値以上。
  // 放置してコードだけ取る参加を止めるための条件で、正答率は見ない。
  minAnsweredRatio: 0.7,
  // 同じブラウザで完了した記録を残す localStorage の鍵。テストモード（?test=1）では書かない。
  doneKey: "collectionB.onlineDone",
  // 倫理審査の承認番号（v0.5.1）。同意の画面の説明文の「11．倫理審査」に出す。空のときは番号の括弧を出さない。
  // 結果通知書の PDF から栗原さんが読み取り、掲載文の承認番号と同じ値を入れる（台帳ではまだ未転記）。
  ethicsApprovalNumber: "TN2611",
  // 記録の削除の請求と問い合わせの宛先（v0.5.1）。承認済みの参加者説明文書の「10．研究責任者・連絡先」と同じ。
  contactEmail: "kurihara@tsuda.ac.jp",
  // 部と部の間の休憩の画面（v0.5.1）で知らせる、募集のページの制限時間（分）。掲載文の第1節の値と同じ。
  timeLimitMinutes: 60,
};

// オンラインの流れの最後の質問の年齢層の選択肢（v0.5.1）。承認済みの研究計画書の別紙の Q1 と同じ区切り。
// 対面の流れは、これまでどおり index.html の選択肢（9 歳以下から 60 歳以上）を使う。
export const ONLINE_AGE_BANDS = [
  { value: "18-19", label: "18〜19歳" },
  { value: "20s", label: "20代" },
  { value: "30s", label: "30代" },
  { value: "40s", label: "40代" },
  { value: "50s", label: "50代" },
  { value: "60s", label: "60代" },
  { value: "70plus", label: "70代以上" },
  { value: "noanswer", label: "答えない" },
];

// オンラインの流れで、部の終わりに休憩の画面を出す部と、全4部のうち何部目か（v0.5.1）。
// 承認済みの参加者説明文書の「所要時間は約〈◯〉分です（途中に休憩があります）」と、申請書の「途中に休憩を設ける」に合わせる。
// 第4部のあとは最後の質問なので、休憩の画面を出さない。
export const REST_AFTER_PARTS = { part1: 1, part2: 2, part3: 3 };
export const MAIN_PART_COUNT = 4;
