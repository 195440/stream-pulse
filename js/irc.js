const TAG_ESCAPES = {
  s: " ",
  ":": ";",
  "\\": "\\",
  r: "\r",
  n: "\n",
};

function unescapeTag(value) {
  return value.replace(/\\(.)/g, (_, char) => TAG_ESCAPES[char] ?? char);
}

export function parseLine(rawLine) {
  let line = String(rawLine).replace(/[\r\n]+$/, "");
  const tags = {};
  let prefix = null;
  let trailing = null;

  if (line.startsWith("@")) {
    const end = line.indexOf(" ");
    if (end < 0) return { tags, prefix, command: "", params: [], trailing };
    for (const pair of line.slice(1, end).split(";")) {
      const split = pair.indexOf("=");
      const key = split < 0 ? pair : pair.slice(0, split);
      const value = split < 0 ? "" : pair.slice(split + 1);
      tags[key] = unescapeTag(value);
    }
    line = line.slice(end + 1);
  }

  if (line.startsWith(":")) {
    const end = line.indexOf(" ");
    prefix = end < 0 ? line.slice(1) : line.slice(1, end);
    line = end < 0 ? "" : line.slice(end + 1);
  }

  const trailingAt = line.indexOf(" :");
  if (trailingAt >= 0) {
    trailing = line.slice(trailingAt + 2);
    line = line.slice(0, trailingAt);
  }
  const parts = line.trim().split(/\s+/).filter(Boolean);
  return { tags, prefix, command: parts.shift() ?? "", params: parts, trailing };
}

function codePointSlice(text, start, end) {
  return Array.from(text).slice(start, end + 1).join("");
}

function parseEmotes(value, text) {
  if (!value) return [];
  const emotes = [];
  for (const group of value.split("/")) {
    const [id, ranges = ""] = group.split(":");
    for (const range of ranges.split(",")) {
      const [start, end] = range.split("-").map(Number);
      if (!id || !Number.isInteger(start) || !Number.isInteger(end) || end < start) continue;
      emotes.push({ id, start, end, name: codePointSlice(text, start, end) });
    }
  }
  return emotes.sort((a, b) => a.start - b.start);
}

function parseBadges(value) {
  if (!value) return [];
  return value.split(",").filter(Boolean).map((badge) => {
    const [name, version = ""] = badge.split("/");
    return { name, version };
  });
}

export function parseChatMessage(input) {
  const parsed = typeof input === "string" ? parseLine(input) : input;
  if (!parsed || parsed.command !== "PRIVMSG") return null;
  let text = String(parsed.trailing ?? "").slice(0, 500);
  let isAction = false;
  if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) {
    text = text.slice(8, -1).slice(0, 500);
    isAction = true;
  }
  const user = parsed.prefix?.split("!")[0] ?? "anonymous";
  const tsValue = Number(parsed.tags["tmi-sent-ts"]);
  return {
    id: parsed.tags.id || `${Number.isFinite(tsValue) ? tsValue : Date.now()}-${user}`,
    user,
    userId: parsed.tags["user-id"] || user,
    displayName: parsed.tags["display-name"] || user,
    text,
    emotes: parseEmotes(parsed.tags.emotes, text),
    ts: Number.isFinite(tsValue) ? tsValue : Date.now(),
    isAction,
    badges: parseBadges(parsed.tags.badges),
  };
}

export function buildConnectLines(channel, nick = `justinfan${Math.floor(10000 + Math.random() * 900000)}`) {
  const login = String(channel).trim().replace(/^#/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) throw new Error("Invalid Twitch channel login");
  return [
    "CAP REQ :twitch.tv/tags twitch.tv/commands",
    "PASS SCHMOOPIIE",
    `NICK ${nick}`,
    `JOIN #${login}`,
  ];
}

export function backoffDelay(attempt, rng = Math.random) {
  const base = Math.min(30000, 1000 * (2 ** Math.max(0, Number(attempt) || 0)));
  return Math.round(Math.max(1000, Math.min(30000, base * (0.8 + rng() * 0.4))));
}

export class ChatClient {
  constructor({ channel, WebSocketImpl = globalThis.WebSocket, rng = Math.random } = {}) {
    this.channel = channel;
    this.WebSocketImpl = WebSocketImpl;
    this.rng = rng;
    this.messageListeners = new Set();
    this.statusListeners = new Set();
    this.attempt = 0;
    this.socket = null;
    this.timer = null;
    this.stopped = true;
  }

  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  emitStatus(status, detail = "") {
    for (const listener of this.statusListeners) listener({ status, detail });
  }

  start() {
    if (!this.WebSocketImpl) throw new Error("WebSocket is not available");
    this.stopped = false;
    this.connect();
    return this;
  }

  connect() {
    if (this.stopped) return;
    this.emitStatus(this.attempt ? "reconnecting" : "connecting");
    const socket = new this.WebSocketImpl("wss://irc-ws.chat.twitch.tv:443");
    this.socket = socket;
    let settled = false;

    socket.addEventListener("open", () => {
      settled = true;
      this.attempt = 0;
      for (const line of buildConnectLines(this.channel)) socket.send(`${line}\r\n`);
      this.emitStatus("live");
    });
    socket.addEventListener("message", (event) => {
      for (const raw of String(event.data).split(/\r?\n/).filter(Boolean)) {
        const line = parseLine(raw);
        if (line.command === "PING") {
          socket.send(`PONG :${line.trailing ?? line.params[0] ?? "tmi.twitch.tv"}\r\n`);
        } else if (line.command === "RECONNECT") {
          socket.close();
        } else {
          const message = parseChatMessage(line);
          if (message) for (const listener of this.messageListeners) listener(message);
        }
      }
    });
    socket.addEventListener("error", () => this.emitStatus("error", "WebSocket error"));
    socket.addEventListener("close", () => {
      if (this.stopped || this.socket !== socket) return;
      this.socket = null;
      const delay = backoffDelay(this.attempt++, this.rng);
      this.emitStatus(settled ? "reconnecting" : "error", `Retrying in ${Math.ceil(delay / 1000)}s`);
      this.timer = setTimeout(() => this.connect(), delay);
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
    this.emitStatus("offline");
  }
}
