// The classifier policy, without the network.
//
// OpenAI's per-category flags are tuned for chat, and a fighting game's prompts
// trip `violence` constantly ("a crushing shoulder bash" scored 0.51 and was
// held for review). The violence categories get their own bar; nothing else
// changes.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  evaluateOpenAiModeration,
  FICTION_TOLERANT_THRESHOLDS,
  OPENAI_REJECT_SCORE,
} from '../_shared/moderation.ts';

function result(
  flags: Record<string, number>,
  extraScores: Record<string, number> = {},
) {
  const categories: Record<string, boolean> = {};
  const category_scores: Record<string, number> = { ...extraScores };
  for (const [cat, score] of Object.entries(flags)) {
    categories[cat] = true;
    category_scores[cat] = score;
  }
  for (const cat of Object.keys(extraScores)) categories[cat] ??= false;
  return {
    flagged: Object.keys(flags).length > 0,
    categories,
    category_scores,
  };
}

Deno.test('written combat: violence below the tolerance is approved', () => {
  const out = evaluateOpenAiModeration(
    result({ violence: 0.51 }, { harassment: 0.02 }),
    'modr-1',
  );
  assertEquals(out.status, 'approved');
  assertEquals(out.provider, 'openai');
  assertEquals(out.providerRequestId, 'modr-1');
  assertEquals(out.flaggedCategories, undefined);
});

Deno.test('violence at or above the tolerance is still held for review', () => {
  const out = evaluateOpenAiModeration(
    result({ violence: FICTION_TOLERANT_THRESHOLDS.violence }),
  );
  assertEquals(out.status, 'flagged_human_review');
  assertEquals(out.flaggedCategories, ['violence']);
});

Deno.test('graphic violence has a lower bar than violence', () => {
  const under = evaluateOpenAiModeration(result({ 'violence/graphic': 0.6 }));
  assertEquals(under.status, 'approved');
  const over = evaluateOpenAiModeration(result({ 'violence/graphic': 0.75 }));
  assertEquals(over.status, 'flagged_human_review');
  assertEquals(over.flaggedCategories, ['violence/graphic']);
});

Deno.test('every other category keeps the provider flag as-is', () => {
  const sexual = evaluateOpenAiModeration(result({ sexual: 0.4 }));
  assertEquals(sexual.status, 'flagged_human_review');
  const harassment = evaluateOpenAiModeration(
    result({ 'harassment/threatening': 0.95 }),
  );
  assertEquals(harassment.status, 'rejected');
  assertEquals(harassment.reason, 'Flagged categories: harassment/threatening');
});

Deno.test(
  'a tolerated violence flag does not shield another flagged category',
  () => {
    const out = evaluateOpenAiModeration(result({ violence: 0.5, hate: 0.6 }));
    assertEquals(out.status, 'flagged_human_review');
    assertEquals(out.flaggedCategories, ['hate']);
    assertEquals(out.confidence, 0.6);
  },
);

Deno.test('extreme violence is refused outright', () => {
  const out = evaluateOpenAiModeration(result({ violence: 0.97 }));
  assertEquals(out.status, 'rejected');
  assertEquals((out.confidence ?? 0) > OPENAI_REJECT_SCORE, true);
});

Deno.test('nothing flagged approves with confidence from the top score', () => {
  const out = evaluateOpenAiModeration(
    result({}, { violence: 0.3, sexual: 0.01 }),
  );
  assertEquals(out.status, 'approved');
  assertEquals(Math.round((out.confidence ?? 0) * 100), 70);
});
