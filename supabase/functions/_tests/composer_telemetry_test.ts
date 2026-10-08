import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseComposerEvent } from '../_shared/composer-events.ts';
const input = {
  event: 'composer_opened',
  battle_id: '00000000-0000-4000-8000-000000000001',
  session_id: '00000000-0000-4000-8000-000000000002',
  round_number: 2,
  duration_ms: 1200,
};
Deno.test('new composer events remain text-free and allowlisted', () => {
  for (const event of [
    'composer_inspiration_selected',
    'composer_action_changed',
    'composer_suggestions_applied',
  ]) {
    assertEquals<unknown>(
      parseComposerEvent({ ...input, event, prompt: 'private prose' }),
      { ...input, event },
    );
  }
});
Deno.test(
  'composer event excludes prose and requires bounded round/session',
  () => {
    assertEquals(
      parseComposerEvent({
        ...input,
        prompt: 'secret',
        keystrokes: ['secret'],
      }),
      input,
    );
    assertEquals(parseComposerEvent({ ...input, round_number: 4 }), null);
    assertEquals(parseComposerEvent({ ...input, session_id: undefined }), null);
    assertEquals(parseComposerEvent({ ...input, duration_ms: -1 }), null);
    assertEquals(parseComposerEvent({ ...input, event: 'arbitrary' }), null);
  },
);
