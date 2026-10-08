// Moderation provider adapters
// Supports text and video moderation with pluggable providers

import { ModerationStatus } from "./types.ts";

export interface TextModerationResult {
  status: ModerationStatus;
  reason?: string;
  confidence?: number;
  flaggedCategories?: string[];
  provider?: string;
  providerRequestId?: string;
}

export interface VideoModerationResult {
  status: ModerationStatus;
  reason?: string;
  confidence?: number;
  flaggedCategories?: string[];
  provider?: string;
  providerRequestId?: string;
}

/**
 * Text moderation provider adapter
 * MVP: blocklist + simple heuristics; production: OpenAI Moderation or Perspective API
 */
/** True when at least one real text-moderation provider is configured. */
export function hasTextModerationProvider(): boolean {
  return Boolean(
    Deno.env.get("OPENAI_API_KEY") || Deno.env.get("PERSPECTIVE_API_KEY"),
  );
}

/**
 * Throws when no moderation provider is configured outside development.
 *
 * Without this, shipping with an unset key degrades silently to the blocklist
 * and nothing surfaces it -- the failure is invisible precisely when it matters.
 */
export function assertTextModerationConfigured(): void {
  if (hasTextModerationProvider()) return;
  const env = Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "";
  if (env === "development" || env === "test" || Deno.env.get("DENO_TESTING")) {
    return;
  }
  throw new Error(
    "No text moderation provider configured. Set OPENAI_API_KEY or " +
      "PERSPECTIVE_API_KEY before accepting user-generated prompts.",
  );
}

/**
 * OpenAI's moderation endpoint returns a per-category boolean at its own
 * default thresholds, and those thresholds are set for general-purpose chat.
 * This is a game whose every prompt describes a fight: "a crushing shoulder
 * bash" scored `violence` 0.51 and was held for review, three times in a row,
 * for the same player. So the violence categories get their own bar, high
 * enough that written combat clears it and low enough that a description of
 * gore does not. Every other category keeps the provider's own flag.
 */
export const FICTION_TOLERANT_THRESHOLDS: Readonly<Record<string, number>> = {
  violence: 0.85,
  "violence/graphic": 0.7,
};

/** Above this, a flagged prompt is refused outright rather than held. */
export const OPENAI_REJECT_SCORE = 0.9;

export interface OpenAiModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

/**
 * Decide from one OpenAI moderation result. Pure, so the policy can be tested
 * without the network.
 */
export function evaluateOpenAiModeration(
  result: OpenAiModerationResult,
  requestId?: string,
): TextModerationResult {
  const scores = result.category_scores ?? {};
  const effective = Object.keys(result.categories ?? {}).filter((category) => {
    if (!result.categories[category]) return false;
    const tolerance = FICTION_TOLERANT_THRESHOLDS[category];
    if (tolerance === undefined) return true;
    return (scores[category] ?? 0) >= tolerance;
  });

  if (effective.length === 0) {
    const allScores = Object.values(scores);
    return {
      status: "approved",
      confidence: 1.0 - (allScores.length ? Math.max(...allScores) : 0),
      provider: "openai",
      providerRequestId: requestId,
    };
  }

  const maxScore = Math.max(...effective.map((c) => scores[c] ?? 0));
  return {
    status: maxScore > OPENAI_REJECT_SCORE
      ? "rejected"
      : "flagged_human_review",
    reason: `Flagged categories: ${effective.join(", ")}`,
    confidence: maxScore,
    flaggedCategories: effective,
    provider: "openai",
    providerRequestId: requestId,
  };
}

export type ModerationUnitKind =
  | "prompt"
  | "title"
  | "action"
  | "intent"
  | "approach"
  | "triple"
  | "body"
  | "pair";
export interface ModerationUnit {
  kind: ModerationUnitKind;
  text: string;
}
export interface ModerationUnitResult extends TextModerationResult {
  kind: ModerationUnitKind;
}
const MODERATION_UNIT_BOUNDS: Record<
  ModerationUnitKind,
  readonly [number, number]
> = {
  prompt: [20, 800],
  title: [3, 48],
  action: [5, 240],
  intent: [5, 180],
  approach: [5, 240],
  triple: [20, 800],
  body: [20, 800],
  pair: [20, 800],
};
function moderationUnavailable(): TextModerationResult {
  return {
    status: "flagged_human_review",
    reason: "Moderation response unavailable",
    confidence: 0,
    provider: "unavailable",
    flaggedCategories: ["provider_unavailable"],
  };
}
// Categories shared by both supported text and omni moderation responses.
// Omni may also return illicit categories; any returned category is validated.
const REQUIRED_OPENAI_CATEGORIES = [
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
];
function validOpenAiResult(value: unknown): value is OpenAiModerationResult {
  if (!value || typeof value !== "object") return false;
  const r = value as OpenAiModerationResult;
  return typeof r.flagged === "boolean" && !!r.categories &&
    !!r.category_scores &&
    REQUIRED_OPENAI_CATEGORIES.every((key) =>
      typeof r.categories[key] === "boolean"
    ) &&
    Object.entries(r.categories).every(([key, flag]) =>
      typeof flag === "boolean" && typeof r.category_scores[key] === "number" &&
      Number.isFinite(r.category_scores[key]) && r.category_scores[key] >= 0 &&
      r.category_scores[key] <= 1
    ) && r.flagged === Object.values(r.categories).some(Boolean);
}

export class TextModerationProvider {
  /** Never acceptable in this game, whatever the context. Rejected outright. */
  private hardBlocklist: string[] = [
    "spam",
    "test123",
    "asdf",
    "xxx",
    "porn",
    "drugs",
    "nsfw",
    "sexual",
    "explicit",
  ];

  /**
   * Combat vocabulary. Only enforced when no classifier is configured (local
   * development and tests): a word list cannot tell "kill the momentum" from a
   * threat, but the classifier can, so in production it gets to decide.
   */
  private fallbackBlocklist: string[] = ["violence", "kill", "die"];

  async moderate(text: string): Promise<TextModerationResult> {
    const [{ kind: _kind, ...result }] = await this.moderateUnits([{
      kind: "prompt",
      text,
    }]);
    return result;
  }

  /** Validate each role first, then classify unique text without concatenating alternatives. */
  async moderateUnits(units: ModerationUnit[], options: {
    deadlineMs?: number;
    classify?: (
      text: string,
      signal: AbortSignal,
    ) => Promise<TextModerationResult>;
  } = {}): Promise<ModerationUnitResult[]> {
    const local = units.map((unit) => this.validateUnit(unit));
    const texts = [
      ...new Set(units.filter((_, i) => !local[i]).map((unit) => unit.text)),
    ];
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, Math.min(options.deadlineMs ?? 60_000, 60_000));
    });
    try {
      const classified = texts.length
        ? await Promise.race([
          this.classifyTexts(texts, controller.signal, options.classify).catch(
            () => null,
          ),
          expired,
        ])
        : [];
      const byText = new Map(
        texts.map((
          text,
          i,
        ) => [text, classified?.[i] ?? moderationUnavailable()]),
      );
      return units.map((unit, i) => ({
        kind: unit.kind,
        ...(local[i] ?? byText.get(unit.text)!),
      }));
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async classifyTexts(
    texts: string[],
    signal: AbortSignal,
    classify?: (
      text: string,
      signal: AbortSignal,
    ) => Promise<TextModerationResult>,
  ): Promise<TextModerationResult[]> {
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const perspectiveKey = Deno.env.get("PERSPECTIVE_API_KEY");
    if (openAiKey && !classify) {
      try {
        const response = await fetch("https://api.openai.com/v1/moderations", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({ input: texts }),
        });
        if (response.ok) {
          const data = await response.json();
          if (
            Array.isArray(data.results) &&
            data.results.length === texts.length &&
            data.results.every(validOpenAiResult)
          ) {
            return data.results.map((result: OpenAiModerationResult) =>
              evaluateOpenAiModeration(result, data.id)
            );
          }
        }
      } catch { /* Fallback shares the same deadline and abort signal. */ }
    }
    if (!classify && !openAiKey && !perspectiveKey) {
      return texts.map(() => ({
        status: "approved",
        confidence: 0.95,
        provider: "blocklist",
      }));
    }
    const results: TextModerationResult[] = Array(texts.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, texts.length) }, async () => {
        while (next < texts.length && !signal.aborted) {
          const index = next++;
          try {
            results[index] = await (classify
              ? classify(texts[index], signal)
              : this.callPerspective(texts[index], signal, perspectiveKey)) ??
              moderationUnavailable();
          } catch {
            results[index] = moderationUnavailable();
          }
        }
      }),
    );
    return texts.map((_, i) => results[i] ?? moderationUnavailable());
  }

  private validateUnit(
    { text, kind }: ModerationUnit,
  ): TextModerationResult | null {
    const lowerText = text.toLowerCase().trim();
    const configured = hasTextModerationProvider();

    // Hold obvious accidental contact sharing before sending text to providers.
    // This is a narrow extra guard, not a substitute for multilingual PII and
    // exploitation evaluation in the reviewed teen-release safety assessment.
    if (
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
      /\b(?:my|our)\s+(?:phone|mobile|telephone)(?:\s+number)?\s*(?:is|:)?\s*\+?[\d ()-]{7,}/i
        .test(
          text,
        ) ||
      /\b(?:my|our)\s+(?:home\s+)?address\s*(?:is|:)\s*\d/i.test(text)
    ) {
      return {
        status: "flagged_human_review",
        reason: "Remove personal contact information before submitting.",
        flaggedCategories: ["personal_information"],
        provider: "privacy_guard",
      };
    }

    // Word-boundary match, not substring. `includes()` flagged "skill" for
    // "kill", "soldier" for "die" and "assassin" for "ass" -- in a game whose
    // whole subject is written combat, that rejected ordinary prompts. It was
    // also trivially evaded by a single space, so it cost legitimate players
    // more than it cost anyone acting in bad faith.
    const blocklist = configured
      ? this.hardBlocklist
      : [...this.hardBlocklist, ...this.fallbackBlocklist];
    for (const blocked of blocklist) {
      const pattern = new RegExp(
        `\\b${blocked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      );
      if (pattern.test(lowerText)) {
        return {
          status: "rejected",
          reason: "Blocked term detected",
          confidence: 1.0,
          flaggedCategories: ["blocklist"],
          provider: "blocklist",
        };
      }
    }

    // Heuristic: excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.7 && text.length > 20) {
      return {
        status: "flagged_human_review",
        reason: "Excessive capitalization",
        confidence: 0.6,
        flaggedCategories: ["spam_like"],
        provider: "heuristic",
      };
    }

    // Heuristic: excessive repetition
    const words = lowerText.split(/\s+/);
    const uniqueWords = new Set(words);
    if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
      return {
        status: "flagged_human_review",
        reason: "Excessive repetition",
        confidence: 0.7,
        flaggedCategories: ["spam_like"],
        provider: "heuristic",
      };
    }

    // Length validation (already checked in submit-prompt, but defense in depth)
    const [minimum, maximum] = MODERATION_UNIT_BOUNDS[kind];
    if (text.length < minimum || text.length > maximum) {
      return {
        status: "rejected",
        reason: `${
          kind === "prompt" ? "Prompt" : kind
        } length out of bounds (${minimum}-${maximum} chars)`,
        confidence: 1.0,
        flaggedCategories: ["length"],
        provider: "validation",
      };
    }

    return null;
  }
  private async callPerspective(
    text: string,
    signal: AbortSignal,
    perspectiveKey?: string,
  ): Promise<TextModerationResult | null> {
    // Perspective API (Google Jigsaw)
    if (perspectiveKey) {
      try {
        const response = await fetch(
          `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${perspectiveKey}`,
          {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              comment: { text },
              languages: ["en"],
              requestedAttributes: {
                TOXICITY: {},
                SEVERE_TOXICITY: {},
                IDENTITY_ATTACK: {},
                INSULT: {},
                PROFANITY: {},
                THREAT: {},
              },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const scores = data.attributeScores;
          if (
            !scores ||
            [
              "TOXICITY",
              "SEVERE_TOXICITY",
              "IDENTITY_ATTACK",
              "INSULT",
              "PROFANITY",
              "THREAT",
            ].some(
              (key) =>
                typeof scores[key]?.summaryScore?.value !== "number" ||
                !Number.isFinite(scores[key].summaryScore.value) ||
                scores[key].summaryScore.value < 0 ||
                scores[key].summaryScore.value > 1,
            )
          ) return null;
          const maxScore = Math.max(
            scores.TOXICITY?.summaryScore?.value || 0,
            scores.SEVERE_TOXICITY?.summaryScore?.value || 0,
            scores.IDENTITY_ATTACK?.summaryScore?.value || 0,
            scores.THREAT?.summaryScore?.value || 0,
          );

          const flagged = Object.keys(scores).filter(
            (attr) => scores[attr].summaryScore.value > 0.7,
          );

          if (maxScore > 0.85) {
            return {
              status: "rejected",
              reason: `Toxic content detected: ${flagged.join(", ")}`,
              confidence: maxScore,
              flaggedCategories: flagged,
              provider: "perspective",
            };
          } else if (maxScore > 0.6) {
            return {
              status: "flagged_human_review",
              reason: `Potentially toxic: ${flagged.join(", ")}`,
              confidence: maxScore,
              flaggedCategories: flagged,
              provider: "perspective",
            };
          }

          return {
            status: "approved",
            confidence: 1.0 - maxScore,
            provider: "perspective",
          };
        }
      } catch (error) {
        if (!signal.aborted) console.error("Perspective API error:", error);
        // Fall through
      }
    }

    return null;
  }
}

/**
 * Video moderation provider adapter
 * MVP: stub with manual review trigger; production: video classification API
 */
export class VideoModerationProvider {
  async moderate(
    videoUrl: string,
    _videoId: string,
  ): Promise<VideoModerationResult> {
    const provider = Deno.env.get("VIDEO_MODERATION_PROVIDER") || "manual";

    // Stub: in production, call video moderation API (e.g., Google Video Intelligence, Hive)
    // For MVP, all videos flagged for manual review
    if (provider === "manual") {
      return {
        status: "flagged_human_review",
        reason: "Manual review required for all videos in MVP",
        confidence: 0.5,
        provider: "manual",
      };
    }

    // Placeholder for future provider integration
    // Example: Hive AI Video Moderation
    const hiveApiKey = Deno.env.get("HIVE_API_KEY");
    if (hiveApiKey && provider === "hive") {
      try {
        const response = await fetch(
          "https://api.thehive.ai/api/v2/task/sync",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${hiveApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: videoUrl,
              models: ["nsfw", "violence", "hate_speech"],
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const classes = data.status[0]?.response?.output || [];

          const flaggedClasses = classes.filter(
            (c: { score: number }) => c.score > 0.8,
          );

          if (flaggedClasses.length > 0) {
            const maxScore = Math.max(
              ...flaggedClasses.map((c: { score: number }) => c.score),
            );
            return {
              status: maxScore > 0.95 ? "rejected" : "flagged_human_review",
              reason: `Flagged: ${
                flaggedClasses.map((c: { class: string }) => c.class).join(", ")
              }`,
              confidence: maxScore,
              flaggedCategories: flaggedClasses.map(
                (c: { class: string }) => c.class,
              ),
              provider: "hive",
            };
          }

          return {
            status: "approved",
            confidence: 0.95,
            provider: "hive",
          };
        }
      } catch (error) {
        console.error("Hive video moderation error:", error);
      }
    }

    // Default: flag for manual review
    return {
      status: "flagged_human_review",
      reason: "No automated video moderation provider configured",
      confidence: 0.5,
      provider: "none",
    };
  }
}
