# 収集B（PC とマウスのアプリ）

まじかるたの「最速囲い手」を PC とマウスで測る心理実験の Web アプリです。
仕様の正本は、同じ案件フォルダにある `collection-b-app-spec.md`（2026-10-30 版）です。
実験計画の正本は cosense（kuri-lab-Maruyama）の「2026/12月まじかるた中山ワークショップ向け実験計画」にあります。

依存するパッケージは無く、ビルド工程もありません。
記録は、まずその PC の IndexedDB に保存し、加えて Google Apps Script（GAS）の Web アプリへ送って、
試行の要約を Google スプレッドシートに、カーソルの軌道を Google Drive の JSON ファイルに保存します（下の「記録の送信先（GAS）」）。
版の数字は `js/config.js` の `APP_VERSION` の 1 か所で管理し、画面の右下に出します。直したら必ず上げ、末尾の「変更履歴」に 1 行書いてください。

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

会場の PC では、このフォルダをそのまま置いてローカルサーバで配信するか、GitHub Pages などの静的な配信に置きます。
Firebase Hosting に置くこともできます（`firebase.json` の雛形。`.firebaserc` の `default` にプロジェクト ID を入れてから `firebase deploy --only hosting`）。

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
正解か「お手つき」かを即座に表示します。札の外（札と札のすき間や盤面の外）をクリックしても、お手つきにはせず試行を続け、そのクリックの位置と時刻を `offCardClicks` に、回数を `offCardClickCount` に残します（2026-11-02 に決めた。競技かるたで畳に触れてもお手つきにならないのと同じ扱い）。参加者が札をクリックするか、時間切れになった時点で、その試行が終わります。
最後の音のあと 6 秒たってもクリックが無ければ「時間切れ」として打ち切り、その旨を記録します。

## 中断と再開

試行の記録は、1 試行が終わるたびに IndexedDB に保存されます。文書 ID は `{part}_{blockIndex}_{trialIndex}` で決定的なので、
途中でブラウザを閉じても、同じ参加者番号とイベント名で「この参加者で開始」を押すと、保存済みの試行を飛ばして続きから始められます。
運営者の画面で参加者番号を入れると、保存済みの試行の数を知らせます。

同じ参加者番号で最初からやり直したいときは、別のイベント名を使うか、ブラウザの IndexedDB（`collection-b`）を消してください。

## 記録の送信先（GAS）

送信先は `js/upload-config.js` の 1 ファイルで決めます。`UPLOAD_TARGET` が `"gas"`（既定）、`"firebase"`、`"none"` のどれかで、
`GAS_URL` に Apps Script の Web アプリの URL を入れます。`GAS_URL` が空のままだと、アプリは何も送らず、この PC の IndexedDB への保存だけで動きます。
このリポジトリには、GAS の URL のほかに鍵や認証情報を書きません。

### GAS 側に書かれるもの

| 場所 | 中身 |
|---|---|
| スプレッドシートの「trials」シート | 1 試行が 1 行。列は `js/summary.js` の `TRIAL_COLUMNS`（`gas/Code.gs` の同名の配列と同じ並び）。軌道そのものは含まず、点の数と、詳細の JSON のファイル名（`detailFile`）とファイル ID（`detailFileId`）を持つ |
| スプレッドシートの「sessions」シート | 1 セッションが 1 行。開始、環境、アンケート、終了を、同じ行に上書きする（`sessionId` で行を探す） |
| Drive の `collection-b-data/{sessionId}/{docId}.json` | 軌道（`path`、`rawPath`）、札と盤面と開始ボタンの矩形（`cardRects`、`boardRect`、`startButtonRect`）、電子音の時刻、クリック。`collection-b-data` はスプレッドシートと同じフォルダに自動で作られる |

二重書き込みは、GAS 側が `rowKey`（`{sessionId}/{docId}`）の列を探して同じ行に上書きすることで防ぎます。
Drive の JSON も、同じ名前があれば中身を置き換えます。したがって、同じ試行を何度再送しても、行もファイルも増えません。
同時に届いた書き込みは、スクリプトのロック（待ちは 30 秒まで）で 1 件ずつ処理します。

クライアントは、各試行の結果を表示したあと（次の試行までの間）に 1 試行分を 1 回の POST で送り、応答の `ok` が true のときだけ
IndexedDB の `sent` の印を立てます。回線が切れていれば印は立たず、起動時、終了の画面、運営者の画面の「未送信の記録を再送する」で送り直します。
セッションの行は、開始のときとアンケートのあとに送り、未送信なら再送のときに一緒に送ります。

### GAS のデプロイの手順（栗原さんが行う）

1. Google ドライブで、記録を集めるフォルダを決め、その中に新しいスプレッドシートを作ります（名前は、たとえば「collection-b 記録 2026-12」）。
   このスプレッドシートと同じフォルダに、軌道の JSON を置く `collection-b-data` フォルダが自動で作られます。
2. そのスプレッドシートのメニューから「拡張機能」→「Apps Script」を開きます。
3. エディタに最初からある `コード.gs` の中身を消し、このリポジトリの `gas/Code.gs` の中身を貼ります。
4. 左の歯車「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」を入れ、
   エディタに現れた `appsscript.json` の中身を、このリポジトリの `gas/appsscript.json` の中身に置き換えます（Drive の権限の範囲と、Web アプリの設定が入っています）。
5. エディタの上の関数の選択で `selfTest` を選んで「実行」を押し、権限の承認の画面で承認します。
   「trials」と「sessions」のシートに 1 行ずつ、Drive に `collection-b-data/selftest_p0_test/practice_0_1.json` ができていれば、GAS 側は動いています。
   この確認の行とファイルは、あとで消してかまいません。
6. 右上の「デプロイ」→「新しいデプロイ」→ 種類の選択で「ウェブアプリ」を選び、
   「次のユーザーとして実行」を **自分**、「アクセスできるユーザー」を **全員** にして「デプロイ」を押します。
7. 表示される「ウェブアプリ」の URL（`https://script.google.com/macros/s/…/exec`）を写し、`js/upload-config.js` の `GAS_URL` に貼ります。
8. コードを直して再デプロイするときは「デプロイ」→「デプロイを管理」→ 鉛筆 → バージョンを「新バージョン」にして「デプロイ」を押します。
   URL は変わりません（「新しいデプロイ」を作ると URL が変わるので、その場合は `GAS_URL` も直します）。

### 試し送り

デプロイした受け口が生きているかは、ブラウザで `/exec` の URL を開くと `{"ok":true,"app":"collection-b",…}` が出ることで分かります。
記録の書き込みまで確かめるには、ターミナルから次を送ります（`https://script.google.com/macros/s/…/exec` の部分を実際の URL に置き換えます）。

```
curl -sL -X POST -H 'Content-Type: text/plain;charset=utf-8' \
  --data '{"type":"trial","summary":{"sessionId":"curl-test_p0_test","docId":"practice_0_1","seq":0,"part":"practice","t":0.4,"target":7,"testMode":true},"detail":{"path":{"x":[0,1],"y":[0,1],"t":[0,8],"src":[0,0]},"rawPath":{"x":[],"y":[],"t":[]}}}' \
  'https://script.google.com/macros/s/…/exec'
```

`{"ok":true,"type":"trial","rowKey":"curl-test_p0_test/practice_0_1","row":…,"replaced":false,"detailFileId":"…"}` が返り、
「trials」シートに 1 行、Drive に `collection-b-data/curl-test_p0_test/practice_0_1.json` ができます。同じコマンドをもう一度送ると `replaced` が true になり、行は増えません。
`-L` は GAS の転送（302）を追うために要ります。

アプリからの試し送りは、`GAS_URL` を入れたうえでテストモード（`?test=1`）を開き、参加者番号 1 で数試行を行って、
「trials」シートの行と Drive の JSON、運営者の画面の「未送信: 試行 0 件」を確かめます。
テストモードのセッション ID は末尾に `_test` が付くので、本番の行と見分けられます。

### GAS をデプロイする前に手元で確かめる

`tools/dev-receiver.mjs` が、GAS の代わりに POST を受けて中身を印字し、`tools/received/` の下に GAS と同じ構成で保存します。

```
node tools/dev-receiver.mjs 8797
```

を起動し、`GAS_URL` を一時的に `http://localhost:8797/` にしてアプリを動かすと、送信の様子を手元で見られます。
このサーバを止めると送信が失敗して未送信のまま残り、もう一度起動してページを読み込み直すと再送されます。確かめたら `GAS_URL` を戻してください。

### 予備の選択肢: Firebase

`UPLOAD_TARGET` を `"firebase"` にし、`js/firebase-config.js` に Firebase コンソールの `firebaseConfig` の値を貼ると、
Firestore（`sessions/{sessionId}` と `sessions/{sessionId}/trials/{docId}`、匿名認証、オフライン永続化）へ送ります。
`js/firebase-init.js`、`firestore.rules`、`firebase.json` はそのために残してあります。GAS が使えない事情が出たときの予備で、
通常は使いません。

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
- `js/upload-config.js` の `GAS_URL` が入っていること、運営者の画面に「送信先: GAS（スプレッドシートと Drive）」と出ること、テストモードの数試行が「trials」シートに届くことを確かめる。

## 記録の項目

1 試行の記録（IndexedDB と書き出した JSON の `trials[]` の各要素）の項目は次のとおりです。GAS へは、このうち大きい配列を Drive の JSON に、それ以外を「trials」シートの 1 行に分けて送ります（`js/summary.js`）。
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
| `sent` | 送信先への送信が確認できたか（IndexedDB と書き出した JSON だけ。送信先には入れない） |

セッションの記録（JSON の `sessions[]`、GAS の「sessions」シートの 1 行）には、
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
`test/summary.test.js` が、1 試行の記録を要約の行と詳細の JSON に分ける純粋関数を検査し、`gas/Code.gs` の列の配列が `js/summary.js` と同じ並びであることも確かめます。
Node は 18 以上が要ります（`node --test` のため）。

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
| `js/storage.js` | IndexedDB への保存、送信先（GAS、Firebase、なし）の選択と送信、未送信の再送、JSON と CSV の書き出し、較正と設定の保存 |
| `js/upload-config.js` | 送信先の設定（`UPLOAD_TARGET`、`GAS_URL`）。デプロイのときに書き換えるのはこのファイルだけ |
| `js/summary.js` | 純粋関数。1 試行の記録を、スプレッドシートの 1 行（要約）と Drive の JSON（詳細）に分ける。列の名前の配列もここにある |
| `js/gas-client.js` | GAS の Web アプリへ text/plain で JSON を POST し、応答の `ok` を返す |
| `gas/Code.gs`, `gas/appsscript.json` | GAS 側のコードと設定。スプレッドシートの Apps Script に貼る |
| `tools/dev-receiver.mjs` | GAS の代わりに手元で POST を受ける確認用のサーバ |
| `js/firebase-init.js` | Firebase Auth（匿名）と Firestore の薄いラッパー（予備の選択肢）。送信先が firebase で設定があるときだけ動的に読み込む |
| `js/firebase-config.js` | Firebase の設定の雛形（空） |
| `js/calibration.js` | 較正の画面 |
| `js/main.js` | 画面の流れ全体 |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase Hosting と Firestore の雛形（予備の選択肢） |
| `test/design.test.js`, `test/summary.test.js` | design.js と summary.js の検査 |

## デバッグの手がかり

`window.__collectionB` に状態（`state.session`, `state.plan`, `state.current`, `state.lastTones`）と、
直前の試行の記録（`lastRecord`）を公開しています。ブラウザの開発者ツールから読めます。

## 変更履歴

- v0.2.1（2026-11-02）: 札の外のクリックをお手つきにせず、試行を続けるようにした。札の外のクリックは位置と時刻を `offCardClicks` に、回数を `offCardClickCount`（スプレッドシートの列と CSV の `off_card_click_count`）に残す。
- v0.2.0（2026-10-31）: 記録の送信先を Firestore から GAS（スプレッドシートと Drive）に切り替えた。要約を 1 試行 1 行で「trials」シートに、軌道を Drive の JSON に保存する。送信先は `js/upload-config.js` で選び、Firebase は予備の選択肢として残した。送信は試行の結果の表示のあとに始める。セッションの記録にも未送信の再送を付けた。
- v0.1.0（2026-10-30）: 画面の流れ、電子音、盤面、記録、IndexedDB への保存、Firestore への送信、較正を実装した。
