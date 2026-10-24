import test from "node:test";
import assert from "node:assert/strict";
import { MarkTracker } from "../js/marks.js";

const vote = (ts, user, text = "!mark") => ({ ts, user, userId: user, text });

test("MarkTracker fires at the unique-user threshold", () => {
  const tracker = new MarkTracker({ threshold: 3 });
  assert.equal(tracker.add(vote(0, "a")), null);
  assert.equal(tracker.add(vote(1000, "b", "!clip")), null);
  const mark = tracker.add(vote(2000, "c", "!MARK wow"));
  assert.equal(mark.type, "community");
  assert.equal(mark.uniqueChatters, 3);
  assert.equal(mark.ts, 2000);
});

test("MarkTracker de-duplicates one user per window", () => {
  const tracker = new MarkTracker({ threshold: 2 });
  assert.equal(tracker.add(vote(0, "a")), null);
  assert.equal(tracker.add(vote(100, "a", "!clip")), null);
  assert.equal(tracker.votes.size, 1);
  assert.equal(tracker.add(vote(200, "b")).uniqueChatters, 2);
});

test("MarkTracker ignores normal chat and expired votes", () => {
  const tracker = new MarkTracker({ threshold: 2 });
  assert.equal(tracker.add(vote(0, "a", "mark")), null);
  assert.equal(tracker.votes.size, 0);
  tracker.add(vote(1, "a"));
  assert.equal(tracker.add(vote(15002, "b")), null);
  assert.equal(tracker.votes.size, 1);
});

test("MarkTracker applies cooldown and can fire later", () => {
  const tracker = new MarkTracker({ threshold: 2, cooldownMs: 30000 });
  tracker.add(vote(0, "a"));
  assert.ok(tracker.add(vote(1, "b")));
  tracker.add(vote(16000, "c"));
  assert.equal(tracker.add(vote(16001, "d")), null);
  tracker.add(vote(32000, "e"));
  const second = tracker.add(vote(32001, "f"));
  assert.ok(second);
  assert.equal(second.ts, 32001);
});

test("MarkTracker reset clears state", () => {
  const tracker = new MarkTracker();
  tracker.add(vote(0, "a"));
  tracker.reset();
  assert.equal(tracker.votes.size, 0);
  assert.equal(tracker.lastTrigger, -Infinity);
});
