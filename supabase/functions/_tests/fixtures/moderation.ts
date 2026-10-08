/** Complete wire response fixture; sparse objects hide partial-response bugs. */
export function moderationResult(flags: Record<string, number> = {}) {
  const keys = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
    "illicit",
    "illicit/violent",
  ];
  return {
    flagged: Object.keys(flags).length > 0,
    categories: Object.fromEntries(keys.map((key) => [key, key in flags])),
    category_scores: Object.fromEntries(
      keys.map((key) => [key, flags[key] ?? 0]),
    ),
  };
}
