// ==========================
// test/summary.test.js
// ==========================
// summary.js の純粋関数（1 試行の記録を要約の行と詳細の JSON に分ける）を検査する。
// gas/Code.gs の列の配列が js/summary.js と同じ並びであることも、ファイルを読んで検査する。
// 実行は、リポジトリの根で `node --test test/`。
// ==========================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  TRIAL_COLUMNS, SESSION_COLUMNS, DETAIL_KEYS,
  buildTrialSummary, buildTrialDetail, buildSessionRow, buildTrialPayload, buildSessionPayload,
  detailFileName, rowKeyOf,
} from "../js/summary.js";

const here = dirname(fileURLToPath(import.meta.url));

// recorder.js の buildTrialRecord が返す形を手で写した、1 試行の記録の見本。
function sampleRecord() {
  const n = 300;
  const path = { x: [], y: [], t: [], src: [] };
  for (let i = 0; i < n; i++) { path.x.push(400 + i); path.y.push(700 - i); path.t.push(1000 + i * 8); path.src.push(i % 2); }
  return {
    docId: "part1_2_3",
    seq: 17,
    sessionId: "nakayama-ws-2026_p4",
    participantId: 4,
    group: "general",
    eventName: "nakayama-ws-2026",
    appVersion: "v0.2.0",
    testMode: false,
    part: "part1",
    blockIndex: 2,
    blockPos: 1,
    trialIndex: 3,
    isPractice: false,
    t: 0.4,
    layoutId: 6,
    layoutName: "8枚・密・散らばり",
    layoutRows: ["1 5 7 3", "4 8 6 2"],
    nCards: 8,
    maxValue: 8,
    target: 7,
    isMaxTarget: false,
    toneCount: 7,
    startedAt: "2026-10-31T10:00:00.000Z",
    startClick: { x: 640, y: 820, perf: 1000.5, timeStamp: 1000.4 },
    waitMs: 731.2,
    toneTimesPerf: [1731.7, 2131.7, 2531.7, 2931.7, 3331.7, 3731.7, 4131.7],
    firstTonePerf: 1731.7,
    lastTonePerf: 4131.7,
    toneDurationMs: 80,
    audioBase: { basePerfNow: 1000.6, baseCtxTime: 0.52, baseLatencySec: 0.005, outputLatencySec: 0.02, sampleRate: 48000 },
    click: {
      x: 520, y: 300, perf: 4400.2, timeStamp: 4400.1, card: 7, correct: true,
      toneCountAtClick: 7, beforeLastTone: false, determinedAtClick: true, candidatesAtClick: [7, 8],
      msFromLastTone: 268.5, msFromFirstTone: 2668.5, msFromStart: 3399.7,
    },
    timedOut: false,
    endPerf: 4400.3,
    cardRects: [{ value: 1, left: 100, top: 200, width: 120, height: 165 }],
    boardRect: { left: 100, top: 200, width: 600, height: 370 },
    startButtonRect: { left: 560, top: 790, width: 160, height: 56 },
    path,
    rawPath: { x: [1, 2], y: [3, 4], t: [1001, 1002] },
    pathPointCount: n,
    rawPathPointCount: 2,
    moveEventCount: 150,
    derived: {
      movementOnsetPerf: 4150.1, movementOnsetMsFromFirstTone: 2418.4, cardAtLastTone: 5, onCorrectCardAtLastTone: false,
      cardAtEachTone: [null, null, 1, 1, 5, 5, 5], acquisitionTimeMs: 268.5, pathLengthPx: 612.3, straightLinePx: 533.1,
    },
    env: {
      screenWidth: 2560, screenHeight: 1440, devicePixelRatio: 2, innerWidth: 1280, innerHeight: 900,
      userAgent: "test-agent", audioGain: 0.3,
      calibration: { screenPxPerMm: 3.78, mousePxPerMm: 6.1, mouseCpi: 1600, calibratedAt: "2026-10-31T09:00:00.000Z" },
    },
    sent: false,
  };
}

function sampleSession() {
  return {
    sessionId: "nakayama-ws-2026_p4",
    participantId: 4,
    group: "general",
    eventName: "nakayama-ws-2026",
    testMode: false,
    appVersion: "v0.2.0",
    startedAt: "2026-10-31T10:00:00.000Z",
    resumedAt: null,
    resumeCount: 0,
    planLength: 134,
    completedTrialCount: 134,
    lastTrialDocId: "part4_1_4",
    env: {
      screenWidth: 2560, screenHeight: 1440, availWidth: 2560, availHeight: 1415, devicePixelRatio: 2,
      innerWidth: 1280, innerHeight: 900, outerWidth: 1280, outerHeight: 1000,
      userAgent: "test-agent", platform: "macOS", language: "ja", hardwareConcurrency: 8,
      hasCoalescedEvents: true, hasPointerRawUpdate: true, timeOrigin: 1761900000000, audioGain: 0.3,
      calibration: { screenPxPerMm: 3.78, mousePxPerMm: 6.1, mouseCpi: null, calibratedAt: "2026-10-31T09:00:00.000Z" },
    },
    survey: { experience: "yes", years: 3, grade: "C級", ageBand: "20s", handedness: "right", playedMajikaruta: "no", answeredAt: "2026-10-31T10:20:00.000Z" },
    finishedAt: "2026-10-31T10:20:01.000Z",
    status: "finished",
    sent: false,
  };
}

test("要約の行は、大きい配列を含まず、スカラと短い文字列だけでできている", () => {
  const s = buildTrialSummary(sampleRecord());
  for (const k of DETAIL_KEYS) assert.equal(k in s, false, `${k} が要約に残っている`);
  for (const [k, v] of Object.entries(s)) {
    assert.ok(v === null || ["string", "number", "boolean"].includes(typeof v), `${k} の値がスカラでない: ${typeof v}`);
    if (typeof v === "string") assert.ok(v.length < 1000, `${k} の文字列が長すぎる`);
  }
  assert.ok(JSON.stringify(s).length < 4000);
});

test("要約の行のキーは、すべて TRIAL_COLUMNS に含まれる", () => {
  const s = buildTrialSummary(sampleRecord(), { clientSentAt: "2026-10-31T10:00:05.000Z" });
  for (const k of Object.keys(s)) assert.ok(TRIAL_COLUMNS.includes(k), `列の一覧に無いキー: ${k}`);
  // GAS が埋める 2 列だけが要約に無い。
  const missing = TRIAL_COLUMNS.filter((c) => !(c in s));
  assert.deepEqual(missing, ["detailFileId", "receivedAt"]);
});

test("要約の行の主な値が記録から正しく写される", () => {
  const r = sampleRecord();
  const s = buildTrialSummary(r, { clientSentAt: "2026-10-31T10:00:05.000Z" });
  assert.equal(s.rowKey, "nakayama-ws-2026_p4/part1_2_3");
  assert.equal(s.rowKey, rowKeyOf(r));
  assert.equal(s.docId, "part1_2_3");
  assert.equal(s.sessionId, "nakayama-ws-2026_p4");
  assert.equal(s.participantId, 4);
  assert.equal(s.t, 0.4);
  assert.equal(s.target, 7);
  assert.equal(s.layoutRows, "1 5 7 3 / 4 8 6 2");
  assert.equal(s.startX, 640);
  assert.equal(s.startY, 820);
  assert.equal(s.startPerf, 1000.5);
  assert.equal(s.toneTimesPerf, "1731.700 2131.700 2531.700 2931.700 3331.700 3731.700 4131.700");
  assert.equal(s.audioSampleRate, 48000);
  assert.equal(s.clickCard, 7);
  assert.equal(s.correct, true);
  assert.equal(s.candidatesAtClick, "7 8");
  assert.equal(s.msFromLastTone, 268.5);
  assert.equal(s.cardAtEachTone, "- - 1 1 5 5 5");
  assert.equal(s.onCorrectCardAtLastTone, false);
  assert.equal(s.pathPointCount, 300);
  assert.equal(s.screenPxPerMm, 3.78);
  assert.equal(s.mouseCpi, 1600);
  assert.equal(s.detailFile, "part1_2_3.json");
  assert.equal(s.detailFile, detailFileName(r));
  assert.equal(s.clientSentAt, "2026-10-31T10:00:05.000Z");
});

test("時間切れの試行（click が null）でも要約の行が作れる", () => {
  const r = sampleRecord();
  r.click = null;
  r.timedOut = true;
  r.derived.acquisitionTimeMs = null;
  r.derived.straightLinePx = null;
  const s = buildTrialSummary(r);
  assert.equal(s.timedOut, true);
  assert.equal(s.clickX, null);
  assert.equal(s.clickCard, null);
  assert.equal(s.correct, null);
  assert.equal(s.candidatesAtClick, "");
  assert.equal(s.acquisitionTimeMs, null);
});

test("詳細の JSON には大きい配列と識別の項目が入り、要約と同じ rowKey を持つ", () => {
  const r = sampleRecord();
  const d = buildTrialDetail(r);
  for (const k of DETAIL_KEYS) assert.deepEqual(d[k], r[k]);
  assert.equal(d.rowKey, rowKeyOf(r));
  assert.equal(d.docId, r.docId);
  assert.equal(d.sessionId, r.sessionId);
  assert.deepEqual(d.toneTimesPerf, r.toneTimesPerf);
  assert.equal(d.path.x.length, 300);
  // 同じ記録からは同じ JSON ができる（再送して上書きしても内容は変わらない）。
  assert.equal(JSON.stringify(buildTrialDetail(r)), JSON.stringify(d));
});

test("試行の送信の本文は type が trial で、要約と詳細の両方を持つ", () => {
  const p = buildTrialPayload(sampleRecord(), { clientSentAt: "2026-10-31T10:00:05.000Z" });
  assert.equal(p.type, "trial");
  assert.equal(p.summary.docId, "part1_2_3");
  assert.equal(p.detail.path.t.length, 300);
  // 1 回の送信は数百 KB まで。見本の 300 点では数十 KB に収まる。
  assert.ok(JSON.stringify(p).length < 100000);
});

test("セッションの行は、アンケートと環境を平らにし、キーがすべて SESSION_COLUMNS に含まれる", () => {
  const row = buildSessionRow(sampleSession(), { clientSentAt: "2026-10-31T10:20:02.000Z" });
  for (const k of Object.keys(row)) assert.ok(SESSION_COLUMNS.includes(k), `列の一覧に無いキー: ${k}`);
  const missing = SESSION_COLUMNS.filter((c) => !(c in row));
  assert.deepEqual(missing, ["receivedAt"]);
  assert.equal(row.sessionId, "nakayama-ws-2026_p4");
  assert.equal(row.surveyExperience, "yes");
  assert.equal(row.surveyYears, 3);
  assert.equal(row.surveyGrade, "C級");
  assert.equal(row.status, "finished");
  assert.equal(row.hasPointerRawUpdate, true);
  assert.equal(row.screenPxPerMm, 3.78);
  assert.equal(row.mouseCpi, null);
  assert.equal(row.calibratedAt, "2026-10-31T09:00:00.000Z");
  for (const v of Object.values(row)) assert.ok(v === null || ["string", "number", "boolean"].includes(typeof v));
  const p = buildSessionPayload(sampleSession());
  assert.equal(p.type, "session");
  assert.equal(p.session.sessionId, "nakayama-ws-2026_p4");
});

test("アンケートが未回答のセッションでも行が作れる", () => {
  const s = sampleSession();
  s.survey = null;
  s.finishedAt = null;
  s.status = "running";
  const row = buildSessionRow(s);
  assert.equal(row.surveyExperience, null);
  assert.equal(row.finishedAt, null);
  assert.equal(row.status, "running");
});

test("列の名前に重複が無い", () => {
  assert.equal(new Set(TRIAL_COLUMNS).size, TRIAL_COLUMNS.length);
  assert.equal(new Set(SESSION_COLUMNS).size, SESSION_COLUMNS.length);
});

// gas/Code.gs の const TRIAL_COLUMNS = [...] と const SESSION_COLUMNS = [...] を読み取る。
function readGasColumns(name) {
  const src = readFileSync(join(here, "..", "gas", "Code.gs"), "utf8");
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `gas/Code.gs に ${name} が無い`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

test("gas/Code.gs の TRIAL_COLUMNS と SESSION_COLUMNS は js/summary.js と同じ並び", () => {
  assert.deepEqual(readGasColumns("TRIAL_COLUMNS"), TRIAL_COLUMNS);
  assert.deepEqual(readGasColumns("SESSION_COLUMNS"), SESSION_COLUMNS);
});
