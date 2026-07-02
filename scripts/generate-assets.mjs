#!/usr/bin/env node
/**
 * Prompt Wars — game asset generator.
 *
 * Generates app branding + character-creator art-style thumbnails using
 * Google's "Nano Banana" model (Gemini 2.5 Flash Image) via the Generative
 * Language REST API, then post-processes the output to the exact dimensions /
 * formats the app expects.
 *
 * Usage:
 *   node scripts/generate-assets.mjs                # generate everything
 *   node scripts/generate-assets.mjs --only icon    # one task (id or group)
 *   node scripts/generate-assets.mjs --list         # list task ids
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
const IMAGES_DIR = path.join(ROOT, 'assets', 'images');
const STYLES_DIR = path.join(IMAGES_DIR, 'styles');
const UI_DIR = path.join(IMAGES_DIR, 'ui');

// Candidate model ids, tried in order (GA name first, preview fallback).
const MODELS = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

/**
 * Call Nano Banana and return the first inline image as a Buffer.
 * @param {string} apiKey
 * @param {string} prompt
 * @param {string} aspectRatio e.g. '1:1', '9:16'
 * @returns {Promise<Buffer>}
 */
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
          lastErr = new Error(`HTTP ${res.status} from ${model}: ${text.slice(0, 400)}`);
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
          const reason = json?.promptFeedback?.blockReason || JSON.stringify(json).slice(0, 300);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const BRAND =
  'Prompt Wars is a premium competitive mobile game about prompt battles. ' +
  'Brand palette: deep near-black background, electric purple #8B5CF6 and magenta #D946EF glow, ' +
  'with cyan #22D3EE accents. Esports, cinematic, high-contrast, clean vector-quality rendering.';

const NO_TEXT =
  'Absolutely no text, no letters, no numbers, no words, no captions, no watermark, no signature.';

// Shared subject so the 8 style tiles are directly comparable.
const STYLE_SUBJECT =
  'a fierce gender-neutral fantasy warrior champion, head-and-shoulders bust, ' +
  'facing the viewer, confident expression, glowing purple signature accent on the armor, ' +
  'centered composition, clean uncluttered background';

// One-sentence medium scaffolds (mirrors supabase portrait-prompt-resolver).
const STYLE_SCAFFOLDS = {
  painterly:
    'Stylized illustrated hero portrait, painterly digital brushwork, dramatic rim lighting, cohesive game-ready hero card.',
  anime:
    'Crisp cel-shaded anime portrait, bold clean linework, vibrant flat colors with sharp shadow shapes.',
  comic:
    'Inked western comic-book portrait, bold black outlines, halftone Ben-Day dot shading, saturated flats.',
  pixel:
    'Retro pixel-art character bust, hand-placed pixels, dithered shading, limited 16-color palette, crisp blocky edges.',
  oil: 'Classical oil-painting bust, visible textured brushwork, rich chiaroscuro lighting, muted earthy palette.',
  lowpoly:
    'Stylized low-poly 3D render, faceted geometric shading, soft studio HDR lighting, matte finish.',
  darkfantasy:
    'Gritty dark-fantasy portrait, muted desaturated palette, atmospheric haze and shadow, dramatic side lighting.',
  vaporwave:
    'Neon synthwave portrait, magenta and cyan rim lighting, retro vaporwave grid backdrop, subtle chromatic aberration.',
};

function stylePrompt(key) {
  return `${STYLE_SCAFFOLDS[key]} Subject: ${STYLE_SUBJECT}. ${NO_TEXT}`;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** @type {{id:string, group:string, aspect:string, prompt:string, save:(buf:Buffer)=>Promise<string[]>}[]} */
const TASKS = [
  {
    id: 'icon',
    group: 'brand',
    aspect: '1:1',
    prompt:
      `${BRAND} Design a bold mobile app ICON: a single iconic emblem of two crossed ` +
      `energy blades clashing in a "versus" spark, forming a strong symmetrical silhouette, ` +
      `centered with comfortable margin, deep black background with a radial purple-to-magenta ` +
      `glow and a bright energy spark at the clash point. Flat, modern, instantly recognizable ` +
      `at small sizes, premium esports emblem. ${NO_TEXT}`,
    async save(buf) {
      const iconPath = path.join(IMAGES_DIR, 'icon.png');
      const faviconPath = path.join(IMAGES_DIR, 'favicon.png');
      await sharp(buf).resize(1024, 1024, { fit: 'cover' }).png().toFile(iconPath);
      await sharp(buf).resize(48, 48, { fit: 'cover' }).png().toFile(faviconPath);
      return [iconPath, faviconPath];
    },
  },
  {
    id: 'adaptive',
    group: 'brand',
    aspect: '1:1',
    prompt:
      `${BRAND} Design an Android ADAPTIVE ICON FOREGROUND: the same crossed energy-blade ` +
      `"versus" clash emblem, centered inside the middle 65% safe zone with generous empty ` +
      `padding on all sides, on a pure flat black background (#000000), bright purple-magenta ` +
      `glow on the emblem only. Simple, bold, centered. ${NO_TEXT}`,
    async save(buf) {
      const out = path.join(IMAGES_DIR, 'adaptive-icon.png');
      await sharp(buf).resize(1024, 1024, { fit: 'cover' }).png().toFile(out);
      return [out];
    },
  },
  {
    id: 'splash',
    group: 'brand',
    aspect: '9:16',
    prompt:
      `${BRAND} Design a vertical mobile SPLASH / launch screen: a centered glowing emblem of ` +
      `two crossed energy blades clashing in a "versus" spark, on a deep black background with ` +
      `a soft purple radial glow and faint magenta embers / particles rising. Cinematic, minimal, ` +
      `premium, lots of dark negative space framing the centered emblem. ${NO_TEXT}`,
    async save(buf) {
      const out = path.join(IMAGES_DIR, 'splash-screen.png');
      await sharp(buf)
        .resize(1284, 2778, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .png()
        .toFile(out);
      return [out];
    },
  },
  ...Object.keys(STYLE_SCAFFOLDS).map((key) => ({
    id: `style:${key}`,
    group: 'styles',
    aspect: '1:1',
    prompt: stylePrompt(key),
    async save(buf) {
      // JPEG (not webp): RN core <Image> on iOS cannot decode webp.
      const out = path.join(STYLES_DIR, `${key}.jpg`);
      await sharp(buf).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toFile(out);
      return [out];
    },
  })),
  // UI chrome illustrations ("Cinematic Arena" hero zones — see
  // docs/DESIGN_LANGUAGE.md and UX_DESIGN_REVIEW.md). Square tiles are 512px,
  // full-bleed backdrops 1080-wide. All JPEG for iOS <Image> compatibility.
  ...[
    {
      key: 'mode-ranked',
      aspect: '1:1',
      size: [512, 512],
      prompt:
        `${BRAND} Illustration tile for the RANKED battle mode: two crossed energy blades ` +
        `clashing over a glowing champion's laurel wreath, electric purple and magenta energy, ` +
        `dramatic arena spotlights from above, deep black background, centered emblem composition. ${NO_TEXT}`,
    },
    {
      key: 'mode-unranked',
      aspect: '1:1',
      size: [512, 512],
      prompt:
        `${BRAND} Illustration tile for the CASUAL / friendly sparring battle mode: two crossed ` +
        `training staffs with soft cyan energy wisps, relaxed glow, subtle arena floor, ` +
        `deep black background, centered emblem composition, lighter and friendlier mood. ${NO_TEXT}`,
    },
    {
      key: 'mode-bot',
      aspect: '1:1',
      size: [512, 512],
      prompt:
        `${BRAND} Illustration tile for the PRACTICE VS BOT mode: a sleek friendly robot sparring ` +
        `partner bust with glowing cyan eyes and subtle purple rim light, matte dark metal, ` +
        `deep black background, centered composition, approachable not menacing. ${NO_TEXT}`,
    },
    {
      key: 'clash',
      aspect: '1:1',
      size: [512, 512],
      prompt:
        `${BRAND} In-app hero emblem: two crossed energy blades meeting in a bright "versus" ` +
        `spark, radial purple-to-magenta glow, energy particles, bold symmetrical centered ` +
        `composition with comfortable margin. The deep black background must fill the entire ` +
        `canvas edge-to-edge — no border, no frame, no white margin, no card, no vignette box. ${NO_TEXT}`,
    },
    {
      key: 'welcome-hero',
      aspect: '9:16',
      size: [1080, 1920],
      prompt:
        `${BRAND} Vertical full-screen mobile backdrop for the welcome / onboarding screen: a vast ` +
        `dark cinematic esports arena seen from the fighter's entrance tunnel, glowing purple and ` +
        `magenta stage lights, faint silhouetted crowd, energy particles in the air, strong dark ` +
        `negative space in the lower half for overlay text. Epic, premium, atmospheric. ${NO_TEXT}`,
    },
    {
      key: 'arena-backdrop',
      aspect: '9:16',
      size: [1080, 1920],
      prompt:
        `${BRAND} Vertical full-screen mobile backdrop for a waiting / matchmaking screen: a dark ` +
        `moody empty arena floor with a soft purple spotlight circle at center, faint magenta haze ` +
        `and drifting particles, very subtle and non-distracting, mostly near-black with lots of ` +
        `negative space. Calm anticipation. ${NO_TEXT}`,
    },
    {
      key: 'theme-poster',
      aspect: '16:9',
      size: [1024, 576],
      prompt:
        `${BRAND} Wide banner illustration for a "today's battle theme" card: an abstract arena ` +
        `stage with two opposing energy waves (purple vs cyan) colliding in the center with a ` +
        `magenta spark, dark background, cinematic depth, composition keeps the left half darker ` +
        `for overlay text. ${NO_TEXT}`,
    },
  ].map(({ key, aspect, size, prompt }) => ({
    id: `ui:${key}`,
    group: 'ui',
    aspect,
    prompt,
    async save(buf) {
      const out = path.join(UI_DIR, `${key}.jpg`);
      await sharp(buf)
        .resize(size[0], size[1], { fit: 'cover' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(out);
      return [out];
    },
  })),
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function selectTasks(filter) {
  if (!filter) return TASKS;
  return TASKS.filter(
    (t) => t.id === filter || t.group === filter || t.id.startsWith(`${filter}:`),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const t of TASKS) console.log(`${t.group.padEnd(8)} ${t.id}`);
    return;
  }
  const onlyIdx = args.indexOf('--only');
  const filter = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  const tasks = selectTasks(filter);
  if (tasks.length === 0) {
    console.error(`No tasks match "${filter}". Use --list to see ids.`);
    process.exit(1);
  }

  const apiKey = await loadApiKey();
  await fs.mkdir(STYLES_DIR, { recursive: true });
  await fs.mkdir(UI_DIR, { recursive: true });

  console.log(`Generating ${tasks.length} asset(s) with Nano Banana...\n`);
  let ok = 0;
  for (const task of tasks) {
    process.stdout.write(`• ${task.id} (${task.aspect}) ... `);
    try {
      const buf = await generateImage(apiKey, task.prompt, task.aspect);
      const written = await task.save(buf);
      console.log(`done → ${written.map((p) => path.relative(ROOT, p)).join(', ')}`);
      ok += 1;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  console.log(`\n${ok}/${tasks.length} assets generated.`);
  if (ok < tasks.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
