import { toChapters, toCsv, toJson, toMarkdown, fromJson, formatTimestamp } from "./export.js";
import { ChatClient } from "./irc.js";
import { MarkTracker } from "./marks.js";
import { PulseTracker } from "./pulse.js";
import { createSimulator } from "./sim.js";
import { Timeline } from "./timeline.js";

const params = new URLSearchParams(location.search);
const isDemo = params.get("demo") === "1";
const channel = (params.get("channel") || "").trim().toLowerCase();
const storageKey = `streampulse:session:${isDemo ? "demo" : channel || "unknown"}`;
const saved = readSaved();
const explicitStart = parseStart(params.get("start"));
let timeline = new Timeline({
  startEpoch: explicitStart ?? saved?.startEpoch ?? Date.now(),
  moments: saved?.moments ?? [],
});
const pulse = new PulseTracker({ sensitivity: Math.max(1, Math.min(10, Number(params.get("sensitivity")) || 5)) });
const marks = new MarkTracker({ threshold: Math.max(1, Math.min(25, Number(params.get("marks")) || 3)) });
let priorTotal = Number(saved?.totalMessages) || 0;
let priorPeak = Number(saved?.peakRate) || 0;
let importedEmotes = saved?.topEmotes ?? [];
let buckets = Array.isArray(saved?.buckets) ? saved.buckets.slice(-7200) : [];
let lastTrackerBucket = -Infinity;

const elements = {
  statusDot: document.querySelector("#status-dot"),
  statusText: document.querySelector("#status-text"),
  total: document.querySelector("#total-messages"),
  peak: document.querySelector("#peak-rate"),
  current: document.querySelector("#current-rate"),
  start: document.querySelector("#start-time"),
  rateChart: document.querySelector("#rate-chart"),
  miniChart: document.querySelector("#mini-chart"),
  body: document.querySelector("#moments-body"),
  empty: document.querySelector("#empty-state"),
  count: document.querySelector("#moment-count"),
  privacy: document.querySelector("#privacy"),
  privacyCopy: document.querySelector("#privacy-copy"),
  import: document.querySelector("#session-import"),
  exportStatus: document.querySelector("#export-status"),
};

function parseStart(value) {
  if (!value) return null;
  const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSaved() {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? fromJson(value) : null;
  } catch {
    return null;
  }
}

function localDateValue(epoch) {
  const date = new Date(epoch - new Date(epoch).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 19);
}

function setStatus(status, detail = "") {
  const labels = { connecting: "Connecting", live: "Live chat", reconnecting: "Reconnecting", error: "Connection error", demo: "Demo live", offline: "Offline" };
  elements.statusDot.dataset.status = status;
  elements.statusText.textContent = detail || labels[status] || status;
}

function addMoment(moment) {
  timeline.add(moment);
  renderMoments();
}

function receive(message) {
  const moment = pulse.add(message);
  const community = marks.add(message);
  if (moment) addMoment(moment);
  if (community) addMoment(community);
}

function syncTracker(now) {
  for (const moment of pulse.advance(now)) addMoment(moment);
  for (const bucket of pulse.history) {
    if (bucket.start > lastTrackerBucket) {
      buckets.push(bucket);
      lastTrackerBucket = bucket.start;
    }
  }
  if (buckets.length > 7200) buckets = buckets.slice(-7200);
  const snapshot = pulse.snapshot();
  elements.current.textContent = String(snapshot.rate);
  elements.total.textContent = String(priorTotal + snapshot.totalMessages);
  elements.peak.textContent = String(Math.max(priorPeak, snapshot.peakRate));
}

function button(label, action, className = "") {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  control.className = className;
  control.addEventListener("click", action);
  return control;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.className = "sr-only";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

function renderMoments() {
  const moments = timeline.getMoments();
  elements.body.replaceChildren();
  elements.empty.hidden = moments.length > 0;
  elements.count.textContent = String(moments.length);
  for (const moment of moments) {
    const row = document.createElement("tr");
    const values = [formatTimestamp(moment.offsetMs), moment.type, moment.label, moment.peakRate, moment.uniqueChatters];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      if (index === 1) cell.className = "type-badge";
      row.append(cell);
    });
    const actions = document.createElement("td");
    const group = document.createElement("div");
    group.className = "row-actions";
    const copyButton = button("Copy", async () => {
        await copyText(formatTimestamp(moment.offsetMs));
        announce("Timestamp copied.");
      });
    const renameButton = button("Rename", () => {
        const label = prompt("Rename moment", moment.label);
        if (label !== null && timeline.rename(moment.id, label)) renderMoments();
      });
    const deleteButton = button("Delete", () => {
        timeline.delete(moment.id);
        renderMoments();
      }, "delete-button");
    copyButton.setAttribute("aria-label", `Copy timestamp for ${moment.label}`);
    renameButton.setAttribute("aria-label", `Rename ${moment.label}`);
    deleteButton.setAttribute("aria-label", `Delete ${moment.label}`);
    group.append(copyButton, renameButton, deleteButton);
    actions.append(group);
    row.append(actions);
    elements.body.append(row);
  }
}

function sessionData() {
  const total = priorTotal + pulse.totalMessages;
  const top = new Map(importedEmotes.map((item) => [item.name, { ...item }]));
  for (const item of pulse.getTopEmotes(10)) {
    const existing = top.get(item.name) ?? { ...item, count: 0 };
    existing.count += item.count;
    top.set(item.name, existing);
  }
  return {
    version: 1,
    channel,
    startEpoch: timeline.startEpoch,
    durationMs: Math.max(0, Date.now() - timeline.startEpoch),
    totalMessages: total,
    peakRate: Math.max(priorPeak, pulse.peakRate),
    topEmotes: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    moments: timeline.moments.map((item) => ({ ...item })),
    buckets,
  };
}

function announce(message) {
  elements.exportStatus.textContent = message;
}

function download(content, filename, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function runExport(kind) {
  const session = sessionData();
  const privacy = elements.privacy.checked;
  const exports = {
    chapters: [toChapters(session), "streampulse-chapters.txt", "text/plain"],
    markdown: [toMarkdown(session), "streampulse-recap.md", "text/markdown"],
    csv: [toCsv(session), "streampulse-moments.csv", "text/csv"],
    json: [toJson(session, { privacy }), "streampulse-session.json", "application/json"],
  };
  const [content, name, type] = exports[kind];
  await copyText(content);
  download(content, name, type);
  announce(`${name} copied and downloaded.`);
}

function saveSession() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sessionData()));
    announce("Session autosaved.");
  } catch {
    announce("Autosave unavailable in this browser.");
  }
}

function importSession(session) {
  timeline = new Timeline({ startEpoch: session.startEpoch, moments: session.moments });
  priorTotal = Number(session.totalMessages) || 0;
  priorPeak = Number(session.peakRate) || 0;
  importedEmotes = session.topEmotes ?? [];
  buckets = Array.isArray(session.buckets) ? session.buckets.slice(-7200) : [];
  elements.start.value = localDateValue(timeline.startEpoch);
  renderMoments();
  announce("Session imported. Timeline is ready to re-time.");
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { context: canvas.getContext("2d"), width, height, ratio };
}

function drawGraph(canvas, data, mini = false) {
  const { context, width, height, ratio } = fitCanvas(canvas);
  context.clearRect(0, 0, width, height);
  const step = Math.max(1, Math.ceil(data.length / 600));
  const sampled = step === 1 ? data : data.filter((_, index) => index % step === 0 || index === data.length - 1);
  const values = sampled.length ? sampled : [{ count: 0 }];
  const max = Math.max(8, ...values.map((item) => item.count));
  if (!mini) {
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.lineWidth = ratio;
    for (let line = 1; line < 5; line += 1) {
      const y = line / 5 * height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }
  context.beginPath();
  values.forEach((item, index) => {
    const x = values.length === 1 ? width : index / (values.length - 1) * width;
    const y = height - (item.count / max) * (height - 4 * ratio) - 2 * ratio;
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.strokeStyle = mini ? "#ff4fbd" : "#57f3ff";
  context.lineWidth = (mini ? 1.5 : 2) * ratio;
  context.shadowColor = context.strokeStyle;
  context.shadowBlur = mini ? 2 * ratio : 8 * ratio;
  context.stroke();
}

function renderCharts() {
  drawGraph(elements.rateChart, buckets.slice(-120));
  drawGraph(elements.miniChart, buckets, true);
  requestAnimationFrame(renderCharts);
}

elements.start.value = localDateValue(timeline.startEpoch);
elements.start.addEventListener("change", () => {
  const value = new Date(elements.start.value).getTime();
  if (Number.isFinite(value)) {
    timeline.setStart(value);
    renderMoments();
    saveSession();
  }
});
elements.privacy.addEventListener("change", () => {
  elements.privacyCopy.textContent = elements.privacy.checked ? "Usernames stay out of every export." : "Privacy mode is off for JSON backups.";
});
document.querySelectorAll("[data-export]").forEach((control) => control.addEventListener("click", () => runExport(control.dataset.export)));
elements.import.addEventListener("change", async () => {
  try {
    importSession(fromJson(await elements.import.files[0].text()));
  } catch (error) {
    announce(error.message || "Could not import that session.");
  }
  elements.import.value = "";
});

renderMoments();
requestAnimationFrame(renderCharts);
const demoRunStarted = Date.now();
let simulatorTime = demoRunStarted;
setInterval(() => syncTracker(isDemo ? simulatorTime : Date.now()), 250);
setInterval(saveSession, 10000);
addEventListener("beforeunload", saveSession);

if (isDemo) {
  setStatus("demo");
  const simulator = createSimulator({ seed: 2026, startEpoch: demoRunStarted });
  let previous = performance.now();
  function simulate(now) {
    const delta = Math.min(100, now - previous) * 4;
    previous = now;
    for (const message of simulator.next(delta)) receive(message);
    simulatorTime = demoRunStarted + simulator.elapsed;
    requestAnimationFrame(simulate);
  }
  requestAnimationFrame(simulate);
} else if (channel) {
  const client = new ChatClient({ channel });
  client.onMessage(receive);
  client.onStatus(({ status, detail }) => setStatus(status, detail));
  client.start();
  addEventListener("beforeunload", () => client.stop(), { once: true });
} else {
  setStatus("error", "Missing channel");
}
