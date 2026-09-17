import { RENDERABLE_TYPES } from './renderable-types.ts';
export function contractVersion(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}
export function availableToClient(
  item: { cosmetic_type: string; min_client_contract_version?: number },
  version: number,
): boolean {
  return (
    RENDERABLE_TYPES.includes(item.cosmetic_type) &&
    (item.min_client_contract_version ?? 1) <= version
  );
}
export function equipPolicy(type: string): boolean {
  return RENDERABLE_TYPES.includes(type) && type !== 'color';
}
export function catalogFromReads<
  T extends {
    id: string;
    cosmetic_type: string;
    min_client_contract_version?: number;
  },
>(
  catalog: { data: T[] | null; error: unknown },
  owned: { data: { cosmetic_id: string }[] | null; error: unknown },
  version: number,
) {
  if (catalog.error || catalog.data === null)
    throw new Error('Failed to read cosmetic catalog');
  if (owned.error || owned.data === null)
    throw new Error('Failed to read cosmetic ownership');
  const ids = new Set(owned.data.map((row) => row.cosmetic_id));
  return {
    items: catalog.data
      .filter((item) => availableToClient(item, version))
      .map((item) => ({ ...item, owned: ids.has(item.id) })),
    owned_count: ids.size,
  };
}
export async function purchaseResponse<T>(
  result: { success?: boolean; error?: string; [key: string]: unknown } | null,
  slug: string,
  refresh: () => Promise<{ items: T[]; owned_count: number }>,
) {
  const acknowledged =
    result?.success === true || result?.error === 'already_owned';
  const acknowledgment = {
    ...result,
    success: acknowledged,
    ...(acknowledged
      ? {
          error: undefined,
          cosmetic_slug: slug,
          already_owned: result?.error === 'already_owned',
        }
      : {}),
  };
  try {
    return {
      ...acknowledgment,
      ...(await refresh()),
      catalog_refresh_required: false,
    };
  } catch {
    // The ownership transaction is already authoritative; refreshing cannot undo it.
    return {
      ...acknowledgment,
      items: [] as T[],
      owned_count: 0,
      catalog_refresh_required: true,
    };
  }
}
