// online.js の判定の検査（v0.5.0）。node --test test/*.test.js で実行する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWid, participantIdFromWid, isMobileEnv, envProblems, practiceDecision, completionDecision, duplicateDecision,
  restAfter, surveyValue, requirementsDecision,
} from "../js/online.js";
import { ONLINE, ONLINE_AGE_BANDS, APP_VERSION, INSTRUCTIONS, START_HINTS, PART3_PRACTICE_GUIDE_NOTE, RULES_VIDEO, ONLINE_REQUIREMENTS } from "../js/config.js";
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";

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

// ---------- v0.5.1（承認済みの倫理審査の文書に合わせた直し） ----------

test("休憩は第1部、第2部、第3部のあとに出し、練習と第3部の練習と第4部のあとには出さない", () => {
  assert.deepEqual(restAfter("part1"), { done: 1, total: 4 });
  assert.deepEqual(restAfter("part2"), { done: 2, total: 4 });
  assert.deepEqual(restAfter("part3"), { done: 3, total: 4 });
  for (const k of ["practice", "part3practice", "part4", "unknown"]) assert.equal(restAfter(k), null);
});

test("最後の質問の未回答は null、「答えない」はそのまま", () => {
  assert.equal(surveyValue(null), null);
  assert.equal(surveyValue(undefined), null);
  assert.equal(surveyValue(""), null);
  assert.equal(surveyValue("noanswer"), "noanswer");
  assert.equal(surveyValue("right"), "right");
});

test("オンラインの年齢層の選択肢は研究計画書の別紙の Q1 と同じで、18歳未満の区切りが無く、「答えない」がある", () => {
  assert.deepEqual(ONLINE_AGE_BANDS.map((b) => b.label), ["18〜19歳", "20代", "30代", "40代", "50代", "60代", "70代以上", "答えない"]);
});

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("版の数字が config.js、index.html の ?v=、package.json でそろっている", () => {
  const v = APP_VERSION.replace(/^v/, "");
  const html = read("../index.html");
  const marks = [...html.matchAll(/\?v=([0-9.]+)/g)].map((m) => m[1]);
  assert.ok(marks.length >= 2);
  for (const m of marks) assert.equal(m, v);
  assert.equal(JSON.parse(read("../package.json")).version, v);
});

test("同意の画面に、同意のチェックボックスと「同意して開始」のボタン（最初は押せない）がある", () => {
  const html = read("../index.html");
  assert.match(html, /<input type="checkbox" id="consent-check"[^>]*required/);
  assert.match(html, /<button type="submit" class="primary" id="btn-online-start" disabled>同意して開始<\/button>/);
});

test("同意の前に記録を送らない（端末の条件と二重の参加の記録を作らず、起動時に送信先を初期化しない）", () => {
  const main = read("../js/main.js");
  assert.doesNotMatch(main, /recordStopped\(/);
  const init = main.slice(main.indexOf("function init()"), main.indexOf("// ---------- オンラインの流れ"));
  const onlineBranch = init.slice(init.indexOf("if (ONLINE_MODE)"), init.indexOf("setupOperatorScreen();"));
  assert.doesNotMatch(onlineBranch, /uploadEnabled|resendUnsent|sendSession/);
  // startOnline の中で、送信に関わる呼び出しは同意（consentedAt）のあとにだけある
  const so = main.slice(main.indexOf("async function startOnline()"));
  const consentPos = so.indexOf("const consentedAt");
  assert.ok(consentPos > 0);
  for (const name of ["uploadEnabled(", "resendUnsent(", "sendSession(", "startSession("]) {
    const pos = so.indexOf(name);
    if (pos >= 0) assert.ok(pos > consentPos, `${name} が同意の前にある`);
  }
});

test("終了の画面は完了コードを「選んで」と案内し、「入力して」とは書かない", () => {
  const main = read("../js/main.js");
  assert.doesNotMatch(main, /数字を入力してください|画面に入力してください/);
  assert.match(main, /1 桁ずつ選んでください/);
});

// ---------- v0.6.0（栗原さんの通しの確認 Y11 のあとの決定） ----------

test("第2部で早く動いてやり直した回の記録は、完了コードの条件で数えない", () => {
  const sup = { isPractice: false, timedOut: false, supersededByRetry: true };
  const records = [...Array(7).fill(0).map(() => main(false)), ...Array(3).fill(0).map(() => main(true))];
  const d = completionDecision([...records, sup, sup], { minRatio: 0.7 });
  assert.equal(d.total, 10);
  assert.equal(d.answered, 7);
});

test("教示の文が決定のとおり（I1、I3、I4、I5、I6、I8、I9。v0.7.0 でカードの言い方に直した）", () => {
  assert.equal(START_HINTS.all, "カードの並びを覚えたら、開始を押してください");
  assert.equal(START_HINTS.part2, "開始ボタンの真ん中あたりを押してください");
  assert.match(INSTRUCTIONS.part1, /1、2、5、12 の例のように）、最後の高い音を待たずにクリックしてもかまいません。$/);
  assert.equal(INSTRUCTIONS.part2, "開始を押したら、カーソルを開始ボタンの上に置いたまま待ち、最後の高い音が聞こえたらカードへ動かしてください。");
  assert.equal(INSTRUCTIONS.part3[0], "第3部では、次の動き方を試していただきます。");
  assert.match(INSTRUCTIONS.part3[1], /^音が 1 回鳴るごとに、正解の可能性が残っているカードは減っていきます。/);
  assert.equal(INSTRUCTIONS.part3[2], "開始を押したら、最初の音が鳴る前から、いちばん小さい数字のカードの上で待ってかまいません。");
  assert.match(INSTRUCTIONS.part3[3], /^1\. /);
  assert.match(INSTRUCTIONS.part3[4], /^2\. /);
  assert.match(INSTRUCTIONS.part3[5], /^3\. /);
  assert.equal(INSTRUCTIONS.part3.length, 7);
  assert.equal(INSTRUCTIONS.part4.join(""), "ここからは、どの動き方でもかまいません。第2部のように最後の高い音を聞いてから動いても、第3部のように正解の可能性が残っているカードの上で待ちながら動いても、それ以外の動き方でもかまいません。正解のカードを、できるだけ早くクリックしてください。正解が分かったら、最後の高い音を待たずにクリックしてもかまいません。");
  assert.equal(PART3_PRACTICE_GUIDE_NOTE, "練習の目印：いまカーソルを乗せるカードを光らせています。光っているカードにカーソルを移してください（本番では光りません）");
});

// ---------- v0.7.0（かるたの知識を前提にしない教示、栗原さんの指摘と決定） ----------

test("教示の文と画面の文に、かるたを前提にした言い方（札、お手つき、読まれる、まじかるた）が残っていない", () => {
  const texts = [START_HINTS.all, PART3_PRACTICE_GUIDE_NOTE, INSTRUCTIONS.part1, INSTRUCTIONS.part2, ...INSTRUCTIONS.part3, ...INSTRUCTIONS.part4];
  for (const t of texts) assert.doesNotMatch(t, /札|お手つき|読ま|まじかるた/, t);
  const html = read("../index.html");
  // 承認済みの参加者説明文書（同意の画面の consent-doc）と、最後の質問の「まじかるたを遊んだことがありますか」は変えないので、除いて調べる。
  const noConsent = html.slice(0, html.indexOf('<div id="consent-doc"')) + html.slice(html.indexOf('<form id="online-env-form"'), html.indexOf('<section id="screen-survey"'));
  const visible = noConsent.replace(/<!--[\s\S]*?-->/g, "").replace(/<section id="screen-operator"[\s\S]*?<\/section>/, "");
  assert.doesNotMatch(visible, /札|お手つき|読まれ|読み手|まじかるた/);
  assert.match(html, /<title>数字のカードを選ぶ課題<\/title>/);
  assert.match(html, /<h1>課題のやり方<\/h1>/);
  assert.match(html, /正解は、必ず画面に並んでいるカードのどれかです。/);
  assert.match(html, /1、2、5、12 のカードが並んでいるとします。/);
  assert.match(html, /name="quiz2" value="12"/);
  const main = read("../js/main.js");
  assert.match(main, /board\.showFeedback\("不正解", "miss"\)/);
  assert.match(main, /quiz2Attempts,/);
});

test("ルール紹介の映像のファイルがあり、GitHub Pages で配信できる大きさ（5MB 未満）で、映像の画面が index.html にある", () => {
  const f = new URL("../" + RULES_VIDEO.src, import.meta.url);
  assert.ok(existsSync(f));
  assert.ok(statSync(f).size < 5 * 1024 * 1024);
  const html = read("../index.html");
  assert.match(html, /<section id="screen-video" class="screen">/);
  assert.match(html, /id="btn-video-next"/);
});

// ---------- v0.6.1（AA1） ----------

test("同意の画面の所要時間は約20分、謝礼は72ポイントで、古い値（約15分、54ポイント）が残っていない", () => {
  const html = read("../index.html");
  assert.match(html, /<h1>数字のカードを選ぶ課題（パソコンで約20分）<\/h1>/);
  assert.match(html, /かかる時間は約20分です。/);
  assert.match(html, /所要時間は約20分です（途中に休憩があります）。/);
  assert.match(html, /72 ポイントをお支払いします。/);
  assert.doesNotMatch(html, /15分|15 分|54 ?ポイント/);
  assert.equal(ONLINE.timeLimitMinutes, 60);
});

// ---------- v0.6.1（AA5） ----------

test("ルール紹介の映像の画面に、読み上げアプリの「読む」のボタンと準備の音についての注記が残っていない", () => {
  const html = read("../index.html");
  const sec = html.slice(html.indexOf('<section id="screen-video"'), html.indexOf("</section>", html.indexOf('<section id="screen-video"')));
  assert.ok(sec.length > 0);
  assert.doesNotMatch(sec, /読み上げアプリ|準備の音/);
  assert.match(sec, /約 23 秒/);
  assert.equal(RULES_VIDEO.durationSec, 23.0);
});

// ---------- v0.6.3（参加の条件の確認） ----------

test("参加の条件の確認：マウスだけが先へ進め、マウス以外と未回答は進めない", () => {
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "wired" }).ok, true);
  for (const p of ["touchpad", "other", "noanswer"]) {
    const d = requirementsDecision({ pointerDevice: p, audioDevice: "wired" });
    assert.equal(d.pointer, "not_mouse");
    assert.equal(d.ok, false);
  }
  const m = requirementsDecision({ pointerDevice: null, audioDevice: "wired" });
  assert.equal(m.pointer, "missing");
  assert.equal(m.ok, false);
});

test("参加の条件の確認：Bluetooth と未回答は進めず、有線、スピーカー、そのほかは進める", () => {
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "bluetooth" }).audio, "bluetooth");
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "bluetooth" }).ok, false);
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: null }).ok, false);
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "" }).audio, "missing");
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "noanswer" }).ok, false);
  assert.equal(requirementsDecision({ pointerDevice: "mouse", audioDevice: "speaker" }).ok, true);
  const o = requirementsDecision({ pointerDevice: "mouse", audioDevice: "other" });
  assert.equal(o.audio, "other");
  assert.equal(o.ok, true);
  assert.equal(requirementsDecision({}).ok, false);
});

test("参加の条件の確認は同意の説明より前にあり、必須で「答えない」が無く、決定どおりの文と選択肢である", () => {
  const html = read("../index.html");
  const req = html.indexOf('id="online-requirements"');
  const doc = html.indexOf('id="consent-doc"');
  assert.ok(req > 0 && doc > req, "条件の確認が同意の説明より前にない");
  const sec = html.slice(req, html.indexOf('id="online-consent"'));
  assert.match(sec, /<legend>カーソルを動かすのに、いま何を使っていますか？<\/legend>/);
  assert.match(sec, /<legend>音を聞くのに、いま何を使っていますか？<\/legend>/);
  assert.match(sec, /name="pointerDevice" value="mouse" required/);
  assert.match(sec, /name="audioDevice" value="wired" required/);
  assert.doesNotMatch(sec, /noanswer|答えない|任意/);
  assert.doesNotMatch(html, /タッチパッド|トラックパッド/);
  assert.match(sec, /マウス（机の上で手で動かす、ボタンの付いた機器）/);
  assert.match(sec, /ノートパソコンの、キーボードの手前にある平らな板を指でなでる操作/);
  assert.match(sec, /そのほか（トラックボール、ペン、画面に直接さわる操作など）/);
  // 3 つの選択肢のそれぞれに SVG の絵がある
  assert.equal((sec.match(/<svg class="device-icon"/g) || []).length, 3);
  assert.match(sec, /<button type="submit" class="primary" id="btn-req-next" disabled>/);
  // 同意の説明の部分は、最初は隠してある
  assert.match(html, /<div id="online-consent" hidden>/);
  // 「パソコンからの参加を確認しました」は出さない
  assert.doesNotMatch(read("../js/main.js"), /パソコンからの参加を確認しました/);
});

test("参加の条件の確認の案内の文が決定のとおり", () => {
  assert.equal(ONLINE_REQUIREMENTS.notMouse, "この課題は、マウスを使える方にご参加いただいています。マウスをつないでから、もう一度選んでください。");
  assert.match(ONLINE_REQUIREMENTS.bluetooth, /有線のイヤホンかパソコンのスピーカーに切り替えてから、もう一度選んでください。$/);
});

test("最後の質問（アンケート）の「答えない」は残っている", () => {
  const main = read("../js/main.js");
  assert.match(main, /value="noanswer"> 答えない/);
  assert.equal(ONLINE_AGE_BANDS.at(-1).value, "noanswer");
});
