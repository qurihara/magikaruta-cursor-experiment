// online.js の判定の検査（v0.5.0）。node --test test/*.test.js で実行する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWid, participantIdFromWid, isMobileEnv, envProblems, practiceDecision, completionDecision, duplicateDecision,
  restAfter, surveyValue,
} from "../js/online.js";
import { ONLINE, ONLINE_AGE_BANDS, APP_VERSION, INSTRUCTIONS, START_HINTS, PART3_PRACTICE_GUIDE_NOTE, RULES_VIDEO } from "../js/config.js";
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
  // 同意の画面の申告（ポインタと音の機器）は任意で、「答えない」がある
  assert.doesNotMatch(html, /name="pointerDevice"[^>]*required/);
  assert.doesNotMatch(html, /name="audioDevice"[^>]*required/);
  assert.match(html, /name="pointerDevice" value="noanswer"/);
  assert.match(html, /name="audioDevice" value="noanswer"/);
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

test("教示の文が決定のとおり（I1、I3、I4、I5、I6、I8、I9）", () => {
  assert.equal(START_HINTS.all, "札の配置を覚えたら、開始を押してください");
  assert.equal(START_HINTS.part2, "開始ボタンの真ん中あたりを押してください");
  assert.match(INSTRUCTIONS.part1, /正しい札が分かったら、最後の高い音を待たずにクリックしてもかまいません。$/);
  assert.equal(INSTRUCTIONS.part2, "開始を押したら、カーソルを開始ボタンの上に置いたまま待ち、最後の高い音が聞こえたら札へ動かしてください。");
  assert.equal(INSTRUCTIONS.part3[0], "第3部では、次の動き方を試していただきます。");
  assert.equal(INSTRUCTIONS.part3[1], "開始を押したら、最初の音が鳴る前から、いちばん小さい数字の札の上で待ってかまいません。");
  assert.match(INSTRUCTIONS.part3[2], /^1\. /);
  assert.match(INSTRUCTIONS.part3[3], /^2\. /);
  assert.match(INSTRUCTIONS.part3[4], /^3\. /);
  assert.equal(INSTRUCTIONS.part3.length, 6);
  assert.equal(INSTRUCTIONS.part4.join(""), "ここからは、どの動き方でもかまいません。第2部のように最後の高い音を聞いてから動いても、第3部のように候補の札の上で待ちながら動いても、それ以外の動き方でもかまいません。正しい札を、できるだけ早くクリックしてください。正しい札が分かったら、最後の高い音を待たずにクリックしてもかまいません。");
  assert.equal(PART3_PRACTICE_GUIDE_NOTE, "練習の目印：いま乗せるべき札を光らせています。光っている札にカーソルを移してください（本番では光りません）");
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
  assert.match(html, /<h1>まじかるたの課題（パソコンで約20分）<\/h1>/);
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
