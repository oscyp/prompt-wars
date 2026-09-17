/** Use one readable card per row when text or viewport needs more room. */
export function collectionColumns(width: number, fontScale: number): 1 | 2 {
  return width >= 390 && fontScale <= 1.15 ? 2 : 1;
}
