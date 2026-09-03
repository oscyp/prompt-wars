/**
 * Every sentence the Settings screen says that is worth pinning.
 *
 * The notifications section used to promise "quiet hours" the app has no UI
 * for and label the result category "(Must-Send)", a server term. Copy lives
 * here so the test can hold it still.
 */

export const NOTIFICATION_COPY = {
  subtitle: 'At most two a day, apart from battle results.',
  resultsLabel: 'Battle results',
  resultsSubline: 'Always on',
  note: 'Battle results always notify you. Everything else counts toward the two-a-day cap.',
  updateFailed: 'Couldn’t save that setting. Try again.',
  permissionDenied: 'Notifications are off for Prompt Wars in system settings',
  openSettings: 'Open Settings',
} as const;

export const HAPTICS_COPY = {
  label: 'Haptics',
  accessibilityLabel: 'Toggle haptic feedback',
} as const;

/** "Version 1.0.0 (12)" / "Version 1.0.0" / "Version unknown". */
export function appVersionLabel(
  version: string | null | undefined,
  build?: string | number | null,
): string {
  const v = version?.trim();
  if (!v) return 'Version unknown';
  const b = build === null || build === undefined ? '' : String(build).trim();
  return b ? `Version ${v} (${b})` : `Version ${v}`;
}
