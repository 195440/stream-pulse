export class MarkTracker {
  constructor({ threshold = 3, windowMs = 15000, cooldownMs = 30000 } = {}) {
    this.threshold = Math.max(1, Number(threshold) || 3);
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.votes = new Map();
    this.lastTrigger = -Infinity;
  }

  add(message) {
    const parsedTs = Number(message.ts);
    const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    for (const [user, votedAt] of this.votes) {
      if (ts - votedAt > this.windowMs) this.votes.delete(user);
    }
    if (!/^!(?:mark|clip)(?:\s|$)/i.test(String(message.text ?? "").trim())) return null;
    const user = message.userId || message.user;
    if (!user || this.votes.has(user)) return null;
    this.votes.set(user, ts);
    if (this.votes.size < this.threshold || ts - this.lastTrigger < this.cooldownMs) return null;
    this.lastTrigger = ts;
    return {
      ts,
      type: "community",
      label: "Community mark",
      peakRate: 0,
      uniqueChatters: this.votes.size,
    };
  }

  ingest(message) {
    return this.add(message);
  }

  reset() {
    this.votes.clear();
    this.lastTrigger = -Infinity;
  }
}
