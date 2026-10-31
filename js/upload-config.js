// ==========================
// upload-config.js
// ==========================
// 記録の送信先の設定。栗原さんがデプロイのときに書き換えるのは、このファイルだけである。
//
// UPLOAD_TARGET … "gas"、"firebase"、"none" のどれか。
//   "gas"      … Google Apps Script の Web アプリへ送る（既定）。GAS_URL が空なら "none" と同じ動きになる。
//   "firebase" … Firestore へ送る（予備の選択肢）。js/firebase-config.js に設定が要る。
//   "none"     … 送信せず、この PC の IndexedDB への保存だけで動く。
//
// GAS_URL … Apps Script を「ウェブアプリ」としてデプロイしたときの URL。
//   https://script.google.com/macros/s/（デプロイ ID）/exec の形で、末尾が /exec で終わる。
//   取り方は README.md の「GAS のデプロイの手順」に書いてある。
//   この URL は公開されてもよい種類のもの（誰でも POST できる受け口）なので、
//   ここに書いてリポジトリに入れてよい。それ以外の鍵や認証情報は、このリポジトリに書かない。
// ==========================

export const UPLOAD_TARGET = "gas";

export const GAS_URL = "";

// 1 回の送信を待つ時間の上限（ミリ秒）。GAS は Drive への書き込みを含むと 2〜5 秒かかることがある。
export const UPLOAD_TIMEOUT_MS = 20000;
