import test from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp, fromJson, toChapters, toCsv, toJson, toMarkdown } from "../js/export.js";

const session = {
  startEpoch: 1000,
  durationMs: 3661000,
  totalMessages: 321,
  peakRate: 44,
  topEmotes: [{ name: "Kappa", count: 20 }, { name: "PogChamp", count: 9 }],
  moments: [
    { ts: 6000, type: "auto", label: "Too early", peakRate: 8, uniqueChatters: 3 },
    { ts: 11000, type: "auto", label: "Start", peakRate: 12, uniqueChatters: 5 },
    { ts: 18000, type: "community", label: "Too close", peakRate: 0, uniqueChatters: 4 },
    { ts: 3602000, type: "both", label: "Finale", peakRate: 44, uniqueChatters: 20 },
  ],
};

test("formatTimestamp handles minute and hour forms", () => {
  assert.equal(formatTimestamp(0), "00:00");
  assert.equal(formatTimestamp(65000), "01:05");
  assert.equal(formatTimestamp(3600000), "01:00:00");
  assert.equal(formatTimestamp(5000, true), "00:00:05");
  assert.equal(formatTimestamp(-100), "00:00");
});

test("toChapters inserts Intro and enforces ten-second spacing", () => {
  const lines = toChapters(session).split("\n");
  assert.equal(lines[0], "00:00 Intro");
  assert.equal(lines[1], "00:10 Start");
  assert.equal(lines[2], "01:00:01 Finale");
  assert.equal(lines.length, 3);
});

test("toMarkdown includes aggregate recap data", () => {
  const markdown = toMarkdown(session);
  assert.match(markdown, /Stream length: 01:01:01/);
  assert.match(markdown, /Total messages: 321/);
  assert.match(markdown, /Peak chat rate: 44/);
  assert.match(markdown, /Kappa: 20/);
  assert.match(markdown, /\*\*00:10\*\* Start/);
  assert.doesNotMatch(markdown, /viewer\d/);
});

test("toCsv escapes syntax and neutralizes formula injection", () => {
  const csv = toCsv({ startEpoch: 0, moments: [
    { ts: 10000, type: "auto", label: '=HYPERLINK("bad","click")', peakRate: 9, uniqueChatters: 3 },
    { ts: 20000, type: "community", label: "+SUM(1,2)\nnext", peakRate: 0, uniqueChatters: 4 },
    { ts: 30000, type: "auto", label: "@cmd", peakRate: 7, uniqueChatters: 5 },
    { ts: 40000, type: "auto", label: "-2", peakRate: 7, uniqueChatters: 5 },
  ] });
  assert.match(csv, /"'=HYPERLINK\(""bad"",""click""\)"/);
  assert.match(csv, /"'\+SUM\(1,2\) next"/);
  assert.match(csv, /,'@cmd,/);
  assert.match(csv, /,'-2,/);
  assert.equal(csv.split("\n").length, 5);
});

test("JSON export defaults to privacy-safe fields", () => {
  const json = toJson({ ...session, user: "secret", messages: [{ user: "secret", text: "hi" }] });
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.user, undefined);
  assert.equal(parsed.messages, undefined);
  assert.ok(parsed.exportedAt);
  assert.equal(parsed.moments.length, 4);
});

test("JSON export can retain user data when privacy is off", () => {
  const parsed = JSON.parse(toJson({ ...session, user: "viewer" }, { privacy: false }));
  assert.equal(parsed.user, "viewer");
});

test("fromJson validates and limits imported sessions", () => {
  const many = Array.from({ length: 2005 }, (_, index) => ({ ts: index, label: `m${index}` }));
  const restored = fromJson(JSON.stringify({ startEpoch: 10, moments: [...many, { ts: "bad" }] }));
  assert.equal(restored.startEpoch, 10);
  assert.equal(restored.moments.length, 2000);
  assert.throws(() => fromJson("{}"), /Invalid/);
  assert.throws(() => fromJson({ moments: [] }), /start time/);
});
