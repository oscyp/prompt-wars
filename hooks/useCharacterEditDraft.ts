import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  characterEditDrafts,
  type CharacterEditDraft,
  type CharacterEditDraftScope,
  type CharacterEditMode,
} from '@/utils/characterEditDrafts';
import {
  describeCooldownLength,
  type EditPriceKey,
  type EditPricing,
} from '@/utils/editCooldowns';
import {
  TRAIT_LABELS,
  ART_STYLE_LABELS,
  type StageTraitKey,
  type PaletteKey,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import type { IdentityChanges, LookChanges } from '@/utils/characters';

export type DraftSection = 'identity' | 'look' | 'gear';

/** Every field the player can stage, across all three tabs. */
export type DraftKey =
  // identity
  | 'name'
  | 'archetype'
  | 'battleCry'
  | 'signatureColor'
  // look
  | 'artStyle'
  | 'portraitPromptRaw'
  | 'palette'
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression'
  // gear
  | 'signatureItemId';

interface FieldDef {
  key: DraftKey;
  section: DraftSection;
  /** Column on the character row. */
  column: string;
  label: string;
  /** Only the identity fields carry cooldowns worth announcing. */
  priceKey?: EditPriceKey;
}

export const DRAFT_FIELDS: readonly FieldDef[] = [
  {
    key: 'name',
    section: 'identity',
    column: 'name',
    label: 'Name',
    priceKey: 'rename',
  },
  {
    key: 'archetype',
    section: 'identity',
    column: 'archetype',
    label: 'Archetype',
    priceKey: 'archetype',
  },
  {
    key: 'battleCry',
    section: 'identity',
    column: 'battle_cry',
    label: 'Battle cry',
    priceKey: 'battle_cry',
  },
  {
    key: 'signatureColor',
    section: 'identity',
    column: 'signature_color',
    label: 'Signature colour',
    priceKey: 'signature_color',
  },

  { key: 'artStyle', section: 'look', column: 'art_style', label: 'Art style' },
  {
    key: 'portraitPromptRaw',
    section: 'look',
    column: 'portrait_prompt_raw',
    label: 'Description',
  },
  {
    key: 'palette',
    section: 'look',
    column: 'palette_key',
    label: 'Outfit palette',
  },
  { key: 'vibe', section: 'look', column: 'vibe', label: 'Vibe' },
  {
    key: 'silhouette',
    section: 'look',
    column: 'silhouette',
    label: 'Silhouette',
  },
  { key: 'era', section: 'look', column: 'era', label: 'Era' },
  {
    key: 'expression',
    section: 'look',
    column: 'expression',
    label: 'Expression',
  },

  {
    key: 'signatureItemId',
    section: 'gear',
    column: 'signature_item_id',
    label: 'Signature item',
  },
];

export interface DraftChange {
  key: DraftKey;
  section: DraftSection;
  label: string;
  /** Player-facing new value, already formatted. */
  to: string;
  /** Present when saving this field locks it, e.g. "7 days". */
  locksFor?: string;
}

export interface DraftSummary {
  changes: DraftChange[];
  changeCount: number;
  dirty: boolean;
  /** Which tabs carry unsaved edits, for the staged dots. */
  dirtySections: Record<DraftSection, boolean>;
}

/** Staged values. `null` is meaningful for portraitPromptRaw and only there. */
export type DraftValues = Partial<Record<DraftKey, string | null>>;

/**
 * Formats a staged value for the save confirmation.
 *
 * Item ids resolve through `itemName` because a uuid in a confirmation dialog
 * tells the player nothing about what they are about to equip.
 */
function displayValue(
  key: DraftKey,
  value: string | null,
  itemName: (id: string) => string,
): string {
  if (value === null || value === '') return 'None';
  switch (key) {
    case 'archetype':
      return ARCHETYPES[value as ArchetypeId]?.name ?? value;
    case 'artStyle':
      return ART_STYLE_LABELS[value as ArtStyle] ?? value;
    case 'palette':
      return TRAIT_LABELS.palette[value as PaletteKey] ?? value;
    case 'vibe':
      return (
        TRAIT_LABELS.vibe[value as keyof typeof TRAIT_LABELS.vibe] ?? value
      );
    case 'silhouette':
      return (
        TRAIT_LABELS.silhouette[
          value as keyof typeof TRAIT_LABELS.silhouette
        ] ?? value
      );
    case 'era':
      return TRAIT_LABELS.era[value as keyof typeof TRAIT_LABELS.era] ?? value;
    case 'expression':
      return (
        TRAIT_LABELS.expression[
          value as keyof typeof TRAIT_LABELS.expression
        ] ?? value
      );
    case 'signatureItemId':
      return itemName(value);
    case 'portraitPromptRaw':
      return value;
    default:
      return value;
  }
}

export interface ComputeDraftInput {
  character: Record<string, unknown> | null;
  values: DraftValues;
  pricing: EditPricing;
  itemName?: (id: string) => string;
}

const EMPTY: DraftSummary = {
  changes: [],
  changeCount: 0,
  dirty: false,
  dirtySections: { identity: false, look: false, gear: false },
};

/**
 * Pure core of the draft: what actually differs from the saved character, and
 * what saving it will lock.
 *
 * There is no cost arithmetic here any more. Describing a character is free —
 * the money moved to the render — so the only thing a save can cost the player
 * is time: name locks for 7 days, archetype for 14.
 */
export function computeDraft(input: ComputeDraftInput): DraftSummary {
  const { character, values, pricing, itemName = (id) => id } = input;
  if (!character) return EMPTY;

  const changes: DraftChange[] = [];
  const dirtySections: Record<DraftSection, boolean> = {
    identity: false,
    look: false,
    gear: false,
  };

  for (const field of DRAFT_FIELDS) {
    // Presence, not truthiness: null is a real staged value for the prompt.
    if (!(field.key in values)) continue;
    const staged = values[field.key] ?? null;
    const current = (character[field.column] as string | null) ?? null;
    // A field staged back to its saved value is not a change. Writing it would
    // bump appearance_version and tell the player their portrait is out of date
    // over an edit they did not make.
    if (staged === current) continue;

    dirtySections[field.section] = true;
    changes.push({
      key: field.key,
      section: field.section,
      label: field.label,
      to: displayValue(field.key, staged, itemName),
      locksFor: field.priceKey
        ? (describeCooldownLength(
            pricing.prices[field.priceKey]?.cooldownSeconds ?? 0,
          ) ?? undefined)
        : undefined,
    });
  }

  return {
    changes,
    changeCount: changes.length,
    dirty: changes.length > 0,
    dirtySections,
  };
}

export interface UseCharacterEditDraft extends DraftSummary {
  values: DraftValues;
  stage: (key: DraftKey, value: string | null) => void;
  clear: () => void;
  activeMode: CharacterEditMode;
  writtenText: string;
  setMode: (mode: CharacterEditMode) => void;
  section: DraftSection;
  setSection: (section: DraftSection) => void;
  scrollPositions: Record<DraftSection, number>;
  setScrollPosition: (section: DraftSection, position: number) => void;
  expandedGroups: Record<string, boolean>;
  setExpandedGroup: (group: string, expanded: boolean) => void;
  ready: boolean;
  restored: boolean;
  persistenceError: string | null;
  flush: () => Promise<void>;
  discard: () => Promise<void>;
  acknowledge: (keys: DraftKey[], submitted: DraftValues) => Promise<void>;
  conflicts: DraftConflict[];
  resolveConflict: (key: DraftKey, choice: 'saved' | 'draft') => void;
  /** Batched payload for the free `identity` edit, or null when unchanged. */
  identityPayload: IdentityChanges | null;
  /** Batched payload for the free `look` edit (look + gear), or null. */
  lookPayload: LookChanges | null;
}

export interface CharacterEditDraftOptions {
  accountId?: string;
  characterId?: string;
  initialSection?: DraftSection;
}

export interface DraftConflict {
  key: DraftKey;
  label: string;
  saved: string | null;
  draft: string | null;
}

type Character = Record<string, unknown> | null;
interface DraftSession {
  key: string;
  scope: CharacterEditDraftScope | null;
  character: Character;
  data: CharacterEditDraft;
  ready: boolean;
  restored: boolean;
  error: string | null;
  active: boolean;
  pendingDelete: boolean;
  hasDraft: boolean;
  needsSave: boolean;
  revision: number;
  hydration?: Promise<void>;
}

function characterValues(character: Character): DraftValues {
  if (!character) return {};
  return Object.fromEntries(
    DRAFT_FIELDS.map(({ key, column }) => [
      key,
      (character[column] as string | null) ?? null,
    ]),
  );
}

function emptyDraft(
  character: Character,
  section: DraftSection,
): CharacterEditDraft {
  const prompt =
    typeof character?.portrait_prompt_raw === 'string'
      ? character.portrait_prompt_raw
      : '';
  return {
    values: {},
    baseline: characterValues(character),
    acknowledged: {},
    activeMode: prompt ? 'prompt' : 'guided',
    writtenText: prompt,
    section,
    scrollPositions: { identity: 0, look: 0, gear: 0 },
    expandedGroups: {},
  };
}

/** Hold confirmed writes above stale subscription data until the row catches up. */
function savedValues(
  data: CharacterEditDraft,
  character: Character,
): DraftValues {
  const saved = characterValues(character);
  for (const { key } of DRAFT_FIELDS) {
    const ack = data.acknowledged[key];
    if (ack && ack.previous.includes(saved[key] ?? null))
      saved[key] = ack.value;
  }
  return saved;
}

function reconcile(
  data: CharacterEditDraft,
  character: Character,
): CharacterEditDraft {
  if (!character) return data;
  const saved = savedValues(data, character);
  const next = {
    ...data,
    values: { ...data.values },
    baseline: { ...data.baseline },
    acknowledged: { ...data.acknowledged },
  };
  const incoming = characterValues(character);
  for (const { key } of DRAFT_FIELDS) {
    const ack = data.acknowledged[key];
    if (
      ack &&
      (incoming[key] === ack.value ||
        !ack.previous.includes(incoming[key] ?? null))
    )
      delete next.acknowledged[key];
    if (key in next.values && next.values[key] === saved[key])
      delete next.values[key];
    if (!(key in next.values)) {
      // Refresh untouched authoring state, but retain any independently written text.
      if (
        key === 'portraitPromptRaw' &&
        data.writtenText === (data.baseline[key] ?? '') &&
        data.activeMode === (data.baseline[key] ? 'prompt' : 'guided')
      ) {
        next.writtenText = saved[key] ?? '';
        next.activeMode = saved[key] ? 'prompt' : 'guided';
      }
      next.baseline[key] = saved[key] ?? null;
    } else if (!(key in next.baseline)) {
      next.baseline[key] = saved[key] ?? null;
    }
  }
  return JSON.stringify(next) === JSON.stringify(data) ? data : next;
}

/** One durable, account-and-fighter-scoped draft across all editing tabs. */
export function useCharacterEditDraft(
  character: Character,
  pricing: EditPricing,
  itemName?: (id: string) => string,
  options?: CharacterEditDraftOptions,
): UseCharacterEditDraft {
  const [, render] = useState(0);
  const scopeKey = options
    ? JSON.stringify([options.accountId ?? null, options.characterId ?? null])
    : 'unscoped';
  const current = useRef<DraftSession | null>(null);
  if (!current.current || current.current.key !== scopeKey) {
    current.current = {
      key: scopeKey,
      scope:
        options?.accountId && options.characterId
          ? { accountId: options.accountId, characterId: options.characterId }
          : null,
      character,
      data: emptyDraft(character, options?.initialSection ?? 'identity'),
      ready: !options,
      restored: false,
      error: null,
      active: true,
      pendingDelete: false,
      hasDraft: false,
      needsSave: false,
      revision: 0,
    };
  }
  const session = current.current;
  session.character = character;
  const notify = useCallback((target: DraftSession) => {
    if (target.active && current.current === target)
      render((revision) => revision + 1);
  }, []);
  const isCurrent = useCallback(
    (target: DraftSession) => target.active && current.current === target,
    [],
  );

  const hydrate = useCallback(
    async (target: DraftSession): Promise<void> => {
      if (target.ready) return;
      if (!target.scope)
        throw new Error('Character draft scope is not available');
      if (target.hydration) return target.hydration;
      const revision = target.revision;
      target.hydration = (async () => {
        try {
          const restored = await characterEditDrafts.read(target.scope!);
          if (!isCurrent(target) || target.revision !== revision) return;
          target.data = reconcile(
            restored ?? emptyDraft(target.character, target.data.section),
            target.character,
          );
          target.ready = true;
          target.restored = restored !== null;
          target.hasDraft = restored !== null;
          target.needsSave = restored !== null && target.data !== restored;
          target.error = null;
          notify(target);
        } catch (error) {
          if (isCurrent(target) && target.revision === revision) {
            target.error =
              'Couldn’t restore your saved draft. Retry before writing.';
            notify(target);
          }
          throw error;
        } finally {
          target.hydration = undefined;
        }
      })();
      return target.hydration;
    },
    [isCurrent, notify],
  );

  const persist = useCallback(
    async (target: DraftSession): Promise<void> => {
      if (!target.scope || !target.ready) return;
      const revision = target.revision;
      const deleting = target.pendingDelete;
      const writing = target.needsSave;
      const data = target.data;
      try {
        // Enqueue synchronously: an older operation must not schedule writes after discard.
        const work = deleting
          ? characterEditDrafts.clear(target.scope)
          : writing
            ? characterEditDrafts.save(target.scope, data)
            : characterEditDrafts.flush(target.scope);
        await work;
        if (target.revision === revision) {
          target.pendingDelete = false;
          target.needsSave = false;
          target.error = null;
          notify(target);
        }
      } catch (error) {
        if (target.revision === revision) {
          target.error = deleting
            ? 'Couldn’t remove the saved draft. Retry to finish deleting it.'
            : 'Draft is not saved on this device. Keep this screen open and retry.';
          notify(target);
        }
        throw error;
      }
    },
    [notify],
  );

  const update = useCallback(
    (change: (data: CharacterEditDraft) => CharacterEditDraft) => {
      if (!isCurrent(session) || !session.ready) return;
      session.data = change(session.data);
      session.revision += 1;
      session.hasDraft = true;
      session.needsSave = true;
      // New user input after discard is a new draft; the queued deletion remains before it.
      session.pendingDelete = false;
      notify(session);
      void persist(session).catch(() => {});
    },
    [isCurrent, notify, persist, session],
  );

  const flush = useCallback(async () => {
    if (!isCurrent(session)) return;
    if (!session.ready) await hydrate(session);
    if (isCurrent(session)) await persist(session);
  }, [hydrate, isCurrent, persist, session]);

  useEffect(() => {
    session.active = true;
    if (session.scope && !session.ready) void hydrate(session).catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush().catch(() => {});
    });
    return () => {
      session.active = false;
      subscription.remove();
    };
  }, [flush, hydrate, session]);

  useEffect(() => {
    if (!session.ready) return;
    const next = reconcile(session.data, character);
    if (next !== session.data) {
      session.data = next;
      // Refresh existing drafts only; merely loading a fighter does not create one.
      if (session.hasDraft) {
        session.revision += 1;
        session.needsSave = true;
      }
      notify(session);
    }
    if (session.needsSave) void persist(session).catch(() => {});
  }, [character, notify, persist, session, session.ready]);

  const stage = useCallback(
    (key: DraftKey, value: string | null) => {
      update((data) => {
        const next = { ...data, values: { ...data.values, [key]: value } };
        if (key === 'portraitPromptRaw') {
          if (value !== null) next.writtenText = value;
          next.values.portraitPromptRaw =
            data.activeMode === 'prompt' ? next.writtenText : null;
        }
        return reconcile(next, session.character);
      });
    },
    [session, update],
  );

  const setMode = useCallback(
    (activeMode: CharacterEditMode) => {
      update((data) =>
        reconcile(
          {
            ...data,
            activeMode,
            values: {
              ...data.values,
              portraitPromptRaw:
                activeMode === 'prompt' ? data.writtenText : null,
            },
          },
          session.character,
        ),
      );
    },
    [session, update],
  );

  const setSection = useCallback(
    (section: DraftSection) => update((data) => ({ ...data, section })),
    [update],
  );
  const setScrollPosition = useCallback(
    (section: DraftSection, position: number) => {
      if (!Number.isFinite(position) || position < 0) return;
      update((data) => ({
        ...data,
        scrollPositions: { ...data.scrollPositions, [section]: position },
      }));
    },
    [update],
  );
  const setExpandedGroup = useCallback(
    (group: string, expanded: boolean) => {
      update((data) => ({
        ...data,
        expandedGroups: { ...data.expandedGroups, [group]: expanded },
      }));
    },
    [update],
  );

  const discard = useCallback(async () => {
    if (!isCurrent(session)) return;
    if (!session.scope && session.key !== 'unscoped')
      throw new Error('Character draft scope is not available');
    session.data = emptyDraft(session.character, session.data.section);
    session.revision += 1;
    session.ready = true;
    session.pendingDelete = true;
    session.hasDraft = false;
    session.needsSave = false;
    session.restored = false;
    notify(session);
    await persist(session);
  }, [isCurrent, notify, persist, session]);
  const clear = useCallback(() => {
    void discard().catch(() => {});
  }, [discard]);

  const acknowledge = useCallback(
    async (keys: DraftKey[], submitted: DraftValues) => {
      if (!isCurrent(session) || !session.ready) return;
      const data = session.data;
      const next = {
        ...data,
        values: { ...data.values },
        baseline: { ...data.baseline },
        acknowledged: { ...data.acknowledged },
      };
      const incoming = characterValues(session.character);
      for (const key of keys) {
        if (!(key in submitted)) continue;
        const value = submitted[key] ?? null;
        next.baseline[key] = value;
        next.acknowledged[key] = {
          value,
          previous: [
            ...new Set([
              ...(data.acknowledged[key]?.previous ?? []),
              data.acknowledged[key]?.value ?? incoming[key] ?? null,
              incoming[key] ?? null,
            ]),
          ],
        };
        if (next.values[key] === value) delete next.values[key];
      }
      session.data = next;
      session.revision += 1;
      session.pendingDelete = false;
      session.hasDraft = true;
      session.needsSave = true;
      notify(session);
      await persist(session);
    },
    [isCurrent, notify, persist, session],
  );

  const resolveConflict = useCallback(
    (key: DraftKey, choice: 'saved' | 'draft') => {
      update((data) => {
        const saved = savedValues(data, session.character)[key] ?? null;
        const next = {
          ...data,
          values: { ...data.values },
          baseline: { ...data.baseline, [key]: saved },
        };
        if (choice === 'saved') {
          delete next.values[key];
          if (key === 'portraitPromptRaw') {
            next.activeMode = saved ? 'prompt' : 'guided';
            if (saved !== null) next.writtenText = saved;
          }
        }
        return next;
      });
    },
    [session, update],
  );

  const {
    values,
    activeMode,
    writtenText,
    section,
    scrollPositions,
    expandedGroups,
  } = session.data;
  const saved = savedValues(session.data, character);
  const conflicts: DraftConflict[] = character
    ? DRAFT_FIELDS.flatMap(({ key, label }) =>
        key in values &&
        values[key] !== saved[key] &&
        session.data.baseline[key] !== saved[key]
          ? [
              {
                key,
                label,
                saved: saved[key] ?? null,
                draft: values[key] ?? null,
              },
            ]
          : [],
      )
    : [];
  const effectiveCharacter = character ? { ...character } : null;
  if (effectiveCharacter) {
    for (const { key, column } of DRAFT_FIELDS)
      effectiveCharacter[column] = saved[key] ?? null;
  }
  const summary = computeDraft({
    character: effectiveCharacter,
    values,
    pricing,
    itemName,
  });

  const identityPayload = useMemo(() => {
    const staged = summary.changes.filter((c) => c.section === 'identity');
    if (staged.length === 0) return null;
    const payload: IdentityChanges = {};
    for (const c of staged) {
      const v = values[c.key];
      if (typeof v !== 'string') continue;
      if (c.key === 'name') payload.name = v;
      if (c.key === 'archetype') payload.archetype = v;
      if (c.key === 'battleCry') payload.battleCry = v;
      if (c.key === 'signatureColor') payload.signatureColor = v;
    }
    return payload;
  }, [summary.changes, values]);

  const lookPayload = useMemo(() => {
    const staged = summary.changes.filter(
      (c) => c.section === 'look' || c.section === 'gear',
    );
    if (staged.length === 0) return null;
    const payload: LookChanges = {};
    for (const c of staged) {
      const v = values[c.key];
      switch (c.key) {
        case 'artStyle':
          if (typeof v === 'string') payload.artStyle = v as ArtStyle;
          break;
        case 'palette':
          if (typeof v === 'string') payload.palette = v as PaletteKey;
          break;
        case 'vibe':
          if (typeof v === 'string') payload.vibe = v;
          break;
        case 'silhouette':
          if (typeof v === 'string') payload.silhouette = v;
          break;
        case 'era':
          if (typeof v === 'string') payload.era = v;
          break;
        case 'expression':
          if (typeof v === 'string') payload.expression = v;
          break;
        case 'signatureItemId':
          if (typeof v === 'string') payload.signatureItemId = v;
          break;
        // The one field whose null must survive: it is how a player returns
        // from "your own words" to the guided traits.
        case 'portraitPromptRaw':
          payload.portraitPromptRaw = v ?? null;
          break;
      }
    }
    return payload;
  }, [summary.changes, values]);

  return {
    ...summary,
    values,
    stage,
    clear,
    identityPayload,
    lookPayload,
    activeMode,
    writtenText,
    setMode,
    section,
    setSection,
    scrollPositions,
    setScrollPosition,
    expandedGroups,
    setExpandedGroup,
    ready: session.ready,
    restored: session.restored,
    persistenceError: session.error,
    flush,
    discard,
    acknowledge,
    conflicts,
    resolveConflict,
  };
}

export type { StageTraitKey };
