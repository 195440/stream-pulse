const elements = {
  form: document.querySelector("#channel-form"),
  channel: document.querySelector("#channel"),
  error: document.querySelector("#channel-error"),
  sensitivity: document.querySelector("#sensitivity"),
  sensitivityValue: document.querySelector("#sensitivity-value"),
  marks: document.querySelector("#marks"),
  theme: document.querySelector("#theme"),
  corner: document.querySelector("#corner"),
  rain: document.querySelector("#rain"),
  url: document.querySelector("#obs-url"),
  copy: document.querySelector("#copy-url"),
  copyStatus: document.querySelector("#copy-status"),
  canvas: document.querySelector("#hero-canvas"),
  heroRate: document.querySelector("#hero-rate"),
};

function validChannel() {
  const channel = elements.channel.value.trim().replace(/^#/, "").toLowerCase();
  const valid = /^[a-z0-9_]{1,25}$/.test(channel);
  elements.error.textContent = channel && !valid ? "Use the channel login: letters, numbers, or underscores." : "";
  elements.channel.setAttribute("aria-invalid", String(!valid && Boolean(channel)));
  return valid ? channel : "";
}

function destination(page) {
  const channel = validChannel();
  if (!channel) return null;
  const url = new URL(`${page}.html`, location.href);
  url.searchParams.set("channel", channel);
  url.searchParams.set("sensitivity", elements.sensitivity.value);
  url.searchParams.set("marks", elements.marks.value);
  url.searchParams.set("theme", elements.theme.value);
  url.searchParams.set("corner", elements.corner.value);
  url.searchParams.set("rain", elements.rain.checked ? "1" : "0");
  return url;
}

function updateUrl() {
  elements.sensitivityValue.textContent = elements.sensitivity.value;
  const url = destination("overlay");
  elements.url.value = url?.href ?? "Enter a Twitch channel above to generate your URL";
}

function openPage(page) {
  const url = destination(page);
  if (!url) {
    elements.error.textContent = "Enter a Twitch channel to continue.";
    elements.channel.focus();
    return;
  }
  open(url, "_blank", "noopener");
}

async function copyUrl() {
  const url = destination("overlay");
  if (!url) {
    elements.error.textContent = "Enter a Twitch channel before copying the URL.";
    elements.channel.focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(url.href);
  } catch {
    elements.url.select();
    document.execCommand("copy");
  }
  elements.copyStatus.textContent = "OBS URL copied.";
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  openPage("overlay");
});
document.querySelector("[data-open='dashboard']").addEventListener("click", () => openPage("dashboard"));
elements.copy.addEventListener("click", copyUrl);
for (const control of [elements.channel, elements.sensitivity, elements.marks, elements.theme, elements.corner, elements.rain]) {
  control.addEventListener("input", updateUrl);
  control.addEventListener("change", updateUrl);
}
updateUrl();

const context = elements.canvas.getContext("2d");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let phase = 0;

function resizeCanvas() {
  const rect = elements.canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  elements.canvas.width = Math.max(1, Math.round(rect.width * ratio));
  elements.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawPulse() {
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#080b12";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,.055)";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  const colors = ["#57f3ff", "#ff4fbd", "#b8ff5a"];
  colors.forEach((color, line) => {
    context.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const center = height * (0.33 + line * 0.16);
      const burst = Math.exp(-(((x - width * 0.66) / (width * 0.16)) ** 2));
      const wave = Math.sin(x * 0.018 + phase * (1 + line * 0.12) + line) * (10 + burst * 62);
      const y = center + wave + Math.sin(x * 0.043 - phase) * 4;
      if (x) context.lineTo(x, y);
      else context.moveTo(x, y);
    }
    context.strokeStyle = color;
    context.globalAlpha = 0.34 + line * 0.12;
    context.lineWidth = line === 0 ? 2 : 1.2;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.stroke();
  });
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  if (!reducedMotion) phase += 0.018;
  elements.heroRate.textContent = String(18 + Math.round((Math.sin(phase * 1.5) + 1) * 9));
  if (!reducedMotion) requestAnimationFrame(drawPulse);
}

resizeCanvas();
addEventListener("resize", resizeCanvas);
drawPulse();
