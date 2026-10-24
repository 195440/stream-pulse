import { ChatClient } from "./irc.js";
import { MarkTracker } from "./marks.js";
import { PulseTracker } from "./pulse.js";
import { createSimulator } from "./sim.js";
import { formatTimestamp } from "./export.js";
import { emoteGlyph, formatDemoMessage } from "./display.js";

const params = new URLSearchParams(location.search);
const overlay = document.querySelector("#overlay");
const isDemo = overlay.dataset.demo === "true" || params.get("demo") === "1";
const options = {
  channel: (params.get("channel") || "").trim().toLowerCase(),
  sensitivity: Math.max(1, Math.min(10, Number(params.get("sensitivity")) || 5)),
  marks: Math.max(1, Math.min(25, Number(params.get("marks")) || 3)),
  corner: /^(tl|tr|bl|br)$/.test(params.get("corner")) ? params.get("corner") : "br",
  theme: params.get("theme") === "clean" ? "clean" : "neon",
  rain: params.get("rain") !== "0",
};

overlay.dataset.corner = options.corner;
overlay.classList.toggle("theme-clean", options.theme === "clean");

const elements = {
  statusDot: document.querySelector("#status-dot"),
  statusText: document.querySelector("#status-text"),
  rate: document.querySelector("#pulse-value"),
  chatters: document.querySelector("#chatter-count"),
  canvas: document.querySelector("#pulse-canvas"),
  banner: document.querySelector("#moment-banner"),
  label: document.querySelector("#moment-label"),
  time: document.querySelector("#moment-time"),
  toast: document.querySelector("#mark-toast"),
  markCount: document.querySelector("#mark-count"),
  rain: document.querySelector("#rain-layer"),
  chat: document.querySelector("#demo-chat-feed"),
};

const tracker = new PulseTracker({ sensitivity: options.sensitivity });
const marks = new MarkTracker({ threshold: options.marks });
const startedAt = isDemo ? 1700000000000 : Date.now();
const recentEmotes = [];
const chartSamples = Array(24).fill(0);
let latestTs = startedAt;
let bannerTimer;
let toastTimer;
let lastRain = 0;
let lastBucket = null;

function setStatus(status, detail = "") {
  const labels = {
    connecting: "Connecting",
    live: "Live chat",
    reconnecting: "Reconnecting",
    error: "Connection error",
    offline: "Offline",
    demo: "Demo live",
  };
  elements.statusDot.dataset.status = status;
  elements.statusText.textContent = detail || labels[status] || status;
}

function reveal(element, timerName) {
  element.classList.remove("is-visible");
  requestAnimationFrame(() => element.classList.add("is-visible"));
  if (timerName === "banner") {
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => element.classList.remove("is-visible"), 4500);
  } else {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-visible"), 4000);
  }
}

function showMoment(moment) {
  elements.label.textContent = moment.label;
  elements.time.textContent = formatTimestamp(moment.ts - startedAt);
  reveal(elements.banner, "banner");
}

function showMark(mark) {
  elements.markCount.textContent = String(mark.uniqueChatters);
  reveal(elements.toast, "toast");
}

function receive(message) {
  latestTs = Math.max(latestTs, message.ts);
  const moment = tracker.add(message);
  const mark = marks.add(message);
  if (moment) showMoment(moment);
  if (mark) showMark(mark);
  for (const emote of message.emotes ?? []) recentEmotes.push({ ...emote, ts: message.ts });
  if (isDemo) appendDemoChat(message);
}

function appendDemoChat(message) {
  if (!elements.chat) return;
  const colors = ["#57f3ff", "#ff82ca", "#b8ff5a", "#ffd166", "#a99cff", "#ff8b73"];
  const key = String(message.userId || message.user || "viewer");
  const colorIndex = [...key].reduce((total, character) => total + character.charCodeAt(0), 0) % colors.length;
  const line = document.createElement("div");
  line.className = "demo-chat-line";
  const user = document.createElement("span");
  user.className = "demo-chat-user";
  user.style.color = colors[colorIndex];
  user.textContent = message.displayName || message.user || "viewer";
  const text = document.createElement("span");
  text.textContent = `: ${formatDemoMessage(message)}`;
  line.append(user, text);
  elements.chat.append(line);
  while (elements.chat.children.length > 14) elements.chat.firstElementChild.remove();
}

function trimEmotes(now) {
  while (recentEmotes.length && now - recentEmotes[0].ts > 30000) recentEmotes.shift();
}

function topEmote(now) {
  trimEmotes(now);
  const counts = new Map();
  for (const emote of recentEmotes) {
    const item = counts.get(emote.id) ?? { id: emote.id, name: emote.name, count: 0 };
    item.count += 1;
    counts.set(emote.id, item);
  }
  // Weighted random pick among the five most used emotes, so the rain shows variety but favours the dominant one.
  const top = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  let ticket = Math.random() * top.reduce((sum, item) => sum + item.count, 0);
  for (const item of top) {
    ticket -= item.count;
    if (ticket <= 0) return item;
  }
  return top[0] ?? null;
}

function spawnRain(now) {
  if (!options.rain || now - lastRain < 550 || elements.rain.children.length >= 28) return;
  const emote = topEmote(now);
  if (!emote) return;
  lastRain = now;
  const node = document.createElement("div");
  node.className = "rain-emote";
  const size = Math.min(104, 44 + emote.count * 3);
  node.style.setProperty("--size", `${size}px`);
  node.style.setProperty("--duration", `${6 + Math.random() * 3}s`);
  node.style.left = `${3 + Math.random() * 90}%`;
  if (isDemo) {
    const label = document.createElement("span");
    label.textContent = emoteGlyph(emote.name);
    node.append(label);
  } else {
    const image = document.createElement("img");
    image.src = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emote.id)}/default/dark/3.0`;
    image.alt = "";
    node.append(image);
  }
  node.addEventListener("animationend", () => node.remove(), { once: true });
  elements.rain.append(node);
  setTimeout(() => node.remove(), 10000);
}

function drawChart() {
  const canvas = elements.canvas;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  const max = Math.max(8, ...chartSamples);
  context.beginPath();
  chartSamples.forEach((value, index) => {
    const x = index / (chartSamples.length - 1) * width;
    const y = height - (value / max) * (height - 3) - 1;
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.strokeStyle = options.theme === "clean" ? "#ffffff" : "#57f3ff";
  context.lineWidth = 2 * ratio;
  context.shadowBlur = options.theme === "clean" ? 0 : 7 * ratio;
  context.shadowColor = "#57f3ff";
  context.stroke();
}

function updateMeter(now) {
  const moments = tracker.advance(now);
  for (const moment of moments) showMoment(moment);
  const snapshot = tracker.snapshot();
  elements.rate.textContent = String(snapshot.rate);
  elements.chatters.textContent = String(snapshot.uniqueChatters);
  const bucket = Math.floor(now / 5000);
  if (bucket !== lastBucket) {
    lastBucket = bucket;
    chartSamples.push(tracker.history.at(-1)?.count ?? 0);
    chartSamples.shift();
  }
  drawChart();
  spawnRain(now);
}

if (isDemo) {
  setStatus("demo");
  const simulator = createSimulator({ seed: 2026, startEpoch: startedAt });
  let speed = 4;
  let previous = performance.now();
  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      speed = Number(button.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    });
  });
  function frame(now) {
    const elapsed = Math.min(1000, now - previous);
    previous = now;
    for (const message of simulator.next(elapsed * speed)) receive(message);
    latestTs = startedAt + simulator.elapsed;
    updateMeter(latestTs);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} else if (options.channel) {
  const client = new ChatClient({ channel: options.channel });
  client.onMessage(receive);
  client.onStatus(({ status, detail }) => setStatus(status, detail));
  client.start();
  setInterval(() => updateMeter(Date.now()), 250);
  addEventListener("beforeunload", () => client.stop(), { once: true });
} else {
  setStatus("error", "Missing channel");
  setInterval(() => updateMeter(Date.now()), 500);
}
