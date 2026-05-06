// AI Provider Interfaces and Adapters
// Implements judge, image, video, and TTS providers with mock fallbacks

import { MoveType, JudgeRubricScores, Archetype } from './types.ts';

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
  generateMotionPoster(request: MotionPosterRequest): Promise<MotionPosterResponse>;
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
  compositionType: 'motion_poster' | 'static_scorecard';
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
  submitVideoGeneration(request: VideoGenerationRequest): Promise<VideoJobSubmission>;
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
  aspectRatio: '9:16'; // vertical mobile
  safetyConstraints: string[];
}

export interface VideoJobSubmission {
  providerJobId: string;
  providerRequestId: string;
  estimatedCompletionSeconds: number;
}

export interface VideoJobStatus {
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  videoUrl?: string;
  errorCode?: string;
  errorMessage?: string;
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
    return 'mock-judge-v1.0.0';
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    // Deterministic scoring based on prompt length and move type
    const scoreOne = this.mockScore(req.promptOne, req.moveTypeOne, req.seed);
    const scoreTwo = this.mockScore(req.promptTwo, req.moveTypeTwo, req.seed);

    return {
      playerOneScores: scoreOne,
      playerTwoScores: scoreTwo,
      explanation:
        'Mock judge evaluated both prompts based on length, clarity, move type matchup, and deterministic seed.',
      modelId: this.getModelId(),
      promptVersion: req.promptVersion,
    };
  }

  private mockScore(prompt: string, moveType: MoveType, seed: number): JudgeRubricScores {
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
  async generateMotionPoster(req: MotionPosterRequest): Promise<MotionPosterResponse> {
    // Always returns deterministic metadata, never blocks
    const animationPreset = this.getAnimationPreset(req.moveTypeWinner, req.isDraw);
    const musicStingId = this.getMusicSting(req.winnerArchetype, req.isDraw);

    return {
      compositionType: 'motion_poster',
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
    if (isDraw) return 'draw_neutral';

    switch (moveType) {
      case 'attack':
        return 'attack_sting_3s';
      case 'defense':
        return 'defense_counter_3s';
      case 'finisher':
        return 'finisher_dramatic_3s';
      default:
        return 'default_sting';
    }
  }

  private getMusicSting(archetype: Archetype, isDraw: boolean): string {
    if (isDraw) return 'music_draw_ambiguous';

    const stings: Record<Archetype, string> = {
      strategist: 'music_tactical_victory',
      trickster: 'music_chaos_triumph',
      titan: 'music_power_surge',
      mystic: 'music_ethereal_win',
      engineer: 'music_precision_success',
    };

    return stings[archetype] || 'music_default_win';
  }
}

/**
 * Mock video provider (stubs xAI / X AI integration)
 */
export class MockVideoProvider implements AiVideoProvider {
  async submitVideoGeneration(req: VideoGenerationRequest): Promise<VideoJobSubmission> {
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
      status: 'succeeded',
      videoUrl: `https://mock-storage.example.com/videos/${providerJobId}.mp4`,
    };
  }

  async getVideoUrl(providerJobId: string): Promise<string> {
    return `https://mock-storage.example.com/videos/${providerJobId}.mp4`;
  }
}

/**
 * xAI / X AI video provider (production)
 */
export class XAIVideoProvider implements AiVideoProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = Deno.env.get('XAI_API_KEY') || '';
    this.baseUrl = Deno.env.get('XAI_VIDEO_BASE_URL') || 'https://api.x.ai/v1/video';

    if (!this.apiKey) {
      console.warn('XAI_API_KEY not set, video generation will fail');
    }
  }

  async submitVideoGeneration(req: VideoGenerationRequest): Promise<VideoJobSubmission> {
    // Compose xAI prompt from battle context
    const prompt = this.composeVideoPrompt(req);

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration: req.targetDurationSeconds,
        aspect_ratio: req.aspectRatio,
        safety_filters: req.safetyConstraints,
        model: 'xai-video-v1', // placeholder model name
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI video submission failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      providerJobId: data.job_id,
      providerRequestId: data.request_id || `xai-${Date.now()}`,
      estimatedCompletionSeconds: data.estimated_completion_seconds || 90,
    };
  }

  async pollVideoStatus(providerJobId: string): Promise<VideoJobStatus> {
    const response = await fetch(`${this.baseUrl}/status/${providerJobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`xAI status poll failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      status: data.status, // queued | processing | succeeded | failed
      videoUrl: data.video_url,
      errorCode: data.error_code,
      errorMessage: data.error_message,
    };
  }

  async getVideoUrl(providerJobId: string): Promise<string> {
    const status = await this.pollVideoStatus(providerJobId);

    if (status.status !== 'succeeded' || !status.videoUrl) {
      throw new Error('Video not ready or failed');
    }

    return status.videoUrl;
  }

  private composeVideoPrompt(req: VideoGenerationRequest): string {
    // Compose narrative prompt from battle context
    // Format: character intros, move types, prompts (sanitized), winner framing

    const winnerName = req.winnerId === 'p1' ? req.playerOneCharacterName : req.playerTwoCharacterName;
    const loserName = req.winnerId === 'p1' ? req.playerTwoCharacterName : req.playerOneCharacterName;

    if (req.isDraw) {
      return `
A cinematic vertical mobile video (9:16) depicting an intense creative battle between two characters.

Character 1: ${req.playerOneCharacterName}, a ${req.playerOneArchetype} wielding a ${req.playerOneMoveType} approach.
Character 2: ${req.playerTwoCharacterName}, a ${req.playerTwoArchetype} wielding a ${req.playerTwoMoveType} approach.

Theme: ${req.theme || 'Open battle'}

Prompt 1 (${req.playerOneCharacterName}): "${this.sanitizePrompt(req.playerOnePrompt)}"
Prompt 2 (${req.playerTwoCharacterName}): "${this.sanitizePrompt(req.playerTwoPrompt)}"

The battle is evenly matched. Both characters unleash their strategies simultaneously, resulting in a dramatic stalemate. Energy crackling, tension high, but neither gains the upper hand. The scene fades with both standing strong.

Duration: ${req.targetDurationSeconds} seconds. Vertical mobile format. No real person likenesses. No text overlays. Cinematic, dramatic, abstract energy and motion.
      `.trim();
    }

    return `
A cinematic vertical mobile video (9:16) depicting a creative battle between two characters.

Winner: ${winnerName}, a ${req.winnerId === 'p1' ? req.playerOneArchetype : req.playerTwoArchetype} using a ${req.winnerId === 'p1' ? req.playerOneMoveType : req.playerTwoMoveType} approach.
Challenger: ${loserName}, a ${req.winnerId === 'p1' ? req.playerTwoArchetype : req.playerOneArchetype} using a ${req.winnerId === 'p1' ? req.playerTwoMoveType : req.playerOneMoveType} approach.

Theme: ${req.theme || 'Open battle'}

Winning prompt (${winnerName}): "${this.sanitizePrompt(req.winnerId === 'p1' ? req.playerOnePrompt : req.playerTwoPrompt)}"
Losing prompt (${loserName}): "${this.sanitizePrompt(req.winnerId === 'p1' ? req.playerTwoPrompt : req.playerOnePrompt)}"

The video shows ${winnerName} executing their strategy with precision and dramatic flair. ${loserName} puts up a strong fight but is ultimately outmaneuvered. The scene culminates in ${winnerName}'s victory, with energy and visual effects emphasizing their triumph.

Duration: ${req.targetDurationSeconds} seconds. Vertical mobile format. No real person likenesses. No text overlays. Cinematic, dramatic, abstract energy and motion.
    `.trim();
  }

  private sanitizePrompt(prompt: string): string {
    // Truncate long prompts, strip unsafe patterns
    const maxLength = 400;
    const sanitized = prompt
      .replace(/[<>]/g, '') // strip angle brackets
      .replace(/\n+/g, ' ') // collapse newlines
      .trim();

    return sanitized.length > maxLength ? sanitized.substring(0, maxLength) + '...' : sanitized;
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
      strategist: 'voice_calm_authoritative',
      trickster: 'voice_playful_chaotic',
      titan: 'voice_deep_powerful',
      mystic: 'voice_ethereal_mysterious',
      engineer: 'voice_precise_technical',
    };

    return presets[archetype] || 'voice_default';
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export function createJudgeProvider(): AiJudgeProvider {
  const providerType = Deno.env.get('JUDGE_PROVIDER') || 'mock';

  switch (providerType) {
    case 'mock':
      return new MockJudgeProvider();
    // Add other providers (OpenAI, xAI, etc.) here
    default:
      console.warn(`Unknown judge provider: ${providerType}, falling back to mock`);
      return new MockJudgeProvider();
  }
}

export function createImageProvider(): AiImageProvider {
  // MVP: always mock, returns deterministic metadata
  return new MockImageProvider();
}

export function createVideoProvider(): AiVideoProvider {
  const providerType = Deno.env.get('VIDEO_PROVIDER') || 'mock';

  switch (providerType) {
    case 'xai':
      return new XAIVideoProvider();
    case 'mock':
      return new MockVideoProvider();
    default:
      console.warn(`Unknown video provider: ${providerType}, falling back to mock`);
      return new MockVideoProvider();
  }
}

export function createTtsProvider(): TtsProvider {
  // MVP: always mock, client-side TTS
  return new MockTtsProvider();
}
