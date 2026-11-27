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
3. ルール紹介の映像の基本の部分（約 23 秒、音あり。v0.6.0、v0.6.1 で課題の操作に合わせた場面に替えた）。再生が終わるか「次へ」を押すと進みます。
4. 練習（0.4 秒で 5 試行）。
5. 第1部（5 ブロック。t は 0.1、0.2、0.4、0.6、0.8 秒。ブロックの前に t を知らせ、1 試行の練習、8 試行）。
6. 第2部の教示、8 試行（t = 0.2 秒）。最後の高い音より前に開始ボタンから離れた回は、知らせてやり直します（v0.6.0）。3 回目にも早く動いたときは、やり直さずに記録し、知らせを出して先へ進みます（v0.6.1）。
7. 第3部の教示と動きの見本、0.8 秒で 3 試行の練習（いま乗せるべき札を光らせて示します）、5 ブロック。
8. 第4部の教示、8 試行（0.4 秒と 0.8 秒を 4 試行ずつ。順序は参加者番号の偶奇で入れ替え）。
9. アンケート（競技かるたの経験、年齢の帯、利き手、まじかるたを遊んだことがあるか）。
10. 終了の画面。送信の状態を表示します。

各試行は、画面の下中央の「開始」のボタンをクリックすると始まります。ボタンの上に「札の配置を覚えたら、開始を押してください」と出します（v0.6.0、第2部では「開始ボタンの真ん中あたりを押してください」も添えます）。クリックの位置がその試行の開始位置になり、
0.5 秒から 1.0 秒の無作為の待ちのあとに電子音が始まります。盤面の上でクリック（pointerdown）した時点で試行が終わり、
正解か「お手つき」かを即座に表示します。札の外（札と札のすき間や盤面の外）をクリックしても、お手つきにはせず試行を続け、そのクリックの位置と時刻を `offCardClicks` に、回数を `offCardClickCount` に残します（2026-11-02 に決めた。競技かるたで畳に触れてもお手つきにならないのと同じ扱い）。参加者が札をクリックするか、時間切れになった時点で、その試行が終わります。
最後の音のあと 6 秒たってもクリックが無ければ「時間切れ」として打ち切り、その旨を記録します。

## オンラインの流れ（Yahoo!クラウドソーシング、v0.5.0、v0.5.1 で倫理審査の文書に合わせた）

URL に `?wid=`（作業者ID、半角英数 1〜20 文字）を付けて開くと、オンラインの流れになります。
`?wid=` が無いときは、上の「画面の流れ」のとおり運営者の画面から始める対面の流れで、下の制限と条件は働きません。
同じ版で、Yahoo の参加者と、12/6 と 12/13 の会場の参加者の両方を測れます。

- 参加用の URL の例: `https://unryu.org/magikaruta-cursor-experiment/?wid=k7m2qx`（試し打ちは `&test=1` を足す）。
- イベント名の既定は `yahoo-2026-12`（`js/config.js` の `ONLINE.defaultEvent`）で、`?event=` で替えられます。
- セッション ID は `{イベント名}_w{wid}`（テストモードでは末尾に `_test`）。参加者番号は wid から 10000 から 99999 の値に決まり（`js/online.js` の `participantIdFromWid`）、t のブロックの順序と読まれる札の割り当ての種に使います。同じ wid で開き直すと、続きから再開します。
- 運営者の画面と定規の較正は飛ばします（`env.calibration` は空になります）。音量は `AUDIO.gain` の 0.3 で始めます。

オンラインの流れの画面の順序は次のとおりです。

1. 端末の確認。スマートフォンとタブレット（iPad が Mac を名乗る場合はタッチ点の数で判定）は先へ進めません。表示の幅が 760px 未満、高さが 660px 未満のときは、ウィンドウを広げるか全画面表示にするよう案内し、広げれば先へ進めます。端末と画面の条件を満たしているときは何も表示せず、満たしていないときだけ案内を出します（v0.6.3。v0.6.2 までは「パソコンからの参加を確認しました」と出していた）。判定は参加者の端末の中だけで行い、止まった人の記録は作りません（v0.5.1。v0.5.0 では `_blocked` の文書に `blocked_env` を送っていた）。一度止まってからウィンドウを広げて同意した人は、セッションの `online.envProblemsBeforeConsent`（`narrow`、`short`）に残します。
2. 参加の条件の確認（v0.6.3、栗原さんの決定。音の機器は AE1）。長い同意の説明より前の、最初の画面に置きます。条件に合わない人が数秒で分かって引き返せるようにするためです。この確認は最後の質問（任意）ではなく参加の条件なので、2 問とも必須で、「答えない」はありません。判定は `js/online.js` の `requirementsDecision`、案内の文は `js/config.js` の `ONLINE_REQUIREMENTS` にあります。
   - 「カーソルを動かすのに、いま何を使っていますか？」の選択肢は、マウス（机の上で手で動かす、ボタンの付いた機器。値は `mouse`）、ノートパソコンの、キーボードの手前にある平らな板を指でなでる操作（`touchpad`）、そのほか（トラックボール、ペン、画面に直接さわる操作など。`other`）の 3 つで、それぞれに SVG で描いた小さな絵（マウス、ノートパソコンの手前の平らな板、ペン）を添えます。画面では「タッチパッド」「トラックパッド」という呼び名を使いません（値の名前 `touchpad` は、v0.6.2 までの記録と承認の判定表の道具に合わせて残しました）。マウスを選んだ人だけが先へ進めます。それ以外を選んだ人には「この課題は、マウスを使える方にご参加いただいています。マウスをつないでから、もう一度選んでください」と出し、マウスを選び直すまで進めません。
   - 「音を聞くのに、いま何を使っていますか？」の選択肢は、有線のイヤホンかヘッドホン（`wired`）、パソコンのスピーカー（`speaker`）、Bluetooth（無線）のイヤホンかヘッドホン（`bluetooth`）、そのほか（`other`）の 4 つです。Bluetooth を選んだ人には、音が遅れて届くので使えないことと「有線のイヤホンかパソコンのスピーカーに切り替えてから、もう一度選んでください」を出し、切り替えて選び直すまで進めません（AE1。11/26 の「案内と記録だけ」を改めました）。そのほかは進めてよく、選んだ値を記録します（「Bluetooth（無線）の機器でなければ、そのまま進んでください」と添えます）。
   - 条件の確認で止まった人の記録は作りません（同意の前には何も送信しません）。同意した人のセッションには、`online.pointerDevice`（必ず `mouse`）、`online.audioDevice`（`wired`、`speaker`、`other` のどれか）、選んだ順の履歴（選び直しを含む）の `online.requirementSelections`（`pointerDevice` と `audioDevice` の配列）、条件の確認を通った時刻の `online.requirementsPassedAt` を残します。
3. 「次へ（参加の説明を読む）」を押すと、同じ画面に、承認済みの倫理審査の申請（候補縮小課題）の参加者説明文書を、この課題の条件を埋めて表示します（v0.5.1）。承認番号は `ONLINE.ethicsApprovalNumber` に入れると「11．倫理審査」に出ます（空のときは番号の括弧を出しません）。同じ画面のルールの確認の問い（音が 7 回なら何の札か）に正しく答えるまで先へ進めません（`online.quizAttempts` に回数を残します）。v0.5.1 から v0.6.2 までは、この画面で機器を任意で申告してもらい（未回答は `null`、「答えない」は `noanswer`）、Bluetooth を避けるよう案内するだけでした。
4. 同意のチェックボックスにチェックを入れて「同意して開始」を押すまで、先へ進めません（ボタンはチェックを入れるまで押せません。v0.5.1）。同意の時刻と方法を `online.consentedAt` と `online.consent` に残します。**同意の前には何も送信しません。** Firebase の初期化（匿名のログインを含む）と未送信の記録の再送も、同意のあとに行います。
5. 音量の確認から第4部まで、対面の流れと同じです。ただし、第1部、第2部、第3部のそれぞれのあとに休憩の画面を出します（v0.5.1）。休憩の長さは決めず、参加者が「次へ」を押すと再開します。休憩の開始と終了の時刻と長さを `online.rests` に残します。読み込み直して途中から再開した部のあとには出しません。
6. 練習の合格条件。最初の練習（5 試行）で正解が 2 回に届かなければ、届くまで練習を 1 回ずつ足します（文書 ID は `practice_0_6` から）。練習の合計が 15 回に達しても届かなければ打ち切り、`status: "failed_practice"` を記録して、完了コードを出しません。
7. 最後の質問（アンケート）は、すべて任意です（v0.5.1。v0.6.3 でも「答えない」を残しています）。必須の指定を外し、選択式の各問に「答えない」（`noanswer`）を足し、年齢層の選択肢を研究計画書の別紙の Q1 の区切り（18〜19歳、20代〜60代、70代以上、答えない。`ONLINE_AGE_BANDS`）にします。未回答の問は `null` です。対面の流れのアンケートは変えていません。
8. アンケートのあと、本試行（練習を除く）のうち時間切れでない回の割合が 0.7 以上なら `status: "finished"` にして完了コード（全員共通の 3 桁、`ONLINE.completionCode`）を表示し、Yahoo の設問で 1 桁ずつ選ぶよう案内します。アンケートの回答の有無は条件に入れません。届かなければ `status: "incomplete"` にして、完了コードを出しません。どちらの場合も、記録の削除の請求の宛先（`ONLINE.contactEmail`）と、添えてもらう作業者IDを出します。終了の画面は送信の状況を 3 秒ごとに表示し直し、未送信が残れば再送します。
9. 同じブラウザで完了（または打ち切り）した記録を localStorage（`collectionB.onlineDone`）に残します。同じ wid で開き直すと終了の画面を出し直し、別の wid で開くと二重の参加として止めます。止めた人は同意の前なので、記録を作りません（v0.5.1。v0.5.0 では `_dup` の文書に `duplicate_browser` を送っていた）。テストモードでは残しません。

両方の流れで記録する項目（v0.5.0）は次のとおりです。

- `earlyClick`: 最後の電子音より前に札をクリックした。まじかるたでは囲い手の戦略として正当な行動になりうるので、お手つきにも無効にもせず、印を付けるだけにします。
- `pointerTypeStart`、`pointerTypeClick`: 開始のボタンと札のクリックの `PointerEvent.pointerType`。セッションには種類ごとの回数（`pointerTypes`）を残します。
- `focus`: 試行の間にタブが背面になった回数（`hiddenDuringTrial`）、フォーカスが外れた回数（`blurDuringTrial`）、開始の時点のフォーカスと表示の状態。タブが背面の間は、開始のボタンを出さずに待ちます。セッションには、ページを開いてからの累計（`focus.hiddenCount`、`focus.blurCount`）を残します。
- `env` に、`maxTouchPoints`、`uadMobile`、`pointerFine`、`hoverHover`、`anyPointerCoarse`、`timeZone`、`mode` を足しました。

## 第2部の早い動きの判定（v0.6.0、I4）

第2部では、最後の高い音の予定の時刻より前に、カーソルが開始ボタンの四角（幅 160px、高さ 56px、`BOARD.startButtonWidth` と `startButtonHeight`）の外へ出たら、早く動いたと判定します。判定には、試行の軌道の点と札のクリックを使います（`js/recorder.js` の `earlyLeaveFromStart`）。試行のあいだも、開始ボタンを「ここで待つ」と書いた点線の枠として画面に残します。札の見た目は変えません。

早く動いた回は、正誤を出さずに「最後の高い音が鳴る前に、開始ボタンから離れました。高い音を聞いてから動かしてください」と知らせ、同じ試行をやり直します。同じ試行のやり直しは 2 回まで（`PART2_EARLY_MOVE.maxRetries`）で、3 回目は早く動いてもやり直さずに記録して先へ進みます。3 回目にも早く動いたときは、正誤を出したあとに「最後の高い音が鳴る前に動きました。次の試行では、高い音を聞いてから動かしてください」と知らせ（`PART2_EARLY_MOVE.finalNotice`）、「次へ」で先へ進みます（v0.6.1、AA4）。

- やり直した回の記録は、文書 ID の末尾に `_early1`、`_early2` を付けて残します（`supersededByRetry: true`、`planDocId` に元の文書 ID）。完了コードの条件では数えません。
- 第2部の記録には、`earlyMove`（外へ出た最初の点の `perf`、`x`、`y`、`msBeforeLastTone`、`source`。出ていなければ null）、`earlyMoveDetected`、`part2Attempt`（0 が最初、1 と 2 がやり直し）、`part2MaxRetries` が入ります。試行の CSV には `early_move`、`early_move_ms_before_last_tone`、`part2_attempt`、`superseded_by_retry`、`plan_doc_id` の列を足しました。
- 3 回目でも早く動いた試行は、`earlyMoveDetected: true` のまま本来の文書 ID で残るので、分析で除けます。第2部の記録の `part2Outcome` は、`retry`（やり直した回）、`record_early`（3 回目にも早く動き、記録して知らせを出した回）、`record`（早く動かなかった回）のどれかです（v0.6.1）。

## 第3部の動きの見本とハイライト（v0.6.0、I5、I6）

第3部の教示の画面（練習の前と本番の前）に、動きの見本を出します（`js/demo.js`）。札 5 6 7 8 の小さな盤面で、7 が読まれる場合を音の間隔 0.8 秒で自動で動かし、電子音に合わせてカーソルの絵を動かします。見本は、画面に半分以上見えたときに自動で 1 回再生します（教示の文が長く、狭い画面では見本が下に隠れるため）。「もう一度見る」で何度でも見直せます。

第3部の練習のハイライトは、最初の音の前に最小の札を光らせ、各音の鳴り終わり（鳴り始めから音の間隔の半分の時点）に次の札へ移します（`js/design.js` の `guideSchedule`。v0.5.4 までは鳴り始めに移していた）。動きの見本のカーソルの絵も同じ時刻で動きます。練習の画面には「練習の目印：いま乗せるべき札を光らせています。光っている札にカーソルを移してください（本番では光りません）」と出します。

## ルール紹介の映像（v0.6.0、I3）

`video/rules-basic.mp4`（23.0 秒、960×540、約 1.4MB）は、ルール紹介の映像の場面 s03「音の聞き方」を、課題の操作に合わせて作り直したものです（v0.6.1、AA5）。音の回数が札の値であること、最後の 1 回だけ高い音であること、7 回鳴る例（0.4 秒の間隔）が入っています。ナレーションは「『開始』を押すと、少し待ってから、『ピン』という電子音が何回か鳴ります」で始まり、画面には課題の「開始」のボタンとマウスのカーソルを描き、準備の音は描いていません。最後の 7 回の電子音は、このアプリと同じ音（880 Hz と、最後だけ 1760 Hz、各 0.08 秒）で、「開始」を押してから 0.75 秒待って鳴ります。戦略（囲い手）、決まり字、空札、読み上げアプリの説明の場面は使っていません。見たかどうかは、セッションの `rulesVideo`（`how` が `ended` か `next`、`watchedSec`）に残します。

映像の正本は、demo-video の作品 `demo-video-pipeline/projects/majikaruta-rules-task`（台本 `script.md` の場面 `s03task`、図 `anims/ListenTask.tsx`、電子音 `tools/make_sfx.py`）です。元の作品 `majikaruta-rules` の台本と映像は変えていません。作り直すときは、`LIGHT=1 nice -n 10 scripts/video.sh majikaruta-rules-task render` で書き出し、`nice -n 10 ffmpeg -i out/majikaruta-rules-task.mp4 -t 23.0 -vf scale=960:540 -c:v h264_videotoolbox -b:v 400k -maxrate 600k -bufsize 1200k -pix_fmt yuv420p -c:a aac -b:a 96k -ar 48000 -ac 2 -movflags +faststart video/rules-basic.mp4` で縮めます。v0.6.0 では、読み上げアプリの公開用の映像 `majikaruta-reader/video/magikaruta-rules.mp4` の 18.0 秒から 41.05 秒を切り出し、映像の中の「読む」のボタンと準備の音は読み上げアプリのものだという注記を画面に添えていました。

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
`finishedAt`, `status` が入ります。オンラインの流れでは、ほかに `mode`, `wid`, `online`（`wid`, `pointerDevice`, `audioDevice`, `requirementSelections`, `requirementsPassedAt`, `quizAttempts`, `consentedAt`, `consent`, `envProblemsBeforeConsent`, `rests`）, `practice`, `completion`, `focus`, `pointerTypes` が入ります。

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
`test/recorder.test.js` が、第2部の早い動きの判定とやり直しの上限を検査します（v0.6.0）。`test/design.test.js` は、t の 5 水準と、第3部の練習のハイライトの時刻（鳴り始め + t/2）も検査します。
`test/online.test.js` が、オンラインの流れの判定（作業者ID、端末、参加の条件の確認〔マウス以外と Bluetooth と未回答で進めない〕、練習の合格条件、完了コードの条件、二重の参加、休憩、任意回答）と、v0.5.1 の直し（版の数字がそろっていること、同意のチェックボックスがあること、同意の前に送信の呼び出しが無いこと、完了コードを「選んで」と案内すること）を検査します。
Node は 18 以上が要ります（`node --test` のため）。omba では PATH の node が古いので、`/opt/homebrew/bin/node --test test/*.test.js` で実行します。

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
| `js/main.js` | 画面の流れ全体（対面の流れとオンラインの流れ） |
| `js/online.js` | 純粋関数。オンラインの流れの判定（作業者ID、端末、練習の合格条件、完了コードの条件、二重の参加） |
| `js/demo.js` | 第3部の教示の画面の動きの見本（v0.6.0） |
| `video/rules-basic.mp4` | 最初の練習の前に見せるルール紹介の映像の基本の部分（v0.6.0） |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase Hosting と Firestore の雛形（予備の選択肢） |
| `test/design.test.js`, `test/summary.test.js`, `test/online.test.js`, `test/recorder.test.js` | design.js、summary.js、online.js、recorder.js の検査 |

## デバッグの手がかり

`window.__collectionB` に状態（`state.session`, `state.plan`, `state.current`, `state.lastTones`）と、
直前の試行の記録（`lastRecord`）を公開しています。ブラウザの開発者ツールから読めます。

## 変更履歴

- v0.6.4（2026-11-27）: オンラインの流れの終了の画面で、送信先の名前（Firebase）や件数を出すのをやめ、「記録の送信が完了しました。このページを閉じてかまいません」か「記録を送信しています。このページを閉じずに、しばらくお待ちください」だけを出す。送信が済んでいるときは再送のボタンを出さず、30秒たっても終わらないときだけ「送信をやり直す」を出す（栗原さんの Y11 の指摘）。対面の流れの表示は変えていない。

- v0.6.3（2026-11-27）: オンラインの流れの最初の画面を、栗原さんの決定に合わせて直した。対面の流れの動きは変えていない。
  - 端末と画面の条件を満たしているときは何も表示せず、満たしていないとき（スマートフォン、タブレット、狭い画面）だけ案内を出すようにした（「パソコンからの参加を確認しました」の表示をやめた）。
  - マウスと音の機器の確認を、長い同意の説明（参加者説明文書）より前の「参加の条件の確認」にした。必須で「答えない」は無い。最後の質問（任意）とは別に扱うので、承認済みの説明文書の「アンケートの回答はすべて任意」と食い違わない。
  - カーソルを動かすものの問いを「カーソルを動かすのに、いま何を使っていますか？」にし、選択肢を、マウス、ノートパソコンのキーボードの手前の平らな板を指でなでる操作、そのほかの 3 つにして、SVG の小さな絵を添えた。画面から「タッチパッド」「トラックパッド」の呼び名を外した。マウスを選んだ人だけが先へ進める。
  - 音を聞くものの問いで Bluetooth を選んだ人は、切り替えて選び直すまで進めないようにした（AE1。11/26 の「案内と記録だけ」を改めた）。そのほかは進めてよいが記録する。
  - 同意の前には何も送信しない決まり（v0.5.1）は変えていない。同意した人のセッションに `online.requirementSelections`（選んだ順の履歴）と `online.requirementsPassedAt` を足した。`online.pointerDevice` と `online.audioDevice` の値の名前は変えていない（`noanswer` と `null` は出なくなった）。
  - 同意の画面の参加者説明文書の「2．お願いする内容」に Bluetooth のイヤホンやヘッドホンは使えないことを、「4．記録する内容」に参加の条件の確認の内容を書いた。スマートフォンの案内の「（またはタッチパッド）」を外した。
  - 検査: 参加の条件の確認の判定（マウス以外、Bluetooth、未回答で進めない）、画面の文と選択肢、同意の説明より前にあること、アンケートの「答えない」が残ることの検査を足した（64 件）。

- v0.6.2（2026-11-27）: 第2部の3回目の早い動きの知らせの「次の試行では」を「これからの試行では」にした。第2部の最後の試行で出ても食い違わないようにするため。

- v0.6.1（2026-11-27）: 栗原さんの判断 AA1、AA4、AA5 に合わせた。このあと 2 回目のパイロットを行い、Yahoo!クラウドソーシングで 100 人に配る。
  - AA1: 同意の画面の参加者説明文書の所要時間を「約15分」から「約20分」に、謝礼を「54 ポイント」から「72 ポイント」にした（見出し、冒頭の文、「2．お願いする内容」、「7．謝礼」）。v0.6.0 の所要時間の見積もりが、休憩を除いて約 17 分、初めての参加者は 18〜20 分になったため。謝礼は、手本の 18 ポイントが目安 5 分だった比を目安 20 分に当てた値。制限時間（`ONLINE.timeLimitMinutes`）は 60 分のまま。Yahoo の掲載文（`../yahoo/掲載文_magikaruta.md`）の設定値、タスク説明文、費用の見積もりも同じ値に直した。
  - AA4: 第2部で 3 回目にも早く動いたときは、やり直さずに記録して先へ進むが、正誤を出したあとに「最後の高い音が鳴る前に動きました。次の試行では、高い音を聞いてから動かしてください」と知らせ、「次へ」で進む画面にした（`PART2_EARLY_MOVE.finalNotice`）。`part2AttemptDecision` は、この回に `record_early` を返す。第2部の記録に `part2Outcome` を足した。
  - AA5: ルール紹介の映像（`video/rules-basic.mp4`）を、課題の操作に合わせたナレーションの場面に差し替えた。「『開始』を押すと、少し待ってから、『ピン』という電子音が何回か鳴ります」で始まり、画面の「読む」のボタンを「開始」のボタンに、準備の音を「少し待つ」の点線に替えた。鳴った回数が札の値、最後の 1 回だけ高い音、7 回鳴る例、0.4 秒の間隔は変えていない。映像の下の、読み上げアプリの「読む」のボタンと準備の音についての注記を外した。
  - 検査: AA1 の値、AA4 の判定と知らせの文、AA5 の注記が無いことの検査を足した（59 件）。

- v0.6.0（2026-11-27）: 栗原さんの通しの確認（Y11）のあとに決まった判断 I1〜I9 と、t の水準の変更に合わせた。対面の流れとオンラインの流れの両方で同じに動く。
  - t の水準: 1.6 秒をやめて 0.6 秒を足し、0.1、0.2、0.4、0.6、0.8 秒にした。予測の表で、値が隣り合う札への移動が間に合う境目が 0.4 秒と 0.8 秒の間にあり、その間を測る水準が無かったため。水準の数は 5 のままで、ウィリアムズ方陣の 10 通りの巡回は同じ形。第3部の練習は 1.6 秒から 0.8 秒にした。最初の練習（0.4 秒）と第4部（0.4 秒と 0.8 秒）は変えていない。
  - I1: 開始ボタンのそばに「札の配置を覚えたら、開始を押してください」と出した。配置を覚える前に開始を押して、音が鳴ってから札を探す回を減らすため。開始のあとの無作為の待ち（0.5〜1.0 秒）は変えていない。
  - I3: 最初の練習の前に、ルール紹介の映像の基本の部分（約 23 秒）を見せる画面を足した。教示の文だけでは、最後の音だけ高いことが伝わりにくいため。第1部の教示に「正しい札が分かったら、最後の高い音を待たずにクリックしてもかまいません」を足した（最初の練習の教示も同じ文を使う）。
  - I4: 第2部で、最後の高い音の予定の時刻より前に開始ボタンの四角の外へ出た回を早い動きと判定し、試行のあとに知らせてやり直す（同じ試行で 2 回まで、3 回目はそのまま記録）。試行のあいだも開始ボタンを「ここで待つ」場所として残した。やり直した回も記録に残す。第2部の教示を「開始を押したら、カーソルを開始ボタンの上に置いたまま待ち、最後の高い音が聞こえたら札へ動かしてください」にし、開始の前に「開始ボタンの真ん中あたりを押してください」と添えた。第2部の教示の「カーソルを動かさず」が守られているかを確かめられず、守られない回が混ざると第2部の移動時間の測定が崩れるため。札の見た目は変えていない。
  - I5、I8: 第3部の教示を、最初の音の前から最小の札の上で待ってよいことと、番号付きの 3 つの手順に書き替え、教示の画面に動きの見本（札 5 6 7 8、7 が読まれる、0.8 秒）を足した。文だけでは囲い手の動き方が伝わりにくいため。
  - I6: 第3部の練習のハイライトが次の札へ移る時刻を、各音の鳴り始めから鳴り終わり（音の間隔の半分の時点）に遅らせ、練習の画面にハイライトの説明を出した。鳴り始めに移すと、その音が低い音だと分かる前に光が移り、教示の「その数字の回数まで鳴っても低い音が続いたら」と合わないため。
  - I7: 第3部のブロックの順序は巡回のまま（変えていない）。
  - I9: 第4部の教示を、どの動き方でもよいこと、正しい札が分かったら最後の高い音を待たずにクリックしてよいことを明示する文にした。
  - 記録: 第2部の `earlyMove`、`earlyMoveDetected`、`part2Attempt`、`supersededByRetry`、`planDocId`、セッションの `rulesVideo` を足した。試行の CSV に 5 列を足した。完了コードの条件では、やり直した回の記録を数えない。

- v0.5.4（2026-11-27）: 同意の画面の「10．連絡先」を研究責任者（栗原）だけにした（栗原さんの指示。研究者として丸山さんの所属と名前は冒頭に残す）。

- v0.5.3（2026-11-26）: 倫理審査の承認番号 TN2611 を `ONLINE.ethicsApprovalNumber` に入れ、同意の画面の「11．倫理審査」に出るようにした。

- v0.5.2（2026-11-26）: 同意の画面の「印を付けて」を「チェックを入れて」に言い換えた（v0.5.1 の送信のあとに直したので、版を上げた）。動きは変えていない。

- v0.5.1（2026-11-26）: Yahoo!クラウドソーシングで100人を募集する前に、オンラインの流れを、承認済みの倫理審査の申請「候補縮小課題」（2026-09-23 申請、2026-10-27 承認）の説明文書と手続きに合わせた。(1) 終了の画面の文を、Yahoo の設問の形に合わせて「1 桁ずつ選んでください」にした。(2) 同意の画面に参加者説明文書を表示し、同意のチェックボックスにチェックを入れて「同意して開始」を押すまで先へ進めないようにした（説明文書と申請書の同意の取り方）。(3) 同意の前には何も送信しないようにした。端末の条件で止めた人（`blocked_env`）と二重の参加の人（`duplicate_browser`）の記録をやめ、Firebase の初期化と再送を同意のあとに移した（申請書と研究計画書の「判定の結果を含め、同意の前には記録を送信しない」）。(4) 最後の質問と同意の画面の申告を任意にし、「答えない」を足し、未回答でも送信でき完了コードが出るようにした。オンラインの年齢層の選択肢を研究計画書の別紙の Q1 の区切りにした（説明文書の「すべて任意」、別紙の「選択式のすべての質問に答えないの選択肢を設けます」）。(5) 第1部、第2部、第3部のあとに、長さを決めない休憩の画面を置いた（説明文書の「途中に休憩があります」、申請書の「途中に休憩を設ける」）。(6) 説明文書の中と終了の画面に、記録の削除の請求の宛先と作業者IDを出した。対面の流れの動きは変えていない。

- v0.5.0（2026-11-26）: Yahoo!クラウドソーシングで募集するためのオンラインの流れを足した（上の「オンラインの流れ」）。URL の `?wid=` で始め、運営者の画面と較正を飛ばす。スマートフォン、タブレット、狭い画面を弾いて `blocked_env` を記録する。ポインタの種類とマウスかタッチパッドかの申告、音の機器の申告と Bluetooth を避ける案内、ルールの確認の問いを足した。練習の合格条件（正解 2 回、最大 15 回、届かなければ `failed_practice`）と、完了コードの条件（本試行の時間切れでない回の割合が 0.7 以上で `finished`、届かなければ `incomplete`）を足した。同じブラウザで完了した人の再開と二重の参加を止める。両方の流れで、最後の音より前のクリックの印（`earlyClick`）、ポインタの種類、試行中のタブの背面とフォーカスの喪失の回数を記録し、タブが背面の間は試行を始めない。試行の CSV に 8 列（mode、wid、extra_practice、early_click、pointer_type_start、pointer_type_click、hidden_during_trial、blur_during_trial）を足した。対面の流れの動きは変えていない。Firestore の規則は欄を制限していないので変えていない。

- v0.4.0（2026-11-06）: 計測に使う機械の名前（A〜D、そのほか）を記録する欄を足した。運営者の画面で選ぶか、参加用の URL の ?machine=A で渡す。一度選んだ機械の名前は、その PC に保存され、次から自動で入る。機械の名前は、セッションと試行の記録、要約の列（machine）、試行の CSV に入る。会場の PC が機種の違う4台（omen1 と同じ型の Windows 2台と古い Surface 2台）になるので、分析で機械の違いを取り除くためである。
- v0.3.0（2026-11-02）: 記録の送信先を GAS から Firebase（Firestore）に戻した（丸山さんの経験で GAS の受け口が不安定なため）。プロジェクトは magikaruta-pilot-2026（Firestore は asia-northeast1）。匿名のログインが使えなくても送れるようにし、Firestore の規則はログインを求めない代わりに書き込める場所と形を絞り、読み取りを許さない。1 試行の記録が 700KB を超えそうなときは rawPath だけを省いて送る（PC の中には全部残る）。参加用の URL の ?pid=、?event=、?group= で、参加者番号、イベント名、群を埋められるようにした（研究室のメンバーが自分のブラウザで参加するオンラインのパイロットのため）。firebase-config.js の読み込みに版の印を付けた。firebase-config.js の apiKey は、ページに埋め込む前提の公開の識別子で、秘密の鍵ではない。GitHub の秘密の検出が警告を出したので、Google Cloud の側でこの鍵を使えるサイトを https://unryu.org/* と http://localhost:8796/* に、使える API を Firestore、認証の 2 つ、Firebase のインストールの管理の 4 つに限り、警告は理由を添えて閉じた。
- v0.2.3（2026-11-02）: 候補の札の数え方を直した。k 回目の音が低い音なら値 k の札はその時点で外れるので、候補を「値が k より大きい札」にした（それまでは「値が k 以上の札」で、音 1 つ分だけ遅れていた）。これにより、記録の `candidatesAtClick` と `determinedAtClick` と、第3部の練習で乗るべき札を示す案内が、音 1 つ分早くなる。
- v0.2.2（2026-11-02）: 8枚・疎の配置（配置 7 と 8）の札の集合を {2, 3, 5, 6, 8, 9, 11, 12} から {1, 3, 5, 7, 9, 10, 11, 12} に替えた。配置 7 は上段 1 3 5 7、下段 9 10 11 12、配置 8 は上段 1 9 11 5、下段 7 12 10 3（配置 6 と同じ位置の並び）。旧集合では 2 と 3 の値の差が 1 のために、最速囲い手の予測の上で 8枚・密と区別されなかった。
- v0.2.1（2026-11-02）: 札の外のクリックをお手つきにせず、試行を続けるようにした。札の外のクリックは位置と時刻を `offCardClicks` に、回数を `offCardClickCount`（スプレッドシートの列と CSV の `off_card_click_count`）に残す。
- v0.2.0（2026-10-31）: 記録の送信先を Firestore から GAS（スプレッドシートと Drive）に切り替えた。要約を 1 試行 1 行で「trials」シートに、軌道を Drive の JSON に保存する。送信先は `js/upload-config.js` で選び、Firebase は予備の選択肢として残した。送信は試行の結果の表示のあとに始める。セッションの記録にも未送信の再送を付けた。
- v0.1.0（2026-10-30）: 画面の流れ、電子音、盤面、記録、IndexedDB への保存、Firestore への送信、較正を実装した。
