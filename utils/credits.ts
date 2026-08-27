/**
 * One vocabulary for the credit currency.
 *
 * The edit-character screen previously mixed "1 cr", "3 credits", "Spend 1
 * credit?" and "Need 3 credits" within a single view. Credits are the noun
 * attached to money, so inconsistent units read as improvised pricing at
 * exactly the moment a player decides whether to spend.
 *
 * Rule: `chip` in badges and buttons where space is tight, `sentence` in prose
 * and dialogs. Never both inside one component.
 */

export type CreditStyle = 'chip' | 'sentence';

/**
 * Format a credit amount for display.
 *
 * @example formatCredits(0)              // "Free"
 * @example formatCredits(1)              // "1 cr"
 * @example formatCredits(3, 'sentence')  // "3 credits"
 */
export function formatCredits(
  amount: number,
  style: CreditStyle = 'chip',
): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  if (style === 'chip') return `${amount} cr`;
  return `${amount} credit${amount === 1 ? '' : 's'}`;
}

/**
 * The cost half of an action label, without the "Free" special case — used
 * where the surrounding copy already implies a charge ("Spend 2 credits?").
 */
export function creditsNoun(amount: number): string {
  return `${amount} credit${amount === 1 ? '' : 's'}`;
}
