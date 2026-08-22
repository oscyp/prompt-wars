// AI Provider Interfaces and Adapters
// Implements judge, image, video, and TTS providers with mock fallbacks

import { Archetype, JudgeRubricScores, MoveType } from "./types.ts";

/**
 * Judge provider interface with strict JSON schema validation
 */
export interface AiJudgeProvider {
  judge(request: JudgeRequest): Promise<JudgeResponse>;
  getModelId(): string;
}

export interface JudgeRequest {
  promptOne: string;
  promptTwo: string;
  moveTypeOne: MoveType;
  moveTypeTwo: MoveType;
  theme: string | null;
  seed: number;
  promptVersion: string; // frozen prompt version for reproducibility
}

export interface JudgeResponse {
  playerOneScores: JudgeRubricScores;
  playerTwoScores: JudgeRubricScores;
  explanation: string;
  modelId: string;
  promptVersion: string;
}

/**
 * Image provider for Tier 0 motion poster assets
 */
export interface AiImageProvider {
  generateMotionPoster(
    request: MotionPosterRequest,
  ): Promise<MotionPosterResponse>;
}

export interface MotionPosterRequest {
  battleId: string;
  winnerCharacterName: string;
  winnerArchetype: Archetype;
  winnerSignatureColor: string;
  loserCharacterName: string;
  loserArchetype: Archetype;
  moveTypeWinner: MoveType;
  moveTypeLoser: MoveType;
  isDraw: boolean;
}

export interface MotionPosterResponse {
  // Tier 0 always returns deterministic composition metadata, never blocks battle
  compositionType: "motion_poster" | "static_scorecard";
  backgroundImageUrl?: string; // optional, may be deterministic gradient
  animationPreset: string; // per-move-type animation sting
  musicStingId: string; // selected by archetype + outcome
  metadata: {
    winnerArchetype: Archetype;
    winnerColor: string;
    moveMatchup: string;
  };
}

/**
 * Video provider for Tier 1 cinematic shorts (default xAI / X AI)
 */
export interface AiVideoProvider {
  submitVideoGeneration(
    request: VideoGenerationRequest,
  ): Promise<VideoJobSubmission>;
  pollVideoStatus(providerJobId: string): Promise<VideoJobStatus>;
  getVideoUrl(providerJobId: string): Promise<string>;
}

export interface VideoGenerationRequest {
  battleId: string;
  playerOneCharacterName: string;
  playerOneArchetype: Archetype;
  playerOnePrompt: string;
  playerOneMoveType: MoveType;
  playerTwoCharacterName: string;
  playerTwoArchetype: Archetype;
  playerTwoPrompt: string;
  playerTwoMoveType: MoveType;
  winnerId: string | null; // null for draw
  isDraw: boolean;
  theme: string | null;
  targetDurationSeconds: number; // 6-12s for MVP
  aspectRatio: "9:16"; // vertical mobile
  safetyConstraints: string[];
}

export interface VideoJobSubmission {
  providerJobId: string;
  providerRequestId: string;
  estimatedCompletionSeconds: number;
}

export interface VideoJobStatus {
  status: "queued" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  /** Provider's post-generation safety verdict, when explicitly supplied. */
  moderationApproved?: boolean;
  moderationProvider?: string;
  errorCode?: string;
  errorMessage?: string;
}

export function mapXAIVideoStatus(data: {
  status?: string;
  video?: { url?: string; respect_moderation?: unknown };
  error?: { code?: string; message?: string };
}): VideoJobStatus {
  switch (data.status) {
    case "done":
      return {
        status: "succeeded",
        videoUrl: data.video?.url,
        moderationApproved: typeof data.video?.respect_moderation ===
            "boolean"
          ? data.video.respect_moderation
          : undefined,
        moderationProvider: "xai_generation",
      };
    case "failed":
      return {
        status: "failed",
        errorCode: data.error?.code || "xai_failed",
        errorMessage: data.error?.message || "xAI reported failure",
      };
    case "expired":
      return {
        status: "failed",
        errorCode: "expired",
        errorMessage: "xAI video request expired before completion",
      };
    case "pending":
    default:
      return { status: "processing" };
  }
}

/**
 * TTS provider for winner battle cry voice line
 */
export interface TtsProvider {
  generateBattleCry(request: BattleCryRequest): Promise<BattleCryResponse>;
}

export interface BattleCryRequest {
  battleCryText: string;
  characterArchetype: Archetype;
  voicePreset: string; // archetype-mapped voice preset
}

export interface BattleCryResponse {
  audioUrl?: string; // optional, may be client-side TTS
  voicePreset: string;
  durationMs: number;
}

// ============================================================================
// MOCK PROVIDERS (MVP fallback, deterministic)
// ============================================================================

/**
 * Mock judge provider (deterministic scoring for testing and fallback)
 */
export class MockJudgeProvider implements AiJudgeProvider {
  getModelId(): string {
    return "mock-judge-v1.0.0";
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    // Deterministic scoring based on prompt length and move type
    const scoreOne = this.mockScore(req.promptOne, req.moveTypeOne, req.seed);
    const scoreTwo = this.mockScore(req.promptTwo, req.moveTypeTwo, req.seed);

    return {
      playerOneScores: scoreOne,
      playerTwoScores: scoreTwo,
      explanation:
        "Mock judge evaluated both prompts based on length, clarity, move type matchup, and deterministic seed.",
      modelId: this.getModelId(),
      promptVersion: req.promptVersion,
    };
  }

  private mockScore(
    prompt: string,
    moveType: MoveType,
    seed: number,
  ): JudgeRubricScores {
    const wordCount = prompt.split(/\s+/).length;
    const lengthScore = Math.min(10, Math.max(3, wordCount / 10)); // 3-10 based on words

    // Deterministic pseudo-random based on seed
    const rng = (offset: number) => ((seed + offset) % 100) / 100;

    return {
      clarity: Math.min(10, Math.max(0, lengthScore + rng(1) * 2)),
      originality: Math.min(10, Math.max(0, 5 + rng(2) * 5)),
      specificity: Math.min(10, Math.max(0, lengthScore + rng(3))),
      theme_fit: Math.min(10, Math.max(0, 6 + rng(4) * 4)),
      archetype_fit: Math.min(10, Math.max(0, 6 + rng(5) * 4)),
      dramatic_potential: Math.min(10, Math.max(0, 5 + rng(6) * 5)),
    };
  }
}

/**
 * Mock image provider (returns deterministic Tier 0 composition)
 */
export class MockImageProvider implements AiImageProvider {
  async generateMotionPoster(
    req: MotionPosterRequest,
  ): Promise<MotionPosterResponse> {
    // Always returns deterministic metadata, never blocks
    const animationPreset = this.getAnimationPreset(
      req.moveTypeWinner,
      req.isDraw,
    );
    const musicStingId = this.getMusicSting(req.winnerArchetype, req.isDraw);

    return {
      compositionType: "motion_poster",
      animationPreset,
      musicStingId,
      metadata: {
        winnerArchetype: req.winnerArchetype,
        winnerColor: req.winnerSignatureColor,
        moveMatchup: `${req.moveTypeWinner} vs ${req.moveTypeLoser}`,
      },
    };
  }

  private getAnimationPreset(moveType: MoveType, isDraw: boolean): string {
    if (isDraw) return "draw_neutral";

    switch (moveType) {
      case "attack":
        return "attack_sting_3s";
      case "defense":
        return "defense_counter_3s";
      case "finisher":
        return "finisher_dramatic_3s";
      default:
        return "default_sting";
    }
  }

  private getMusicSting(archetype: Archetype, isDraw: boolean): string {
    if (isDraw) return "music_draw_ambiguous";

    const stings: Record<Archetype, string> = {
      strategist: "music_tactical_victory",
      trickster: "music_chaos_triumph",
      titan: "music_power_surge",
      mystic: "music_ethereal_win",
      engineer: "music_precision_success",
    };

    return stings[archetype] || "music_default_win";
  }
}

/**
 * Mock video provider (stubs xAI / X AI integration)
 */
export class MockVideoProvider implements AiVideoProvider {
  async submitVideoGeneration(
    req: VideoGenerationRequest,
  ): Promise<VideoJobSubmission> {
    // In production, compose xAI prompt from req fields
    const providerJobId = `mock-video-${req.battleId}-${Date.now()}`;

    return {
      providerJobId,
      providerRequestId: `mock-req-${Date.now()}`,
      estimatedCompletionSeconds: 60,
    };
  }

  async pollVideoStatus(providerJobId: string): Promise<VideoJobStatus> {
    // Mock: always succeeds after short delay
    return {
      status: "succeeded",
      videoUrl: `https://mock-storage.example.com/videos/${providerJobId}.mp4`,
    };
  }

  async getVideoUrl(providerJobId: string): Promise<string> {
    return `https://mock-storage.example.com/videos/${providerJobId}.mp4`;
  }
}

/**
 * xAI / X AI video provider (production)
 *
 * Real xAI Imagine Video REST API contract (docs.x.ai, May 2026):
 *   POST https://api.x.ai/v1/videos/generations
 *     body: { model: "grok-imagine-video", prompt, duration, aspect_ratio, resolution }
 *     → { request_id }
 *   GET  https://api.x.ai/v1/videos/{request_id}
 *     → { status: "pending"|"done"|"expired"|"failed", video?: { url, duration, respect_moderation }, error?: { code, message } }
 *
 * Video URLs are TEMPORARY xAI-hosted URLs. For production, download to Storage
 * before serving to clients. For dev, the temp URL is good enough.
 */
export class XAIVideoProvider implements AiVideoProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private resolution: string;

  constructor() {
    this.apiKey = Deno.env.get("XAI_API_KEY") || "";
    // Ignore legacy XAI_VIDEO_BASE_URL (was hard-coded to non-existent
    // /v1/video path). Allow override via XAI_API_BASE_URL if ever needed.
    this.baseUrl = Deno.env.get("XAI_API_BASE_URL") || "https://api.x.ai/v1";
    this.model = Deno.env.get("XAI_VIDEO_MODEL") || "grok-imagine-video";
    this.resolution = Deno.env.get("XAI_VIDEO_RESOLUTION") || "720p";

    if (!this.apiKey) {
      console.warn("XAI_API_KEY not set, video generation will fail");
    }
  }

  async submitVideoGeneration(
    req: VideoGenerationRequest,
  ): Promise<VideoJobSubmission> {
    const prompt = this.composeVideoPrompt(req);

    // xAI duration: 1–15 seconds.
    const duration = Math.max(1, Math.min(15, req.targetDurationSeconds || 8));

    const response = await fetch(`${this.baseUrl}/videos/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        duration,
        aspect_ratio: req.aspectRatio, // "9:16" supported
        resolution: this.resolution,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `xAI video submission failed: ${response.status} ${response.statusText}${
          bodyText ? " — " + bodyText.slice(0, 500) : ""
        }`,
      );
    }

    const data = await response.json();
    const requestId = data.request_id;
    if (!requestId) {
      throw new Error("xAI video submission returned no request_id");
    }

    return {
      providerJobId: requestId,
      providerRequestId: requestId,
      estimatedCompletionSeconds: 120,
    };
  }

  async pollVideoStatus(providerJobId: string): Promise<VideoJobStatus> {
    const response = await fetch(`${this.baseUrl}/videos/${providerJobId}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `xAI status poll failed: ${response.status} ${response.statusText}${
          bodyText ? " — " + bodyText.slice(0, 300) : ""
        }`,
      );
    }

    const data = await response.json();

    // xAI status enum: pending | done | expired | failed.
    return mapXAIVideoStatus(data);
  }

  async getVideoUrl(providerJobId: string): Promise<string> {
    const status = await this.pollVideoStatus(providerJobId);

    if (status.status !== "succeeded" || !status.videoUrl) {
      throw new Error("Video not ready or failed");
    }

    return status.videoUrl;
  }

  private composeVideoPrompt(req: VideoGenerationRequest): string {
    // Compose narrative prompt from battle context
    // Format: character intros, move types, prompts (sanitized), winner framing

    const winnerName = req.winnerId === "p1"
      ? req.playerOneCharacterName
      : req.playerTwoCharacterName;
    const loserName = req.winnerId === "p1"
      ? req.playerTwoCharacterName
      : req.playerOneCharacterName;

    if (req.isDraw) {
      return `
A cinematic vertical mobile video (9:16) depicting an intense creative battle between two characters.

Character 1: ${req.playerOneCharacterName}, a ${req.playerOneArchetype} wielding a ${req.playerOneMoveType} approach.
Character 2: ${req.playerTwoCharacterName}, a ${req.playerTwoArchetype} wielding a ${req.playerTwoMoveType} approach.

Theme: ${req.theme || "Open battle"}

Prompt 1 (${req.playerOneCharacterName}): "${
        this.sanitizePrompt(req.playerOnePrompt)
      }"
Prompt 2 (${req.playerTwoCharacterName}): "${
        this.sanitizePrompt(req.playerTwoPrompt)
      }"

The battle is evenly matched. Both characters unleash their strategies simultaneously, resulting in a dramatic stalemate. Energy crackling, tension high, but neither gains the upper hand. The scene fades with both standing strong.

Duration: ${req.targetDurationSeconds} seconds. Vertical mobile format. No real person likenesses. No text overlays. Silent visual only: no dialogue, voices, music, sound effects, or audio track. Cinematic, dramatic, abstract energy and motion.
      `.trim();
    }

    return `
A cinematic vertical mobile video (9:16) depicting a creative battle between two characters.

Winner: ${winnerName}, a ${
      req.winnerId === "p1" ? req.playerOneArchetype : req.playerTwoArchetype
    } using a ${
      req.winnerId === "p1" ? req.playerOneMoveType : req.playerTwoMoveType
    } approach.
Challenger: ${loserName}, a ${
      req.winnerId === "p1" ? req.playerTwoArchetype : req.playerOneArchetype
    } using a ${
      req.winnerId === "p1" ? req.playerTwoMoveType : req.playerOneMoveType
    } approach.

Theme: ${req.theme || "Open battle"}

Winning prompt (${winnerName}): "${
      this.sanitizePrompt(
        req.winnerId === "p1" ? req.playerOnePrompt : req.playerTwoPrompt,
      )
    }"
Losing prompt (${loserName}): "${
      this.sanitizePrompt(
        req.winnerId === "p1" ? req.playerTwoPrompt : req.playerOnePrompt,
      )
    }"

The video shows ${winnerName} executing their strategy with precision and dramatic flair. ${loserName} puts up a strong fight but is ultimately outmaneuvered. The scene culminates in ${winnerName}'s victory, with energy and visual effects emphasizing their triumph.

Duration: ${req.targetDurationSeconds} seconds. Vertical mobile format. No real person likenesses. No text overlays. Silent visual only: no dialogue, voices, music, sound effects, or audio track. Cinematic, dramatic, abstract energy and motion.
    `.trim();
  }

  private sanitizePrompt(prompt: string): string {
    // Truncate long prompts, strip unsafe patterns
    const maxLength = 400;
    const sanitized = prompt
      .replace(/[<>]/g, "") // strip angle brackets
      .replace(/\n+/g, " ") // collapse newlines
      .trim();

    return sanitized.length > maxLength
      ? sanitized.substring(0, maxLength) + "..."
      : sanitized;
  }
}

/**
 * Mock TTS provider (returns client-side TTS metadata)
 */
export class MockTtsProvider implements TtsProvider {
  async generateBattleCry(req: BattleCryRequest): Promise<BattleCryResponse> {
    // MVP: client-side TTS, server returns preset only
    const voicePreset = this.getVoicePreset(req.characterArchetype);

    return {
      voicePreset,
      durationMs: Math.max(1000, req.battleCryText.length * 50), // rough estimate
    };
  }

  private getVoicePreset(archetype: Archetype): string {
    const presets: Record<Archetype, string> = {
      strategist: "voice_calm_authoritative",
      trickster: "voice_playful_chaotic",
      titan: "voice_deep_powerful",
      mystic: "voice_ethereal_mysterious",
      engineer: "voice_precise_technical",
    };

    return presets[archetype] || "voice_default";
  }
}

// ============================================================================
// REAL JUDGE PROVIDER (xAI)
// ============================================================================

const JUDGE_REQUEST_TIMEOUT_MS = 30_000;

export class JudgeProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "JudgeProviderError";
    this.code = code;
  }
}

/**
 * Rubric instructions sent to the judge.
 *
 * Frozen per JUDGE_PROMPT_VERSION (_shared/judge.ts). Changing the wording
 * changes scores, so bump that version alongside any edit here or historical
 * judge_runs stop being comparable and the calibration set is invalidated.
 *
 * Anti-pay-to-win (concept §10.6): the judge is given prompt text, move types
 * and the theme only. No archetype identity, cosmetics, subscription state,
 * ratings or wallet data ever reach it -- round-resolve additionally asserts
 * this via assertNoMonetizationDataInScoring().
 */
function buildJudgeSystemPrompt(): string {
  return [
    "You are the impartial judge of a competitive prompt-writing duel.",
    "Score BOTH prompts independently on six criteria, each 0-10:",
    "  clarity            - unambiguous, well-formed, easy to act on",
    "  originality        - unexpected angle rather than a generic take",
    "  specificity        - concrete detail over vague gesturing",
    "  theme_fit          - answers the stated theme constraint",
    "  archetype_fit      - internally consistent voice and persona",
    "  dramatic_potential - would make a compelling short cinematic",
    "",
    "Rules:",
    "- Judge only the writing. Ignore length except where it harms clarity.",
    "- Do not reward or penalise the declared move type; it is scored separately.",
    "- Be willing to separate the two prompts. Identical scores should be rare.",
    "- explanation: 1-3 sentences, under 600 characters, naming the deciding factor.",
    "",
    "Respond with JSON only, exactly this shape:",
    '{"playerOneScores":{"clarity":0,"originality":0,"specificity":0,' +
      '"theme_fit":0,"archetype_fit":0,"dramatic_potential":0},',
    '"playerTwoScores":{"clarity":0,"originality":0,"specificity":0,' +
      '"theme_fit":0,"archetype_fit":0,"dramatic_potential":0},',
    '"explanation":"..."}',
  ].join("\n");
}

/**
 * xAI (Grok) judge, via the OpenAI-compatible chat-completions endpoint.
 *
 * Shape is validated downstream by validateJudgeResponse() in _shared/judge.ts,
 * so this adapter deliberately does not re-implement range checks -- it returns
 * what the model produced and lets the single validator reject it.
 *
 * NOTE: JUDGE_MODEL_ID is the authority for which model is called. The default
 * below is a starting point and should be confirmed against x.ai's current
 * model list before relying on it in production; an unknown model id fails
 * fast with a client_error rather than degrading silently.
 */
export class XAIJudgeProvider implements AiJudgeProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    // JUDGE_API_KEY lets the judge use a separate key/quota from video and
    // portraits; falls back to the shared xAI key.
    this.apiKey = Deno.env.get("JUDGE_API_KEY") ||
      Deno.env.get("XAI_API_KEY") || "";
    this.baseUrl = Deno.env.get("JUDGE_API_BASE_URL") ||
      Deno.env.get("XAI_API_BASE_URL") || "https://api.x.ai/v1";
    this.model = Deno.env.get("JUDGE_MODEL_ID") || "grok-3";

    if (!this.apiKey) {
      console.warn("JUDGE_API_KEY/XAI_API_KEY not set; judge calls will fail");
    }
  }

  getModelId(): string {
    return this.model;
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    if (!this.apiKey) {
      throw new JudgeProviderError("no_api_key", "Judge API key not configured");
    }

    const userContent = [
      `Theme: ${req.theme ?? "(no theme constraint)"}`,
      "",
      `Player one move type: ${req.moveTypeOne}`,
      `Player one prompt: ${req.promptOne}`,
      "",
      `Player two move type: ${req.moveTypeTwo}`,
      `Player two prompt: ${req.promptTwo}`,
    ].join("\n");

    let status = 0;
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: buildJudgeSystemPrompt() },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          // The pipeline runs the judge twice with different seeds and expects
          // the runs to be able to disagree; a non-zero temperature is what
          // makes that double-run meaningful rather than a duplicated call.
          temperature: 0.4,
          seed: req.seed,
        }),
        signal: AbortSignal.timeout(JUDGE_REQUEST_TIMEOUT_MS),
      });
      status = res.status;

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        if (res.status >= 500) {
          throw new JudgeProviderError("server_error", `xAI judge ${res.status}`);
        }
        throw new JudgeProviderError(
          "client_error",
          `xAI judge ${res.status}: ${bodyText.slice(0, 200)}`,
        );
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new JudgeProviderError(
          "malformed_response",
          "xAI judge response missing message content",
        );
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new JudgeProviderError(
          "malformed_response",
          "xAI judge did not return parseable JSON",
        );
      }

      return {
        playerOneScores: parsed.playerOneScores as JudgeRubricScores,
        playerTwoScores: parsed.playerTwoScores as JudgeRubricScores,
        explanation: String(parsed.explanation ?? ""),
        modelId: this.getModelId(),
        promptVersion: req.promptVersion,
      };
    } catch (err) {
      if (err instanceof JudgeProviderError) throw err;
      const isAbort = err instanceof DOMException && err.name === "TimeoutError";
      throw new JudgeProviderError(
        isAbort ? "timeout" : "network",
        err instanceof Error ? err.message : `xAI judge failed (${status})`,
      );
    }
  }
}

/**
 * Wraps a real judge so a provider outage degrades instead of failing the
 * battle.
 *
 * This is a hard requirement, not a nicety: round-resolve claims the round into
 * status 'resolving' BEFORE calling the judge, and nothing sweeps that state
 * (see round-resolve/index.ts). A judge throw would therefore strand the round
 * permanently rather than merely erroring.
 *
 * The fallback is auditable: MockJudgeProvider reports modelId
 * "mock-judge-v1.0.0", so any judge_runs row scored by the fallback is
 * identifiable after the fact and can be excluded from calibration.
 */
export class FallbackJudgeProvider implements AiJudgeProvider {
  private primary: AiJudgeProvider;
  private fallback: AiJudgeProvider;

  constructor(primary: AiJudgeProvider, fallback: AiJudgeProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  getModelId(): string {
    return this.primary.getModelId();
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    try {
      return await this.primary.judge(req);
    } catch (err) {
      console.error(
        "Judge provider failed, falling back to mock:",
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
      return await this.fallback.judge(req);
    }
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export function createJudgeProvider(): AiJudgeProvider {
  const providerType = Deno.env.get("JUDGE_PROVIDER") || "mock";

  switch (providerType) {
    case "mock":
      return new MockJudgeProvider();
    case "xai":
      // Always wrapped: a judge outage must degrade, never strand a round.
      return new FallbackJudgeProvider(
        new XAIJudgeProvider(),
        new MockJudgeProvider(),
      );
    default:
      console.warn(
        `Unknown judge provider: ${providerType}, falling back to mock`,
      );
      return new MockJudgeProvider();
  }
}

export function createImageProvider(): AiImageProvider {
  // MVP: always mock, returns deterministic metadata
  return new MockImageProvider();
}

export function createVideoProvider(): AiVideoProvider {
  const providerType = Deno.env.get("VIDEO_PROVIDER") || "mock";

  switch (providerType) {
    case "xai":
      return new XAIVideoProvider();
    case "mock":
      return new MockVideoProvider();
    default:
      console.warn(
        `Unknown video provider: ${providerType}, falling back to mock`,
      );
      return new MockVideoProvider();
  }
}

export function createTtsProvider(): TtsProvider {
  // MVP: always mock, client-side TTS
  return new MockTtsProvider();
}
