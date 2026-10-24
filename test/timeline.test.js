import test from "node:test";
import assert from "node:assert/strict";
import { Timeline } from "../js/timeline.js";

test("Timeline stores, sorts and re-times moments", () => {
  const timeline = new Timeline({ startEpoch: 1000 });
  timeline.add({ ts: 21000, type: "auto", label: "later", peakRate: 8 });
  timeline.add({ ts: 11000, type: "auto", label: "first", peakRate: 7 });
  assert.deepEqual(timeline.getMoments().map((item) => item.label), ["first", "later"]);
  assert.deepEqual(timeline.getMoments().map((item) => item.offsetMs), [10000, 20000]);
  timeline.setStart(6000);
  assert.deepEqual(timeline.getMoments().map((item) => item.offsetMs), [5000, 15000]);
});

test("Timeline merges nearby auto and community moments", () => {
  const timeline = new Timeline({ startEpoch: 0 });
  const auto = timeline.add({ ts: 20000, type: "auto", label: "Kappa spike", peakRate: 20, uniqueChatters: 9 });
  const merged = timeline.add({ ts: 25000, type: "community", label: "Community mark", uniqueChatters: 4 });
  assert.equal(timeline.getMoments().length, 1);
  assert.equal(merged.id, auto.id);
  assert.equal(merged.type, "both");
  assert.equal(merged.label, "Kappa spike");
  assert.equal(merged.peakRate, 20);
  assert.equal(merged.uniqueChatters, 9);
});

test("Timeline keeps a stronger community moment when merging", () => {
  const timeline = new Timeline({ startEpoch: 1000 });
  timeline.add({ ts: 20000, type: "auto", label: "Small", peakRate: 3 });
  const merged = timeline.add({ ts: 25000, type: "community", label: "Crowd", uniqueChatters: 8 });
  assert.equal(merged.label, "Crowd");
  assert.equal(merged.ts, 25000);
  assert.equal(merged.offsetMs, 24000);
});

test("Timeline does not merge same-type or distant moments", () => {
  const timeline = new Timeline({ startEpoch: 0 });
  timeline.add({ ts: 10000, type: "auto", label: "A" });
  timeline.add({ ts: 12000, type: "auto", label: "B" });
  timeline.add({ ts: 40000, type: "community", label: "C" });
  assert.equal(timeline.getMoments().length, 3);
});

test("Timeline renames and deletes by id", () => {
  const timeline = new Timeline({ startEpoch: 0 });
  const moment = timeline.add({ ts: 1000, label: "Old" });
  assert.equal(timeline.rename(moment.id, "New"), true);
  assert.equal(timeline.getMoments()[0].label, "New");
  assert.equal(timeline.rename("missing", "No"), false);
  assert.equal(timeline.delete(moment.id), true);
  assert.equal(timeline.delete(moment.id), false);
  assert.equal(timeline.getMoments().length, 0);
});

test("Timeline enforces the configured cap", () => {
  const timeline = new Timeline({ startEpoch: 0, maxMoments: 2 });
  timeline.add({ ts: 1, type: "auto", label: "one" });
  timeline.add({ ts: 2, type: "auto", label: "two" });
  timeline.add({ ts: 3, type: "auto", label: "three" });
  assert.deepEqual(timeline.getMoments().map((item) => item.label), ["two", "three"]);
  assert.throws(() => timeline.add({ label: "invalid" }), /timestamp/);
});

test("Timeline continues IDs after a restored session", () => {
  const timeline = new Timeline({
    startEpoch: 0,
    moments: [{ id: "moment-12", ts: 1000, type: "auto", label: "restored" }],
  });
  const next = timeline.add({ ts: 2000, type: "auto", label: "new" });
  assert.equal(next.id, "moment-13");
  assert.equal(new Set(timeline.getMoments().map((item) => item.id)).size, 2);
});
