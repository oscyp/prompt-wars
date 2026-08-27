import { formatCredits, creditsNoun } from '@/utils/credits';
import {
  EditError,
  describeEditError,
  formatRetryAfter,
} from '@/utils/editErrors';

describe('formatCredits', () => {
  it('renders zero and negatives as Free in both styles', () => {
    expect(formatCredits(0)).toBe('Free');
    expect(formatCredits(0, 'sentence')).toBe('Free');
    expect(formatCredits(-1)).toBe('Free');
  });

  it('abbreviates for chips and spells out for sentences', () => {
    expect(formatCredits(1)).toBe('1 cr');
    expect(formatCredits(3)).toBe('3 cr');
    expect(formatCredits(1, 'sentence')).toBe('1 credit');
    expect(formatCredits(3, 'sentence')).toBe('3 credits');
  });

  it('creditsNoun always spells out, including zero', () => {
    expect(creditsNoun(0)).toBe('0 credits');
    expect(creditsNoun(1)).toBe('1 credit');
  });
});

describe('formatRetryAfter', () => {
  it('scales the unit to the delay', () => {
    expect(formatRetryAfter(90)).toBe('in about 2 minutes');
    expect(formatRetryAfter(3600)).toBe('in about 1 hour');
    expect(formatRetryAfter(4 * 3600)).toBe('in about 4 hours');
    expect(formatRetryAfter(86400 * 7)).toBe('in about 7 days');
  });

  it('degrades gracefully on nonsense input', () => {
    expect(formatRetryAfter(0)).toBe('shortly');
    expect(formatRetryAfter(NaN)).toBe('shortly');
  });
});

describe('describeEditError', () => {
  it('never leaks a raw ISO timestamp for cooldowns', () => {
    const err = new EditError(
      'cooldown',
      'next allowed at 2026-08-28T14:32:11.000Z',
      { retryAfterSeconds: 4 * 3600 },
    );
    const { message } = describeEditError(err);
    expect(message).toContain('in about 4 hours');
    expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('recovers a delay from the message when the server sent no number', () => {
    const iso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const err = new EditError('cooldown', `next allowed at ${iso}`);
    const { message } = describeEditError(err);
    expect(message).toContain('hour');
    expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('explains a battle lock without server phrasing', () => {
    const err = new EditError(
      'battle_locked',
      'character is in an active battle',
    );
    expect(describeEditError(err).message).toContain('Finish your battle');
  });

  it('names the shortfall when the server provides one', () => {
    const err = new EditError('insufficient_credits', 'Insufficient credits', {
      shortfall: 2,
    });
    expect(describeEditError(err).message).toContain('2 more credits');
  });

  it('says the player was not charged when the art provider fails', () => {
    const err = new EditError(
      'all_providers_failed',
      'All image providers failed: xai=404; openai=timeout',
    );
    const { message } = describeEditError(err);
    expect(message).toContain('not been charged');
    expect(message).not.toContain('openai');
  });

  it('falls back to the raw message only for unknown codes', () => {
    const err = new EditError('some_new_code', 'raw detail');
    expect(describeEditError(err).message).toBe('raw detail');
  });

  it('handles non-EditError throwables', () => {
    expect(describeEditError(new Error('boom')).message).toBe('boom');
    expect(describeEditError(undefined).message).toContain('went wrong');
  });
});
