import { supabase } from './supabase';
import type { CatalogSignatureItem } from './characters';

/** Retained equipment is readable independently of the active shop catalogue. */
export async function loadEquippedSignatureItem(
  characterId: string,
  accountId: string,
): Promise<CatalogSignatureItem | null> {
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .select('signature_item_id')
    .eq('id', characterId)
    .eq('profile_id', accountId)
    .maybeSingle();
  if (characterError) throw new Error(characterError.message);
  if (!character?.signature_item_id) return null;
  const { data: item, error } = await supabase
    .from('signature_items')
    .select(
      'id,profile_id,kind,name,description,item_class,image_path,moderation_status',
    )
    .eq('id', character.signature_item_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // RLS remains authoritative. Never use another account's custom item or rejected art.
  if (
    !item ||
    item.moderation_status === 'rejected' ||
    (item.kind === 'custom' && item.profile_id !== accountId)
  )
    return null;
  let iconUrl: string | null = null;
  if (item.image_path) {
    if (item.kind === 'custom') {
      const signed = await supabase.storage
        .from('signature-items-custom')
        .createSignedUrl(item.image_path, 3600);
      iconUrl = signed.data?.signedUrl ?? null;
    } else {
      iconUrl = supabase.storage
        .from('signature-items-catalog')
        .getPublicUrl(item.image_path).data.publicUrl;
    }
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    itemClass: item.item_class,
    isCustom: item.kind === 'custom',
    iconUrl: iconUrl ?? undefined,
  };
}
