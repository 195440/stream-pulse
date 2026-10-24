# StreamPulse - build spec (for the Codex Hackathon entry)

You (Codex) build this whole project. Read this file fully, then build it milestone by milestone, run the tests, and commit
after each milestone with Conventional Commit messages (`feat: ...`, `test: ...`, `docs: ...`). Git identity is already
configured locally; do not touch global git config. Do not install anything from the network: the project must have ZERO
runtime and ZERO dev dependencies (Node 18+ built-ins only, `node --test` for tests, vanilla ES modules in the browser,
no bundler, no build step). Never write or ask for secrets/tokens. Do not use any network access while building.

## One-line pitch
Your chat is already your editor. StreamPulse is a zero-install Twitch chat overlay + dashboard that spots the moments your
community reacts to (auto spike detection + viewers typing `!mark`), shows them live on stream, and turns the whole stream into
timestamps, YouTube chapters and a recap you can paste anywhere.

## Who it is for
Small and mid-size streamers who cannot afford an editor or a clipping tool and lose their best moments in a 5-hour VOD, and
their communities who love to say "clip that". Anti-goals: no chat moderation, no AI/LLM calls at runtime, no accounts, no
servers, no tokens, nothing that needs the streamer to trust a backend.

## Twitch integration (this is what makes it a Twitch project)
- The browser connects DIRECTLY to Twitch chat over WebSocket `wss://irc-ws.chat.twitch.tv:443` as an anonymous, read-only
  user (`NICK justinfan<random 5-6 digits>`, `PASS SCHMOOPIIE`), requesting capabilities `twitch.tv/tags twitch.tv/commands`
  (tags give emote ranges, badges, user-id, timestamps). Join `#<channel>` (lowercase login). Reply `PONG` to `PING`.
  Handle `RECONNECT`, close events and errors with exponential backoff reconnect (1s..30s, jitter), and expose a visible
  connection status (connecting / live / reconnecting / error).
- Twitch emotes come from IRC tags (`emotes=id:start-end,...`); render them with
  `https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/3.0`. Third-party emotes are out of scope.
- Works as an OBS/Streamlabs Browser Source (transparent background) and as a normal web page on any static host
  (GitHub Pages). Anyone can try it on ANY live channel by opening a URL with `?channel=<login>`.

## Deliverables (all static files at repo root unless noted)
1. `index.html` - landing page: channel input, buttons "Open overlay", "Open dashboard", "Try demo (no stream needed)", a
   copy-to-clipboard box with the OBS Browser Source URL (1920x1080, transparent), a three-step setup, a privacy note.
2. `overlay.html` - transparent overlay. Query params: `channel`, `sensitivity` (1-10, default 5), `marks` (unique chatters
   needed for a community mark, default 3), `theme` (`neon` default | `clean`), `corner` (`tl|tr|bl|br`), `rain` (0/1),
   `demo=1`. Shows: (a) a compact pulse meter (messages per 5 s sparkline + chatters count + connection dot),
   (b) emote rain: the most used emotes of the last 30 s float up, size scaled by frequency, hard cap on live DOM nodes,
   (c) a MOMENT banner when a spike is detected, with an auto label (dominant emote or word, e.g. `KEKW spike`,
   `CAPS hype`, `chat exploded`) and stream-relative time, (d) a COMMUNITY MARK toast when enough unique chatters type
   `!mark` (or `!clip`) inside 15 s.
3. `dashboard.html` - streamer view. Query params as above plus `start` (ISO time or epoch ms of stream start; default =
   moment the page connected; a visible field lets the streamer edit it and the whole timeline re-times instantly).
   Shows: live chat-rate graph (canvas, last 10 minutes + whole-session mini-map), the moments table (time, type auto |
   community, label, peak msgs/5s, unique chatters), buttons per moment (copy time, delete, rename label), and EXPORTS:
   YouTube chapters (first chapter `00:00 Intro`, at least 10 s apart, `HH:MM:SS` once past an hour else `MM:SS`),
   Markdown recap (stream length, total messages, peak chat rate, top 10 emotes, moments list), CSV, JSON. Export buttons
   copy to clipboard AND offer a file download. Session autosaves to `localStorage` every 10 s and restores on reload.
   Import of a saved JSON session works (so a VOD can be re-timed later). Privacy toggle (default ON): exports contain no
   usernames, only counts.
4. `demo.html` (or `index.html?demo`) - fully offline synthetic chat so reviewers can see everything without a live stream:
   a deterministic seeded generator (`js/sim.js`) producing ~25 chatters, steady background chatter, three scripted spikes
   (emote storm, CAPS hype, mark chorus) in a 90 s loop, with a speed control (1x/4x/8x).
5. `js/` pure ES modules (no DOM access in the pure ones, so Node can import them):
   - `irc.js` - `parseLine(line)` -> `{tags, prefix, command, params, trailing}`; correct tag unescaping; `parseChatMessage`
     -> `{id, user, userId, displayName, text, emotes:[{id,start,end,name}], ts, isAction, badges}`; `buildConnectLines`;
     `backoffDelay(attempt, rng)`; a `ChatClient` class (browser only, WebSocket injected for testing) with
     `onMessage/onStatus`.
   - `pulse.js` - `PulseTracker`: rolling window counters (5 s buckets), EWMA baseline + robust spread (MAD) over the last
     ~3 minutes, spike score = (rate - baseline) / max(spread, floor), triggers when score > threshold(sensitivity) AND
     absolute messages in the bucket >= `minMessages` (default 6) AND unique chatters >= 3, with a 20 s cooldown;
     `labelMoment(window)` picks the dominant emote (>= 35% of emote tokens), else CAPS ratio > 0.5 -> `CAPS hype`, else the
     most repeated token (>= 25%), else `chat exploded`.
   - `marks.js` - `MarkTracker`: counts unique users typing `!mark`/`!clip` inside a sliding 15 s window, fires once when the
     unique count reaches the threshold, 30 s cooldown, one vote per user per window.
   - `timeline.js` - `Timeline`: stores moments, re-times against a start epoch, merges auto + community moments closer
     than 15 s into one (keeps the strongest, marks `both`), supports rename/delete.
   - `export.js` - `toChapters`, `toMarkdown`, `toCsv`, `toJson`, `fromJson`, `formatTimestamp`; CSV must escape quotes,
     commas, newlines and neutralize leading `= + - @` (formula injection).
   - `sim.js` - seeded RNG chat simulator (`createSimulator({seed})` -> `{next(dtMs)}` yielding IRC-like message objects).
   - `ui-*.js` - the DOM code for overlay, dashboard, landing; use `textContent`, never `innerHTML` with chat data.
6. `css/` shared styles. Dark, high contrast, readable at 1080p and 720p, respects `prefers-reduced-motion` (rain becomes
   static badges), keyboard-accessible dashboard, visible focus rings, ARIA labels on buttons and live regions for the
   connection status.
7. `test/` - `node --test` suites for EVERY pure module (IRC parsing incl. tag escapes and emote ranges, backoff bounds,
   spike detection on synthetic series: quiet -> no trigger, burst -> exactly one trigger, cooldown, sensitivity monotonic,
   labeling rules, mark tracker windows and de-duplication, timeline merge/re-time, every exporter incl. chapter rules and CSV
   injection, simulator determinism). At least 60 assertions in total. `package.json` has `"type":"module"` and
   `"scripts":{"test":"node --test"}` and NO dependencies.
8. `README.md` - what/why, 60-second quickstart (`python3 -m http.server`), OBS setup steps, URL parameter table, how
   detection works (formula, thresholds), privacy statement (everything runs in the browser, anonymous read-only chat, no
   tokens, no server, no analytics), architecture diagram in Mermaid, testing instructions, limitations (no third-party
   emotes, anonymous clients cannot send chat), license MIT (`LICENSE`).
9. `docs/BUILT_WITH_CODEX.md` - leave a stub heading only; the humans fill it in.

## Quality bars (the judges score: Innovation, Potential impact, Technological implementation incl. how well Codex was used,
## Design)
- Everything must actually run: open `index.html` through any static server and each page works without console errors.
- The demo must look great (this is what the 3-minute video shows): polished neon theme, smooth 60 fps canvas, no layout jumps.
- Chat data is hostile input: never `innerHTML`, cap message length (500 chars), cap DOM nodes, cap stored moments (2000).
- Keep every JS file under ~400 lines and well named; short comments only where the intent is not obvious.

## Milestones
1. `irc.js`, `pulse.js`, `marks.js`, `timeline.js`, `export.js`, `sim.js` + tests, all green.
2. Overlay + demo mode working with the simulator.
3. Dashboard with graph, moments table, exports, autosave/import.
4. Landing page, README, LICENSE, polish, accessibility pass, final `npm test` green.
After milestone 4 print a short summary: files, test count, how to run, known gaps.
