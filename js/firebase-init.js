// ==========================
// firebase-init.js
// ==========================
// Firebase Auth（匿名認証）と Firestore の薄いラッパー。Kikiwake v6 の firebase-init.js に準じる。
//
// 設計の原則（Kikiwake の firebase/schema.md から）。
// 1. 文書 ID を決定的にする。試行は sessions/{sessionId}/trials/{part}_{blockIndex}_{trialIndex}。
//    同じ試行を2回送っても上書きになるだけで、二重に数えられない。
// 2. 個人情報は保存しない。参加者番号と申告した経験だけを保存する。
// 3. 進捗はセッションの文書に持つ（completedTrialCount、lastTrialDocId）。
//
// firebase-config.js の apiKey が空のときは初期化しない（isEnabled() が false）。
// Firestore のオフライン永続化を有効にし、会場の回線が切れても送信を待ち行列に残す。
// ==========================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, getDoc, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const config = window.FIREBASE_CONFIG || {};
const enabled = Boolean(config.apiKey && config.projectId);

let app = null, auth = null, db = null, uid = null;

if (enabled) {
  app = initializeApp(config);
  auth = getAuth(app);
  // オフライン永続化。複数タブで開くことは想定しないので single tab manager にする。
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  });
}

export const FB = {
  enabled,
  get uid() { return uid; },

  isEnabled() { return enabled; },

  // 匿名でサインインする。既にサインイン済みなら、その uid を使う。
  async signInAnon() {
    if (!enabled) return null;
    if (auth.currentUser) { uid = auth.currentUser.uid; return uid; }
    const result = await signInAnonymously(auth);
    uid = result.user.uid;
    return uid;
  },

  onAuthChange(callback) {
    if (!enabled) return () => {};
    return onAuthStateChanged(auth, (user) => {
      uid = user ? user.uid : null;
      callback(user);
    });
  },

  // セッションの文書を作る、または更新する（merge）。
  async upsertSession(sessionId, data) {
    if (!enabled) return false;
    const ref = doc(db, "sessions", sessionId);
    await setDoc(ref, { ...data, uid, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  },

  async getSession(sessionId) {
    if (!enabled) return null;
    const snap = await getDoc(doc(db, "sessions", sessionId));
    return snap.exists() ? snap.data() : null;
  },

  // 1試行を保存する。文書 ID は record.docId（決定的）なので、再送は上書きになる。
  // オフラインのときに読み取りで待たされないよう、ここでは getDoc を使わない。
  // 進捗（completedTrialCount）は、IndexedDB にある試行の数を数えて upsertSession で書く。
  async saveTrial(sessionId, record) {
    if (!enabled) return false;
    const ref = doc(db, "sessions", sessionId, "trials", record.docId);
    const { sent, ...data } = record;
    await setDoc(ref, { ...data, uid, savedAt: serverTimestamp() });
    return true;
  },

  // Firestore の増分の値。main.js が upsertSession の中で使う。
  increment,
};

window.FB = FB;
