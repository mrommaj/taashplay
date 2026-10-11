// Tiny synthesized sound engine — no audio files needed.
// Uses Web Audio API to generate card snaps, dings and fanfares.

let ctx: AudioContext | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("rang-muted") === "1";

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("rang-muted", m ? "1" : "0");
  } catch {}
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.18, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur = 0.08, vol = 0.22, delay = 0, filterFreq = 2500) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

function buzz(ms = 30) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

export const sfx = {
  unlock() {
    ac();
  },
  click() {
    tone(620, 0.06, "triangle", 0.12);
  },
  deal() {
    for (let i = 0; i < 5; i++) noise(0.06, 0.16, i * 0.07, 3000);
  },
  shuffle() {
    for (let i = 0; i < 3; i++) noise(0.09, 0.14, i * 0.1, 1800);
    tone(300, 0.08, "triangle", 0.06, 0.32);
  },
  playCard() {
    noise(0.07, 0.3, 0, 3200);
    tone(180, 0.09, "sine", 0.2, 0.01, 90);
  },
  yourTurn() {
    tone(880, 0.12, "sine", 0.16);
    tone(1175, 0.16, "sine", 0.16, 0.12);
    buzz(40);
  },
  trump() {
    tone(523, 0.12, "triangle", 0.18);
    tone(659, 0.12, "triangle", 0.18, 0.1);
    tone(784, 0.2, "triangle", 0.18, 0.2);
  },
  trickWin() {
    tone(660, 0.1, "sine", 0.16);
    tone(880, 0.14, "sine", 0.16, 0.09);
    buzz(25);
  },
  trickLose() {
    tone(330, 0.12, "sine", 0.1);
    tone(247, 0.16, "sine", 0.1, 0.1);
  },
  handWin() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.2, i * 0.12));
    buzz([40, 60, 40] as unknown as number);
  },
  handLose() {
    [392, 330, 262].forEach((f, i) => tone(f, 0.2, "triangle", 0.14, i * 0.14));
  },
  kot() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, "square", 0.1, i * 0.11));
    buzz([50, 50, 50, 100] as unknown as number);
  },
  join() {
    tone(740, 0.09, "sine", 0.14);
    tone(988, 0.12, "sine", 0.14, 0.08);
  },
  error() {
    tone(200, 0.18, "sawtooth", 0.1, 0, 120);
  },
};
