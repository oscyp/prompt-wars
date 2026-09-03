/**
 * The one banner the edit-character Stage shows at a time.
 *
 * Three conditions used to stack as separate banners above the hero, and on an
 * SE-class phone two of them left ~170pt for the panel. They now merge into a
 * single notice with a fixed priority: a battle lock blocks every edit, so it
 * outranks a pricing failure, which only pauses paid actions, which outranks
 * a missing avatar, which blocks nothing.
 */

import { avatarPendingCopy } from '@/utils/editDialogCopy';

export interface EditNotice {
  tone: 'warning' | 'error';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface MergeEditNoticesInput {
  battleLocked: boolean;
  pricingVerified: boolean;
  /** The avatar leg failed or never ran for the current fighter render. */
  avatarPending: boolean;
  /** Only true once the deployed server offers the free `avatar_only` mode. */
  canRetryAvatar: boolean;
  onRetryPricing: () => void;
  onRetryAvatar: () => void;
}

export function mergeEditNotices(i: MergeEditNoticesInput): EditNotice | null {
  if (i.battleLocked && !i.pricingVerified) {
    return {
      tone: 'warning',
      text: "Editing is locked during a battle, and credit prices couldn't be checked.",
      actionLabel: 'Retry',
      onAction: i.onRetryPricing,
    };
  }
  if (i.battleLocked) {
    return {
      tone: 'warning',
      text: 'Editing is unavailable while this fighter is in an active battle.',
    };
  }
  if (!i.pricingVerified) {
    return {
      tone: 'error',
      text: "Couldn't check credit prices, so paid actions are paused.",
      actionLabel: 'Retry',
      onAction: i.onRetryPricing,
    };
  }
  if (i.avatarPending) {
    const copy = avatarPendingCopy(i.canRetryAvatar);
    return i.canRetryAvatar
      ? {
          tone: 'warning',
          text: copy.text,
          actionLabel: copy.actionLabel,
          onAction: i.onRetryAvatar,
        }
      : { tone: 'warning', text: copy.text };
  }
  return null;
}

export interface CompactStatusInput {
  battleLocked: boolean;
  pricingVerified: boolean;
  avatarPending: boolean;
}

/**
 * The same priority, as a one-line status for the collapsed hero, where a
 * full banner would not fit.
 */
export function compactStatusLabel(i: CompactStatusInput): string | null {
  if (i.battleLocked) return 'Locked during battle';
  if (!i.pricingVerified) return 'Prices unavailable · Retry';
  if (i.avatarPending) return 'Avatar missing';
  return null;
}
