// ==========================
// upload-config.js
// ==========================
// 記録の送信先の設定。栗原さんがデプロイのときに書き換えるのは、このファイルだけである。
//
// UPLOAD_TARGET … "gas"、"firebase"、"none" のどれか。
//   "firebase" … Firestore へ送る（既定）。js/firebase-config.js に設定が要る。
//   "gas"      … Google Apps Script の Web アプリへ送る（予備の選択肢）。GAS_URL が空なら "none" と同じ動きになる。
//
// 2026-11-02 に、丸山さんの経験（GAS の受け口は不安定）を受けて、栗原さんが送信先を Firebase に戻した。
// プロジェクトは magikaruta-pilot-2026（Firestore は asia-northeast1）。
//   "none"     … 送信せず、この PC の IndexedDB への保存だけで動く。
//
// GAS_URL … Apps Script を「ウェブアプリ」としてデプロイしたときの URL。
//   https://script.google.com/macros/s/（デプロイ ID）/exec の形で、末尾が /exec で終わる。
//   取り方は README.md の「GAS のデプロイの手順」に書いてある。
//   この URL は公開されてもよい種類のもの（誰でも POST できる受け口）なので、
//   ここに書いてリポジトリに入れてよい。それ以外の鍵や認証情報は、このリポジトリに書かない。
// ==========================

export const UPLOAD_TARGET = "firebase";

export const GAS_URL = "";

// 1 回の送信を待つ時間の上限（ミリ秒）。GAS は Drive への書き込みを含むと 2〜5 秒かかることがある。
export const UPLOAD_TIMEOUT_MS = 20000;
