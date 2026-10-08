/** The artwork yields space to text and actions, which remain freely scrollable. */
export function heroArtworkBudget(
  viewportHeight: number,
  reservedHeight: number,
): number {
  return Math.max(180, Math.min(320, viewportHeight - reservedHeight));
}

export function fighterArtworkWidth(
  available: number,
  maximum: number,
  aspect: number,
  maxHeight?: number,
): number {
  return Math.max(
    1,
    Math.min(
      available,
      maximum,
      maxHeight == null ? Infinity : maxHeight * aspect,
    ),
  );
}
