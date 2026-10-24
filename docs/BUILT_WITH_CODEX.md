# Built with Codex

StreamPulse was created during the Codex x TwitchCon Hackathon window (started 2026-10-24). All application code,
tests and the README body were written by **OpenAI Codex**; a human-directed AI assistant (Cursor) wrote the spec, ran the
real-browser checks, handled git/GitHub, and added the README "Try it / Built with Codex" header plus this document.

## Codex setup

| Item | Value |
| --- | --- |
| Tool | Codex CLI `codex exec` (v0.153.4), non-interactive, `--json` event log |
| Model | `gpt-5.6-sol`, reasoning effort `high` |
| Sandbox | `workspace-write`, approvals `never`, no network |
| **Codex session (thread) ID** | `01a16c9b-9ec1-72b1-b287-91b1d19dad64` (one thread, resumed with `codex exec resume`) |

## How the work was split

1. **Spec first.** [`SPEC.md`](../SPEC.md) is the only input Codex got for the build: pitch, Twitch integration details
   (anonymous IRC over WebSocket, tags, emotes), module contracts, test requirements, quality bars and four milestones.
2. **Codex build (turn 1).** Codex read the spec and implemented the whole project: `js/irc.js`, `pulse.js`, `marks.js`,
   `timeline.js`, `export.js`, `sim.js`, the DOM modules, the overlay / dashboard / landing / demo pages, CSS, 41 unit tests
   (161 assertions), README and LICENSE. Its sandbox could not write `.git` or open a browser, so it said so honestly and
   left the files uncommitted; the commits in this repository were made afterwards in milestone order.
3. **Real-browser verification (human side).** The result was opened in headless Chrome against real Twitch chat
   (anonymous read, official emotes rendering) and against the offline demo. That found concrete defects Codex could not see
   from inside its sandbox: the dashboard mini-map canvas painting over the moments table, the demo caption overlapping the
   sparkline, an empty-looking demo, and a favicon 404.
4. **Codex polish (turn 2, same thread).** The defect list was handed back to the same Codex thread. It fixed canvas sizing,
   added moment markers linked to the table, built the CSS-only stream scene and fake chat panel for the demo, emoji emotes
   in demo mode, inline favicons, a larger overlay card, and added `js/display.js` with tests (45 tests, 180 assertions).
5. **Three small human-side edits** after the polish: confine the demo overlay to the "stream" area (one CSS line), pick
   rain emotes by weighted random among the top five instead of always the top one, and make the demo recap use the
   simulated clock for "Stream length".

## Why this is a good fit for Codex

- The spec is checkable: pure modules with exact contracts, so Codex could run `node --test` after every milestone.
- Zero dependencies and no build step keep the feedback loop short and the result reviewable.
- Codex was honest about environment limits (no `.git` write, no browser) instead of faking verification.

## Reproduce

```bash
node --test            # 45 tests
python3 -m http.server 8000   # then open http://localhost:8000
```
