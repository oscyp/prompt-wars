/**
 * The character-creation draft: its shape, step gating, on-device persistence
 * and every player-facing sentence the flow says about money or failure.
 *
 * Pure apart from the three AsyncStorage calls, so the screen stays a renderer
 * and the rules ("can I advance?", "which error is this?", "does the portrait
 * still match?") can be pinned by tests.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import {
  ART_STYLE_LABELS,
  PALETTE_HEX,
  TRAIT_LABELS,
  type ArtStyle,
  type Era,
  type Expression,
  type PaletteKey,
  type Silhouette,
  type Vibe,
} from '@/constants/CharacterTraits';
import { formatCredits, insufficientCreditsMessage } from '@/utils/credits';
import { EditError } from '@/utils/editErrors';
import {
  BALANCED_STATS,
  STAT_MAX,
  STAT_MIN,
  STAT_POINT_TOTAL,
  allocationHint,
  describeAllocation,
  isValidAllocation,
} from '@/utils/statAllocation';
import type { StatBlock } from '@/types/battle';
import type {
  CatalogSignatureItem,
  PortraitJobResult,
} from '@/utils/characters';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type CreationPath = 'prompt' | 'guided';

export const MIN_NAME_LEN = 3;
export const MAX_NAME_LEN = 20;
export const MIN_BATTLE_CRY_LEN = 3;
export const MAX_BATTLE_CRY_LEN = 60;
export const MAX_PROMPT_LEN = 120;
export const MAX_ITEM_NAME_LEN = 32;
export const MAX_ITEM_DESC_LEN = 140;

/**
 * The battle_cry written when the draft row is pre-created. Must match
 * PLACEHOLDER_BATTLE_CRY in supabase/functions/_shared/character-creation.ts:
 * finalize-character-creation refuses rows that carry anything else.
 */
export const PLACEHOLDER_BATTLE_CRY = '…';

/**
 * Free portraits during creation, mirroring DRAFT_FREE_RENDERS in
 * generate-portrait. Display only — the server decides and reports the count.
 */
export const DRAFT_FREE_PORTRAITS = 3;

/** The inputs a portrait was drawn from, kept to tell when it has gone stale. */
export interface RenderInputs {
  path: CreationPath;
  artStyle: ArtStyle;
  prompt: string;
  vibe?: Vibe;
  silhouette?: Silhouette;
  palette?: PaletteKey;
  era?: Era;
  expression?: Expression;
}

export interface Draft {
  name: string;
  archetype: ArchetypeId | null;
  /** Creation-time allocation. Every fighter spends the same pool. */
  stats: StatBlock;
  path: CreationPath | null;
  prompt: string;
  vibe?: Vibe;
  silhouette?: Silhouette;
  palette?: PaletteKey;
  era?: Era;
  expression?: Expression;
  artStyle: ArtStyle;
  portrait?: PortraitJobResult;
  /** What `portrait` was drawn from. Absent until a portrait lands. */
  renderedWith?: RenderInputs;
  portraitFailed: boolean;
  signatureItem?: CatalogSignatureItem;
  /** No item picked; the server assigns a catalogue default on insert. */
  itemSkipped: boolean;
  battleCry: string;
  /** Undefined means "archetype default". */
  signatureColor?: PaletteKey;
  /**
   * Set once the `characters` row is pre-created (first portrait, or at
   * confirm). Confirm finalizes this row rather than inserting another.
   */
  characterId?: string;
}

export const INITIAL_DRAFT: Draft = {
  name: '',
  archetype: null,
  stats: { ...BALANCED_STATS },
  path: null,
  prompt: '',
  artStyle: 'painterly',
  battleCry: '',
  portraitFailed: false,
  itemSkipped: false,
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * Identity first (name, archetype, stats, item, cry, colour), then how to
 * build, then the portrait last: it is the one step that can cost credits and
 * the one a player may want to redo, so it carries the recap and the
 * Enter-the-Arena action. There is no separate confirm step.
 */
export const STEP = {
  name: 1,
  archetype: 2,
  stats: 3,
  item: 4,
  battleCry: 5,
  color: 6,
  path: 7,
  portrait: 8,
} as const;

export const TOTAL_STEPS = 8;

const STEP_TITLES: Record<number, string> = {
  [STEP.name]: 'Name',
  [STEP.archetype]: 'Archetype',
  [STEP.stats]: 'Stats',
  [STEP.item]: 'Signature item',
  [STEP.battleCry]: 'Battle cry',
  [STEP.color]: 'Signature colour',
  [STEP.path]: 'How to build',
  [STEP.portrait]: 'Portrait',
};

export function stepTitle(step: number): string {
  return STEP_TITLES[step] ?? '';
}

export function progressLabel(step: number): string {
  return `Step ${step} of ${TOTAL_STEPS}`;
}

/** Screen-reader announcement when the step changes. */
export function stepAnnouncement(step: number): string {
  return `${progressLabel(step)}: ${stepTitle(step)}`;
}

function nameIsValid(name: string): boolean {
  const n = name.trim().length;
  return n >= MIN_NAME_LEN && n <= MAX_NAME_LEN;
}

/** Whether Next is enabled on `step`. Skips count as done. */
export function canAdvance(step: number, draft: Draft): boolean {
  switch (step) {
    case STEP.name:
      return nameIsValid(draft.name);
    case STEP.archetype:
      return draft.archetype !== null;
    case STEP.stats:
      return isValidAllocation(draft.stats);
    case STEP.item:
      return Boolean(draft.signatureItem) || draft.itemSkipped;
    case STEP.battleCry:
      return draft.battleCry.trim().length >= MIN_BATTLE_CRY_LEN;
    case STEP.color:
      return true;
    case STEP.path:
      return draft.path !== null;
    case STEP.portrait:
      // Last step: "Next" here is Enter the Arena.
      return finalizeBlocker(draft) === null;
    default:
      return false;
  }
}

/** Read as the disabled Next button's hint; undefined when it is enabled. */
export function nextDisabledHint(
  step: number,
  draft: Draft,
): string | undefined {
  if (canAdvance(step, draft)) return undefined;
  switch (step) {
    case STEP.name:
      return `Enter a name of ${MIN_NAME_LEN} to ${MAX_NAME_LEN} characters to continue`;
    case STEP.archetype:
      return 'Choose an archetype to continue';
    case STEP.stats:
      return allocationHint(draft.stats);
    case STEP.item:
      return 'Pick a signature item or skip to continue';
    case STEP.battleCry:
      return `Write a battle cry of at least ${MIN_BATTLE_CRY_LEN} characters to continue`;
    case STEP.path:
      return 'Choose how to build your fighter to continue';
    case STEP.portrait:
      return finalizeBlocker(draft)?.message;
    default:
      return undefined;
  }
}

/**
 * The first step a restored draft cannot legitimately be past. A draft saved
 * at step 6 whose name was somehow cleared reopens at step 1, not step 6.
 */
export function clampStepToDraft(step: number, draft: Draft): number {
  const target = Math.min(Math.max(Math.floor(step) || 1, 1), TOTAL_STEPS);
  for (let s = 1; s < target; s++) {
    if (!canAdvance(s, draft)) return s;
  }
  return target;
}

export interface FinalizeBlocker {
  message: string;
  /** Step that fixes it. */
  step: number;
}

export const PORTRAIT_REQUIRED_MESSAGE =
  'Draw your portrait before entering the arena.';

/** Why the last step cannot submit yet, or null. Replaces silent returns. */
export function finalizeBlocker(draft: Draft): FinalizeBlocker | null {
  if (!draft.archetype) {
    return {
      message: 'Choose an archetype before entering the arena.',
      step: STEP.archetype,
    };
  }
  if (!nameIsValid(draft.name)) {
    return {
      message: `Your fighter needs a name of ${MIN_NAME_LEN} to ${MAX_NAME_LEN} characters.`,
      step: STEP.name,
    };
  }
  if (draft.battleCry.trim().length < MIN_BATTLE_CRY_LEN) {
    return {
      message: 'Add a battle cry before entering the arena.',
      step: STEP.battleCry,
    };
  }
  // No skip: the portrait is part of the fighter, not an optional extra.
  if (!draft.portrait) {
    return { message: PORTRAIT_REQUIRED_MESSAGE, step: STEP.portrait };
  }
  if (!isValidAllocation(draft.stats)) {
    return {
      message: `Place all ${STAT_POINT_TOTAL} stat points before entering the arena.`,
      step: STEP.stats,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Portrait staleness (D31)
// ---------------------------------------------------------------------------

export const PORTRAIT_STALE_NOTICE =
  'Portrait doesn’t match your current picks — Regenerate to update.';

/** Snapshot of the picks a portrait would be drawn from right now. */
export function renderInputs(draft: Draft): RenderInputs {
  return {
    path: draft.path ?? 'prompt',
    artStyle: draft.artStyle,
    prompt: draft.prompt.trim(),
    vibe: draft.vibe,
    silhouette: draft.silhouette,
    palette: draft.palette,
    era: draft.era,
    expression: draft.expression,
  };
}

/** True when a portrait exists and the picks have moved since it was drawn. */
export function portraitIsStale(draft: Draft): boolean {
  const was = draft.renderedWith;
  if (!draft.portrait || !was) return false;
  const now = renderInputs(draft);
  if (now.artStyle !== was.artStyle || now.path !== was.path) return true;
  if (now.path === 'prompt') return now.prompt !== was.prompt.trim();
  return (
    now.vibe !== was.vibe ||
    now.silhouette !== was.silhouette ||
    now.palette !== was.palette ||
    now.era !== was.era ||
    now.expression !== was.expression
  );
}

// ---------------------------------------------------------------------------
// Money copy
// ---------------------------------------------------------------------------

/** Said before the first Generate, so the allowance is known up front. */
export function freePortraitsIntro(price: number | null): string {
  if (price === null) {
    return `${DRAFT_FREE_PORTRAITS} free portraits. After that, each one costs credits.`;
  }
  return `${DRAFT_FREE_PORTRAITS} free portraits, then ${formatCredits(price, 'sentence')} each.`;
}

/** The running count after each portrait. */
export function freePortraitsLeft(left: number, price: number | null): string {
  if (left > 0) return `${left} free portrait${left === 1 ? '' : 's'} left`;
  const each = price === null ? 'credits' : formatCredits(price);
  return `No free portraits left · ${each} each. You can change your look any time after this.`;
}

export interface OutOfFreePortraitsCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * The confirm before a paid portrait. With no live price (the read failed) it
 * still says a charge is coming rather than quoting a number the server may
 * not honour.
 */
export function outOfFreePortraitsCopy(
  price: number | null,
): OutOfFreePortraitsCopy {
  const sentence =
    price === null ? 'credits' : formatCredits(price, 'sentence');
  return {
    title: 'Out of free portraits',
    message: `You’ve used your ${DRAFT_FREE_PORTRAITS} free portraits. Another one costs ${sentence}.`,
    confirmLabel: `Spend ${sentence}`,
    cancelLabel: 'Keep this one',
  };
}

/** Regenerate button label; carries the price once the free ones are gone. */
export function regenerateLabel(
  outOfFree: boolean,
  price: number | null,
): string {
  if (!outOfFree) return 'Regenerate';
  return price === null
    ? 'Regenerate · credits'
    : `Regenerate · ${formatCredits(price)}`;
}

export interface CustomItemPrices {
  text: number | null;
  image: number | null;
}

/** Sits beside the "Generate icon" switch. Names the marginal cost of the icon. */
export function iconSwitchCaption(prices: CustomItemPrices): string {
  if (prices.image === null) return 'Adds an icon';
  const extra = Math.max(prices.image - (prices.text ?? 0), 0);
  return `Adds an icon · ${formatCredits(extra)}`;
}

/** The custom item's create button, priced for the chosen options. */
export function customItemCreateLabel(
  prices: CustomItemPrices,
  withIcon: boolean,
): string {
  const price = withIcon ? prices.image : prices.text;
  if (price === null) return 'Create';
  return `Create · ${formatCredits(price)}`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface FunctionFailure {
  status: number;
  code?: string;
  message?: string;
  shortfall?: number;
  /** The request field the server blamed, when it named one. */
  field?: string;
}

/**
 * Reads a `FunctionInvokeError` (utils/supabase.ts) without importing it: that
 * module builds the Supabase client on import, which this pure module must not
 * trigger. Anything with a numeric `status` and a `body` is treated as one.
 */
function functionFailure(err: unknown): FunctionFailure | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; body?: unknown };
  if (typeof e.status !== 'number') return null;
  const body =
    e.body && typeof e.body === 'object'
      ? (e.body as { error?: unknown })
      : null;
  const inner =
    body?.error && typeof body.error === 'object'
      ? (body.error as {
          code?: unknown;
          message?: unknown;
          shortfall?: unknown;
          field?: unknown;
        })
      : null;
  return {
    status: e.status,
    code: typeof inner?.code === 'string' ? inner.code : undefined,
    message: typeof inner?.message === 'string' ? inner.message : undefined,
    shortfall:
      typeof inner?.shortfall === 'number' ? inner.shortfall : undefined,
    field: typeof inner?.field === 'string' ? inner.field : undefined,
  };
}

function errorCode(err: unknown): string | undefined {
  const fn = functionFailure(err);
  if (fn?.code) return fn.code;
  if (err instanceof EditError) return err.code;
  return undefined;
}

function shortfallOf(err: unknown): number | undefined {
  const fn = functionFailure(err);
  if (typeof fn?.shortfall === 'number') return fn.shortfall;
  if (err instanceof EditError) return err.shortfall;
  return undefined;
}

export const PORTRAIT_MODERATION_MESSAGE =
  'That description didn’t pass moderation. Try different wording.';
export const PORTRAIT_TIMEOUT_MESSAGE =
  'Your portrait is taking longer than usual. We’ll keep working on it.';
export const PORTRAIT_UNAVAILABLE_MESSAGE =
  'Portrait drawing is unavailable right now — you’re seeing a placeholder instead of your portrait.';

export interface PortraitErrorCopy {
  message: string;
  /** Offer a Retry action. Off for deterministic refusals. */
  retry: boolean;
  /** Offer a Top up action to the wallet. */
  topUp: boolean;
}

/**
 * The portrait failure banner. Branches on the machine-readable code and never
 * appends the server's prose.
 */
export function describePortraitError(err: unknown): PortraitErrorCopy {
  const fn = functionFailure(err);
  const code = errorCode(err);
  if (fn?.status === 422 || code === 'moderation_rejected') {
    return { message: PORTRAIT_MODERATION_MESSAGE, retry: false, topUp: false };
  }
  if (fn?.status === 402 || code === 'insufficient_credits') {
    return {
      message: insufficientCreditsMessage(shortfallOf(err)),
      retry: false,
      topUp: true,
    };
  }
  if (code === 'timeout') {
    return { message: PORTRAIT_TIMEOUT_MESSAGE, retry: true, topUp: false };
  }
  return { message: PORTRAIT_UNAVAILABLE_MESSAGE, retry: true, topUp: false };
}

export interface CustomItemErrorCopy {
  title: string;
  message: string;
  topUp: boolean;
}

export function describeCustomItemError(err: unknown): CustomItemErrorCopy {
  const fn = functionFailure(err);
  const code = errorCode(err);
  if (fn?.status === 429 || code === 'rate_limited') {
    return {
      title: 'Daily limit reached',
      message: 'You’ve made today’s limit of custom items.',
      topUp: false,
    };
  }
  if (fn?.status === 422 || code === 'moderation_rejected') {
    return {
      title: 'Rejected',
      message:
        'That wording didn’t pass moderation. Try describing it a different way.',
      topUp: false,
    };
  }
  if (fn?.status === 402 || code === 'insufficient_credits') {
    return {
      title: 'Not enough credits',
      message: insufficientCreditsMessage(shortfallOf(err)),
      topUp: true,
    };
  }
  return {
    title: 'Couldn’t create item',
    message: 'Something went wrong. Please try again.',
    topUp: false,
  };
}

export type FinalizeOutcome =
  | { kind: 'already_finalized' }
  | { kind: 'moderation'; title: string; message: string }
  | { kind: 'error'; title: string; message: string };

/**
 * What a failed finalize means.
 *
 * A 409 says the row was already finalized — by a previous tap that timed out
 * on the way back, typically — and is a success for the player. Moderation
 * refusals come back as a 400 whose prose names "name or battle cry"; the
 * server does not say which, so the copy names both and the screen offers a
 * fix for each.
 */
export function describeFinalizeError(err: unknown): FinalizeOutcome {
  const fn = functionFailure(err);
  const code = errorCode(err);
  if (fn?.status === 409 || code === 'conflict') {
    return { kind: 'already_finalized' };
  }
  const prose = fn?.message ?? (err instanceof Error ? err.message : '');
  if (
    code === 'moderation_rejected' ||
    /moderation|needs review/i.test(prose)
  ) {
    return {
      kind: 'moderation',
      title: 'Name or battle cry rejected',
      message:
        'Your name or battle cry was rejected by moderation. Choose different wording.',
    };
  }
  return {
    kind: 'error',
    title: 'Couldn’t create your fighter',
    message: 'Something went wrong. Please try again.',
  };
}

export const STATS_REJECTED_MESSAGE = `Your stats didn’t pass the check. Place all ${STAT_POINT_TOTAL} points, ${STAT_MIN} to ${STAT_MAX} each.`;

/**
 * Whether a failed finalize named the stat allocation. The server answers a
 * rejected pool with `bad_request` and `field: 'stats'`; its prose also says
 * "stats", which is all that survives once the envelope has been collapsed
 * into an Error. The screen routes the notice to the stats step on true.
 */
export function finalizeErrorNamesStats(err: unknown): boolean {
  const fn = functionFailure(err);
  if (fn?.field === 'stats') return true;
  const prose = fn?.message ?? (err instanceof Error ? err.message : '');
  return /\bstats?\b/i.test(prose);
}

// ---------------------------------------------------------------------------
// Recap (last step)
// ---------------------------------------------------------------------------

export interface SummaryRow {
  label: string;
  value: string;
}

function lookSummary(draft: Draft): string {
  if (draft.path === 'prompt') {
    const prompt = draft.prompt.trim();
    return prompt.length > 0 ? `“${prompt}”` : 'No description yet';
  }
  const traits = [
    draft.vibe ? TRAIT_LABELS.vibe[draft.vibe] : null,
    draft.silhouette ? TRAIT_LABELS.silhouette[draft.silhouette] : null,
    draft.palette ? TRAIT_LABELS.palette[draft.palette] : null,
    draft.era ? TRAIT_LABELS.era[draft.era] : null,
    draft.expression ? TRAIT_LABELS.expression[draft.expression] : null,
  ].filter((t): t is string => t !== null);
  return traits.length > 0 ? traits.join(' · ') : 'Archetype default look';
}

/** The last step's recap, one row per decision. */
export function summaryRows(draft: Draft): SummaryRow[] {
  const arch = draft.archetype ? ARCHETYPES[draft.archetype] : null;
  // Skipped: the insert trigger assigns a default catalogue item.
  const item = draft.signatureItem
    ? draft.signatureItem.name
    : draft.itemSkipped
      ? 'Assigned by the arena — change it later'
      : 'None yet';
  const colour = draft.signatureColor
    ? TRAIT_LABELS.palette[draft.signatureColor]
    : arch
      ? `${arch.name} default`
      : 'Archetype default';
  return [
    { label: 'Name', value: draft.name.trim() },
    { label: 'Archetype', value: arch?.name ?? '—' },
    { label: 'Stats', value: describeAllocation(draft.stats) },
    { label: 'Art style', value: ART_STYLE_LABELS[draft.artStyle] },
    { label: 'Look', value: lookSummary(draft) },
    { label: 'Signature item', value: item },
    { label: 'Signature colour', value: colour },
    { label: 'Battle cry', value: `“${draft.battleCry.trim()}”` },
  ];
}

const SUMMARY_LABEL_STEPS: Readonly<Record<string, number | undefined>> = {
  Name: STEP.name,
  Archetype: STEP.archetype,
  Stats: STEP.stats,
  'Signature item': STEP.item,
  'Battle cry': STEP.battleCry,
  'Signature colour': STEP.color,
};

/**
 * The step that changes a recap row, or null for the rows the portrait step
 * sets itself (art style, look): the recap lives on that step, so a "Change"
 * link there would only point at the controls just above it.
 */
export function stepForSummaryLabel(label: string): number | null {
  return SUMMARY_LABEL_STEPS[label] ?? null;
}

/** The hex the character will be framed in, resolving the archetype default. */
export function draftAccentHex(draft: Draft): string {
  if (draft.signatureColor) return PALETTE_HEX[draft.signatureColor];
  if (draft.archetype) return ARCHETYPES[draft.archetype].color;
  return PALETTE_HEX.royal;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Bumped whenever the step numbers or draft shape change. v2: stats step. */
export const DRAFT_STORAGE_VERSION = 2;

const KEY_PREFIX = 'pw:onboarding:draft:';

export function draftStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

interface DraftEnvelope {
  version: number;
  savedAt: string;
  step: number;
  draft: Draft;
}

export interface SavedDraft {
  step: number;
  draft: Draft;
  savedAt: string;
}

/**
 * Strip what must not be persisted: signed image URLs expire in minutes and
 * are re-signed on restore from the portrait id.
 */
export function toPersistedDraft(draft: Draft): Draft {
  if (!draft.portrait) return draft;
  return {
    ...draft,
    portrait: { ...draft.portrait, imageUrl: '', avatarImageUrl: null },
  };
}

function isEnvelope(value: unknown): value is DraftEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DraftEnvelope>;
  return (
    typeof v.version === 'number' &&
    typeof v.step === 'number' &&
    !!v.draft &&
    typeof v.draft === 'object' &&
    typeof (v.draft as Draft).name === 'string'
  );
}

export async function saveDraft(
  userId: string,
  step: number,
  draft: Draft,
): Promise<void> {
  const envelope: DraftEnvelope = {
    version: DRAFT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    step,
    draft: toPersistedDraft(draft),
  };
  try {
    await AsyncStorage.setItem(
      draftStorageKey(userId),
      JSON.stringify(envelope),
    );
  } catch (err) {
    // Losing a draft is recoverable; crashing creation is not.
    console.warn('Could not save onboarding draft:', err);
  }
}

/**
 * The saved draft, or null. A draft written by another version of the shape
 * is discarded rather than half-restored.
 */
export async function loadDraft(userId: string): Promise<SavedDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftStorageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEnvelope(parsed) || parsed.version !== DRAFT_STORAGE_VERSION) {
      await AsyncStorage.removeItem(draftStorageKey(userId));
      return null;
    }
    // Fill in fields added since the draft was written with their defaults.
    const draft: Draft = { ...INITIAL_DRAFT, ...parsed.draft };
    return { step: parsed.step, draft, savedAt: parsed.savedAt };
  } catch (err) {
    console.warn('Could not load onboarding draft:', err);
    return null;
  }
}

export async function clearDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftStorageKey(userId));
  } catch (err) {
    console.warn('Could not clear onboarding draft:', err);
  }
}
