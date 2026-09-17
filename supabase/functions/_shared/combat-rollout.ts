/** Queue compatibility is independent of combat: rollback never changes active rules. */
export function matchmakingRulesVersion(
  enabled: boolean,
  resumedVersion?: number,
): number {
  return resumedVersion ?? (enabled ? 2 : 1);
}
export function requiresCombatClientUpdate(
  rulesVersion: number,
  clientVersion: unknown,
): boolean {
  return (
    rulesVersion >= 2 &&
    (typeof clientVersion !== 'number' ||
      !Number.isInteger(clientVersion) ||
      clientVersion < 2)
  );
}
