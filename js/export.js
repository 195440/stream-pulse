function momentsOf(input) {
  const moments = Array.isArray(input) ? input : input?.moments ?? [];
  const start = Number(input?.startEpoch) || 0;
  return moments.map((moment) => ({
    ...moment,
    offsetMs: Number.isFinite(Number(moment.offsetMs))
      ? Math.max(0, Number(moment.offsetMs))
      : Math.max(0, Number(moment.ts) - start),
  })).sort((a, b) => a.offsetMs - b.offsetMs);
}

export function formatTimestamp(milliseconds, forceHours = false) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (forceHours || hours) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function cleanLabel(label) {
  return String(label || "Moment").replace(/[\r\n]+/g, " ").trim().slice(0, 100) || "Moment";
}

export function toChapters(input) {
  const lines = ["00:00 Intro"];
  let last = 0;
  for (const moment of momentsOf(input)) {
    const seconds = Math.floor(moment.offsetMs / 1000);
    if (seconds - last < 10) continue;
    lines.push(`${formatTimestamp(moment.offsetMs)} ${cleanLabel(moment.label)}`);
    last = seconds;
  }
  return lines.join("\n");
}

function topEmotes(input) {
  const value = input?.topEmotes ?? [];
  const entries = Array.isArray(value) ? value : Object.entries(value).map(([name, count]) => ({ name, count }));
  return entries.slice(0, 10);
}

export function toMarkdown(session) {
  const moments = momentsOf(session);
  const duration = Number(session?.durationMs) || Math.max(0, Date.now() - (Number(session?.startEpoch) || Date.now()));
  const lines = [
    "# Stream recap",
    "",
    `- Stream length: ${formatTimestamp(duration, duration >= 3600000)}`,
    `- Total messages: ${Number(session?.totalMessages) || 0}`,
    `- Peak chat rate: ${Number(session?.peakRate) || 0} messages / 5 s`,
    "",
    "## Top emotes",
    "",
  ];
  const emotes = topEmotes(session);
  lines.push(...(emotes.length ? emotes.map((item) => `- ${cleanLabel(item.name)}: ${Number(item.count) || 0}`) : ["- None"]));
  lines.push("", "## Moments", "");
  lines.push(...(moments.length
    ? moments.map((moment) => `- **${formatTimestamp(moment.offsetMs)}** ${cleanLabel(moment.label)} (${moment.type})`)
    : ["- No moments captured"]));
  return lines.join("\n");
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(input) {
  const rows = [["time", "type", "label", "peak_msgs_5s", "unique_chatters"]];
  for (const moment of momentsOf(input)) {
    rows.push([
      formatTimestamp(moment.offsetMs),
      moment.type,
      cleanLabel(moment.label),
      Number(moment.peakRate) || 0,
      Number(moment.uniqueChatters) || 0,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function stripUserData(value) {
  if (Array.isArray(value)) return value.map(stripUserData);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (["user", "userId", "displayName", "users", "messages"].includes(key)) continue;
    output[key] = stripUserData(child);
  }
  return output;
}

export function toJson(session, { privacy = true } = {}) {
  const data = privacy ? stripUserData(session) : session;
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export function fromJson(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.moments)) throw new Error("Invalid StreamPulse session");
  const startEpoch = Number(parsed.startEpoch);
  if (!Number.isFinite(startEpoch)) throw new Error("Session is missing a valid start time");
  return {
    ...parsed,
    startEpoch,
    moments: parsed.moments.slice(0, 2000).filter((moment) => Number.isFinite(Number(moment.ts))),
  };
}
