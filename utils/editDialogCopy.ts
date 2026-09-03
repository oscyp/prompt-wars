/**
 * Every sentence the edit-character screen says before or while spending.
 *
 * Pure, like `leaveDialogCopy` in utils/battles.ts, so the strings can be
 * pinned by tests and the screen stays free of copy. Rules inherited from
 * there: the price goes in the body, never the title, and always in the
 * `sentence` form in prose; the `chip` form ("3 cr") appears only in button
 * labels.
 */

import type { DraftChange } from '@/hooks/useCharacterEditDraft';
import {
  formatCredits,
  creditsNoun,
  insufficientCreditsMessage,
} from '@/utils/credits';
import { describeLook, type DescribedLook } from '@/constants/CharacterTraits';

export interface SpendRow {
  label: 'Price' | 'Balance' | 'After';
  value: string;
}

export interface SheetCopy {
  title: string;
  subtitle?: string;
  lines: string[];
  rows: SpendRow[];
  footnote?: string;
  confirmLabel: string;
}

/**
 * Price / Balance / After. Balance rows are omitted while the balance is still
 * loading (`null`) rather than shown as zero.
 */
export function spendRows(price: number, balance: number | null): SpendRow[] {
  if (!Number.isFinite(price) || price <= 0) {
    return [{ label: 'Price', value: 'Free' }];
  }
  const rows: SpendRow[] = [
    { label: 'Price', value: formatCredits(price, 'sentence') },
  ];
  if (balance !== null && Number.isFinite(balance)) {
    rows.push({ label: 'Balance', value: creditsNoun(balance) });
    rows.push({
      label: 'After',
      value: creditsNoun(Math.max(0, balance - price)),
    });
  }
  return rows;
}

/** How many credits short of `price` the player is. 0 when unknown. */
export function shortfallFor(price: number, balance: number | null): number {
  if (balance === null || !Number.isFinite(balance)) return 0;
  return Math.max(0, price - balance);
}

function changeLines(changes: DraftChange[]): string[] {
  return changes.map((c) => `${c.label}: ${c.to}`);
}

function locksFootnote(changes: DraftChange[]): string | undefined {
  const locks = changes
    .filter((c) => c.locksFor)
    .map((c) => `${c.label} locks for ${c.locksFor}.`);
  return locks.length > 0 ? locks.join(' ') : undefined;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function saveConfirmCopy(a: { changes: DraftChange[] }): SheetCopy {
  return {
    title: 'Save changes?',
    subtitle: 'Free',
    lines: changeLines(a.changes),
    rows: [],
    footnote: locksFootnote(a.changes),
    confirmLabel: 'Save',
  };
}

export function renderConfirmCopy(a: {
  price: number;
  balance: number | null;
  changes: DraftChange[];
}): SheetCopy {
  const dirty = a.changes.length > 0;
  return {
    title: 'Draw this look?',
    subtitle: 'Redraws your fighter and avatar together.',
    lines: dirty
      ? ['Saves your changes first:', ...changeLines(a.changes)]
      : [],
    rows: spendRows(a.price, a.balance),
    footnote: locksFootnote(a.changes),
    confirmLabel: 'Draw this look',
  };
}

export function randomConfirmCopy(a: {
  price: number;
  balance: number | null;
  changes: DraftChange[];
}): SheetCopy {
  const lines = ['Shuffles every trait and redraws fighter and avatar.'];
  if (a.changes.length > 0) {
    lines.push(
      `Discards ${plural(a.changes.length, 'staged change')}: ${a.changes
        .map((c) => c.label)
        .join(', ')}`,
    );
  }
  return {
    title: 'Shuffle a random character?',
    lines,
    rows: spendRows(a.price, a.balance),
    confirmLabel: 'Shuffle and draw',
  };
}

export function customItemConfirmCopy(a: {
  price: number;
  balance: number | null;
  itemName: string;
  itemClassLabel: string;
}): SheetCopy {
  return {
    title: 'Create signature item?',
    lines: [`${a.itemName} · ${a.itemClassLabel}`, 'Includes a generated icon'],
    rows: spendRows(a.price, a.balance),
    confirmLabel: 'Create',
  };
}

export function topUpCopy(a: {
  price: number;
  balance: number | null;
}): SheetCopy {
  return {
    title: 'Not enough credits',
    lines: [insufficientCreditsMessage(shortfallFor(a.price, a.balance))],
    rows: spendRows(a.price, a.balance),
    confirmLabel: 'Top up',
  };
}

export function discardDraftCopy(changeCount: number): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  return {
    title: 'Discard changes?',
    message: `You have ${plural(changeCount, 'unsaved change')}.`,
    confirmLabel: 'Discard',
  };
}

/**
 * The avatar leg failed after the fighter landed. Only promise a free retry
 * when the deployed server is known to offer one.
 */
export function avatarPendingCopy(canRetry: boolean): {
  text: string;
  actionLabel?: string;
} {
  return canRetry
    ? { text: 'Your avatar didn’t render. Retry free.', actionLabel: 'Retry' }
    : {
        text: 'Your avatar didn’t render. It will be redrawn with your next look.',
      };
}

export type ButtonIntent = 'render' | 'topUp' | 'disabled';

export interface ButtonCopy {
  label: string;
  caption?: string;
  accessibilityLabel: string;
  intent: ButtonIntent;
}

function shortCaption(shortfall: number): string {
  return `Need ${plural(shortfall, 'more credit')}`;
}

/**
 * The paid Draw button, in every state it can be in.
 *
 * "Draw" is the only verb on the screen that produces an image, so it carries
 * the paid/free split on its own; the free Save bar keeps "Save". When the
 * draft is dirty the caption says the save happens first rather than
 * duplicating the word.
 */
export function renderButtonCopy(a: {
  dirty: boolean;
  price: number;
  balance: number | null;
  hasPortrait: boolean;
  pricingVerified: boolean;
  locked: boolean;
}): ButtonCopy {
  if (!a.hasPortrait) {
    return {
      label: 'Draw first portrait · Free',
      accessibilityLabel: 'Draw your first portrait, free',
      intent: a.locked ? 'disabled' : 'render',
    };
  }
  const chip = formatCredits(a.price);
  const sentence = formatCredits(a.price, 'sentence');
  const label = `Draw this look · ${chip}`;
  if (a.locked) {
    return {
      label,
      accessibilityLabel: `Draw this look, ${sentence}. Unavailable during a battle.`,
      intent: 'disabled',
    };
  }
  if (!a.pricingVerified) {
    return {
      label: 'Draw this look',
      caption: 'Checking prices…',
      accessibilityLabel: 'Draw this look. Checking prices.',
      intent: 'disabled',
    };
  }
  const short = shortfallFor(a.price, a.balance);
  if (short > 0) {
    return {
      label,
      caption: shortCaption(short),
      accessibilityLabel: `Draw this look costs ${sentence}. You need ${plural(
        short,
        'more credit',
      )}. Opens your wallet.`,
      intent: 'topUp',
    };
  }
  if (a.dirty) {
    return {
      label,
      caption: 'Saves your changes first',
      accessibilityLabel: `Draw this look for ${sentence}. Saves your changes first.`,
      intent: 'render',
    };
  }
  return {
    label,
    accessibilityLabel: `Draw this look for ${sentence}`,
    intent: 'render',
  };
}

export function randomButtonCopy(a: {
  price: number;
  balance: number | null;
  pricingVerified: boolean;
  locked: boolean;
}): ButtonCopy {
  const sentence = formatCredits(a.price, 'sentence');
  const label = `Shuffle random character · ${formatCredits(a.price)}`;
  if (a.locked || !a.pricingVerified) {
    return {
      label,
      accessibilityLabel: `Generate a random character, ${sentence}. Unavailable right now.`,
      intent: 'disabled',
    };
  }
  const short = shortfallFor(a.price, a.balance);
  if (short > 0) {
    return {
      label,
      caption: shortCaption(short),
      accessibilityLabel: `Generate a random character costs ${sentence}. You need ${plural(
        short,
        'more credit',
      )}. Opens your wallet.`,
      intent: 'topUp',
    };
  }
  return {
    label,
    accessibilityLabel: `Generate a random character, ${sentence}`,
    intent: 'render',
  };
}

export function customItemButtonCopy(a: {
  price: number;
  balance: number | null;
  pricingVerified: boolean;
}): ButtonCopy {
  const sentence = formatCredits(a.price, 'sentence');
  const label = `Create · ${formatCredits(a.price)}`;
  if (!a.pricingVerified) {
    return {
      label: 'Create',
      caption: 'Checking prices…',
      accessibilityLabel: 'Create item. Checking prices.',
      intent: 'disabled',
    };
  }
  const short = shortfallFor(a.price, a.balance);
  if (short > 0) {
    return {
      label,
      caption: shortCaption(short),
      accessibilityLabel: `Create item costs ${sentence}. You need ${plural(
        short,
        'more credit',
      )}. Opens your wallet.`,
      intent: 'topUp',
    };
  }
  return {
    label,
    accessibilityLabel: `Create item for ${sentence}`,
    intent: 'render',
  };
}

/**
 * Said while drawing.
 *
 * Calibrated on 2026-09-02 against succeeded `portrait_jobs` on the linked
 * project (n=11): each leg took ~9 s at the median and ~30–34 s at p90, and a
 * render draws two legs in sequence, so the honest promise is "under a
 * minute" rather than a tighter window that the p90 would break. Recalibrate
 * when the sample grows; the test pins the string so it cannot drift silently.
 */
export const RENDER_EXPECTED_DURATION = 'Usually under a minute';

export const RENDER_PHASE_LABEL = {
  saving: 'Saving your changes…',
  fighter: 'Drawing your fighter…',
  avatar: 'Drawing your avatar…',
} as const;

export type RenderPhase = keyof typeof RENDER_PHASE_LABEL;

const CAPTION_MAX = 120;

/** The description being drawn: the player's own words, else the traits. */
export function renderingCaption(
  look: DescribedLook & { portraitPromptRaw?: string | null },
): string {
  const prompt = look.portraitPromptRaw?.trim();
  if (prompt) {
    return prompt.length > CAPTION_MAX
      ? `${prompt.slice(0, CAPTION_MAX - 1)}…`
      : prompt;
  }
  return describeLook(look);
}
