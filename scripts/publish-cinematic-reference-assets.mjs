#!/usr/bin/env node
// Default: local verification only. --execute explicitly uploads immutable assets.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (
  args.some((arg) => arg !== '--execute' && arg !== '--dry-run') ||
  (args.includes('--execute') && args.includes('--dry-run'))
) {
  throw new Error(
    'Usage: node scripts/publish-cinematic-reference-assets.mjs [--dry-run | --execute]',
  );
}
const execute = args.includes('--execute');
const root = new URL('../', import.meta.url);
const source = await readFile(
  new URL('supabase/functions/_shared/cinematic-bundled-assets.ts', root),
  'utf8',
);
const match = source.match(
  /CINEMATIC_BUNDLED_ASSETS:[^=]+?=\s*(\{[\s\S]*?\n\});/,
);
if (!match) throw new Error('Bundled reference manifest is unreadable');
const manifest = JSON.parse(match[1].replace(/,\s*([}\]])/g, '$1'));
const assets = [];
// Validate the entire plan before any upload, including byte-for-byte app parity.
for (const [key, asset] of Object.entries(manifest)) {
  const bytes = await readFile(new URL(asset.local_path, root));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== asset.version || !asset.path.endsWith(`/${hash}.jpg`)) {
    throw new Error(
      `Bundled artwork changed; regenerate manifest before publishing: ${asset.local_path}`,
    );
  }
  assets.push({ key, ...asset, size_bytes: bytes.length, bytes });
}
let uploaded = 0;
let verified = 0;
if (execute) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      'Execute requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  for (const asset of assets) {
    const objectPath = `${encodeURIComponent(asset.bucket)}/${asset.path.split('/').map(encodeURIComponent).join('/')}`;
    const upload = await fetch(`${url}/storage/v1/object/${objectPath}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
      },
      body: asset.bytes,
    });
    // Existing content-addressed assets are verified instead of overwritten.
    if (!upload.ok && upload.status !== 409 && upload.status !== 400) {
      throw new Error(`Upload failed (${upload.status}) for ${asset.key}`);
    }
    if (upload.ok) uploaded++;
    const download = await fetch(
      `${url}/storage/v1/object/authenticated/${objectPath}`,
      { headers },
    );
    if (!download.ok)
      throw new Error(
        `Published asset cannot be verified (${download.status}): ${asset.key}`,
      );
    const hash = createHash('sha256')
      .update(Buffer.from(await download.arrayBuffer()))
      .digest('hex');
    if (hash !== asset.version)
      throw new Error(`Published asset differs from app artwork: ${asset.key}`);
    verified++;
  }
}
console.log(
  JSON.stringify(
    {
      mode: execute ? 'execute' : 'dry-run',
      uploaded,
      verified,
      assets: assets.map(({ bytes, ...asset }) => asset),
    },
    null,
    2,
  ),
);
