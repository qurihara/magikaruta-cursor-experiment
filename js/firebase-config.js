// ==========================
// firebase-config.js
// ==========================
// Firebase プロジェクトの設定。Firebase コンソールの
// 「プロジェクトの設定」→「全般」→「マイアプリ」→「SDK の設定と構成」→「構成」に出る
// firebaseConfig の値を、そのまま下のオブジェクトに貼る。取り方は README.md に書いてある。
//
// 2026-11-02 にパイロット用のプロジェクト magikaruta-pilot-2026 の値を入れた。
// apiKey が空のままだと、アプリは Firebase を初期化せず、IndexedDB への保存だけで動く。
// この設定の値は公開されてもよい種類のもの（Web アプリの識別子）だが、
// Firestore のセキュリティルールで書き込みの範囲を絞ること。
// ==========================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUBAjkCceb0Xpc3t1DdyEV-SFQ3wOx1mw",
  authDomain: "magikaruta-pilot-2026.firebaseapp.com",
  projectId: "magikaruta-pilot-2026",
  storageBucket: "magikaruta-pilot-2026.firebasestorage.app",
  messagingSenderId: "213761279730",
  appId: "1:213761279730:web:4a8920a6b880753058b26b",
};
