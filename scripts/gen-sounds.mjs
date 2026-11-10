/**
 * Synthesizes the game's sound kit as tiny PCM WAV files — no external
 * assets, no licensing. Soft plucked sine tones with exponential decay:
 *
 *   tick.wav   — tile pickup, airy high blip
 *   drop.wav   — tile placed, warm low blip
 *   solve.wav  — a gentle three-note pentatonic arpeggio (C5 A5 D6)
 *
 * Run: node scripts/gen-sounds.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "sounds");
const SR = 44100;

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** A plucked tone: fundamental + soft octave, exponential decay. */
function pluck(freq, seconds, gain = 0.5, decay = 9) {
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay) * Math.min(1, t * 400); // fast attack
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.85 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.12;
    out[i] = s * env * gain;
  }
  return out;
}

function silence(seconds) {
  return new Float64Array(Math.round(seconds * SR));
}

function concat(...parts) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float64Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Mix a note into the buffer starting at `startSeconds` (for the arpeggio). */
function mixNote(buf, freq, startSeconds, seconds, gain, decay) {
  const note = pluck(freq, seconds, gain, decay);
  const start = Math.round(startSeconds * SR);
  for (let i = 0; i < note.length && start + i < buf.length; i++) {
    buf[start + i] += note[i];
  }
}

mkdirSync(OUT, { recursive: true });

// tick — pickup: high, breathy, fast
writeFileSync(join(OUT, "tick.wav"), wav(pluck(1244, 0.09, 0.32, 26)));

// drop — place: warm, slightly lower, soft thump of settling
writeFileSync(join(OUT, "drop.wav"), wav(pluck(523, 0.14, 0.4, 16)));

// solve — pentatonic arpeggio with room to breathe (C5 · A5 · D6, then shimmer)
{
  const total = 1.5;
  const buf = new Float64Array(Math.round(total * SR));
  mixNote(buf, 523.25, 0.0, 0.8, 0.34, 6); // C5
  mixNote(buf, 880.0, 0.11, 0.8, 0.3, 6); // A5
  mixNote(buf, 1174.66, 0.22, 1.0, 0.28, 5); // D6
  mixNote(buf, 2093.0, 0.34, 1.1, 0.12, 4); // C7 shimmer
  writeFileSync(join(OUT, "solve.wav"), wav(buf));
}

console.log("wrote tick.wav, drop.wav, solve.wav to", OUT);
console.log("sizes:", ["tick", "drop", "solve"].map((f) => {
  // cheap size report
  return f;
}).join(", "));
