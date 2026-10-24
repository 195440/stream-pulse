import test from "node:test";
import assert from "node:assert/strict";
import { labelMoment, PulseTracker } from "../js/pulse.js";

function message(ts, user, text = "hello", emotes = []) {
  return { ts, user, userId: user, text, emotes };
}

function runBuckets(tracker, counts, text = "wow") {
  const moments = [];
  tracker.advance(0);
  counts.forEach((count, bucket) => {
    for (let index = 0; index < count; index += 1) {
      const found = tracker.add(message(bucket * 5000 + index, `u${index}`, text));
      if (found) moments.push(found);
    }
  });
  moments.push(...tracker.advance(counts.length * 5000));
  return moments;
}

test("labelMoment prefers a dominant emote", () => {
  const messages = [
    message(0, "a", "Kappa", [{ id: "25", name: "Kappa", start: 0, end: 4 }]),
    message(1, "b", "Kappa", [{ id: "25", name: "Kappa", start: 0, end: 4 }]),
    message(2, "c", "PogChamp", [{ id: "88", name: "PogChamp", start: 0, end: 7 }]),
  ];
  assert.equal(labelMoment(messages), "Kappa spike");
});

test("labelMoment detects CAPS hype", () => {
  assert.equal(labelMoment([message(0, "a", "THIS IS WILD"), message(1, "b", "NO WAY")]), "CAPS hype");
});

test("labelMoment detects repeated words then falls back", () => {
  assert.equal(labelMoment([message(0, "a", "wow yes"), message(1, "b", "wow nice")]), "wow wave");
  assert.equal(labelMoment([message(0, "a", "one two"), message(1, "b", "three four")]), "chat exploded");
});

test("quiet traffic never triggers", () => {
  const tracker = new PulseTracker();
  const moments = runBuckets(tracker, Array(12).fill(4));
  assert.equal(moments.length, 0);
  assert.equal(tracker.snapshot().totalMessages, 48);
  assert.equal(tracker.snapshot().peakRate, 4);
});

test("a burst triggers exactly once", () => {
  const tracker = new PulseTracker();
  const moments = runBuckets(tracker, [1, 1, 1, 12, 1, 1]);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].type, "auto");
  assert.equal(moments[0].peakRate, 12);
  assert.equal(moments[0].uniqueChatters, 12);
  assert.equal(moments[0].label, "wow wave");
  assert.ok(moments[0].score > 3);
});

test("spikes need enough messages and unique chatters", () => {
  const tooSmall = runBuckets(new PulseTracker(), [0, 0, 0, 5]);
  assert.equal(tooSmall.length, 0);
  const tracker = new PulseTracker();
  for (let bucket = 0; bucket < 3; bucket += 1) tracker.advance((bucket + 1) * 5000);
  for (let index = 0; index < 12; index += 1) tracker.add(message(15000 + index, "same", "wow"));
  assert.equal(tracker.advance(20000).length, 0);
});

test("cooldown suppresses a nearby second burst", () => {
  const tracker = new PulseTracker();
  const moments = runBuckets(tracker, [0, 0, 0, 15, 0, 15, 0, 0, 20]);
  assert.equal(moments.length, 2);
  assert.equal(moments[0].ts, 20000);
  assert.equal(moments[1].ts, 45000);
});

test("higher sensitivity is monotonically easier to trigger", () => {
  const low = runBuckets(new PulseTracker({ sensitivity: 1, minMessages: 3 }), [0, 0, 0, 5]);
  const high = runBuckets(new PulseTracker({ sensitivity: 10, minMessages: 3 }), [0, 0, 0, 5]);
  assert.equal(low.length, 0);
  assert.equal(high.length, 1);
  assert.ok(new PulseTracker({ sensitivity: 10 }).threshold < new PulseTracker({ sensitivity: 1 }).threshold);
});

test("tracker aggregates emote totals and recent buckets", () => {
  const tracker = new PulseTracker();
  tracker.add(message(0, "a", "Kappa", [{ id: "25", name: "Kappa" }]));
  tracker.add(message(1, "b", "Kappa", [{ id: "25", name: "Kappa" }]));
  tracker.advance(5000);
  assert.equal(tracker.getTopEmotes()[0].count, 2);
  assert.equal(tracker.getTopEmotes()[0].id, "25");
  assert.equal(tracker.getBuckets().length, 1);
});
