#!/usr/bin/env node

/**
 * Deterministic, dependency-free battle audio asset generator.
 *
 * These restrained procedural beds and stings are intentionally simple. They
 * are original source assets, reproducible from this script, and avoid adding
 * licensed music to the repository. All ambient oscillators complete a whole
 * number of cycles, so the WAVs loop without an endpoint discontinuity.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 22050;
const OUTPUT = new URL('../assets/audio/battle/', import.meta.url).pathname;

function writeWav(path, samples) {
  const dataSize = samples.length * 2;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    out.writeInt16LE(Math.round(clipped * 32767), 44 + i * 2);
  });
  writeFileSync(path, out);
}

function ambient(seconds, cycleCounts, pulseCycles, shimmerCycles) {
  const length = seconds * SAMPLE_RATE;
  return Array.from({ length }, (_, i) => {
    const phase = i / length;
    const bed = cycleCounts.reduce(
      (sum, cycles, index) =>
        sum +
        Math.sin(2 * Math.PI * cycles * phase + index * 0.73) / (index + 1),
      0,
    );
    const pulse = 0.72 + 0.28 * Math.sin(2 * Math.PI * pulseCycles * phase);
    const shimmer =
      Math.sin(2 * Math.PI * shimmerCycles * phase) *
      (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * phase));
    return (bed * pulse * 0.075 + shimmer * 0.012) * 0.8;
  });
}

function sweep(seconds, fromHz, toHz, volume, decay = 4) {
  const length = Math.round(seconds * SAMPLE_RATE);
  let phase = 0;
  return Array.from({ length }, (_, i) => {
    const t = i / SAMPLE_RATE;
    const p = i / Math.max(1, length - 1);
    const frequency = fromHz * Math.pow(toHz / fromHz, p);
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
    const envelope = Math.sin(Math.PI * p) * Math.exp(-decay * p);
    return Math.sin(phase) * envelope * volume;
  });
}

mkdirSync(OUTPUT, { recursive: true });

const ambiences = {
  'neon-nexus.wav': [[330, 495, 660], 2, 2376],
  'storm-citadel.wav': [[220, 330, 440], 1, 1760],
  'ember-forge.wav': [[165, 247, 330], 2, 1320],
  'astral-temple.wav': [[196, 294, 441], 1, 2156],
  'verdant-reactor.wav': [[262, 393, 524], 3, 1834],
  'frozen-void.wav': [[294, 441, 588], 1, 2646],
};

for (const [name, [cycles, pulse, shimmer]] of Object.entries(ambiences)) {
  writeWav(join(OUTPUT, name), ambient(6, cycles, pulse, shimmer));
}

writeWav(join(OUTPUT, 'match-found.wav'), sweep(0.42, 330, 990, 0.42, 1.8));
writeWav(join(OUTPUT, 'move-select.wav'), sweep(0.16, 620, 420, 0.28, 2.2));
writeWav(join(OUTPUT, 'prompt-lock.wav'), sweep(0.28, 440, 880, 0.34, 1.6));
writeWav(join(OUTPUT, 'transition.wav'), sweep(0.5, 180, 720, 0.3, 2.6));

console.log(
  `Generated ${Object.keys(ambiences).length + 4} battle audio assets in ${OUTPUT}`,
);
