// ==========================
// gas-client.js
// ==========================
// Google Apps Script の Web アプリへ記録を送る薄い層。
//
// 送り方は iFont の prod_common.js と同じで、Content-Type を text/plain にして JSON を POST する。
// text/plain の POST は「単純な要求」なので、ブラウザは CORS の事前要求（OPTIONS）を出さず、
// GAS がそれに答えられない問題を避けられる。GAS は POST を script.googleusercontent.com へ
// 302 で転送するので、redirect: "follow" を付ける。転送先の応答には Access-Control-Allow-Origin: * が
// 付くので、iFont の no-cors と違って応答の本文（{ok: true, ...}）を読める。
//
// 返り値は常に { ok, ... } の形で、例外を投げない。ok が true のときだけ、呼び出し側は
// IndexedDB の送信済みの印を立てる。時間切れ、回線の断、GAS 側のエラーはすべて ok: false になり、
// 記録は未送信のまま残って、あとで再送される。
// ==========================

export async function postToGas(url, payload, { timeoutMs = 20000 } = {}) {
  if (!url) return { ok: false, skipped: true, error: "GAS_URL が空です" };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    let json;
    try {
      json = await res.json();
    } catch (e) {
      // GAS が HTML（ログイン画面やエラーの画面）を返したときにここへ来る。送信済みとは見なさない。
      return { ok: false, status: res.status, error: "応答が JSON ではありません（デプロイの設定で「アクセスできるユーザ」が全員になっているかを確かめてください）" };
    }
    if (json && json.ok === true) return json;
    return { ok: false, error: (json && json.error) || "GAS が ok を返しませんでした", response: json };
  } catch (e) {
    const timedOut = e && e.name === "AbortError";
    return { ok: false, timeout: timedOut, error: timedOut ? `時間切れ（${timeoutMs} ms）` : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 受け口が生きているかを確かめる。応答の ok を返す。
export async function pingGas(url, { timeoutMs = 8000 } = {}) {
  return postToGas(url, { type: "ping" }, { timeoutMs });
}
