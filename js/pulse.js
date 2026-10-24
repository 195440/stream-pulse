const BUCKET_MS = 5000;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tokenise(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}_']+/gu) ?? [];
}

export function labelMoment(window) {
  const messages = Array.isArray(window) ? window : window?.messages ?? [];
  const emotes = new Map();
  let emoteCount = 0;
  let upper = 0;
  let letters = 0;
  const tokens = new Map();
  let tokenCount = 0;

  for (const message of messages) {
    for (const emote of message.emotes ?? []) {
      emotes.set(emote.name, (emotes.get(emote.name) ?? 0) + 1);
      emoteCount += 1;
    }
    const text = String(message.text ?? "");
    for (const char of text) {
      if (/\p{L}/u.test(char)) {
        letters += 1;
        if (char === char.toUpperCase() && char !== char.toLowerCase()) upper += 1;
      }
    }
    for (const token of tokenise(text)) {
      if (token.startsWith("mark") || token.startsWith("clip")) continue;
      tokens.set(token, (tokens.get(token) ?? 0) + 1);
      tokenCount += 1;
    }
  }

  const topEmote = [...emotes].sort((a, b) => b[1] - a[1])[0];
  if (topEmote && topEmote[1] / emoteCount >= 0.35) return `${topEmote[0]} spike`;
  if (letters && upper / letters > 0.5) return "CAPS hype";
  const topToken = [...tokens].sort((a, b) => b[1] - a[1])[0];
  if (topToken && topToken[1] >= 2 && topToken[1] / tokenCount >= 0.25) return `${topToken[0]} wave`;
  return "chat exploded";
}

function createBucket(start) {
  return { start, count: 0, users: new Set(), messages: [] };
}

export class PulseTracker {
  constructor({ sensitivity = 5, minMessages = 6, bucketMs = BUCKET_MS, cooldownMs = 20000 } = {}) {
    this.sensitivity = Math.max(1, Math.min(10, Number(sensitivity) || 5));
    this.minMessages = minMessages;
    this.bucketMs = bucketMs;
    this.cooldownMs = cooldownMs;
    this.current = null;
    this.history = [];
    this.baseline = 0;
    this.lastTrigger = -Infinity;
    this.totalMessages = 0;
    this.peakRate = 0;
    this.emoteTotals = new Map();
  }

  get threshold() {
    return 5.5 - this.sensitivity * 0.4;
  }

  add(message) {
    const parsedTs = Number(message.ts);
    const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    const moments = this.advance(ts);
    if (!this.current) this.current = createBucket(Math.floor(ts / this.bucketMs) * this.bucketMs);
    this.current.count += 1;
    this.current.users.add(message.userId || message.user || "anonymous");
    this.current.messages.push(message);
    this.totalMessages += 1;
    for (const emote of message.emotes ?? []) {
      const current = this.emoteTotals.get(emote.name) ?? { id: emote.id, name: emote.name, count: 0 };
      current.count += 1;
      this.emoteTotals.set(emote.name, current);
    }
    return moments[0] ?? null;
  }

  ingest(message) {
    return this.add(message);
  }

  advance(ts = Date.now()) {
    const target = Math.floor(ts / this.bucketMs) * this.bucketMs;
    if (!this.current) {
      this.current = createBucket(target);
      return [];
    }
    const moments = [];
    while (this.current.start < target) {
      const moment = this.finalize(this.current);
      if (moment) moments.push(moment);
      this.current = createBucket(this.current.start + this.bucketMs);
    }
    return moments;
  }

  finalize(bucket) {
    const recent = this.history.slice(-36).map((item) => item.count);
    const center = median(recent);
    const spread = median(recent.map((value) => Math.abs(value - center))) * 1.4826;
    const effectiveSpread = Math.max(spread, 1.5);
    const baseline = this.history.length ? this.baseline : center;
    const score = (bucket.count - baseline) / effectiveSpread;
    const uniqueChatters = bucket.users.size;
    const triggerAt = bucket.start + this.bucketMs;
    const isSpike = recent.length >= 3
      && score > this.threshold
      && bucket.count >= this.minMessages
      && uniqueChatters >= 3
      && triggerAt - this.lastTrigger >= this.cooldownMs;

    this.peakRate = Math.max(this.peakRate, bucket.count);
    this.history.push({ start: bucket.start, count: bucket.count, uniqueChatters });
    if (this.history.length > 7200) this.history.shift();
    this.baseline = this.history.length === 1 ? bucket.count : this.baseline * 0.85 + bucket.count * 0.15;

    if (!isSpike) return null;
    this.lastTrigger = triggerAt;
    return {
      ts: triggerAt,
      type: "auto",
      label: labelMoment(bucket.messages),
      peakRate: bucket.count,
      uniqueChatters,
      score: Number(score.toFixed(2)),
    };
  }

  getBuckets(durationMs = 600000) {
    const latest = this.current?.start ?? this.history.at(-1)?.start ?? 0;
    return this.history.filter((bucket) => bucket.start >= latest - durationMs);
  }

  getTopEmotes(limit = 10) {
    return [...this.emoteTotals.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  }

  snapshot() {
    return {
      rate: this.current?.count ?? 0,
      uniqueChatters: this.current?.users.size ?? 0,
      baseline: this.baseline,
      totalMessages: this.totalMessages,
      peakRate: this.peakRate,
    };
  }
}
