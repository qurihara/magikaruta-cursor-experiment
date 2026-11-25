// ==========================
// online.js
// ==========================
// オンラインの募集（Yahoo!クラウドソーシング）のための判定の関数（v0.5.0）。
// DOM に触れない純粋な関数だけを置き、Node の test runner で検査する（test/online.test.js）。
// ==========================

import { ONLINE } from "./config.js";
import { hashSeed } from "./design.js";

// URL の ?wid= から作業者IDを取り出す。半角英数 1〜20 文字だけを受け、それ以外は null にする。
export function parseWid(params) {
  const w = String(params.get("wid") || "").trim();
  return /^[A-Za-z0-9]{1,20}$/.test(w) ? w : null;
}

// 作業者IDから参加者番号を決める。参加者番号は、t のブロックの順序（ウィリアムズ方陣の10通り）と
// 第2部と第3部の順序（偶奇）と、読まれる札の割り当ての種に使う。対面の参加者番号（1〜999）と重ならないよう、
// 10000 から 99999 の範囲にする。同じ wid なら同じ番号になるので、読み込み直しても同じ試行の列で再開できる。
export function participantIdFromWid(wid) {
  return 10000 + (hashSeed("wid", wid) % 90000);
}

// スマートフォンとタブレットの判定。丸山さんの isMobileEnv と同じ条件。
// iPadOS は Mac の UA を名乗るので、「Macintosh かつタッチ点が2以上」も弾く。
export function isMobileEnv(env) {
  if (env.uadMobile === true) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(env.userAgent || "")) return true;
  if (/Macintosh/.test(env.userAgent || "") && (env.maxTouchPoints || 0) > 1) return true;
  if ((env.maxTouchPoints || 0) > 0 && Math.min(env.screenWidth || 0, env.screenHeight || 0) < 700) return true;
  return false;
}

// 端末の問題を調べる。返り値は { mobile, narrow, short, problems }。
// mobile は開き直す以外に解決できない問題、narrow と short はウィンドウを広げれば解決できる問題。
export function envProblems(env, { minWidth = ONLINE.minInnerWidth, minHeight = ONLINE.minInnerHeight } = {}) {
  const mobile = isMobileEnv(env);
  const narrow = (env.innerWidth || 0) < minWidth;
  const short = (env.innerHeight || 0) < minHeight;
  const problems = [];
  if (mobile) problems.push("スマートフォンまたはタブレットと判定されました。この課題はパソコンとマウス（またはタッチパッド）で行います。パソコンで開き直してください。");
  if (narrow) problems.push(`ブラウザの表示の幅が足りません（いま ${env.innerWidth}px、${minWidth}px 以上が必要です）。ウィンドウを広げてください。`);
  if (short) problems.push(`ブラウザの表示の高さが足りません（いま ${env.innerHeight}px、${minHeight}px 以上が必要です）。全画面表示（Windows は F11、Mac は Control + Command + F）にするか、ウィンドウを広げてください。`);
  return { mobile, narrow, short, problems };
}

// 練習の記録の並びから、練習を続けるか、合格か、打ち切りかを決める。
// 返り値は "pass"（本番に進む）、"more"（練習を1回足す）、"fail"（打ち切って failed_practice）。
// planned は予定の練習の回数（5回）。予定の回数を終えるまでは "pending" を返し、呼び出し側は予定どおり進める。
export function practiceDecision(records, { planned, need = ONLINE.practicePassCorrect, max = ONLINE.practiceMaxTrials } = {}) {
  const correct = records.filter((r) => r.click && r.click.correct).length;
  if (records.length < planned) return "pending";
  if (correct >= need) return "pass";
  if (records.length >= max) return "fail";
  return "more";
}

// 本試行の記録の並びから、完了コードを出すかを決める。
// 返り値は { status, answered, total, ratio }。status は "finished" か "incomplete"。
export function completionDecision(records, { minRatio = ONLINE.minAnsweredRatio } = {}) {
  const main = records.filter((r) => !r.isPractice);
  const total = main.length;
  const answered = main.filter((r) => !r.timedOut).length;
  const ratio = total === 0 ? 0 : answered / total;
  return { status: total > 0 && ratio >= minRatio ? "finished" : "incomplete", answered, total, ratio };
}

// 同じブラウザで完了した記録（localStorage の値）と、いまの wid から、どう扱うかを決める。
// 返り値は "new"（初めて）、"same"（同じ wid で完了済み。終了の画面を出し直す）、"other"（別の wid で完了済み。二重の参加として止める）。
export function duplicateDecision(doneRecord, wid) {
  if (!doneRecord || !doneRecord.wid) return "new";
  return doneRecord.wid === wid ? "same" : "other";
}
