import { EditError } from '@/utils/editErrors';
import { BALANCED_STATS, STAT_POINT_TOTAL } from '@/utils/statAllocation';
import {
  DRAFT_FREE_PORTRAITS,
  INITIAL_DRAFT,
  MAX_NAME_LEN,
  MIN_NAME_LEN,
  PORTRAIT_MODERATION_MESSAGE,
  PORTRAIT_REQUIRED_MESSAGE,
  PORTRAIT_STALE_NOTICE,
  PORTRAIT_TIMEOUT_MESSAGE,
  PORTRAIT_UNAVAILABLE_MESSAGE,
  STATS_REJECTED_MESSAGE,
  STEP,
  TOTAL_STEPS,
  canAdvance,
  clampStepToDraft,
  customItemCreateLabel,
  describeCustomItemError,
  describeFinalizeError,
  describePortraitError,
  draftAccentHex,
  finalizeBlocker,
  finalizeErrorNamesStats,
  freePortraitsIntro,
  freePortraitsLeft,
  iconSwitchCaption,
  nextDisabledHint,
  outOfFreePortraitsCopy,
  portraitIsStale,
  progressLabel,
  regenerateLabel,
  renderInputs,
  stepAnnouncement,
  stepForSummaryLabel,
  stepTitle,
  summaryRows,
  type Draft,
} from '@/utils/onboardingDraft';

/** The shape `invokeAuthenticatedFunction` throws for a non-2xx. */
function functionError(
  status: number,
  error: { code: string; message?: string; shortfall?: number; field?: string },
) {
  return Object.assign(new Error(error.message ?? 'failed'), {
    name: 'FunctionInvokeError',
    status,
    body: { ok: false, error },
  });
}

/** Every step before the portrait is done; no portrait yet. */
const READY: Draft = {
  ...INITIAL_DRAFT,
  name: 'Kestrel',
  archetype: 'mystic',
  path: 'guided',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  palette: 'ocean',
  era: 'cyberpunk',
  expression: 'smirk',
  signatureItem: {
    id: 'item-1',
    name: 'Brass Kettle',
    description: 'Never empties.',
    itemClass: 'tool',
  },
  battleCry: 'Words become worlds.',
};

/** READY plus a portrait: everything Enter the Arena needs. */
const RENDERED: Draft = {
  ...READY,
  portrait: {
    jobId: 'j',
    portraitId: 'p',
    imageUrl: 'https://x/p.png',
    seed: '1',
    status: 'succeeded',
  },
  renderedWith: renderInputs(READY),
};

/** 19 of 20 points placed. */
const ONE_SHORT = { ...BALANCED_STATS, focus: 4 };

describe('step order', () => {
  it('has eight steps, identity first and the portrait last', () => {
    expect(TOTAL_STEPS).toBe(8);
    expect(STEP.portrait).toBe(TOTAL_STEPS);
    expect([
      STEP.name,
      STEP.archetype,
      STEP.stats,
      STEP.item,
      STEP.battleCry,
      STEP.color,
      STEP.path,
      STEP.portrait,
    ]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(STEP).not.toHaveProperty('confirm');
    expect(stepTitle(STEP.stats)).toBe('Stats');
    expect(stepTitle(STEP.path)).toBe('How to build');
    expect(progressLabel(3)).toBe('Step 3 of 8');
    expect(stepAnnouncement(3)).toBe('Step 3 of 8: Stats');
    expect(stepAnnouncement(8)).toBe('Step 8 of 8: Portrait');
  });

  it('starts every fighter balanced and has no skip-portrait flag', () => {
    expect(INITIAL_DRAFT.stats).toEqual(BALANCED_STATS);
    // A copy, so patching the draft never mutates the shared constant.
    expect(INITIAL_DRAFT.stats).not.toBe(BALANCED_STATS);
    expect(INITIAL_DRAFT).not.toHaveProperty('portraitSkipped');
  });
});

describe('step gating', () => {
  it('gates the name on length', () => {
    expect(canAdvance(STEP.name, INITIAL_DRAFT)).toBe(false);
    expect(canAdvance(STEP.name, { ...INITIAL_DRAFT, name: 'ab' })).toBe(false);
    expect(canAdvance(STEP.name, { ...INITIAL_DRAFT, name: '  abc ' })).toBe(
      true,
    );
    expect(
      canAdvance(STEP.name, {
        ...INITIAL_DRAFT,
        name: 'x'.repeat(MAX_NAME_LEN + 1),
      }),
    ).toBe(false);
    expect(nextDisabledHint(STEP.name, INITIAL_DRAFT)).toBe(
      `Enter a name of ${MIN_NAME_LEN} to ${MAX_NAME_LEN} characters to continue`,
    );
  });

  it('gates archetype and path on a pick', () => {
    expect(canAdvance(STEP.archetype, INITIAL_DRAFT)).toBe(false);
    expect(nextDisabledHint(STEP.archetype, INITIAL_DRAFT)).toBe(
      'Choose an archetype to continue',
    );
    expect(
      canAdvance(STEP.archetype, { ...INITIAL_DRAFT, archetype: 'titan' }),
    ).toBe(true);
    expect(canAdvance(STEP.path, INITIAL_DRAFT)).toBe(false);
    expect(nextDisabledHint(STEP.path, INITIAL_DRAFT)).toBe(
      'Choose how to build your fighter to continue',
    );
    expect(canAdvance(STEP.path, { ...INITIAL_DRAFT, path: 'prompt' })).toBe(
      true,
    );
  });

  it('gates the stats step on the whole pool being placed', () => {
    expect(canAdvance(STEP.stats, INITIAL_DRAFT)).toBe(true);
    expect(nextDisabledHint(STEP.stats, INITIAL_DRAFT)).toBeUndefined();
    const short = { ...INITIAL_DRAFT, stats: ONE_SHORT };
    expect(canAdvance(STEP.stats, short)).toBe(false);
    expect(nextDisabledHint(STEP.stats, short)).toBe(
      'Spend 1 more point to continue',
    );
    expect(
      canAdvance(STEP.stats, {
        ...INITIAL_DRAFT,
        stats: { strength: 8, stamina: 6, agility: 3, focus: 3 },
      }),
    ).toBe(true);
  });

  it('treats a skipped item as done', () => {
    expect(canAdvance(STEP.item, INITIAL_DRAFT)).toBe(false);
    expect(nextDisabledHint(STEP.item, INITIAL_DRAFT)).toBe(
      'Pick a signature item or skip to continue',
    );
    expect(canAdvance(STEP.item, { ...INITIAL_DRAFT, itemSkipped: true })).toBe(
      true,
    );
    expect(canAdvance(STEP.item, READY)).toBe(true);
  });

  it('gates the battle cry and frees the colour step', () => {
    expect(canAdvance(STEP.battleCry, { ...READY, battleCry: 'go' })).toBe(
      false,
    );
    expect(canAdvance(STEP.battleCry, READY)).toBe(true);
    expect(canAdvance(STEP.color, INITIAL_DRAFT)).toBe(true);
  });

  it('makes the portrait step the finalize gate: no portrait, no arena', () => {
    expect(canAdvance(STEP.portrait, READY)).toBe(false);
    expect(nextDisabledHint(STEP.portrait, READY)).toBe(
      PORTRAIT_REQUIRED_MESSAGE,
    );
    expect(canAdvance(STEP.portrait, RENDERED)).toBe(true);
    expect(nextDisabledHint(STEP.portrait, RENDERED)).toBeUndefined();
  });

  it('returns no hint when Next is enabled', () => {
    expect(nextDisabledHint(STEP.name, READY)).toBeUndefined();
    expect(nextDisabledHint(STEP.stats, READY)).toBeUndefined();
    expect(nextDisabledHint(STEP.color, INITIAL_DRAFT)).toBeUndefined();
  });

  it('clamps a restored step back to the first unmet one', () => {
    expect(clampStepToDraft(6, INITIAL_DRAFT)).toBe(STEP.name);
    expect(clampStepToDraft(6, { ...INITIAL_DRAFT, name: 'Kestrel' })).toBe(
      STEP.archetype,
    );
    expect(clampStepToDraft(6, { ...READY, stats: ONE_SHORT })).toBe(
      STEP.stats,
    );
    expect(clampStepToDraft(6, READY)).toBe(6);
    // The last step is never clamped for want of a portrait: that is where
    // the portrait gets drawn.
    expect(clampStepToDraft(99, READY)).toBe(TOTAL_STEPS);
    expect(clampStepToDraft(0, READY)).toBe(1);
  });
});

describe('finalizeBlocker', () => {
  it('names the first missing piece and where to fix it', () => {
    expect(finalizeBlocker(INITIAL_DRAFT)).toEqual({
      message: 'Choose an archetype before entering the arena.',
      step: STEP.archetype,
    });
    expect(finalizeBlocker({ ...RENDERED, name: 'ab' })?.step).toBe(STEP.name);
    expect(finalizeBlocker({ ...RENDERED, battleCry: '' })).toEqual({
      message: 'Add a battle cry before entering the arena.',
      step: STEP.battleCry,
    });
  });

  it('requires a portrait; there is no skip', () => {
    expect(finalizeBlocker(READY)).toEqual({
      message: 'Draw your portrait before entering the arena.',
      step: STEP.portrait,
    });
    expect(PORTRAIT_REQUIRED_MESSAGE).toBe(
      'Draw your portrait before entering the arena.',
    );
  });

  it('requires every stat point placed, within range', () => {
    expect(finalizeBlocker({ ...RENDERED, stats: ONE_SHORT })).toEqual({
      message: `Place all ${STAT_POINT_TOTAL} stat points before entering the arena.`,
      step: STEP.stats,
    });
    expect(
      finalizeBlocker({
        ...RENDERED,
        // Totals 20 but breaks the 1–10 floor.
        stats: { strength: 0, stamina: 5, agility: 5, focus: 10 },
      })?.step,
    ).toBe(STEP.stats);
  });

  it('clears once everything is in place', () => {
    expect(finalizeBlocker(RENDERED)).toBeNull();
    expect(canAdvance(STEP.portrait, RENDERED)).toBe(true);
  });
});

describe('portrait staleness', () => {
  it('is not stale without a portrait or right after one lands', () => {
    expect(portraitIsStale(READY)).toBe(false);
    expect(portraitIsStale(RENDERED)).toBe(false);
  });

  it('goes stale when a trait or the art style changes', () => {
    expect(portraitIsStale({ ...RENDERED, era: 'ancient' })).toBe(true);
    expect(portraitIsStale({ ...RENDERED, artStyle: 'anime' })).toBe(true);
  });

  it('compares prompts trimmed on the prompt path', () => {
    const prompted: Draft = {
      ...RENDERED,
      path: 'prompt',
      prompt: 'A monk',
      renderedWith: renderInputs({
        ...RENDERED,
        path: 'prompt',
        prompt: 'A monk',
      }),
    };
    expect(portraitIsStale({ ...prompted, prompt: ' A monk ' })).toBe(false);
    expect(portraitIsStale({ ...prompted, prompt: 'A nun' })).toBe(true);
    expect(PORTRAIT_STALE_NOTICE).toContain('Regenerate');
  });
});

describe('money copy', () => {
  it('states the allowance and the price before the first portrait', () => {
    expect(freePortraitsIntro(3)).toBe(
      '3 free portraits, then 3 credits each.',
    );
    expect(freePortraitsIntro(null)).toBe(
      `${DRAFT_FREE_PORTRAITS} free portraits. After that, each one costs credits.`,
    );
  });

  it('counts down and then names the price', () => {
    expect(freePortraitsLeft(2, 3)).toBe('2 free portraits left');
    expect(freePortraitsLeft(1, 3)).toBe('1 free portrait left');
    expect(freePortraitsLeft(0, 3)).toBe(
      'No free portraits left · 3 cr each. You can change your look any time after this.',
    );
  });

  it('confirms a paid portrait with the price in the body and the button', () => {
    const copy = outOfFreePortraitsCopy(3);
    expect(copy.title).toBe('Out of free portraits');
    expect(copy.message).toBe(
      'You’ve used your 3 free portraits. Another one costs 3 credits.',
    );
    expect(copy.confirmLabel).toBe('Spend 3 credits');
    expect(copy.cancelLabel).toBe('Keep this one');
    expect(outOfFreePortraitsCopy(null).confirmLabel).toBe('Spend credits');
  });

  it('prices the regenerate button only once the free ones are gone', () => {
    expect(regenerateLabel(false, 3)).toBe('Regenerate');
    expect(regenerateLabel(true, 3)).toBe('Regenerate · 3 cr');
    expect(regenerateLabel(true, null)).toBe('Regenerate · credits');
  });

  it('prices the custom item icon as the marginal cost', () => {
    expect(iconSwitchCaption({ text: 0, image: 3 })).toBe(
      'Adds an icon · 3 cr',
    );
    expect(iconSwitchCaption({ text: 1, image: 3 })).toBe(
      'Adds an icon · 2 cr',
    );
    expect(iconSwitchCaption({ text: 3, image: 3 })).toBe(
      'Adds an icon · Free',
    );
    expect(iconSwitchCaption({ text: null, image: null })).toBe('Adds an icon');
    expect(customItemCreateLabel({ text: 0, image: 3 }, false)).toBe(
      'Create · Free',
    );
    expect(customItemCreateLabel({ text: 0, image: 3 }, true)).toBe(
      'Create · 3 cr',
    );
    expect(customItemCreateLabel({ text: null, image: null }, true)).toBe(
      'Create',
    );
  });
});

describe('describePortraitError', () => {
  it('names moderation without a retry', () => {
    const copy = describePortraitError(
      functionError(422, {
        code: 'moderation_rejected',
        message: 'prompt rejected',
      }),
    );
    expect(copy).toEqual({
      message: PORTRAIT_MODERATION_MESSAGE,
      retry: false,
      topUp: false,
    });
  });

  it('offers a top up with the shortfall on 402', () => {
    const copy = describePortraitError(
      functionError(402, { code: 'insufficient_credits', shortfall: 2 }),
    );
    expect(copy.topUp).toBe(true);
    expect(copy.retry).toBe(false);
    expect(copy.message).toBe(
      'You need 2 more credits for this. Top up in the shop.',
    );
  });

  it('uses the timeout sentence for a coded timeout', () => {
    const copy = describePortraitError(new EditError('timeout', 'raw'));
    expect(copy).toEqual({
      message: PORTRAIT_TIMEOUT_MESSAGE,
      retry: true,
      topUp: false,
    });
  });

  it('never appends the raw message for anything else', () => {
    const copy = describePortraitError(new Error('ECONNRESET at 10.0.0.1'));
    expect(copy.message).toBe(PORTRAIT_UNAVAILABLE_MESSAGE);
    expect(copy.message).not.toContain('ECONNRESET');
    expect(copy.retry).toBe(true);
  });
});

describe('describeCustomItemError', () => {
  it('maps the daily limit, moderation and credits', () => {
    expect(
      describeCustomItemError(functionError(429, { code: 'rate_limited' }))
        .message,
    ).toBe('You’ve made today’s limit of custom items.');
    expect(
      describeCustomItemError(
        functionError(422, { code: 'moderation_rejected' }),
      ).title,
    ).toBe('Rejected');
    const short = describeCustomItemError(
      functionError(402, { code: 'insufficient_credits', shortfall: 3 }),
    );
    expect(short.topUp).toBe(true);
    expect(short.message).toContain('3 more credits');
    expect(describeCustomItemError(new Error('boom')).message).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('describeFinalizeError', () => {
  it('treats an already-finalized 409 as success', () => {
    expect(
      describeFinalizeError(
        functionError(409, { code: 'conflict', message: 'already finalized' }),
      ),
    ).toEqual({ kind: 'already_finalized' });
  });

  it('recognises the moderation refusal and names both fields', () => {
    const outcome = describeFinalizeError(
      functionError(400, {
        code: 'bad_request',
        message:
          'That name or battle cry was rejected by moderation. Please choose another.',
      }),
    );
    expect(outcome.kind).toBe('moderation');
    if (outcome.kind === 'moderation') {
      expect(outcome.message).toBe(
        'Your name or battle cry was rejected by moderation. Choose different wording.',
      );
    }
    expect(
      describeFinalizeError(
        functionError(400, { code: 'bad_request', message: 'needs review' }),
      ).kind,
    ).toBe('moderation');
  });

  it('falls back to generic copy', () => {
    const outcome = describeFinalizeError(new Error('duplicate key value'));
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.message).not.toContain('duplicate');
    }
  });
});

describe('finalizeErrorNamesStats', () => {
  it('spots the server’s field marker', () => {
    const refused = functionError(400, {
      code: 'bad_request',
      message: 'invalid',
      field: 'stats',
    });
    expect(describeFinalizeError(refused).kind).toBe('error');
    expect(finalizeErrorNamesStats(refused)).toBe(true);
  });

  it('falls back to the prose once the envelope is gone', () => {
    expect(
      finalizeErrorNamesStats(
        new EditError('bad_request', 'stats must total 20 points (got 19)'),
      ),
    ).toBe(true);
    expect(
      finalizeErrorNamesStats(new EditError('bad_request', 'status 500')),
    ).toBe(false);
    expect(finalizeErrorNamesStats(new Error('duplicate key value'))).toBe(
      false,
    );
    expect(finalizeErrorNamesStats(null)).toBe(false);
  });

  it('tells the player what to fix, with the real pool size', () => {
    expect(STATS_REJECTED_MESSAGE).toContain(`${STAT_POINT_TOTAL} points`);
    expect(STATS_REJECTED_MESSAGE).toContain('1 to 10');
  });
});

describe('recap', () => {
  it('recaps every decision in the player’s words, stats included', () => {
    const rows = summaryRows(READY);
    expect(rows.map((r) => r.label)).toEqual([
      'Name',
      'Archetype',
      'Stats',
      'Art style',
      'Look',
      'Signature item',
      'Signature colour',
      'Battle cry',
    ]);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Name).toBe('Kestrel');
    expect(byLabel.Archetype).toBe('The Mystic');
    expect(byLabel.Stats).toBe('STR 5 · STA 5 · AGI 5 · FOC 5');
    expect(byLabel['Art style']).toBe('Painterly');
    expect(byLabel.Look).toBe(
      'Heroic · Lean Duelist · Ocean · Cyberpunk · Smirk',
    );
    expect(byLabel['Signature item']).toBe('Brass Kettle');
    expect(byLabel['Signature colour']).toBe('The Mystic default');
    expect(byLabel['Battle cry']).toBe('“Words become worlds.”');
  });

  it('shows a shaped allocation', () => {
    const rows = summaryRows({
      ...READY,
      stats: { strength: 8, stamina: 6, agility: 3, focus: 3 },
    });
    expect(rows.find((r) => r.label === 'Stats')?.value).toBe(
      'STR 8 · STA 6 · AGI 3 · FOC 3',
    );
  });

  it('explains an assigned item and a chosen colour', () => {
    const rows = summaryRows({
      ...READY,
      signatureItem: undefined,
      itemSkipped: true,
      signatureColor: 'ember',
      path: 'prompt',
      prompt: 'A monk',
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Signature item']).toBe(
      'Assigned by the arena — change it later',
    );
    expect(byLabel['Signature colour']).toBe('Ember');
    expect(byLabel.Look).toBe('“A monk”');
  });

  it('never mentions skipping a portrait', () => {
    const text = summaryRows(READY)
      .map((r) => `${r.label} ${r.value}`)
      .join(' ');
    expect(text).not.toMatch(/skip/i);
  });

  it('links each row back to its step, except the portrait’s own rows', () => {
    expect(stepForSummaryLabel('Name')).toBe(STEP.name);
    expect(stepForSummaryLabel('Archetype')).toBe(STEP.archetype);
    expect(stepForSummaryLabel('Stats')).toBe(STEP.stats);
    expect(stepForSummaryLabel('Signature item')).toBe(STEP.item);
    expect(stepForSummaryLabel('Battle cry')).toBe(STEP.battleCry);
    expect(stepForSummaryLabel('Signature colour')).toBe(STEP.color);
    expect(stepForSummaryLabel('Art style')).toBeNull();
    expect(stepForSummaryLabel('Look')).toBeNull();
    expect(stepForSummaryLabel('Nope')).toBeNull();
    // Every row either links to an earlier step or belongs to the portrait
    // step itself, where the recap lives.
    for (const row of summaryRows(RENDERED)) {
      const target = stepForSummaryLabel(row.label);
      if (target === null) {
        expect(['Art style', 'Look']).toContain(row.label);
      } else {
        expect(target).toBeLessThan(STEP.portrait);
      }
    }
  });

  it('frames the fighter in the signature colour, else the archetype colour', () => {
    expect(draftAccentHex(READY)).toBe('#8B5CF6');
    expect(draftAccentHex({ ...READY, signatureColor: 'ember' })).toBe(
      '#EF4444',
    );
  });
});
