// ==========================
// firebase-config.js
// ==========================
// Firebase プロジェクトの設定。Firebase コンソールの
// 「プロジェクトの設定」→「全般」→「マイアプリ」→「SDK の設定と構成」→「構成」に出る
// firebaseConfig の値を、そのまま下のオブジェクトに貼る。取り方は README.md に書いてある。
//
// apiKey が空のままだと、アプリは Firebase を初期化せず、IndexedDB への保存だけで動く。
// この設定の値は公開されてもよい種類のもの（Web アプリの識別子）だが、
// Firestore のセキュリティルールで書き込みの範囲を絞ること。
// ==========================

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
