import test from "node:test";
import assert from "node:assert/strict";
import { emoteGlyph, formatDemoMessage, projectMomentMarkers } from "../js/display.js";

test("emoteGlyph maps supported names case-insensitively", () => {
  assert.equal(emoteGlyph("Kappa"), "😐");
  assert.equal(emoteGlyph("kekw"), "😂");
  assert.equal(emoteGlyph("LUL"), "🤣");
  assert.equal(emoteGlyph("PogChamp"), "😮");
  assert.equal(emoteGlyph("PepeHands"), "😭");
  assert.equal(emoteGlyph("EZ"), "😎");
  assert.equal(emoteGlyph("unknown"), "✨");
});

test("formatDemoMessage replaces emote ranges without losing surrounding text", () => {
  const formatted = formatDemoMessage({
    text: "wow Kappa Kappa",
    emotes: [
      { name: "Kappa", start: 4, end: 8 },
      { name: "Kappa", start: 10, end: 14 },
    ],
  });
  assert.equal(formatted, "wow 😐 😐");
  assert.equal(formatDemoMessage({ text: "KEKW and Pog" }), "😂 and 😮");
  assert.equal(formatDemoMessage({ text: "plain chat" }), "plain chat");
  assert.equal(formatDemoMessage({ text: "safe", emotes: [{ name: "Kappa", start: 50, end: 54 }] }), "safe");
});

test("projectMomentMarkers uses the visible bucket time domain", () => {
  const buckets = [{ start: 1000, count: 2 }, { start: 6000, count: 4 }, { start: 11000, count: 7 }];
  const markers = projectMomentMarkers(buckets, [
    { id: "before", ts: 999, type: "auto" },
    { id: "start", ts: 1000, type: "auto" },
    { id: "middle", ts: 8500, type: "community" },
    { id: "end", ts: 16000, type: "both" },
    { id: "after", ts: 16001, type: "auto" },
  ]);
  assert.deepEqual(markers.map((marker) => marker.id), ["start", "middle", "end"]);
  assert.equal(markers[0].position, 0);
  assert.equal(markers[1].position, 0.5);
  assert.equal(markers[2].position, 1);
  assert.equal(markers[1].type, "community");
});

test("projectMomentMarkers handles empty and invalid domains", () => {
  assert.deepEqual(projectMomentMarkers([], [{ ts: 1000 }]), []);
  assert.deepEqual(projectMomentMarkers([{ start: "bad" }], [{ ts: 1000 }]), []);
});
