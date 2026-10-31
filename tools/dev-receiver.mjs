// ==========================
// tools/dev-receiver.mjs
// ==========================
// GAS の代わりに手元で POST を受ける小さなサーバ。送信の仕組みを、GAS をデプロイする前に確かめるために使う。
//
//   /opt/homebrew/bin/node tools/dev-receiver.mjs 8797
//
// で起動し、js/upload-config.js の GAS_URL を http://localhost:8797/ に向けると、
// アプリが送る JSON をこのサーバが受け取り、要点を標準出力に印字して {ok: true} を返す。
// 受け取った本文は、同じフォルダの received/ の下に、GAS と同じ構成（セッションごとのフォルダに docId.json）で保存する。
//
// 失敗の様子を確かめたいときは、?fail=1 を URL に付けて起動側に渡すのではなく、このサーバを止める。
// 止めるとアプリの fetch が失敗し、記録が未送信のまま残る。もう一度起動して「再送」を押すと届く。
//
// このサーバは、開発の確認にだけ使う。記録の正本は IndexedDB と GAS 側にある。
// ==========================

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] || 8797);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "received");
let count = 0;

function safe(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200) || "unknown";
}

const server = createServer((req, res) => {
  // text/plain の POST は単純な要求なので事前要求は来ないが、ブラウザが応答を読むには
  // Access-Control-Allow-Origin が要る。GAS の転送先も同じ見出しを付けて返す。
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.writeHead(204); res.end(); return;
  }
  if (req.method !== "POST") {
    res.end(JSON.stringify({ ok: true, app: "dev-receiver", message: "POST で記録を受け取ります。", received: count }));
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8");
    count++;
    let body;
    try { body = JSON.parse(text); } catch (e) {
      console.log(`#${count} JSON を読めない (${text.length} bytes)`);
      res.end(JSON.stringify({ ok: false, error: "JSON を読めませんでした" })); return;
    }
    const receivedAt = new Date().toISOString();
    if (body.type === "trial") {
      const s = body.summary || {};
      const d = body.detail || {};
      const dir = join(outDir, safe(s.sessionId));
      mkdirSync(dir, { recursive: true });
      const file = join(dir, safe(s.detailFile || `${s.docId}.json`));
      writeFileSync(file, JSON.stringify(d));
      const summaryFile = join(dir, "trials.jsonl");
      writeFileSync(summaryFile, JSON.stringify({ ...s, receivedAt }) + "\n", { flag: "a" });
      console.log(`#${count} trial ${s.rowKey} part=${s.part} t=${s.t} target=${s.target} card=${s.clickCard} correct=${s.correct} ` +
        `path=${d.path ? d.path.t.length : "-"} raw=${d.rawPath ? d.rawPath.t.length : "-"} bytes=${text.length}`);
      res.end(JSON.stringify({ ok: true, type: "trial", rowKey: s.rowKey, detailFileId: `dev-${count}`, receivedAt }));
    } else if (body.type === "session") {
      const s = body.session || {};
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "sessions.jsonl"), JSON.stringify({ ...s, receivedAt }) + "\n", { flag: "a" });
      console.log(`#${count} session ${s.sessionId} status=${s.status} completed=${s.completedTrialCount}/${s.planLength} survey=${s.surveyExperience ?? "-"} bytes=${text.length}`);
      res.end(JSON.stringify({ ok: true, type: "session", sessionId: s.sessionId, receivedAt }));
    } else if (body.type === "ping") {
      console.log(`#${count} ping`);
      res.end(JSON.stringify({ ok: true, type: "ping", receivedAt }));
    } else {
      console.log(`#${count} 知らない type: ${body.type}`);
      res.end(JSON.stringify({ ok: false, error: `知らない type です: ${body.type}` }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`dev-receiver: http://localhost:${port}/ で待っています。保存先: ${outDir}`);
});
