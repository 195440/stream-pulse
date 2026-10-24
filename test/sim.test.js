import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator } from "../js/sim.js";

function collect(simulator, duration, step = 1000) {
  const messages = [];
  for (let elapsed = 0; elapsed < duration; elapsed += step) messages.push(...simulator.next(step));
  return messages;
}

test("simulator is deterministic for a seed and call pattern", () => {
  const first = collect(createSimulator({ seed: 42 }), 30000);
  const second = collect(createSimulator({ seed: 42 }), 30000);
  assert.deepEqual(first, second);
  assert.ok(first.length > 50);
  assert.equal(first[0].id, "sim-0-1");
});

test("different seeds vary generated background chat", () => {
  const first = collect(createSimulator({ seed: 1 }), 10000);
  const second = collect(createSimulator({ seed: 2 }), 10000);
  assert.notDeepEqual(first.map((item) => item.text), second.map((item) => item.text));
  assert.equal(first.length, second.length);
});

test("simulator includes all three scripted spike types", () => {
  const startEpoch = 1700000000000;
  const messages = collect(createSimulator({ seed: 7, startEpoch }), 72000);
  const emoteStorm = messages.filter((item) => (item.ts - startEpoch) % 90000 >= 20000 && (item.ts - startEpoch) % 90000 < 28000);
  const capsHype = messages.filter((item) => (item.ts - startEpoch) % 90000 >= 43000 && (item.ts - startEpoch) % 90000 < 51000);
  const marks = messages.filter((item) => /^!(mark|clip)$/.test(item.text));
  assert.ok(emoteStorm.length > 30);
  assert.ok(emoteStorm.every((item) => item.emotes.length > 0));
  assert.ok(capsHype.length > 30);
  assert.ok(capsHype.every((item) => item.text === item.text.toUpperCase()));
  assert.ok(marks.length > 20);
  assert.ok(new Set(marks.map((item) => item.userId)).size >= 20);
});

test("simulator exposes elapsed time and loops after 90 seconds", () => {
  const simulator = createSimulator({ seed: 3 });
  simulator.next(450);
  assert.equal(simulator.elapsed, 450);
  const messages = simulator.next(92000);
  assert.equal(simulator.elapsed, 92450);
  assert.ok(messages.some((item) => item.id.startsWith("sim-1-")));
});

test("simulator handles empty and negative deltas", () => {
  const simulator = createSimulator();
  assert.deepEqual(simulator.next(0), []);
  assert.deepEqual(simulator.next(-10), []);
  assert.equal(simulator.elapsed, 0);
});
