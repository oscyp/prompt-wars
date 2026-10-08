import type { RewardSummary } from '@/types/battle';
import type { BattleOutcome, RatingSummary } from '@/utils/resultView';

export interface ResultRewardsInput {
  outcome: BattleOutcome;
  isBot: boolean;
  mode: string | null | undefined;
  exhibition: boolean;
  reviewStatus: string | null | undefined;
  rating: RatingSummary;
  reward: RewardSummary | null | undefined;
  battleCompleted: boolean;
}

export interface ResultRewardItem {
  kind:
    | 'rating'
    | 'rating-correction'
    | 'credits'
    | 'streak'
    | 'quests-completed'
    | 'quests-advanced';
  label: string;
  tone: 'up' | 'down' | 'neutral';
  value?: string;
  amount?: number;
}

export interface ResultRewardDetail {
  kind:
    | 'rating-eligibility'
    | 'reward-eligibility'
    | 'correction'
    | 'milestone'
    | 'best'
    | 'quests';
  label: string;
  value: string;
}

export interface ResultRewardsModel {
  state: 'ready' | 'pending' | 'unavailable' | 'empty';
  title: 'Rewards' | 'Progress';
  feedback: string | null;
  items: ResultRewardItem[];
  details: ResultRewardDetail[];
  hasQuestActivity: boolean;
  correctionLine: string | null;
}

function ratingCorrectionPresentation(
  input: Pick<ResultRewardsInput, 'exhibition' | 'isBot' | 'mode' | 'rating'>,
): { value: 'Reversed' | 'Reviewed'; line: string } {
  const delta = input.rating.delta;
  const eligibleOriginal =
    input.mode === 'ranked' &&
    !input.isBot &&
    !input.exhibition &&
    !input.rating.gated;
  const rounded = delta === null ? null : Math.round(delta);
  if (eligibleOriginal && rounded !== null && rounded !== 0) {
    const signed = `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
    return {
      value: 'Reversed',
      line: `Original rating change of ${signed} was reversed. No replacement rating was awarded.`,
    };
  }
  return {
    value: 'Reviewed',
    line: 'Independent review completed. No replacement rating was awarded.',
  };
}

export function buildResultRewardsModel(
  input: ResultRewardsInput,
): ResultRewardsModel {
  const items: ResultRewardItem[] = [];
  const details: ResultRewardDetail[] = [];
  const reward = input.reward;
  const corrected =
    input.reviewStatus === 'overturned' || input.reviewStatus === 'no_contest';
  const competitiveRating =
    !corrected &&
    !input.exhibition &&
    !input.isBot &&
    input.mode !== 'bot' &&
    !input.rating.gated;
  const roundedRating =
    competitiveRating && input.rating.delta !== null
      ? Math.round(input.rating.delta)
      : 0;
  const correction = corrected ? ratingCorrectionPresentation(input) : null;

  if (correction) {
    items.push({
      kind: 'rating-correction',
      label: 'Rating',
      tone: 'neutral',
      value: correction.value,
    });
    details.push({
      kind: 'correction',
      label: 'Rating correction',
      value: correction.line,
    });
  } else if (roundedRating !== 0) {
    items.push({
      kind: 'rating',
      label: 'Rating',
      tone: roundedRating > 0 ? 'up' : 'down',
      value: `${roundedRating > 0 ? '+' : '−'}${Math.abs(roundedRating)}`,
    });
  }

  if (input.rating.gated && input.rating.line) {
    details.push({
      kind: 'rating-eligibility',
      label: 'Rating eligibility',
      value: input.rating.line,
    });
  }

  if (reward) {
    if (reward.credits_granted > 0) {
      items.push({
        kind: 'credits',
        label: 'Diamonds',
        tone: 'up',
        amount: reward.credits_granted,
      });
    }

    if (!corrected) {
      if (input.outcome === 'won' && reward.win_streak_after > 0) {
        items.push({
          kind: 'streak',
          label: 'Recorded streak',
          tone: 'neutral',
          value: String(reward.win_streak_after),
        });
      } else if (
        input.outcome === 'lost' &&
        reward.win_streak_after === 0 &&
        reward.best_win_streak > 0
      ) {
        items.push({
          kind: 'streak',
          label: 'Recorded streak',
          tone: 'neutral',
          value: '0',
        });
      }
    }

    if (reward.quests_completed.length > 0) {
      items.push({
        kind: 'quests-completed',
        label:
          reward.quests_completed.length === 1
            ? 'Quest complete'
            : 'Quests complete',
        tone: 'up',
        value: String(reward.quests_completed.length),
      });
    } else if (reward.quests_advanced.length > 0) {
      items.push({
        kind: 'quests-advanced',
        label:
          reward.quests_advanced.length === 1
            ? 'Quest advanced'
            : 'Quests advanced',
        tone: 'neutral',
        value: String(reward.quests_advanced.length),
      });
    }

    const eligibilityValue = input.exhibition
      ? 'This battle was recorded as an unrated exhibition.'
      : input.isBot || input.mode === 'bot'
        ? 'This practice battle was not eligible for competitive rating or streak diamonds.'
        : reward.credits_eligible
          ? 'This battle was eligible for ranked streak diamonds.'
          : 'This battle was not eligible for ranked streak diamonds.';
    details.push({
      kind: 'reward-eligibility',
      label: 'Diamond eligibility',
      value: eligibilityValue,
    });

    if (!corrected && reward.streak_milestone) {
      details.push({
        kind: 'milestone',
        label: 'Recorded milestone',
        value: `This battle recorded a ${reward.win_streak_after}-win streak milestone.`,
      });
    }
    if (!corrected && reward.best_win_streak > 0) {
      details.push({
        kind: 'best',
        label: 'Best streak after this battle',
        value: `${reward.best_win_streak} ${reward.best_win_streak === 1 ? 'win' : 'wins'}`,
      });
    }
    if (reward.quests_completed.length > 0) {
      details.push({
        kind: 'quests',
        label: 'Completed in this battle',
        value: reward.quests_completed.map((quest) => quest.title).join(' · '),
      });
    }
  }

  const hasQuestActivity = Boolean(
    reward &&
    (reward.quests_completed.length > 0 || reward.quests_advanced.length > 0),
  );
  const earned = Boolean(
    (reward?.credits_granted ?? 0) > 0 ||
    roundedRating > 0 ||
    (reward?.quests_completed.length ?? 0) > 0,
  );
  const feedback = reward
    ? null
    : input.battleCompleted
      ? 'Reward summary unavailable for this battle.'
      : 'Tallying recorded rewards…';
  const state: ResultRewardsModel['state'] = reward
    ? items.length > 0
      ? 'ready'
      : 'empty'
    : input.battleCompleted
      ? 'unavailable'
      : 'pending';

  return {
    state,
    title: earned ? 'Rewards' : 'Progress',
    feedback,
    items,
    details,
    hasQuestActivity,
    correctionLine: correction?.line ?? null,
  };
}
