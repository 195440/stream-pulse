import test from "node:test";
import assert from "node:assert/strict";
import { backoffDelay, buildConnectLines, ChatClient, parseChatMessage, parseLine } from "../js/irc.js";

test("parseLine separates IRC components", () => {
  const line = parseLine("@id=42;flag :nick!nick@host PRIVMSG #room :hello world\r\n");
  assert.equal(line.tags.id, "42");
  assert.equal(line.tags.flag, "");
  assert.equal(line.prefix, "nick!nick@host");
  assert.equal(line.command, "PRIVMSG");
  assert.deepEqual(line.params, ["#room"]);
  assert.equal(line.trailing, "hello world");
});

test("parseLine unescapes Twitch tag values", () => {
  const line = parseLine("@display-name=Hello\\sWorld;note=a\\:b\\\\c\\r\\n PING :server");
  assert.equal(line.tags["display-name"], "Hello World");
  assert.equal(line.tags.note, "a;b\\c\r\n");
  assert.equal(line.command, "PING");
  assert.equal(line.trailing, "server");
});

test("parseChatMessage maps tags, badges and emote ranges", () => {
  const raw = "@badge-info=;badges=subscriber/12,moderator/1;display-name=Tester;emotes=25:0-4,6-10/1902:12-16;id=abc;tmi-sent-ts=1700000000123;user-id=99 :tester!tester@tester.tmi.twitch.tv PRIVMSG #room :Kappa Kappa Keepo";
  const message = parseChatMessage(raw);
  assert.equal(message.id, "abc");
  assert.equal(message.user, "tester");
  assert.equal(message.userId, "99");
  assert.equal(message.displayName, "Tester");
  assert.equal(message.text, "Kappa Kappa Keepo");
  assert.equal(message.ts, 1700000000123);
  assert.equal(message.isAction, false);
  assert.equal(message.emotes.length, 3);
  assert.deepEqual(message.emotes.map((item) => item.name), ["Kappa", "Kappa", "Keepo"]);
  assert.deepEqual(message.badges[0], { name: "subscriber", version: "12" });
  assert.equal(message.badges[1].name, "moderator");
});

test("parseChatMessage handles code-point emote offsets and actions", () => {
  const action = parseChatMessage("@emotes=25:2-6;display-name=Wave :wave!x PRIVMSG #room :\u0001ACTION 😀 Kappa\u0001");
  assert.equal(action.isAction, true);
  assert.equal(action.text, "😀 Kappa");
  assert.equal(action.emotes[0].name, "Kappa");
  assert.equal(parseChatMessage("PING :server"), null);
});

test("parseChatMessage caps hostile message length", () => {
  const message = parseChatMessage(`:user!x PRIVMSG #room :${"x".repeat(700)}`);
  assert.equal(message.text.length, 500);
});

test("buildConnectLines creates anonymous read-only handshake", () => {
  const lines = buildConnectLines("#My_Channel", "justinfan12345");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /twitch\.tv\/tags/);
  assert.match(lines[0], /twitch\.tv\/commands/);
  assert.equal(lines[1], "PASS SCHMOOPIIE");
  assert.equal(lines[2], "NICK justinfan12345");
  assert.equal(lines[3], "JOIN #my_channel");
  assert.throws(() => buildConnectLines("not valid!"), /Invalid/);
});

test("backoffDelay stays bounded and grows with attempts", () => {
  assert.equal(backoffDelay(0, () => 0), 1000);
  assert.equal(backoffDelay(0, () => 1), 1200);
  assert.equal(backoffDelay(1, () => 0), 1600);
  assert.equal(backoffDelay(2, () => 0.5), 4000);
  assert.equal(backoffDelay(10, () => 0), 24000);
  assert.equal(backoffDelay(10, () => 1), 30000);
  assert.ok(backoffDelay(3, () => 0.5) > backoffDelay(2, () => 0.5));
});

test("ChatClient handshakes, parses messages and answers PING", () => {
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.sent = [];
      FakeSocket.instance = this;
    }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    send(value) { this.sent.push(value); }
    close() {}
    emit(name, value = {}) { this.listeners[name]?.(value); }
  }
  const statuses = [];
  const messages = [];
  const client = new ChatClient({ channel: "Room", WebSocketImpl: FakeSocket, rng: () => 0.5 });
  client.onStatus(({ status }) => statuses.push(status));
  client.onMessage((message) => messages.push(message));
  client.start();
  assert.equal(FakeSocket.instance.url, "wss://irc-ws.chat.twitch.tv:443");
  assert.equal(statuses[0], "connecting");
  FakeSocket.instance.emit("open");
  assert.equal(statuses.at(-1), "live");
  assert.equal(FakeSocket.instance.sent.length, 4);
  FakeSocket.instance.emit("message", { data: "PING :tmi.twitch.tv\r\n:user!x PRIVMSG #room :hello" });
  assert.equal(FakeSocket.instance.sent.at(-1), "PONG :tmi.twitch.tv\r\n");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "hello");
  client.stop();
  assert.equal(statuses.at(-1), "offline");
});
