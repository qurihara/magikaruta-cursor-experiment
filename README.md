# 収集B（PC とマウスのアプリ）

まじかるたの「最速囲い手」を PC とマウスで測る心理実験の Web アプリです。
仕様の正本は、同じ案件フォルダにある `collection-b-app-spec.md`（2026-10-30 版）です。
実験計画の正本は cosense（kuri-lab-Maruyama）の「2026/12月まじかるた中山ワークショップ向け実験計画」にあります。

依存するパッケージは無く、ビルド工程もありません。Firebase の SDK は CDN の ES モジュールから読み込みます。
版の数字は `js/config.js` の `APP_VERSION` の 1 か所で管理し、画面の右下に出します。直したら必ず上げてください。

## 動かし方

このアプリは ES モジュール（`<script type="module">`）と IndexedDB を使うので、`file://` では動きません。
ローカルサーバで配信してください。たとえば、このフォルダで次を実行します。

```
python3 -m http.server 8765
```

そのうえで、ブラウザ（Chrome をおすすめします）で次を開きます。

- 本番: `http://localhost:8765/index.html`
- テストモード: `http://localhost:8765/index.html?test=1`

テストモードでは、各ブロックの本試行を 2 試行に、最初の練習を 2 試行に、第3部の練習を 1 試行に減らし、
結果の表示も短くします（`js/config.js` の `TEST_MODE`）。全体で 39 試行になり、3〜4 分で通せます。
テストモードの記録は、セッション ID の末尾に `_test` が付くので、本番の記録と混ざりません。
テストモードでは、画面の左上の進捗の表示に、読まれる札の値も出します。

Firebase Hosting に置くときは、`firebase.json` の雛形（Hosting の public がリポジトリの根）を使います。
`.firebaserc` の `default` に Firebase のプロジェクト ID を入れてから `firebase deploy --only hosting` を実行します。

## 画面の流れ

1. 運営者の画面。参加者番号、群（一般、競技かるたの経験者）、イベント名、音量を入力して「この参加者で開始」を押します。
   較正の画面、記録の書き出し（JSON、試行の CSV、軌道の CSV）、未送信の記録の再送もここにあります。
2. 参加者への説明と、音量の確認（「音を鳴らす」を押すと、通常の音 2 回と最後の高い音 1 回が鳴ります）。
3. 練習（0.4 秒で 5 試行）。
4. 第1部（5 ブロック。ブロックの前に t を知らせ、1 試行の練習、8 試行）。
5. 第2部の教示、8 試行（t = 0.2 秒）。
6. 第3部の教示、1.6 秒で 3 試行の練習（いま乗るべき札を黄色い枠で示します）、5 ブロック。
7. 第4部の教示、8 試行（0.4 秒と 0.8 秒を 4 試行ずつ。順序は参加者番号の偶奇で入れ替え）。
8. アンケート（競技かるたの経験、年齢の帯、利き手、まじかるたを遊んだことがあるか）。
9. 終了の画面。送信の状態を表示します。

各試行は、画面の下中央の「開始」のボタンをクリックすると始まります。クリックの位置がその試行の開始位置になり、
0.5 秒から 1.0 秒の無作為の待ちのあとに電子音が始まります。盤面の上でクリック（pointerdown）した時点で試行が終わり、
正解か「お手つき」かを即座に表示します。札の外をクリックした場合もお手つきとして扱います（クリックした札は空）。
最後の音のあと 6 秒たってもクリックが無ければ「時間切れ」として打ち切り、その旨を記録します。

## 中断と再開

試行の記録は、1 試行が終わるたびに IndexedDB に保存されます。文書 ID は `{part}_{blockIndex}_{trialIndex}` で決定的なので、
途中でブラウザを閉じても、同じ参加者番号とイベント名で「この参加者で開始」を押すと、保存済みの試行を飛ばして続きから始められます。
運営者の画面で参加者番号を入れると、保存済みの試行の数を知らせます。

同じ参加者番号で最初からやり直したいときは、別のイベント名を使うか、ブラウザの IndexedDB（`collection-b`）を消してください。

## Firebase の設定の差し込み方

1. Firebase コンソール（https://console.firebase.google.com/）でプロジェクトを作るか、既存のプロジェクトを選びます。
2. 「構築」→「Authentication」→「Sign-in method」で「匿名」を有効にします。
3. 「構築」→「Firestore Database」でデータベースを作ります（本番モードで作り、ルールは `firestore.rules` の内容に置き換えます）。
4. 「プロジェクトの設定」（歯車）→「全般」→「マイアプリ」で Web アプリを追加し、「SDK の設定と構成」で「構成」を選ぶと
   `firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... }` が表示されます。
5. その値を `js/firebase-config.js` の `window.FIREBASE_CONFIG` に貼ります。
6. `apiKey` と `projectId` が入っていると、アプリは起動時に匿名でサインインし、試行の記録を Firestore に送ります。
   空のままだと Firebase を読み込まず、この PC の IndexedDB への保存だけで動きます。

Firestore の構造は次のとおりです（Kikiwake v6 の `firebase/schema.md` の設計原則に準じます）。

```
sessions/{sessionId}                       ← sessionId = {イベント名}_p{参加者番号}（テストモードは末尾に _test）
sessions/{sessionId}/trials/{part}_{blockIndex}_{trialIndex}   ← 1 試行の記録（軌道を含む）
```

セッションの文書には、参加者番号、群、イベント名、開始と終了の時刻、環境、アンケート、進捗（completedTrialCount）を置きます。
このアプリは個人情報を保存しません。文書 ID が決定的なので、同じ試行を 2 回送っても上書きになるだけで、二重に数えられません。
Firestore のオフライン永続化を有効にしてあり、回線が切れていても送信は待ち行列に残ります。
加えて、送信が確認できた試行には IndexedDB の側に `sent: true` の印を付け、確認できなかった試行は、
起動時、終了の画面、運営者の画面の「未送信の記録を再送する」で再送します。

## 較正の手順（運営者の画面 →「較正の画面」）

較正の値は localStorage（`collectionB.calibration`）に保存され、各セッションの環境の記録（`env.calibration`）に含まれます。
実験に使う PC ごとに、本番の前に 1 回行ってください。画面の解像度や拡大率を変えたら、やり直してください。

1. 画面の較正。画面に出る黒い枡の幅を、定規で測って 100 mm になるように数値を変え、「画面の較正を保存」を押します。
   1 mm あたりの CSS ピクセル数（`screenPxPerMm`）が得られます。
2. マウスの較正。マウスの横に定規を置き、「開始」を押してから、マウスを定規に沿って 100 mm 動かし、その位置でそのままクリックします（画面のどこでもかまいません）。
   これを 3 回行います。カーソルの移動量の平均から、手の 1 mm あたりのカーソルの移動ピクセル数（`mousePxPerMm`）が得られます。
3. マウスの CPI の推定（任意）。枠をクリックするとポインタがロックされ、`unadjustedMovement: true` で生の移動カウントを読みます。
   マウスを 100 mm 動かしてからもう一度クリックすると、CPI（`mouseCpi`）が得られます。
   ブラウザや OS によっては unadjustedMovement が使えず、その場合は加速の掛かった値になります。

## 本番前の確認事項

- OS のポインタの加速を切る。macOS は「システム設定」→「マウス」→「軌跡の速さ」の下にある「ポインタの加速」を切る
  （設定に項目が無い版では `defaults write -g com.apple.mouse.scaling -1` を実行してログインし直す）。
  Windows は「マウスのプロパティ」→「ポインター オプション」→「ポインターの精度を高める」を外す。
- 画面の解像度と拡大率（devicePixelRatio）を固定し、較正をやり直す。ブラウザの拡大率は 100% にする（Ctrl+0 または Cmd+0）。
- ブラウザのウィンドウを十分に大きくする（盤面と開始ボタンで縦 650 CSS ピクセル以上が要る。全画面表示をおすすめします）。
- 音量を固定し、運営者の画面の「音を鳴らして確かめる」で聞こえることを確かめる。音量の値は環境の記録（`env.audioGain`）に入る。
- 同じマウスを使う。マウスを替えたら、マウスの較正をやり直す。
- 参加者番号は 1 から順に付ける（ウィリアムズ方陣の 10 通りの順序を参加者番号で巡回させるため）。
- テストモードで 1 回通し、運営者の画面から JSON を書き出して中身を確かめる。
- Firebase を使うなら、`js/firebase-config.js` に設定が入っていること、運営者の画面に「Firebase: 設定あり」と出ることを確かめる。

## 記録の項目

1 試行の記録（JSON の `trials[]` の各要素、Firestore の `trials/{docId}`）の項目は次のとおりです。
これらの時刻のうち `startedAt` だけが Date（ISO 8601）で、それ以外の時刻はすべて `performance.now` の時間軸（ページの読み込みからのミリ秒）です。

| 項目 | 内容 |
|---|---|
| `docId`, `seq` | 文書 ID（`{part}_{blockIndex}_{trialIndex}`）と、試行の列の中での通し番号 |
| `sessionId`, `participantId`, `group`, `eventName`, `appVersion`, `testMode` | セッションの識別 |
| `part` | `practice`（最初の練習）、`part1`、`part2`、`part3practice`、`part3`、`part4` |
| `blockIndex`, `blockPos`, `trialIndex`, `isPractice` | ブロックの番号、ウィリアムズ方陣の順序の中の位置、ブロック内の試行の番号（0 は練習）、練習の印 |
| `t` | 電子音の間隔（秒） |
| `layoutId`, `layoutName`, `layoutRows`, `nCards`, `maxValue` | 配置の番号（1〜8）と名前、札の並び（段ごとの文字列）、札の数、最大の値 |
| `target`, `isMaxTarget`, `toneCount` | 読まれた札、最大の札が読まれたかどうか、電子音の回数 |
| `startedAt` | 開始ボタンのクリックの時刻（ISO 8601、Date はこの 1 回だけ） |
| `startClick` | 開始ボタンのクリックの位置（`x`, `y`、ビューポート座標の CSS ピクセル）と時刻（`perf`, `timeStamp`） |
| `waitMs` | 開始のクリックから最初の音までの待ち（0.5〜1.0 秒の無作為） |
| `toneTimesPerf`, `firstTonePerf`, `lastTonePerf`, `toneDurationMs` | 各音の開始時刻（予約値を performance.now に換算）、最初と最後の音、各音の長さ |
| `audioBase` | 換算に使った基準（`basePerfNow`, `baseCtxTime`）、AudioContext の遅延と標本化周波数 |
| `click` | クリックの位置と時刻、クリックした札（`card`、札の外なら null）、正誤（`correct`）、その時点までの音の数（`toneCountAtClick`）、最後の音より前か（`beforeLastTone`）、その時点で札が確定していたか（`determinedAtClick`）、候補の札（`candidatesAtClick`）、最後の音からの時間（`msFromLastTone`） |
| `timedOut`, `endPerf` | 時間切れの印と、試行の終了時刻 |
| `cardRects`, `boardRect`, `startButtonRect` | 各札、盤面、開始ボタンの画面上の矩形（ビューポート座標） |
| `path` | 軌道。`x`, `y`, `t`, `src` の 4 つの平らな配列。`src` は 0 が pointermove、1 が getCoalescedEvents で展開した出来事 |
| `rawPath` | pointerrawupdate の軌道（`x`, `y`, `t`）。使えないブラウザでは空 |
| `pathPointCount`, `rawPathPointCount`, `moveEventCount` | 軌道の点の数と、pointermove の出来事の数 |
| `derived.movementOnsetPerf`, `derived.movementOnsetMsFromFirstTone` | 動き出しの時刻（開始位置から 8 ピクセルを超えて離れた最初の点）と、最初の音からの時間 |
| `derived.cardAtLastTone`, `derived.onCorrectCardAtLastTone` | 最後の音の時点でカーソルが乗っていた札と、それが正しい札だったか |
| `derived.cardAtEachTone` | 各音の開始時点でカーソルが乗っていた札（最速囲い手の遵守の確認に使う） |
| `derived.acquisitionTimeMs` | 取得時間（最後の音からクリックまで）。最後の音より前のクリックでは負の値 |
| `derived.pathLengthPx`, `derived.straightLinePx` | 軌道の長さと、開始位置からクリックまでの直線距離 |
| `env` | 環境。`screenWidth`, `screenHeight`, `devicePixelRatio`, `innerWidth`, `innerHeight`, `userAgent`, `platform`, `hasCoalescedEvents`, `hasPointerRawUpdate`, `timeOrigin`, `audioGain`, `calibration` |
| `sent` | Firestore への送信が確認できたか（IndexedDB と JSON だけ。Firestore には入れない） |

セッションの記録（JSON の `sessions[]`、Firestore の `sessions/{sessionId}`）には、
`sessionId`, `participantId`, `group`, `eventName`, `testMode`, `appVersion`, `startedAt`, `resumedAt`, `resumeCount`,
`planLength`, `completedTrialCount`, `lastTrialDocId`, `env`, `survey`（`experience`, `years`, `grade`, `ageBand`, `handedness`, `playedMajikaruta`）,
`finishedAt`, `status` が入ります。

## CSV の列

### 試行の CSV（`collection-b_trials_*.csv`、1 試行が 1 行）

| 列 | 内容 |
|---|---|
| `session_id`, `participant_id`, `group`, `event_name`, `app_version`, `test_mode` | セッションの識別 |
| `doc_id`, `seq`, `part`, `block_index`, `block_pos`, `trial_index`, `is_practice` | 試行の識別（上の記録の項目と同じ） |
| `t`, `layout_id`, `layout_name`, `layout_rows`, `n_cards`, `max_value`, `target`, `is_max_target`, `tone_count` | 試行の設計 |
| `started_at`, `start_x`, `start_y`, `start_perf`, `wait_ms` | 開始のクリックと待ち |
| `first_tone_perf`, `last_tone_perf`, `tone_times_perf`, `tone_duration_ms` | 電子音の時刻（`tone_times_perf` は空白区切り） |
| `click_x`, `click_y`, `click_perf`, `click_card`, `correct`, `tone_count_at_click`, `before_last_tone`, `determined_at_click`, `ms_from_last_tone`, `ms_from_first_tone`, `timed_out` | クリック |
| `movement_onset_perf`, `movement_onset_ms_from_first_tone`, `card_at_last_tone`, `on_correct_card_at_last_tone`, `card_at_each_tone`, `acquisition_time_ms`, `path_length_px`, `straight_line_px` | 導出の指標（`card_at_each_tone` は空白区切り、札の外は `-`） |
| `path_point_count`, `raw_path_point_count`, `move_event_count` | 軌道の点の数 |
| `screen_width`, `screen_height`, `device_pixel_ratio`, `inner_width`, `inner_height` | 画面 |
| `screen_px_per_mm`, `mouse_px_per_mm`, `mouse_cpi` | 較正の値 |
| `sent` | 送信が確認できたか |

### 軌道の CSV（`collection-b_paths_*.csv`、1 点が 1 行）

| 列 | 内容 |
|---|---|
| `session_id`, `doc_id`, `seq`, `part`, `t`, `layout_id`, `target` | 試行の識別 |
| `idx` | その試行の軌道の中での点の番号 |
| `x`, `y` | 位置（ビューポート座標、CSS ピクセル） |
| `t_perf` | 時刻（performance.now の時間軸、ミリ秒） |
| `t_from_first_tone_ms` | 最初の音からの時間（ミリ秒） |
| `src` | 0 が pointermove、1 が getCoalescedEvents で展開した出来事、2 が pointerrawupdate |

## 検査

```
node --test test/*.test.js
```

`test/design.test.js` が、ウィリアムズ方陣、ブロックの順序、読まれる札の割り当て、試行の列の性質を検査します
（第1部と第3部で 5 水準 × 8 配置が各 1 回ずつ、各ブロックの最大の札がちょうど 2 試行、4 枚の配置で 4 つの値が各 1 回以上、
同じ参加者番号なら同じ割り当て、参加者番号 1 から 10 で 10 通りの順序、など）。

## ファイルの構成

| ファイル | 役割 |
|---|---|
| `index.html` | 1 枚のページ。画面を切り替える |
| `style.css` | 見た目。寸法は `js/config.js` で決める |
| `js/config.js` | t の 5 水準、8 通りの配置、札の寸法、音の高さ、試行数、テストモード、版の数字、教示の文 |
| `js/design.js` | 純粋関数。ブロックの順序、配置の順序、読まれる札の割り当て、試行の列、候補と確定の判定 |
| `js/audio.js` | Web Audio で電子音を予約し、各音の performance.now 換算の時刻を返す |
| `js/board.js` | 盤面の描画（CSS ピクセル固定）、札の当たり判定、開始ボタン、結果の表示 |
| `js/recorder.js` | pointermove（getCoalescedEvents）と pointerrawupdate の記録、1 試行の記録の組み立て、導出の指標 |
| `js/storage.js` | IndexedDB への保存、Firestore への送信（設定が空ならスキップ）、JSON と CSV の書き出し、較正と設定の保存 |
| `js/firebase-init.js` | Firebase Auth（匿名）と Firestore の薄いラッパー。設定があるときだけ動的に読み込む |
| `js/firebase-config.js` | Firebase の設定の雛形（空） |
| `js/calibration.js` | 較正の画面 |
| `js/main.js` | 画面の流れ全体 |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase Hosting と Firestore の雛形 |
| `test/design.test.js` | design.js の検査 |

## デバッグの手がかり

`window.__collectionB` に状態（`state.session`, `state.plan`, `state.current`, `state.lastTones`）と、
直前の試行の記録（`lastRecord`）を公開しています。ブラウザの開発者ツールから読めます。
