import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { EditError } from './editErrors';
import {
  generateIdempotencyKey,
  renderLook,
  signPortraitUrl,
  type PortraitJobResult,
  type PortraitResultReferences,
} from './characters';

export type PaidPortraitMode = 'render' | 'random';
export interface PortraitOperationContext {
  previousFighterId?: string | null;
  previousAvatarId?: string | null;
}
export interface PortraitOperation
  extends PortraitResultReferences, PortraitOperationContext {
  accountId: string;
  characterId: string;
  requestKey: string;
  mode: PaidPortraitMode;
  startedAt: string;
  status: 'pending' | 'succeeded' | 'failed';
  error?: string;
}
export interface PortraitOperationOutcome {
  operation: PortraitOperation;
  result: PortraitJobResult | null;
  error: string | null;
}

const storageKey = (accountId: string, characterId: string) =>
  `prompt-wars:paid-portrait:v1:${accountId}:${characterId}`;
const storageTails = new Map<string, Promise<unknown>>();
// A failed disk write must not erase a confirmed outcome while this process is
// alive. Recovery retries only this local write, never the paid request.
const unpersistedTerminals = new Map<string, PortraitOperation>();
function withStorage<T>(
  accountId: string,
  characterId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = storageKey(accountId, characterId);
  const next = (storageTails.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(work);
  storageTails.set(key, next);
  void next
    .finally(() => {
      if (storageTails.get(key) === next) storageTails.delete(key);
    })
    .catch(() => {});
  return next;
}

async function readStored(
  accountId: string,
  characterId: string,
  persistBuffered = true,
): Promise<PortraitOperation | null> {
  const key = storageKey(accountId, characterId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    unpersistedTerminals.delete(key);
    return null;
  }
  const value = JSON.parse(raw) as PortraitOperation;
  if (
    value.accountId !== accountId ||
    value.characterId !== characterId ||
    typeof value.requestKey !== 'string' ||
    !value.requestKey ||
    typeof value.startedAt !== 'string' ||
    !['render', 'random'].includes(value.mode) ||
    !['pending', 'succeeded', 'failed'].includes(value.status)
  ) {
    throw new Error(
      'Could not read the saved render. Reopen Edit Look to check it.',
    );
  }
  const buffered = unpersistedTerminals.get(key);
  if (!buffered) return value;
  if (!sameOperation(value, buffered)) {
    unpersistedTerminals.delete(key);
    return value;
  }
  const next = mergeOperation(value, buffered);
  if (persistBuffered) await persistOperation(next);
  return next;
}

export function readPortraitOperation(accountId: string, characterId: string) {
  return withStorage(accountId, characterId, () =>
    readStored(accountId, characterId),
  );
}

function sameOperation(a: PortraitOperation, b: PortraitOperation) {
  return (
    a.accountId === b.accountId &&
    a.characterId === b.characterId &&
    a.requestKey === b.requestKey
  );
}

function mergeOperation(
  current: PortraitOperation,
  patch: Partial<PortraitOperation>,
) {
  const next = { ...current, ...patch };
  // A stale failure/check can never demote authoritative success. Likewise, an
  // earlier pending response cannot undo a confirmed rejection or failed job.
  if (current.status === 'succeeded' && patch.status !== 'succeeded') {
    next.status = 'succeeded';
    if (patch.status) next.error = current.error;
  } else if (current.status === 'failed' && patch.status === 'pending') {
    next.status = 'failed';
    next.error = current.error;
  }
  if (current.portraitId) next.portraitId = current.portraitId;
  if (current.avatarPortraitId) {
    next.avatarPortraitId = current.avatarPortraitId;
    next.avatarPending = false;
  }
  return next;
}

async function persistOperation(operation: PortraitOperation) {
  const key = storageKey(operation.accountId, operation.characterId);
  if (operation.status !== 'pending') unpersistedTerminals.set(key, operation);
  await AsyncStorage.setItem(key, JSON.stringify(operation));
  if (unpersistedTerminals.get(key) === operation)
    unpersistedTerminals.delete(key);
}

async function assertAccount(accountId: string) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || user.id !== accountId)
    throw new Error('Your account changed. Reopen Edit Look to continue.');
}

async function updateOperation(
  expected: PortraitOperation,
  patch: Partial<PortraitOperation>,
) {
  return withStorage(expected.accountId, expected.characterId, async () => {
    const current = await readStored(
      expected.accountId,
      expected.characterId,
      false,
    );
    if (!current || !sameOperation(current, expected))
      throw new Error('A different render needs checking. Reopen Edit Look.');
    const next = mergeOperation(current, patch);
    await persistOperation(next);
    return next;
  });
}

/** Only an explicit acknowledgement of a confirmed outcome releases the slot. */
export function dismissPortraitOperation(expected: PortraitOperation) {
  return withStorage(expected.accountId, expected.characterId, async () => {
    const current = await readStored(expected.accountId, expected.characterId);
    if (
      !current ||
      !sameOperation(current, expected) ||
      current.status !== expected.status ||
      current.status === 'pending'
    )
      return false;
    await AsyncStorage.removeItem(
      storageKey(current.accountId, current.characterId),
    );
    return true;
  });
}

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Could not check this render. Try again.';

/**
 * These paid regenerate-portrait rejections occur before spend_credits/jobs.
 * Moderation also has a post-charge provider path (HTTP 502), so its code alone
 * is insufficient: only the prompt precheck's HTTP 422 proves no charge.
 */
function isDefinitePortraitRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const structured = error as Error & {
    status?: unknown;
    body?: { error?: { code?: unknown } } | null;
  };
  const code =
    error instanceof EditError ? error.code : structured.body?.error?.code;
  const expectedStatus: Record<string, number> = {
    bad_request: 400,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    battle_locked: 409,
    insufficient_credits: 402,
    moderation_rejected: 422,
  };
  if (code === 'portrait_not_dispatched' && error instanceof EditError)
    return structured.status === undefined;
  if (typeof code !== 'string' || !Object.hasOwn(expectedStatus, code))
    return false;
  if (structured.status !== undefined)
    return structured.status === expectedStatus[code];
  return error instanceof EditError && code !== 'moderation_rejected';
}

/** This is the only paid dispatch in recovery. It is never called by a status check. */
export async function startPortraitOperation(
  accountId: string,
  characterId: string,
  mode: PaidPortraitMode,
  context: PortraitOperationContext = {},
): Promise<PortraitOperationOutcome> {
  await assertAccount(accountId);
  let operation: PortraitOperation = {
    ...context,
    accountId,
    characterId,
    mode,
    requestKey: generateIdempotencyKey(),
    startedAt: new Date().toISOString(),
    status: 'pending',
  };
  await withStorage(accountId, characterId, async () => {
    if (await readStored(accountId, characterId))
      throw new Error(
        'Check or acknowledge your previous render before drawing again.',
      );
    // A failed durable write aborts BEFORE the chargeable request.
    await AsyncStorage.setItem(
      storageKey(accountId, characterId),
      JSON.stringify(operation),
    );
  });
  try {
    const result = await renderLook({
      characterId,
      mode,
      accountId,
      requestKey: operation.requestKey,
      onReferences: async (references) => {
        operation = {
          ...operation,
          ...references,
          status: references.completed ? 'succeeded' : operation.status,
        };
        operation = await updateOperation(operation, operation);
      },
    });
    operation = await updateOperation(operation, {
      error: undefined,
    });
    return {
      operation,
      result: operation.status === 'succeeded' ? result : null,
      error: null,
    };
  } catch (error) {
    // Only a structured, proven rejection releases the purchase for acknowledgement.
    // Transport failures, 5xx, and unknown responses retain the durable request key.
    const rejected =
      operation.status === 'pending' &&
      !operation.jobId &&
      !operation.portraitId &&
      isDefinitePortraitRejection(error);
    operation = {
      ...operation,
      status: rejected ? 'failed' : operation.status,
      error: errorMessage(error),
    };
    try {
      operation = await updateOperation(operation, operation);
    } catch {
      /* original reservation remains */
    }
    return { operation, result: null, error: operation.error ?? null };
  }
}

interface JobEvidence {
  id: string;
  idempotency_key: string;
  status: string;
  result_portrait_id?: string | null;
  seed?: string | number;
  error_message?: string | null;
}

/** Query only the caller's own audit/jobs; an absent row is still ambiguous. */
async function readEvidence(
  operation: PortraitOperation,
): Promise<Partial<PortraitOperation>> {
  const baseKey = [
    'render',
    operation.accountId,
    operation.characterId,
    operation.requestKey,
  ].join('_');
  const { data: edit, error: editError } = await supabase
    .from('character_edits')
    .select('after,credits_spent')
    .eq('profile_id', operation.accountId)
    .eq('character_id', operation.characterId)
    .eq('idempotency_key', baseKey)
    .maybeSingle();
  if (editError)
    throw new Error(editError.message || 'Could not check render status.');
  if (edit?.after?.portrait_id) {
    return {
      status: 'succeeded',
      portraitId: edit.after.portrait_id,
      avatarPortraitId: edit.after.avatar_portrait_id ?? null,
      avatarPending: !edit.after.avatar_portrait_id,
      creditsSpent: edit.credits_spent,
    };
  }

  const { data: rows, error } = await supabase
    .from('portrait_jobs')
    .select('id,idempotency_key,status,result_portrait_id,seed,error_message')
    .eq('profile_id', operation.accountId)
    .eq('character_id', operation.characterId)
    .like('idempotency_key', `${baseKey.replace(/[\\%_]/g, '\\$&')}%`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Could not check render status.');
  // The LIKE prefix is only a candidate lookup. Exact suffix validation prevents
  // adopting another request whose key happens to begin with this key.
  const jobs = ((rows ?? []) as JobEvidence[]).filter((job) => {
    const suffix = job.idempotency_key?.slice(baseKey.length);
    return (
      job.idempotency_key?.startsWith(baseKey) &&
      /^(?:_r\d+)?:(?:fighter|avatar)$/.test(suffix)
    );
  });
  const fighter =
    jobs.find((job) => job.id === operation.jobId) ??
    jobs.find((job) => job.idempotency_key.endsWith(':fighter'));
  const attempt = fighter?.idempotency_key.replace(/:fighter$/, '');
  const avatar = jobs.find(
    (job) => job.idempotency_key === `${attempt}:avatar`,
  );
  const references: PortraitResultReferences = {
    ...(fighter && { jobId: fighter.id }),
    ...(avatar && { avatarJobId: avatar.id }),
    ...(fighter?.seed != null && { seed: String(fighter.seed) }),
  };
  if (fighter?.status === 'succeeded' && fighter.result_portrait_id) {
    return {
      ...references,
      // Job completion precedes publishing the character and finishing its avatar.
      // Only the audit or a completed HTTP response settles the paid operation.
      portraitId: fighter.result_portrait_id,
      avatarPortraitId:
        avatar?.status === 'succeeded'
          ? (avatar.result_portrait_id ?? null)
          : null,
      avatarPending:
        avatar?.status !== 'succeeded' || !avatar.result_portrait_id,
    };
  }
  if (
    fighter &&
    ['failed', 'cancelled', 'moderation_rejected'].includes(fighter.status)
  ) {
    return {
      ...references,
      status: 'failed',
      error: fighter.error_message || 'This render could not be completed.',
    };
  }
  return references;
}

async function resolveOwnedImage(
  operation: PortraitOperation,
  portraitId: string,
) {
  const { data, error } = await supabase
    .from('character_portraits')
    .select('image_path,moderation_status')
    .eq('profile_id', operation.accountId)
    .eq('character_id', operation.characterId)
    .eq('id', portraitId)
    .maybeSingle();
  if (error || !data?.image_path)
    throw new Error(
      error?.message || 'The image is not available yet. Try checking again.',
    );
  if (data.moderation_status !== 'approved')
    throw new Error('This image is not available for display.');
  return signPortraitUrl(data.image_path);
}

/** A media retry signs existing result IDs. It can never create or charge for art. */
export async function loadPortraitOperationResult(
  operation: PortraitOperation,
): Promise<PortraitJobResult | null> {
  if (operation.status !== 'succeeded' || !operation.portraitId) return null;
  await assertAccount(operation.accountId);
  const [imageUrl, avatarImageUrl] = await Promise.all([
    resolveOwnedImage(operation, operation.portraitId),
    operation.avatarPortraitId
      ? resolveOwnedImage(operation, operation.avatarPortraitId).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);
  await assertAccount(operation.accountId);
  return {
    jobId: operation.jobId ?? '',
    portraitId: operation.portraitId,
    imageUrl,
    seed: operation.seed ?? '',
    status: 'succeeded',
    avatarPortraitId: operation.avatarPortraitId,
    avatarImageUrl,
    avatarJobId: operation.avatarJobId,
    avatarPending: operation.avatarPending,
    creditsSpent: operation.creditsSpent,
  };
}

export async function checkPortraitOperation(
  expected: PortraitOperation,
): Promise<PortraitOperationOutcome> {
  await assertAccount(expected.accountId);
  const current = await readPortraitOperation(
    expected.accountId,
    expected.characterId,
  );
  if (!current || !sameOperation(current, expected))
    throw new Error('A different render needs checking. Reopen Edit Look.');
  const evidence = await readEvidence(current);
  await assertAccount(expected.accountId);
  let operation = await updateOperation(current, {
    error:
      current.status === 'failed' && evidence.status !== 'succeeded'
        ? current.error
        : undefined,
    ...evidence,
  });
  try {
    const result = await loadPortraitOperationResult(operation);
    return { operation, result, error: operation.error ?? null };
  } catch (error) {
    operation = await updateOperation(operation, {
      error: errorMessage(error),
    });
    return { operation, result: null, error: operation.error ?? null };
  }
}
