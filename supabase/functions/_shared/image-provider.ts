// Image provider adapter for Prompt Wars character portraits and item icons.
// Primary: xAI (grok-imagine-image). Fallback: OpenAI Images (gpt-image-1).
// Deterministic stub when IMAGE_PROVIDER_MODE === 'fallback'.

import {
  resolvePortraitPrompt,
  resolveItemIconPrompt,
  type Archetype,
  type ArtStyle,
  type PortraitTraits,
  type PortraitKind,
} from './portrait-prompt-resolver.ts';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PortraitGenerationInput {
  prompt_raw?: string;
  traits?: PortraitTraits;
  archetype: Archetype;
  signature_color: string;
  signature_item_fragment?: string;
  seed: number;
  art_style?: ArtStyle;
  /** 'fighter' (full-body, default) or 'avatar' (head/bust). */
  kind?: PortraitKind;
}

export interface PortraitGenerationResult {
  provider: 'xai' | 'openai' | 'fallback';
  provider_model: string;
  /** Billable amount from the deployment's provider contract, when configured. */
  provider_cost_usd?: number;
  provider_latency_ms: number;
  image_bytes: Uint8Array;
  content_type: 'image/png' | 'image/webp' | 'image/jpeg';
  resolved_prompt: string;
}

export interface ItemIconGenerationInput {
  name: string;
  description: string;
  item_class: 'tool' | 'symbol' | 'weaponized_mundane' | 'relic' | 'instrument';
  seed: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ImageProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImageProviderError';
    this.code = code;
  }
}

export class SafetyRefusedError extends Error {
  code: string;
  provider: 'xai' | 'openai';
  constructor(provider: 'xai' | 'openai', message: string) {
    super(message);
    this.name = 'SafetyRefusedError';
    this.code = 'safety_refused';
    this.provider = provider;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XAI_URL = 'https://api.x.ai/v1/images/generations';
const XAI_MODEL = 'grok-imagine-image';
const OPENAI_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_MODEL = 'gpt-image-1';
// Per-provider budgets, not one shared number: grok-imagine-image answers in
// well under 10s, while gpt-image-1 at 1024x1536 measures ~55s and a single
// 45s budget aborted it on every call. Worst case is XAI + OPENAI, which has to
// stay inside the Edge Function wall clock.
const XAI_TIMEOUT_MS = 45_000;
const OPENAI_TIMEOUT_MS = 90_000;

// 1x1 transparent PNG (deterministic stub)
const FALLBACK_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateCharacterPortrait(
  input: PortraitGenerationInput,
): Promise<PortraitGenerationResult> {
  const resolvedPrompt = resolvePortraitPrompt(input);
  // Canvas follows the framing: a 2:3 vertical for full-body so the figure
  // renders head to feet, square for a bust so the face fills the frame rather
  // than floating in dead vertical space.
  //
  // Both providers honour it, through different parameters -- OpenAI takes
  // `size`, xAI takes `aspect_ratio` (and 400s on `size`).
  return generateWithRouting({
    resolvedPrompt,
    size: input.kind === 'avatar' ? '1024x1024' : '1024x1536',
  });
}

export async function generateItemIcon(
  input: ItemIconGenerationInput,
): Promise<PortraitGenerationResult> {
  const resolvedPrompt = resolveItemIconPrompt(input);
  return generateWithRouting({
    resolvedPrompt,
    size: '1024x1024',
  });
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

interface RoutingArgs {
  resolvedPrompt: string;
  // gpt-image-1 supported sizes: 1024x1024 (square icons) and 1024x1536
  // (portrait/full-body). Sent verbatim to OpenAI; translated to an
  // `aspect_ratio` for xAI, which rejects `size` outright.
  size: '1024x1024' | '1024x1536';
}

async function generateWithRouting(
  args: RoutingArgs,
): Promise<PortraitGenerationResult> {
  if (isFallbackMode()) {
    return fallbackResult(args.resolvedPrompt);
  }

  // Try xAI primary. Every non-safety failure falls through to OpenAI,
  // retryable or not -- there is no third provider to save for.
  let primaryError = 'none';
  try {
    return await callXai(args);
  } catch (err) {
    if (err instanceof SafetyRefusedError) {
      // Do not retry on the other provider for safety refusals.
      throw err;
    }
    primaryError = err instanceof Error ? err.message : String(err);
  }

  try {
    return await callOpenAi(args);
  } catch (err) {
    if (err instanceof SafetyRefusedError) {
      throw err;
    }
    // Name both failures. Reporting only the fallback's error hid a retired
    // primary model behind the fallback's timeout for weeks.
    throw new ImageProviderError(
      'all_providers_failed',
      `All image providers failed: xai=${primaryError}; openai=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function isFallbackMode(): boolean {
  const mode = safeEnv('IMAGE_PROVIDER_MODE');
  if (mode && mode.toLowerCase() === 'fallback') return true;
  // Deno test mode detection
  const testMode = safeEnv('DENO_TESTING');
  if (testMode) return true;
  return false;
}

function fallbackResult(resolvedPrompt: string): PortraitGenerationResult {
  return {
    provider: 'fallback',
    provider_model: 'deterministic-stub',
    provider_latency_ms: 0,
    image_bytes: FALLBACK_PNG_BYTES,
    content_type: 'image/png',
    resolved_prompt: resolvedPrompt,
  };
}

// ---------------------------------------------------------------------------
// xAI
// ---------------------------------------------------------------------------

async function callXai(args: RoutingArgs): Promise<PortraitGenerationResult> {
  const apiKey = safeEnv('XAI_API_KEY');
  if (!apiKey) {
    throw new ImageProviderError(
      'missing_api_key',
      'XAI_API_KEY not configured',
    );
  }

  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // xAI rejects unknown arguments outright (`size` 400s), so send only
      // what grok-imagine-image takes: model/prompt/n/response_format plus
      // `aspect_ratio`. There is no `seed` -- determinism flavor lives in the
      // resolved prompt as "Composition seed". Without aspect_ratio the model
      // defaults to landscape, which crops a full-body fighter off at the knees.
      body: JSON.stringify({
        model: XAI_MODEL,
        prompt: args.resolvedPrompt,
        response_format: 'b64_json',
        aspect_ratio: xaiAspectRatio(args.size),
        n: 1,
      }),
      signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
    });
    status = res.status;

    if (!res.ok) {
      const bodyText = await safeReadText(res);
      if (isSafetyRefusal(res.status, bodyText)) {
        throw new SafetyRefusedError(
          'xai',
          'xAI refused generation due to safety policy',
        );
      }
      if (res.status >= 500) {
        throw new ImageProviderError('server_error', `xAI ${res.status}`);
      }
      throw new ImageProviderError(
        'client_error',
        `xAI ${res.status}: ${truncate(bodyText, 200)}`,
      );
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new ImageProviderError(
        'malformed_response',
        'xAI response missing b64_json',
      );
    }
    const bytes = decodeBase64(b64);

    return {
      provider: 'xai',
      provider_model: XAI_MODEL,
      provider_cost_usd: configuredImageCost('xai', args.size),
      provider_latency_ms: Date.now() - started,
      image_bytes: bytes,
      content_type: detectImageContentType(bytes),
      resolved_prompt: args.resolvedPrompt,
    };
  } catch (err) {
    if (
      err instanceof SafetyRefusedError ||
      err instanceof ImageProviderError
    ) {
      logCall('xai', started, status, err.code ?? 'error');
      throw err;
    }
    const code = isAbortError(err) ? 'timeout' : 'network';
    logCall('xai', started, status, code);
    throw new ImageProviderError(
      code,
      err instanceof Error ? err.message : 'xAI network error',
    );
  } finally {
    if (status >= 200 && status < 300) {
      logCall('xai', started, status, 'ok');
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAi(
  args: RoutingArgs,
): Promise<PortraitGenerationResult> {
  const apiKey = safeEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new ImageProviderError(
      'missing_api_key',
      'OPENAI_API_KEY not configured',
    );
  }

  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        prompt: args.resolvedPrompt,
        size: args.size,
        n: 1,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    status = res.status;

    if (!res.ok) {
      const bodyText = await safeReadText(res);
      if (isSafetyRefusal(res.status, bodyText)) {
        throw new SafetyRefusedError(
          'openai',
          'OpenAI refused generation due to safety policy',
        );
      }
      if (res.status >= 500) {
        throw new ImageProviderError('server_error', `OpenAI ${res.status}`);
      }
      throw new ImageProviderError(
        'client_error',
        `OpenAI ${res.status}: ${truncate(bodyText, 200)}`,
      );
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new ImageProviderError(
        'malformed_response',
        'OpenAI response missing b64_json',
      );
    }
    const bytes = decodeBase64(b64);

    return {
      provider: 'openai',
      provider_model: OPENAI_MODEL,
      provider_cost_usd: configuredImageCost('openai', args.size),
      provider_latency_ms: Date.now() - started,
      image_bytes: bytes,
      content_type: detectImageContentType(bytes),
      resolved_prompt: args.resolvedPrompt,
    };
  } catch (err) {
    if (
      err instanceof SafetyRefusedError ||
      err instanceof ImageProviderError
    ) {
      logCall('openai', started, status, err.code ?? 'error');
      throw err;
    }
    const code = isAbortError(err) ? 'timeout' : 'network';
    logCall('openai', started, status, code);
    throw new ImageProviderError(
      code,
      err instanceof Error ? err.message : 'OpenAI network error',
    );
  } finally {
    if (status >= 200 && status < 300) {
      logCall('openai', started, status, 'ok');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** OpenAI's `size` translated to the equivalent xAI `aspect_ratio`. */
function xaiAspectRatio(size: RoutingArgs['size']): '1:1' | '2:3' {
  return size === '1024x1536' ? '2:3' : '1:1';
}

function safeEnv(key: string): string | undefined {
  try {
    return (
      globalThis as { Deno?: { env: { get(k: string): string | undefined } } }
    ).Deno?.env.get(key);
  } catch {
    return undefined;
  }
}

function configuredImageCost(
  provider: 'xai' | 'openai',
  size: RoutingArgs['size'],
): number | undefined {
  const suffix = size === '1024x1536' ? 'PORTRAIT' : 'SQUARE';
  const raw = safeEnv(`${provider.toUpperCase()}_IMAGE_COST_USD_${suffix}`);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function isSafetyRefusal(status: number, body: string): boolean {
  if (status < 400 || status >= 500) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('safety') ||
    lower.includes('content_policy') ||
    lower.includes('content policy') ||
    lower.includes('moderation') ||
    lower.includes('refus')
  );
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectImageContentType(
  bytes: Uint8Array,
): 'image/png' | 'image/webp' | 'image/jpeg' {
  // PNG: 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

function logCall(
  provider: 'xai' | 'openai',
  startedAtMs: number,
  httpStatus: number,
  status: string,
): void {
  // Structured JSON log; no secrets, no prompt text.
  try {
    console.log(
      JSON.stringify({
        event: 'image_provider_call',
        provider,
        latency_ms: Date.now() - startedAtMs,
        http_status: httpStatus,
        status,
      }),
    );
  } catch {
    // ignore log failures
  }
}
