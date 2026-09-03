/**
 * The reveal poster's badge logic. The status strings are the DB enum
 * `video_job_status`; a job in 'submitted' used to match no branch and show no
 * badge, so the poster looked idle while a paid video was being made.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import RoundResultCinematic from '@/components/RoundResultCinematic';
import type { VideoJobUpdate } from '@/hooks/useRealtimeBattle';

function job(status: string): VideoJobUpdate {
  return {
    id: `job-${status}`,
    battle_id: 'b1',
    status,
    thumbnail_url: null,
    error_message: null,
  };
}

describe('RoundResultCinematic', () => {
  it('labels the poster as a round reveal by default and a battle reveal on the series result', () => {
    const { getByLabelText, rerender } = render(<RoundResultCinematic />);
    getByLabelText('Round reveal');
    rerender(<RoundResultCinematic context="battle" />);
    getByLabelText('Battle reveal');
  });

  it('shows the generating badge for every in-flight enum state', () => {
    for (const status of ['queued', 'submitted', 'processing']) {
      const { getByText, getByLabelText, unmount } = render(
        <RoundResultCinematic videoJob={job(status)} />,
      );
      getByText('Generating cinematic…');
      getByLabelText('Round reveal, generating cinematic');
      unmount();
    }
  });

  it('shows no badge for a failed job or for the legacy "pending" string', () => {
    for (const status of ['failed', 'pending']) {
      const { queryByText, getByLabelText, unmount } = render(
        <RoundResultCinematic videoJob={job(status)} />,
      );
      expect(queryByText('Generating cinematic…')).toBeNull();
      getByLabelText('Round reveal');
      unmount();
    }
  });

  it('says the cinematic is ready, in sentence case, once moderation approves', () => {
    const { getByText, getByLabelText } = render(
      <RoundResultCinematic
        videoJob={job('succeeded')}
        isModerationApproved
        context="battle"
      />,
    );
    getByText('Cinematic ready');
    getByLabelText('Battle reveal, cinematic ready');
  });

  it('keeps a succeeded video behind the moderation badge until approved', () => {
    const { getByText, getByLabelText } = render(
      <RoundResultCinematic videoJob={job('succeeded')} />,
    );
    getByText('Video pending moderation');
    getByLabelText('Round reveal, video pending moderation');
  });

  it('never renders an AI-generated disclosure pill (product decision, DESIGN_LANGUAGE.md)', () => {
    const { queryByText } = render(
      <RoundResultCinematic
        tier0Payload={{ summary: 'A clean win.', battleCryText: 'For glory' }}
      />,
    );
    expect(queryByText(/AI[- ]GENERATED/i)).toBeNull();
  });
});
