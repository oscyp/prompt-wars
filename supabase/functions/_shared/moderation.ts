// Moderation provider adapters
// Supports text and video moderation with pluggable providers

import { ModerationStatus } from './types.ts';

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
export class TextModerationProvider {
  private blocklist: string[] = [
    // Minimal MVP blocklist; expand with production content policy
    'spam',
    'test123',
    'asdf',
    'xxx',
    'porn',
    'drugs',
    'violence',
    'kill',
    'die',
    'nsfw',
    'sexual',
    'explicit',
  ];

  async moderate(text: string): Promise<TextModerationResult> {
    const lowerText = text.toLowerCase().trim();

    // Check blocklist
    for (const blocked of this.blocklist) {
      if (lowerText.includes(blocked)) {
        return {
          status: 'rejected',
          reason: 'Blocked term detected',
          confidence: 1.0,
          flaggedCategories: ['blocklist'],
          provider: 'blocklist',
        };
      }
    }

    // Heuristic: excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.7 && text.length > 20) {
      return {
        status: 'flagged_human_review',
        reason: 'Excessive capitalization',
        confidence: 0.6,
        flaggedCategories: ['spam_like'],
        provider: 'heuristic',
      };
    }

    // Heuristic: excessive repetition
    const words = lowerText.split(/\s+/);
    const uniqueWords = new Set(words);
    if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
      return {
        status: 'flagged_human_review',
        reason: 'Excessive repetition',
        confidence: 0.7,
        flaggedCategories: ['spam_like'],
        provider: 'heuristic',
      };
    }

    // Length validation (already checked in submit-prompt, but defense in depth)
    if (text.length < 20 || text.length > 800) {
      return {
        status: 'rejected',
        reason: 'Prompt length out of bounds (20-800 chars)',
        confidence: 1.0,
        flaggedCategories: ['length'],
        provider: 'validation',
      };
    }

    // Call external provider if configured
    const providerResult = await this.callExternalProvider(text);
    if (providerResult) {
      return providerResult;
    }

    // Default: approve
    return {
      status: 'approved',
      confidence: 0.95,
      provider: 'blocklist',
    };
  }

  private async callExternalProvider(text: string): Promise<TextModerationResult | null> {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const perspectiveKey = Deno.env.get('PERSPECTIVE_API_KEY');

    // OpenAI Moderation API
    if (openAiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/moderations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({ input: text }),
        });

        if (response.ok) {
          const data = await response.json();
          const result = data.results[0];

          if (result.flagged) {
            const categories = Object.keys(result.categories).filter(
              (cat) => result.categories[cat]
            );
            const scores = Object.values(result.category_scores) as number[];
            const maxScore = Math.max(...scores);

            return {
              status: maxScore > 0.9 ? 'rejected' : 'flagged_human_review',
              reason: `Flagged categories: ${categories.join(', ')}`,
              confidence: maxScore,
              flaggedCategories: categories,
              provider: 'openai',
              providerRequestId: data.id,
            };
          }

          const scores = Object.values(result.category_scores) as number[];
          return {
            status: 'approved',
            confidence: 1.0 - Math.max(...scores),
            provider: 'openai',
            providerRequestId: data.id,
          };
        }
      } catch (error) {
        console.error('OpenAI moderation error:', error);
        // Fall through to next provider or default
      }
    }

    // Perspective API (Google Jigsaw)
    if (perspectiveKey) {
      try {
        const response = await fetch(
          `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${perspectiveKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              comment: { text },
              languages: ['en'],
              requestedAttributes: {
                TOXICITY: {},
                SEVERE_TOXICITY: {},
                IDENTITY_ATTACK: {},
                INSULT: {},
                PROFANITY: {},
                THREAT: {},
              },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const scores = data.attributeScores;
          const maxScore = Math.max(
            scores.TOXICITY?.summaryScore?.value || 0,
            scores.SEVERE_TOXICITY?.summaryScore?.value || 0,
            scores.IDENTITY_ATTACK?.summaryScore?.value || 0,
            scores.THREAT?.summaryScore?.value || 0
          );

          const flagged = Object.keys(scores).filter(
            (attr) => scores[attr].summaryScore.value > 0.7
          );

          if (maxScore > 0.85) {
            return {
              status: 'rejected',
              reason: `Toxic content detected: ${flagged.join(', ')}`,
              confidence: maxScore,
              flaggedCategories: flagged,
              provider: 'perspective',
            };
          } else if (maxScore > 0.6) {
            return {
              status: 'flagged_human_review',
              reason: `Potentially toxic: ${flagged.join(', ')}`,
              confidence: maxScore,
              flaggedCategories: flagged,
              provider: 'perspective',
            };
          }

          return {
            status: 'approved',
            confidence: 1.0 - maxScore,
            provider: 'perspective',
          };
        }
      } catch (error) {
        console.error('Perspective API error:', error);
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
  async moderate(videoUrl: string, videoId: string): Promise<VideoModerationResult> {
    const provider = Deno.env.get('VIDEO_MODERATION_PROVIDER') || 'manual';

    // Stub: in production, call video moderation API (e.g., Google Video Intelligence, Hive)
    // For MVP, all videos flagged for manual review
    if (provider === 'manual') {
      return {
        status: 'flagged_human_review',
        reason: 'Manual review required for all videos in MVP',
        confidence: 0.5,
        provider: 'manual',
      };
    }

    // Placeholder for future provider integration
    // Example: Hive AI Video Moderation
    const hiveApiKey = Deno.env.get('HIVE_API_KEY');
    if (hiveApiKey && provider === 'hive') {
      try {
        const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${hiveApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: videoUrl,
            models: ['nsfw', 'violence', 'hate_speech'],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const classes = data.status[0]?.response?.output || [];
          
          const flaggedClasses = classes.filter((c: { score: number }) => c.score > 0.8);
          
          if (flaggedClasses.length > 0) {
            const maxScore = Math.max(...flaggedClasses.map((c: { score: number }) => c.score));
            return {
              status: maxScore > 0.95 ? 'rejected' : 'flagged_human_review',
              reason: `Flagged: ${flaggedClasses.map((c: { class: string }) => c.class).join(', ')}`,
              confidence: maxScore,
              flaggedCategories: flaggedClasses.map((c: { class: string }) => c.class),
              provider: 'hive',
            };
          }

          return {
            status: 'approved',
            confidence: 0.95,
            provider: 'hive',
          };
        }
      } catch (error) {
        console.error('Hive video moderation error:', error);
      }
    }

    // Default: flag for manual review
    return {
      status: 'flagged_human_review',
      reason: 'No automated video moderation provider configured',
      confidence: 0.5,
      provider: 'none',
    };
  }
}
