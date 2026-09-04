#!/usr/bin/env node
/**
 * Prompt Wars — signature-item catalog icon generator.
 *
 * Generates one icon per catalog signature item (mirrors the seed rows in
 * supabase/migrations/20260513120000_character_creation_expansion.sql) using
 * Google's "Nano Banana" model (Gemini 2.5 Flash Image), then post-processes
 * each to a 512x512 PNG with alpha in assets/signature-icons/.
 *
 * PNG (not webp): the catalog picker renders icons with React Native's core
 * <Image>, which cannot decode webp on iOS. The matching migration flips the
 * stored image_path extensions from .webp to .png.
 *
 * Usage:
 *   node scripts/generate-signature-icons.mjs              # generate all 15
 *   node scripts/generate-signature-icons.mjs --only umbrella
 *   node scripts/generate-signature-icons.mjs --list
 *
 * Upload (separate, uses the authenticated Supabase CLI — no service key):
 *   supabase storage cp -r assets/signature-icons \
 *     ss:///signature-items-catalog/catalog --experimental
 *
 * The API key is read from .env.integration (GEMINI_API_KEY). That file is
 * git-ignored — never commit it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'signature-icons');

// Candidate model ids, tried in order (GA name first, preview fallback).
const MODELS = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

async function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const envPath = path.join(ROOT, '.env.integration');
  const raw = await fs.readFile(envPath, 'utf8').catch(() => '');
  const match = raw.match(/^GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
  if (!match) {
    throw new Error('GEMINI_API_KEY not found in env or .env.integration');
  }
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Call Nano Banana and return the first inline image as a Buffer. */
async function generateImage(apiKey, prompt, aspectRatio) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  };

  let lastErr;
  for (const model of MODELS) {
    const url = `${API_BASE}/${model}:generateContent`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
        });

        if (res.status === 404) {
          lastErr = new Error(`Model ${model} not found (404)`);
          break; // try next model
        }
        if (!res.ok) {
          const text = await res.text();
          lastErr = new Error(
            `HTTP ${res.status} from ${model}: ${text.slice(0, 400)}`,
          );
          if (res.status === 429 || res.status >= 500) {
            await sleep(1500 * attempt);
            continue; // retry same model
          }
          break; // non-retryable -> next model
        }

        const json = await res.json();
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p) => p.inlineData?.data);
        if (!imgPart) {
          const reason =
            json?.promptFeedback?.blockReason ||
            JSON.stringify(json).slice(0, 300);
          throw new Error(`No image in response (${reason})`);
        }
        return Buffer.from(imgPart.inlineData.data, 'base64');
      } catch (err) {
        lastErr = err;
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastErr ?? new Error('Image generation failed');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// Shared emblem scaffold so all 15 icons read as one cohesive set. Brand
// palette mirrors scripts/generate-assets.mjs.
const NO_TEXT =
  'No text, no letters, no numbers, no words, no watermark, no signature.';

function iconPrompt(object) {
  return (
    `A single centered mobile-game inventory ICON of ${object}. ` +
    `Bold, clean, modern flat-illustration emblem with crisp edges and a strong ` +
    `readable silhouette, lit with an electric-purple (#8B5CF6) to magenta ` +
    `(#D946EF) glow. Premium esports item icon, high contrast, instantly ` +
    `recognizable at small sizes. The object is centered with comfortable ` +
    `margin on a solid deep near-black background (#0E0E12) with a soft radial ` +
    `purple-magenta glow behind it; the background fills the whole square frame ` +
    `and fades to near-black at the edges. Do NOT draw a checkerboard, grid, ` +
    `card, frame or border. ${NO_TEXT}`
  );
}

// slug -> icon subject. Slugs and set mirror the catalog seed rows.
const ITEMS = [
  ['lucky_coin', 'a worn golden lucky coin caught mid-flip'],
  ['briefcase', 'a battered brown leather briefcase'],
  ['fountain_pen', 'a sleek ink-stained fountain pen'],
  ['microphone', 'a vintage stage microphone with a coiled cable'],
  ['umbrella', 'a sharp-tipped black umbrella, half open'],
  ['compass', 'a brass pocket compass with a quivering needle'],
  ['hourglass', 'a cracked hourglass with faintly glowing sand'],
  ['folding_chair', 'a grey metal folding chair'],
  ['tarot_card', 'a single ornate tarot card'],
  ['wrench', 'a heavy chrome adjustable wrench'],
  ['megaphone', 'a dented handheld megaphone with a frayed strap'],
  ['crown_fragment', 'a jagged shard of a golden crown'],
  ['stopwatch', 'a chained silver pocket stopwatch'],
  ['polaroid', 'a half-developed instant polaroid photo'],
  ['tuning_fork', 'a humming metal tuning fork'],
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [slug] of ITEMS) console.log(slug);
    return;
  }
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  const items = only ? ITEMS.filter(([slug]) => slug === only) : ITEMS;
  if (items.length === 0) {
    console.error(`No item matches "${only}". Use --list to see slugs.`);
    process.exit(1);
  }

  const apiKey = await loadApiKey();
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(
    `Generating ${items.length} signature icon(s) with Nano Banana...\n`,
  );
  let ok = 0;
  for (const [slug, subject] of items) {
    process.stdout.write(`• ${slug} ... `);
    try {
      const buf = await generateImage(apiKey, iconPrompt(subject), '1:1');
      const out = path.join(OUT_DIR, `${slug}.png`);
      // Self-contained icon: fill the square (cover) and flatten onto the
      // near-black brand background so there is no stray alpha edge on the card.
      await sharp(buf)
        .resize(512, 512, { fit: 'cover' })
        .flatten({ background: { r: 14, g: 14, b: 18 } })
        .png()
        .toFile(out);
      console.log(`done → ${path.relative(ROOT, out)}`);
      ok += 1;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  console.log(
    `\n${ok}/${items.length} icons generated in ${path.relative(ROOT, OUT_DIR)}/`,
  );
  if (ok < items.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
