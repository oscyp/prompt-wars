import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';

Deno.test(
  'obvious contact information is held before reaching external generation without echoing it',
  async () => {
    const provider = new TextModerationProvider();
    for (const text of [
      'Send the battle invite to player@example.test after this fight.',
      'My phone number is +48 600 123 456 and I want to battle.',
      'My home address is 123 Main Street, come fight me there.',
    ]) {
      const result = await provider.moderate(text);
      assertEquals(result.status, 'flagged_human_review');
      assertEquals(result.flaggedCategories, ['personal_information']);
      assertEquals(result.reason?.includes(text), false);
    }
  },
);
