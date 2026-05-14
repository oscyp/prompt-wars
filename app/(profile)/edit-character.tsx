import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
  regeneratePortrait,
  listSignatureItemsCatalog,
  createCustomSignatureItem,
  getPortraitFallbackUri,
  CatalogSignatureItem,
} from '@/utils/characters';
import {
  PALETTES,
  PALETTE_HEX,
  TRAIT_LABELS,
  PaletteKey,
  ItemClass,
  ITEM_CLASSES,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  Vibe,
  Silhouette,
  Era,
  Expression,
} from '@/constants/CharacterTraits';
import { ArchetypeId } from '@/constants/Archetypes';
import {
  PortraitPreview,
  ItemGrid,
  TraitPicker,
  TraitOption,
} from '@/components';

/**
 * Hardcoded mirror of backend seed pricing. Backend remains source of truth
 * and will reject mismatched calls — these values are display-only.
 */
const EDIT_PRICES = {
  battleCry: 0,
  signatureColor: 0,
  signatureItem: 0,
  customizeItem: 0,
  regeneratePortrait: 1,
  rePromptPortrait: 2,
  swapTrait: 1,
  rerollAllTraits: 2,
} as const;

interface CharacterRow {
  id: string;
  name: string;
  archetype: ArchetypeId;
  battle_cry: string;
  signature_color: string;
  signature_item_id: string | null;
  portrait_id: string | null;
  portrait_seed: number | null;
  vibe: Vibe | null;
  silhouette: Silhouette | null;
  palette_key: PaletteKey | null;
  era: Era | null;
  expression: Expression | null;
  last_edited_at: string | null;
}

export default function EditCharacterScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const { user } = useAuth();

  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const loadCharacter = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('characters')
        .select(
          'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,last_edited_at',
        )
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      setCharacter(data as CharacterRow | null);

      if (data?.portrait_id) {
        const { data: portrait } = await supabase
          .from('character_portraits')
          .select('image_path')
          .eq('id', data.portrait_id)
          .maybeSingle();
        const imagePath =
          (portrait as { image_path: string } | null)?.image_path ?? null;
        if (imagePath) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('character-portraits')
            .createSignedUrl(imagePath, 600);
          setPortraitUrl(signedError ? null : (signed?.signedUrl ?? null));
        } else {
          setPortraitUrl(null);
        }
      } else {
        setPortraitUrl(null);
      }
    } catch (err) {
      console.error('Failed to load character:', err);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to load character.',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCharacter();
  }, [loadCharacter]);

  const runEdit = useCallback(
    async (
      key: string,
      changes: Parameters<typeof editCharacter>[0]['changes'],
      successMsg: string,
    ) => {
      if (!character) return;
      setBusyKey(key);
      try {
        const result = await editCharacter({
          characterId: character.id,
          changes,
        });
        const creditsLabel =
          result.credits_spent === 0
            ? 'free'
            : `${result.credits_spent} credit${result.credits_spent === 1 ? '' : 's'} spent`;
        showToast(`${successMsg} · ${creditsLabel}`);
        await loadCharacter();
      } catch (err) {
        console.error('Failed to edit character', { key, changes, err });
        Alert.alert(
          'Edit failed',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, showToast],
  );

  const runPortraitRender = useCallback(async () => {
    if (!character) return;
    setBusyKey('regeneratePortrait');
    try {
      if (character.portrait_seed === null) {
        await generatePortrait({
          characterId: character.id,
          archetype: character.archetype,
          mode: 'guided',
          traits: {
            vibe: character.vibe ?? undefined,
            silhouette: character.silhouette ?? undefined,
            palette: character.palette_key ?? undefined,
            era: character.era ?? undefined,
            expression: character.expression ?? undefined,
          },
        });
        showToast('Portrait generated');
      } else {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
        });
        showToast('Portrait regenerated · 1 credit spent');
      }
      await loadCharacter();
    } catch (err) {
      console.error('Failed to render portrait from edit screen', {
        characterId: character.id,
        hasPortraitSeed: character.portrait_seed !== null,
        portraitId: character.portrait_id,
        err,
      });
      Alert.alert(
        character.portrait_seed === null
          ? 'Could not generate portrait'
          : 'Edit failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusyKey(null);
    }
  }, [character, loadCharacter, showToast]);

  const runRePromptPortrait = useCallback(
    async (prompt: string) => {
      if (!character) return;
      setBusyKey('rePromptPortrait');
      try {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
          portraitPromptRaw: prompt,
        });
        showToast(`Portrait re-prompted · ${EDIT_PRICES.rePromptPortrait} credits spent`);
        await loadCharacter();
      } catch (err) {
        console.error('Failed to re-prompt portrait', {
          characterId: character.id,
          prompt,
          err,
        });
        Alert.alert(
          'Edit failed',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, showToast],
  );

  const hasInitialPortraitSeed = character?.portrait_seed !== null;

  const fallbackUri = useMemo(() => {
    if (!character) return '';
    return getPortraitFallbackUri({
      archetype: character.archetype,
      signatureColor: character.signature_color,
    });
  }, [character]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!character) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.h1, { color: colors.text }]}>
          No character yet.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/create-character')}
          accessibilityRole="button"
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary, marginTop: Spacing.lg },
          ]}
        >
          <Text style={styles.primaryBtnText}>Create your character</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { color: colors.text }]}>Edit character</Text>
        <PortraitPreview
          uri={portraitUrl ?? fallbackUri}
          size={160}
          caption={character.name}
        />

        <BattleCryRow
          character={character}
          busy={busyKey === 'battleCry'}
          onSave={(v) =>
            runEdit('battleCry', { battleCry: v }, 'Battle cry updated')
          }
        />

        <SignatureColorRow
          character={character}
          busy={busyKey === 'signatureColor'}
          onSave={(v) =>
            runEdit('signatureColor', { signatureColor: v }, 'Color updated')
          }
        />

        <SignatureItemRow
          character={character}
          busy={busyKey === 'signatureItem'}
          onSave={(id) =>
            runEdit(
              'signatureItem',
              { signatureItemId: id },
              'Signature item updated',
            )
          }
        />

        <ActionRow
          title={
            hasInitialPortraitSeed ? 'Regenerate portrait' : 'Generate portrait'
          }
          subtitle={
            hasInitialPortraitSeed
              ? 'Keep your traits, get a new render.'
              : 'Create your first character render.'
          }
          cost={hasInitialPortraitSeed ? EDIT_PRICES.regeneratePortrait : 0}
          busy={busyKey === 'regeneratePortrait'}
          onPress={() =>
            hasInitialPortraitSeed
              ? Alert.alert(
                  'Regenerate portrait',
                  `Spend ${EDIT_PRICES.regeneratePortrait} credit?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Spend',
                      style: 'destructive',
                      onPress: runPortraitRender,
                    },
                  ],
                )
              : runPortraitRender()
          }
        />

        <RePromptRow
          busy={busyKey === 'rePromptPortrait'}
          onSave={(prompt) =>
            Alert.alert(
              'Re-prompt portrait',
              `Spend ${EDIT_PRICES.rePromptPortrait} credits?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Spend',
                  style: 'destructive',
                  onPress: () => runRePromptPortrait(prompt),
                },
              ],
            )
          }
        />

        <TraitRerollRow
          character={character}
          busy={busyKey === 'swapTrait' || busyKey === 'rerollAllTraits'}
          onSwap={(key, value) =>
            Alert.alert(
              'Swap trait',
              `Spend ${EDIT_PRICES.swapTrait} credit?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Spend',
                  style: 'destructive',
                  onPress: () =>
                    runEdit(
                      'swapTrait',
                      { swapTrait: { key, value } },
                      'Trait swapped',
                    ),
                },
              ],
            )
          }
          onRerollAll={() =>
            Alert.alert(
              'Reroll all traits',
              `Spend ${EDIT_PRICES.rerollAllTraits} credits?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Spend',
                  style: 'destructive',
                  onPress: () =>
                    runEdit(
                      'rerollAllTraits',
                      { rerollAllTraits: true },
                      'Traits rerolled',
                    ),
                },
              ],
            )
          }
        />
      </ScrollView>

      {toast && <Toast text={toast} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function formatCooldown(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function CardShell({
  title,
  subtitle,
  cost,
  cooldownMs,
  children,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  cooldownMs?: number;
  children?: React.ReactNode;
}) {
  const colors = useThemedColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardHeader}>
        <View style={styles.flex1}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.costBadge}>
          <Text
            style={[
              styles.costText,
              { color: cost === 0 ? colors.success : colors.primary },
            ]}
          >
            {cost === 0 ? 'Free' : `${cost} cr`}
          </Text>
        </View>
      </View>
      {cooldownMs && cooldownMs > 0 ? (
        <Text style={[styles.cooldown, { color: colors.warning }]}>
          Available in {formatCooldown(cooldownMs)}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function BattleCryRow({
  character,
  busy,
  onSave,
}: {
  character: CharacterRow;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const colors = useThemedColors();
  const [value, setValue] = useState(character.battle_cry);
  const disabled = busy || value.trim() === character.battle_cry;
  return (
    <CardShell
      title="Battle cry"
      subtitle="Free · 24h cooldown"
      cost={EDIT_PRICES.battleCry}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        maxLength={60}
        style={[
          styles.input,
          { backgroundColor: colors.background, color: colors.text },
        ]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Battle cry input"
      />
      <TouchableOpacity
        onPress={() => onSave(value.trim())}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Save battle cry"
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          disabled && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function SignatureColorRow({
  character,
  busy,
  onSave,
}: {
  character: CharacterRow;
  busy: boolean;
  onSave: (v: PaletteKey) => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell
      title="Signature color"
      subtitle="Free · 24h cooldown"
      cost={EDIT_PRICES.signatureColor}
    >
      <View style={styles.swatchRow}>
        {PALETTES.map((p) => {
          const selected =
            PALETTE_HEX[p.key].toLowerCase() ===
            character.signature_color.toLowerCase();
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => onSave(p.key)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${TRAIT_LABELS.palette[p.key]}`}
              accessibilityState={{ selected }}
              style={[
                styles.swatch,
                {
                  backgroundColor: p.hex,
                  borderColor: selected ? colors.text : 'transparent',
                  opacity: busy ? 0.5 : 1,
                },
              ]}
            />
          );
        })}
      </View>
    </CardShell>
  );
}

function SignatureItemRow({
  character,
  busy,
  onSave,
}: {
  character: CharacterRow;
  busy: boolean;
  onSave: (id: string) => void;
}) {
  const colors = useThemedColors();
  const [items, setItems] = useState<CatalogSignatureItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customClass, setCustomClass] = useState<ItemClass>('tool');
  const [customIcon, setCustomIcon] = useState(false);
  const [creating, setCreating] = useState(false);

  const openCatalog = async () => {
    setOpen(true);
    if (items.length === 0) {
      setLoading(true);
      try {
        const list = await listSignatureItemsCatalog();
        setItems(list);
      } catch (err) {
        console.error('Failed to load signature items', err);
        Alert.alert(
          'Could not load items',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const submitCustom = async () => {
    const name = customName.trim();
    const desc = customDesc.trim();
    if (!name || !desc) return;
    setCreating(true);
    try {
      const item = await createCustomSignatureItem({
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: customIcon,
      });
      setCustomOpen(false);
      setCustomName('');
      setCustomDesc('');
      onSave(item.id);
    } catch (err) {
      console.error('Failed to create custom signature item', {
        err,
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: customIcon,
      });
      Alert.alert(
        'Could not create item',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <CardShell
      title="Signature item"
      subtitle="Free swap from catalog"
      cost={EDIT_PRICES.signatureItem}
    >
      {!open ? (
        <TouchableOpacity
          onPress={openCatalog}
          accessibilityRole="button"
          accessibilityLabel="Browse signature items"
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
            Browse items
          </Text>
        </TouchableOpacity>
      ) : loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <ItemGrid
            items={items.slice(0, 15)}
            selectedId={character.signature_item_id ?? undefined}
            onSelect={(id) => !busy && onSave(id)}
            onCreateCustom={() => setCustomOpen(true)}
          />
          {customOpen && (
            <View
              style={[
                styles.customForm,
                { backgroundColor: colors.background },
              ]}
            >
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="Item name"
                placeholderTextColor={colors.textTertiary}
                maxLength={32}
                style={[
                  styles.input,
                  { backgroundColor: colors.card, color: colors.text },
                ]}
                accessibilityLabel="Custom item name"
              />
              <TextInput
                value={customDesc}
                onChangeText={setCustomDesc}
                placeholder="Description"
                placeholderTextColor={colors.textTertiary}
                maxLength={140}
                multiline
                style={[
                  styles.input,
                  styles.multiline,
                  { backgroundColor: colors.card, color: colors.text },
                ]}
                accessibilityLabel="Custom item description"
              />
              <TraitPicker
                title="Class"
                value={customClass}
                onChange={(v) => setCustomClass(v as ItemClass)}
                options={ITEM_CLASSES.map<TraitOption>((c) => ({
                  value: c,
                  label: TRAIT_LABELS.itemClass[c],
                }))}
              />
              <View style={styles.switchRow}>
                <Text style={{ color: colors.text }}>Generate icon</Text>
                <Switch value={customIcon} onValueChange={setCustomIcon} />
              </View>
              <TouchableOpacity
                onPress={submitCustom}
                disabled={creating || !customName.trim() || !customDesc.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save custom item"
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  (creating || !customName.trim() || !customDesc.trim()) &&
                    styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {creating ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </CardShell>
  );
}

function ActionRow({
  title,
  subtitle,
  cost,
  busy,
  onPress,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  busy: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell title={title} subtitle={subtitle} cost={cost}>
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          busy && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Continue</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function RePromptRow({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (prompt: string) => void;
}) {
  const colors = useThemedColors();
  const [value, setValue] = useState('');
  const disabled = busy || value.trim().length === 0;
  return (
    <CardShell
      title="Re-prompt portrait"
      subtitle="Write a new description for your portrait."
      cost={EDIT_PRICES.rePromptPortrait}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="A new vision for your fighter"
        placeholderTextColor={colors.textTertiary}
        maxLength={120}
        multiline
        style={[
          styles.input,
          styles.multiline,
          { backgroundColor: colors.background, color: colors.text },
        ]}
        accessibilityLabel="Re-prompt portrait input"
      />
      <TouchableOpacity
        onPress={() => onSave(value.trim())}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Submit new portrait prompt"
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          disabled && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Submit</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function TraitRerollRow({
  character,
  busy,
  onSwap,
  onRerollAll,
}: {
  character: CharacterRow;
  busy: boolean;
  onSwap: (
    key: 'vibe' | 'silhouette' | 'palette' | 'era' | 'expression',
    value: string,
  ) => void;
  onRerollAll: () => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell
      title="Re-roll traits"
      subtitle={`Single swap ${EDIT_PRICES.swapTrait} cr · full reroll ${EDIT_PRICES.rerollAllTraits} cr`}
      cost={EDIT_PRICES.swapTrait}
    >
      <TraitPicker
        title="Vibe"
        value={character.vibe ?? undefined}
        onChange={(v) => !busy && onSwap('vibe', v)}
        options={VIBES.map<TraitOption>((v) => ({
          value: v,
          label: TRAIT_LABELS.vibe[v],
        }))}
      />
      <TraitPicker
        title="Silhouette"
        value={character.silhouette ?? undefined}
        onChange={(v) => !busy && onSwap('silhouette', v)}
        options={SILHOUETTES.map<TraitOption>((v) => ({
          value: v,
          label: TRAIT_LABELS.silhouette[v],
        }))}
      />
      <TraitPicker
        title="Palette"
        value={character.palette_key ?? undefined}
        onChange={(v) => !busy && onSwap('palette', v)}
        options={PALETTES.map<TraitOption>((p) => ({
          value: p.key,
          label: TRAIT_LABELS.palette[p.key],
          swatch: p.hex,
        }))}
      />
      <TraitPicker
        title="Era"
        value={character.era ?? undefined}
        onChange={(v) => !busy && onSwap('era', v)}
        options={ERAS.map<TraitOption>((v) => ({
          value: v,
          label: TRAIT_LABELS.era[v],
        }))}
      />
      <TraitPicker
        title="Expression"
        value={character.expression ?? undefined}
        onChange={(v) => !busy && onSwap('expression', v)}
        options={EXPRESSIONS.map<TraitOption>((v) => ({
          value: v,
          label: TRAIT_LABELS.expression[v],
        }))}
      />
      <TouchableOpacity
        onPress={onRerollAll}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Reroll all traits"
        style={[
          styles.secondaryBtn,
          { borderColor: colors.border, marginTop: Spacing.sm },
          busy && styles.btnDisabled,
        ]}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
          Reroll all ({EDIT_PRICES.rerollAllTraits} cr)
        </Text>
      </TouchableOpacity>
    </CardShell>
  );
}

function Toast({ text }: { text: string }) {
  const colors = useThemedColors();
  const opacity = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: colors.card, opacity, borderColor: colors.border },
      ]}
    >
      <Text style={{ color: colors.text }}>{text}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  h1: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  flex1: { flex: 1 },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  cardSub: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  costBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  costText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  cooldown: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.sm,
  },
  input: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.sm,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
  },
  secondaryBtnText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  btnDisabled: { opacity: 0.5 },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.sm,
  },
  customForm: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  toast: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.lg,
    right: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
});
