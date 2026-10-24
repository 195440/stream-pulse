const EMOTE_GLYPHS = Object.freeze({
  KAPPA: "😐",
  KEKW: "😂",
  LUL: "🤣",
  POGCHAMP: "😮",
  POG: "😮",
  PEPEHANDS: "😭",
  EZ: "😎",
  OMEGALUL: "🤣",
});

export function emoteGlyph(name) {
  return EMOTE_GLYPHS[String(name ?? "").toUpperCase()] ?? "✨";
}

export function formatDemoMessage(message) {
  const characters = Array.from(String(message?.text ?? "").slice(0, 500));
  const emotes = [...(message?.emotes ?? [])].sort((a, b) => a.start - b.start);
  if (!emotes.length) {
    return characters.join("").replace(
      /\b(Kappa|KEKW|LUL|PogChamp|Pog|PepeHands|EZ|OMEGALUL)\b/gi,
      (name) => emoteGlyph(name),
    );
  }

  const output = [];
  let cursor = 0;
  for (const emote of emotes) {
    const start = Number(emote.start);
    const end = Number(emote.end);
    if (
      !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < cursor
      || end < start
      || start >= characters.length
      || end >= characters.length
    ) continue;
    output.push(characters.slice(cursor, start).join(""), emoteGlyph(emote.name));
    cursor = end + 1;
  }
  output.push(characters.slice(cursor).join(""));
  return output.join("");
}

export function projectMomentMarkers(buckets, moments, bucketMs = 5000) {
  if (!buckets?.length) return [];
  const domainStart = Number(buckets[0].start);
  const domainEnd = Number(buckets.at(-1).start) + bucketMs;
  const span = domainEnd - domainStart;
  if (!Number.isFinite(domainStart) || !Number.isFinite(domainEnd) || span <= 0) return [];

  return (moments ?? []).flatMap((moment) => {
    const timestamp = Number(moment.ts);
    if (!Number.isFinite(timestamp) || timestamp < domainStart || timestamp > domainEnd) return [];
    return [{
      id: moment.id,
      type: moment.type,
      position: Math.max(0, Math.min(1, (timestamp - domainStart) / span)),
    }];
  });
}
