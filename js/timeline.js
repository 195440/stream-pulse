function strength(moment) {
  return Number(moment.peakRate) || Number(moment.uniqueChatters) || Number(moment.score) || 0;
}

export class Timeline {
  constructor({ startEpoch = Date.now(), moments = [], maxMoments = 2000 } = {}) {
    this.startEpoch = Number(startEpoch) || Date.now();
    this.maxMoments = maxMoments;
    this.sequence = 0;
    this.moments = [];
    for (const moment of moments) this.add(moment);
  }

  setStart(startEpoch) {
    const value = Number(startEpoch);
    if (!Number.isFinite(value)) throw new Error("Invalid stream start time");
    this.startEpoch = value;
    return this.getMoments();
  }

  add(moment) {
    const providedId = moment.id ? String(moment.id) : "";
    const matchId = /^moment-(\d+)$/.exec(providedId);
    if (matchId) this.sequence = Math.max(this.sequence, Number(matchId[1]));
    const item = {
      id: providedId || `moment-${++this.sequence}`,
      ts: Number(moment.ts),
      type: moment.type || "auto",
      label: String(moment.label || "Moment").slice(0, 100),
      peakRate: Number(moment.peakRate) || 0,
      uniqueChatters: Number(moment.uniqueChatters) || 0,
      score: Number(moment.score) || 0,
    };
    if (!Number.isFinite(item.ts)) throw new Error("Moment requires a timestamp");

    const match = this.moments.find((existing) => {
      const mixedTypes = existing.type !== item.type && (existing.type !== "both" || item.type !== "both");
      return mixedTypes && Math.abs(existing.ts - item.ts) < 15000;
    });
    if (match) {
      const winner = strength(item) > strength(match) ? item : match;
      match.ts = winner.ts;
      match.label = winner.label;
      match.type = "both";
      match.peakRate = Math.max(match.peakRate, item.peakRate);
      match.uniqueChatters = Math.max(match.uniqueChatters, item.uniqueChatters);
      match.score = Math.max(match.score, item.score);
      return this.withOffset(match);
    }

    this.moments.push(item);
    this.moments.sort((a, b) => a.ts - b.ts);
    if (this.moments.length > this.maxMoments) this.moments.shift();
    return this.withOffset(item);
  }

  rename(id, label) {
    const moment = this.moments.find((item) => item.id === id);
    if (!moment) return false;
    moment.label = String(label).trim().slice(0, 100) || moment.label;
    return true;
  }

  delete(id) {
    const index = this.moments.findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.moments.splice(index, 1);
    return true;
  }

  withOffset(moment) {
    return { ...moment, offsetMs: Math.max(0, moment.ts - this.startEpoch) };
  }

  getMoments() {
    return this.moments.map((moment) => this.withOffset(moment));
  }

  toJSON() {
    return { startEpoch: this.startEpoch, moments: this.moments.map((moment) => ({ ...moment })) };
  }
}
