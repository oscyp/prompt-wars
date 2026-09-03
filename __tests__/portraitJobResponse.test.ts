/**
 * Every shape the portrait functions have ever returned, classified.
 *
 * The wrapper used to throw on the old idempotent replay because it lacked a
 * `job_id`; that made a legitimate retry after a dropped response read as a
 * failure while the charge stood.
 */
import { normalizePortraitJobResponse } from '@/utils/characters';

describe('normalizePortraitJobResponse', () => {
  it('reads the synchronous happy path with both images', () => {
    const shape = normalizePortraitJobResponse({
      job_id: 'job-1',
      portrait_id: 'fighter-1',
      image_path: 'u/fighter.jpg',
      avatar_portrait_id: 'avatar-1',
      avatar_image_path: 'u/avatar.jpg',
      avatar_pending: false,
      avatar_job_id: null,
      credits_spent: 3,
      seed: 42,
      mode: 'render',
    });
    expect(shape).toMatchObject({
      kind: 'sync',
      jobId: 'job-1',
      portraitId: 'fighter-1',
      imagePath: 'u/fighter.jpg',
      avatarPortraitId: 'avatar-1',
      avatarImagePath: 'u/avatar.jpg',
      avatarPending: false,
      creditsSpent: 3,
      seed: '42',
      idempotent: false,
    });
  });

  it('marks the avatar pending when the server says the leg failed', () => {
    const shape = normalizePortraitJobResponse({
      job_id: 'job-1',
      portrait_id: 'fighter-1',
      image_path: 'u/fighter.jpg',
      avatar_portrait_id: null,
      avatar_pending: true,
    });
    expect(shape).toMatchObject({ kind: 'sync', avatarPending: true });
  });

  it('derives pending from a null avatar id when the flag is absent', () => {
    const shape = normalizePortraitJobResponse({
      job_id: 'job-1',
      portrait_id: 'fighter-1',
      image_path: 'u/fighter.jpg',
      avatar_portrait_id: null,
    });
    expect(shape).toMatchObject({ kind: 'sync', avatarPending: true });
  });

  it('leaves the avatar state unknown for a server that predates avatars', () => {
    const shape = normalizePortraitJobResponse({
      job_id: 'job-1',
      portrait_id: 'fighter-1',
      image_path: 'u/fighter.jpg',
    });
    expect(shape).toMatchObject({ kind: 'sync', avatarPortraitId: null });
    expect(
      (shape as { avatarPending?: boolean }).avatarPending,
    ).toBeUndefined();
  });

  it('does not throw on the old idempotent replay shape', () => {
    const shape = normalizePortraitJobResponse({
      idempotent: true,
      after: { portrait_id: 'fighter-1', avatar_portrait_id: 'avatar-1' },
      credits_spent: 3,
    });
    expect(shape).toEqual({
      kind: 'replay',
      portraitId: 'fighter-1',
      avatarPortraitId: 'avatar-1',
      creditsSpent: 3,
    });
  });

  it('treats a job-id-only response as something to wait for', () => {
    expect(normalizePortraitJobResponse({ job_id: 'job-9' })).toEqual({
      kind: 'job',
      jobId: 'job-9',
    });
  });

  it('reads a free avatar-only retry as a zero-cost sync result', () => {
    const shape = normalizePortraitJobResponse({
      job_id: 'avatar-job',
      portrait_id: 'fighter-1',
      image_path: 'u/fighter.jpg',
      avatar_portrait_id: 'avatar-2',
      avatar_image_path: 'u/avatar2.jpg',
      avatar_pending: false,
      credits_spent: 0,
      mode: 'avatar_only',
    });
    expect(shape).toMatchObject({ kind: 'sync', creditsSpent: 0 });
  });

  it('rejects empty and shapeless responses', () => {
    expect(normalizePortraitJobResponse(undefined)).toEqual({
      kind: 'invalid',
    });
    expect(normalizePortraitJobResponse(null)).toEqual({ kind: 'invalid' });
    expect(normalizePortraitJobResponse({})).toEqual({ kind: 'invalid' });
  });
});
