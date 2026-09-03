import { transactionLabel, transactionAmountLabel } from '@/utils/walletCopy';
import {
  battleOutcomeFor,
  battleStatusView,
  opponentNameFor,
} from '@/utils/battleCopy';

describe('transactionLabel', () => {
  it('names the known reasons', () => {
    expect(transactionLabel('purchase')).toBe('Credit pack');
    expect(transactionLabel('daily_login')).toBe('Daily login reward');
    expect(transactionLabel('quest_complete')).toBe('Quest reward');
    expect(transactionLabel('render_look')).toBe('Portrait render');
    expect(transactionLabel('video_upgrade')).toBe('Cinematic video');
    expect(transactionLabel('leave_battle')).toBe('Left a battle');
  });

  it('folds refund suffixes into one label without the operational detail', () => {
    expect(transactionLabel('render_look_refund:timeout')).toBe(
      'Refund · portrait render',
    );
    expect(transactionLabel('draft_render_refund:provider_error')).toBe(
      'Refund · portrait draft',
    );
    expect(transactionLabel('video_generation_failed_refund_502')).toBe(
      'Refund · video generation failed',
    );
    expect(transactionLabel('identity_refund:update_failed')).toBe(
      'Refund · character edit',
    );
    expect(
      transactionLabel('prompt_suggestions_refund:generation_failed'),
    ).toBe('Refund · new ideas');
  });

  it('never returns the raw key', () => {
    for (const key of [
      'some_new_reason',
      'remote_test_drain',
      '',
      null,
      undefined,
    ]) {
      const label = transactionLabel(key as string);
      expect(label).not.toMatch(/_/);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('transactionAmountLabel', () => {
  it('signs and spells the noun', () => {
    expect(transactionAmountLabel(30)).toBe('+30 credits');
    expect(transactionAmountLabel(-3)).toBe('−3 credits');
    expect(transactionAmountLabel(-1)).toBe('−1 credit');
  });
});

describe('battleOutcomeFor', () => {
  it('only resolved battles have an outcome', () => {
    expect(
      battleOutcomeFor(
        { status: 'waiting_for_prompts', winner_id: null },
        'me',
      ),
    ).toBe('pending');
    expect(
      battleOutcomeFor({ status: 'expired', winner_id: 'them' }, 'me'),
    ).toBe('pending');
    expect(
      battleOutcomeFor({ status: 'completed', winner_id: 'me' }, 'me'),
    ).toBe('win');
    expect(
      battleOutcomeFor({ status: 'completed', winner_id: 'them' }, 'me'),
    ).toBe('loss');
    expect(
      battleOutcomeFor(
        { status: 'completed', is_draw: true, winner_id: null },
        'me',
      ),
    ).toBe('draw');
  });
});

describe('battleStatusView', () => {
  it('marks the one row the player is looking for', () => {
    expect(battleStatusView({ status: 'waiting_for_prompts' })).toMatchObject({
      label: 'Your turn',
      actionable: true,
    });
    expect(
      battleStatusView({ status: 'waiting_for_prompts', iHaveLocked: true }),
    ).toMatchObject({ label: 'Waiting for opponent', actionable: false });
  });

  it('never ships a raw enum', () => {
    for (const status of [
      'created',
      'matched',
      'resolving',
      'result_ready',
      'generating_video',
      'completed',
      'expired',
      'canceled',
      'moderation_failed',
      'generation_failed',
      'something_else',
    ]) {
      expect(battleStatusView({ status }).label).not.toMatch(/_/);
    }
  });

  it('reads the outcome on finished battles', () => {
    expect(
      battleStatusView({ status: 'completed', outcome: 'win' }).label,
    ).toBe('Victory');
    expect(
      battleStatusView({ status: 'completed', outcome: 'draw' }).label,
    ).toBe('Draw');
  });
});

describe('opponentNameFor', () => {
  it('uses one vocabulary for the empty seat', () => {
    expect(opponentNameFor({ hasOpponent: false })).toBe('No opponent yet');
    expect(opponentNameFor({ hasOpponent: true })).toBe('Opponent');
    expect(opponentNameFor({ isBot: true, hasOpponent: true })).toBe(
      'Practice bot',
    );
    expect(
      opponentNameFor({ isBot: true, botName: 'Rusty', hasOpponent: true }),
    ).toBe('Rusty');
    expect(
      opponentNameFor({ opponentName: ' Golota ', hasOpponent: true }),
    ).toBe('Golota');
  });
});
