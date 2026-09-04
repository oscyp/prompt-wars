/**
 * Per-fighter move prompt suggestions.
 *
 * Generates three prompt ideas written for one specific character, for one
 * specific move type, against one specific theme -- replacing the 14 static
 * `prompt_templates` rows that carry no character dimension at all.
 *
 * Deliberately NOT modelled on FallbackJudgeProvider. For the judge, silently
 * degrading to a mock is correct: the alternative is a round that never
 * resolves. Here the alternative is handing a player three lines of mock text
 * they just paid a credit for, so failure must propagate and the caller must
 * refund. There is no mock path in this file on purpose.
 */

export const SUGGESTION_PROMPT_VERSION = 'v1-move-suggestions-2026.08';

/** Matches prompt_templates' CHECK so a suggestion is always a legal prompt. */
export const SUGGESTION_BODY_MIN = 20;
export const SUGGESTION_BODY_MAX = 800;
export const SUGGESTION_COUNT = 3;

const REQUEST_TIMEOUT_MS = 30_000;

/** Same table the judge prices from; suggestions run on the same models. */
const MODEL_PRICING: Record<string, { inPerM: number; outPerM: number }> = {
  'grok-4.3': { inPerM: 1.25, outPerM: 2.5 },
  'grok-4.5': { inPerM: 2.0, outPerM: 6.0 },
  'grok-4.6': { inPerM: 2.0, outPerM: 6.0 },
};

export type MoveType = 'attack' | 'defense' | 'finisher';

export interface FighterContext {
  name: string;
  archetype: string;
  vibe?: string | null;
  silhouette?: string | null;
  era?: string | null;
  expression?: string | null;
  paletteKey?: string | null;
  battleCry?: string | null;
  styleDescription?: string | null;
  signatureItemName?: string | null;
  signatureItemFragment?: string | null;
}

export interface SuggestionRequest {
  fighter: FighterContext;
  moveType: MoveType;
  theme: string;
  roundNumber: number;
  /** Varied on reroll so a second paid set is not the first one again. */
  seed: number;
}

export interface Suggestion {
  title: string;
  body: string;
}

export interface SuggestionResult {
  suggestions: Suggestion[];
  provider: string;
  model: string;
  costUsd?: number;
  latencyMs: number;
}

export class SuggestionError extends Error {
  constructor(
    public code:
      | 'not_configured'
      | 'timeout'
      | 'network'
      | 'server_error'
      | 'client_error'
      | 'malformed_response',
    message: string,
  ) {
    super(message);
    this.name = 'SuggestionError';
  }
}

/**
 * Strict schema. `additionalProperties: false` plus a complete `required` list
 * are both mandatory for xAI strict mode -- omitting either makes the model
 * free to return a shape the parser then has to guess at.
 */
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      minItems: SUGGESTION_COUNT,
      maxItems: SUGGESTION_COUNT,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 48 },
          body: {
            type: 'string',
            minLength: SUGGESTION_BODY_MIN,
            maxLength: SUGGESTION_BODY_MAX,
          },
        },
        required: ['title', 'body'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

const MOVE_GUIDANCE: Record<MoveType, string> = {
  attack:
    'An opening or pressing offensive move. It should commit to something ' +
    'concrete and create a problem the opponent has to answer.',
  defense:
    'A defensive or reversal move. It should absorb, redirect or punish an ' +
    'incoming attack rather than simply blocking it.',
  finisher:
    'A decisive closing move. Highest risk and highest drama -- it should ' +
    'read as an ending, not another exchange.',
};

export function buildFighterBrief(f: FighterContext): string {
  const lines: string[] = [`Name: ${f.name}`, `Archetype: ${f.archetype}`];
  if (f.vibe) lines.push(`Vibe: ${f.vibe}`);
  if (f.silhouette) lines.push(`Build: ${f.silhouette}`);
  if (f.era) lines.push(`Era: ${f.era}`);
  if (f.expression) lines.push(`Default expression: ${f.expression}`);
  if (f.paletteKey) lines.push(`Palette: ${f.paletteKey}`);
  if (f.battleCry) lines.push(`Battle cry: "${f.battleCry}"`);
  if (f.styleDescription) lines.push(`Fighting style: ${f.styleDescription}`);
  if (f.signatureItemName) {
    // prompt_fragment is purpose-written prose for exactly this kind of use,
    // so it goes in verbatim rather than being re-described.
    lines.push(
      `Signature item: ${f.signatureItemName}` +
        (f.signatureItemFragment ? ` -- ${f.signatureItemFragment}` : ''),
    );
  }
  return lines.join('\n');
}

export function buildSystemPrompt(): string {
  return [
    'You write prompt ideas for Prompt Wars, a 1v1 game where players write',
    "a short prompt describing their fighter's move and an AI judge scores",
    'the writing on clarity, originality, specificity, theme fit, archetype',
    'fit and dramatic potential.',
    '',
    'You are given one fighter, one move type and one battle theme. Write',
    `exactly ${SUGGESTION_COUNT} DISTINCT prompt suggestions that player could submit.`,
    '',
    'Rules:',
    "- Write in the player's voice, as a prompt they would submit. Do not",
    '  address the player, explain your reasoning, or use second person.',
    '- Each suggestion must be specific to THIS fighter: use their archetype,',
    '  build, era and signature item. A suggestion that would fit any fighter',
    '  is a failed suggestion.',
    '- Tie each one to the battle theme.',
    '- Make the three genuinely different in approach, not three phrasings of',
    '  one idea.',
    `- body: ${SUGGESTION_BODY_MIN}-${SUGGESTION_BODY_MAX} characters.`,
    '- title: a short label, 3-48 characters, no quotes.',
    '- Keep it bloodless and non-graphic: stylised, cinematic combat only.',
    '  No gore, no sexual content, no real people.',
    '',
    'Respond with JSON only.',
  ].join('\n');
}

export function buildUserPrompt(req: SuggestionRequest): string {
  return [
    `Battle theme: ${req.theme}`,
    `Round: ${req.roundNumber}`,
    `Move type: ${req.moveType}`,
    MOVE_GUIDANCE[req.moveType],
    '',
    'Fighter:',
    buildFighterBrief(req.fighter),
  ].join('\n');
}

function estimateCostUsd(
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  const rate = MODEL_PRICING[model];
  if (!rate || promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }
  return (
    (promptTokens / 1_000_000) * rate.inPerM +
    (completionTokens / 1_000_000) * rate.outPerM
  );
}

/**
 * Validates the parsed model output.
 *
 * Runs even though the schema is strict: strict mode is the provider's promise,
 * not ours, and a row that violates the table's own CHECK would fail at insert
 * time with a Postgres error the player would see as a generic failure.
 */
export function validateSuggestions(parsed: unknown): Suggestion[] {
  const raw = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(raw) || raw.length !== SUGGESTION_COUNT) {
    throw new SuggestionError(
      'malformed_response',
      `expected ${SUGGESTION_COUNT} suggestions, got ${
        Array.isArray(raw) ? raw.length : typeof raw
      }`,
    );
  }

  return raw.map((item, i) => {
    const title =
      typeof (item as Suggestion)?.title === 'string'
        ? (item as Suggestion).title.trim()
        : '';
    const body =
      typeof (item as Suggestion)?.body === 'string'
        ? (item as Suggestion).body.trim()
        : '';

    if (!title) {
      throw new SuggestionError(
        'malformed_response',
        `suggestion ${i} has no title`,
      );
    }
    if (
      body.length < SUGGESTION_BODY_MIN ||
      body.length > SUGGESTION_BODY_MAX
    ) {
      throw new SuggestionError(
        'malformed_response',
        `suggestion ${i} body length ${body.length} outside ` +
          `${SUGGESTION_BODY_MIN}-${SUGGESTION_BODY_MAX}`,
      );
    }
    return { title: title.slice(0, 48), body };
  });
}

/**
 * Calls xAI for one suggestion set. Throws SuggestionError on every failure
 * path; there is no degraded return value.
 */
export async function generateSuggestions(
  req: SuggestionRequest,
): Promise<SuggestionResult> {
  const apiKey =
    Deno.env.get('SUGGESTIONS_API_KEY') ||
    Deno.env.get('JUDGE_API_KEY') ||
    Deno.env.get('XAI_API_KEY') ||
    '';
  if (!apiKey) {
    throw new SuggestionError('not_configured', 'no xAI API key configured');
  }

  const baseUrl =
    Deno.env.get('JUDGE_API_BASE_URL') ||
    Deno.env.get('XAI_API_BASE_URL') ||
    'https://api.x.ai/v1';
  // Shares the judge's default model: same family, same strict-mode support,
  // and suggestions are a cheaper call than judging (one pass, short output).
  const model =
    Deno.env.get('SUGGESTIONS_MODEL_ID') ||
    Deno.env.get('JUDGE_MODEL_ID') ||
    'grok-4.3';

  const startedAt = Date.now();
  let status = 0;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(req) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'prompt_wars_move_suggestions',
            strict: true,
            schema: SUGGESTION_SCHEMA,
          },
        },
        // Higher than the judge's 0.4: the judge wants consistency, this wants
        // three ideas that differ from each other and from the last reroll.
        temperature: 0.9,
        seed: req.seed,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = res.status;

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new SuggestionError(
        res.status >= 500 ? 'server_error' : 'client_error',
        `xAI suggestions ${res.status}: ${bodyText.slice(0, 200)}`,
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new SuggestionError(
        'malformed_response',
        'xAI suggestions response missing message content',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new SuggestionError(
        'malformed_response',
        'xAI suggestions did not return parseable JSON',
      );
    }

    const usage = data?.usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;

    return {
      suggestions: validateSuggestions(parsed),
      provider: 'xai',
      model,
      costUsd: estimateCostUsd(
        model,
        usage?.prompt_tokens,
        usage?.completion_tokens,
      ),
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    if (err instanceof SuggestionError) throw err;
    const isAbort = err instanceof DOMException && err.name === 'TimeoutError';
    throw new SuggestionError(
      isAbort ? 'timeout' : 'network',
      err instanceof Error ? err.message : `xAI suggestions failed (${status})`,
    );
  }
}
