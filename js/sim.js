const USERS = Array.from({ length: 25 }, (_, index) => ({
  user: `viewer${String(index + 1).padStart(2, "0")}`,
  displayName: ["PixelPilot", "CozyByte", "Nova", "ArcadeAce", "LunaLive"][index % 5] + (index + 1),
}));

const CHAT = ["nice play", "so close", "lets go", "wow", "gg", "that was clean", "no way", "hello chat"];
const CAPS = ["LETS GOOOO", "THAT WAS INSANE", "NO WAY", "WHAT A PLAY"];
const EMOTE_STORM = [
  "Kappa", "Kappa", "Kappa", "Kappa", "Kappa", "Kappa",
  "KEKW", "LUL", "PogChamp", "Pog", "PepeHands", "EZ", "OMEGALUL",
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSimulator({ seed = 1, startEpoch = 1700000000000 } = {}) {
  const rng = mulberry32(Number(seed) || 1);
  let elapsed = 0;
  let accumulator = 0;
  let sequence = 0;
  let loop = 0;
  let markIndex = 0;

  function makeMessage(at) {
    const phase = at % 90000;
    const userIndex = phase >= 65000 && phase < 71000 ? markIndex++ % USERS.length : Math.floor(rng() * USERS.length);
    const person = USERS[userIndex];
    let text = CHAT[Math.floor(rng() * CHAT.length)];
    let emotes = [];
    if (phase >= 20000 && phase < 28000) {
      const name = EMOTE_STORM[Math.floor(rng() * EMOTE_STORM.length)];
      text = rng() < 0.78 ? `${name} ${name}` : `wow ${name}`;
      const starts = text.startsWith("wow ") ? [4] : [0, name.length + 1];
      emotes = starts.map((start) => ({ id: `sim-${name.toLowerCase()}`, start, end: start + name.length - 1, name }));
    } else if (phase >= 43000 && phase < 51000) {
      text = CAPS[Math.floor(rng() * CAPS.length)];
    } else if (phase >= 65000 && phase < 71000) {
      text = markIndex % 2 ? "!mark" : "!clip";
    }
    sequence += 1;
    return {
      id: `sim-${loop}-${sequence}`,
      user: person.user,
      userId: `sim-user-${userIndex + 1}`,
      displayName: person.displayName,
      text,
      emotes,
      ts: startEpoch + at,
      isAction: false,
      badges: [],
    };
  }

  return {
    next(dtMs) {
      const output = [];
      const end = elapsed + Math.max(0, Number(dtMs) || 0);
      while (elapsed < end) {
        const step = Math.min(100, end - elapsed);
        elapsed += step;
        const phase = elapsed % 90000;
        const nextLoop = Math.floor(elapsed / 90000);
        if (nextLoop !== loop) {
          loop = nextLoop;
          markIndex = 0;
        }
        const rate = phase >= 20000 && phase < 28000 ? 5.8
          : phase >= 43000 && phase < 51000 ? 5.2
            : phase >= 65000 && phase < 71000 ? 4.5
              : 0.9;
        accumulator += rate * step / 1000;
        while (accumulator >= 1) {
          accumulator -= 1;
          output.push(makeMessage(elapsed));
        }
      }
      return output;
    },
    get elapsed() {
      return elapsed;
    },
  };
}
