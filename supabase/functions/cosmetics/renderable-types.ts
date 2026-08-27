/**
 * Cosmetic types with a display surface today.
 *
 * `reveal_style` is deliberately absent: it can be owned and equipped, but
 * nothing renders it yet, so it must not be purchasable. Selling an effect that
 * never appears is how 25 credits were already spent on cosmetics with no
 * display surface at all.
 *
 * Lives in its own module so the purchase guard and its test share one list.
 */
export const RENDERABLE_TYPES: readonly string[] = [
  'frame',
  'title',
  'badge',
  'avatar_effect',
  'color',
];

/** Alias used by the test, so the import reads as intent rather than plumbing. */
export const RENDERABLE_TYPES_FOR_TEST = RENDERABLE_TYPES;
