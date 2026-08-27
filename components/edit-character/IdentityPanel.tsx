import React from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { PALETTES, TRAIT_LABELS } from '@/constants/CharacterTraits';
import { ARCHETYPE_LIST, type ArchetypeId } from '@/constants/Archetypes';
import type { EditPricing } from '@/utils/editCooldowns';
import type { DraftKey } from '@/hooks/useCharacterEditDraft';
import TraitPicker, { type TraitOption } from '../TraitPicker';
import ColorSwatchGrid, {
  withCustomOption,
  selectedValueForHex,
  type ColorSwatchOption,
} from '../ColorSwatchGrid';
import EditCardShell from './EditCardShell';
import { editStyles as s } from './styles';

const NAME_MAX = 40;
const BATTLE_CRY_MAX = 60;

export interface IdentityPanelProps {
  character: {
    name: string;
    archetype: ArchetypeId;
    battle_cry: string;
    signature_color: string;
  };
  staged: Partial<Record<string, string | null>>;
  changedKeys: Set<string>;
  pricing: EditPricing;
  disabled?: boolean;
  onStage: (key: DraftKey, value: string) => void;
}

/** The eight preset colours, shared by Signature colour and Outfit palette. */
export const PALETTE_SWATCHES: ColorSwatchOption[] = PALETTES.map((p) => ({
  value: p.hex,
  label: TRAIT_LABELS.palette[p.key],
  hex: p.hex,
}));

/**
 * Name, Archetype, Battle cry, Signature colour -- all staged, none committed
 * on tap.
 *
 * Name and Archetype have been editable on the server since the edit function
 * shipped (free, on 7- and 14-day cooldowns) but had no UI at all, so the only
 * route to a renamed fighter was to make a new one. Signature colour did the
 * opposite: it committed the instant a swatch was touched, silently starting a
 * 24-hour lock.
 */
export default function IdentityPanel({
  character,
  staged,
  changedKeys,
  pricing,
  disabled = false,
  onStage,
}: IdentityPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const name = (staged.name as string) ?? character.name;
  const archetype = (staged.archetype ?? character.archetype) as ArchetypeId;
  const battleCry = (staged.battleCry as string) ?? character.battle_cry;
  const colorHex = (staged.signatureColor as string) ?? character.signature_color;

  const colorOptions = withCustomOption(
    PALETTE_SWATCHES,
    character.signature_color,
  );

  return (
    <ScrollView
      style={s.panelScroll}
      contentContainerStyle={s.panel}
      keyboardShouldPersistTaps="handled"
    >
      <EditCardShell
        title="Name"
        subtitle="What opponents see on the versus screen."
        cost={pricing.prices.rename?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.rename}
        changed={changedKeys.has('name')}
        disabled={disabled}
      >
        <TextInput
          value={name}
          onChangeText={(v) => onStage('name', v)}
          placeholder="Fighter name"
          placeholderTextColor={colors.textTertiary}
          maxLength={NAME_MAX}
          style={[
            s.input,
            { backgroundColor: colors.background, color: colors.text },
          ]}
          accessibilityLabel="Fighter name"
        />
        <Text style={[s.counter, { color: colors.textTertiary }]}>
          {`${name.length}/${NAME_MAX}`}
        </Text>
      </EditCardShell>

      <EditCardShell
        title="Archetype"
        subtitle="Shapes how the judge weighs your moves, and your portrait."
        cost={pricing.prices.archetype?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.archetype}
        changed={changedKeys.has('archetype')}
        disabled={disabled}
      >
        <TraitPicker
          title=""
          value={archetype}
          onChange={(v) => onStage('archetype', v)}
          options={ARCHETYPE_LIST.map<TraitOption>((a) => ({
            value: a.id,
            label: a.name,
            swatch: a.color,
          }))}
        />
        <Text style={[s.hint, accessibleText, { color: colors.textTertiary }]}>
          {ARCHETYPE_LIST.find((a) => a.id === archetype)?.description ?? ''}
        </Text>
      </EditCardShell>

      <EditCardShell
        title="Battle cry"
        subtitle="Shown on reveals and share cards."
        cost={pricing.prices.battle_cry?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.battle_cry}
        changed={changedKeys.has('battleCry')}
        disabled={disabled}
      >
        <TextInput
          value={battleCry}
          onChangeText={(v) => onStage('battleCry', v)}
          placeholder="Say something worth quoting"
          placeholderTextColor={colors.textTertiary}
          maxLength={BATTLE_CRY_MAX}
          multiline
          style={[
            s.input,
            s.multiline,
            { backgroundColor: colors.background, color: colors.text },
          ]}
          accessibilityLabel="Battle cry"
        />
        <Text style={[s.counter, { color: colors.textTertiary }]}>
          {`${battleCry.length}/${BATTLE_CRY_MAX}`}
        </Text>
      </EditCardShell>

      <EditCardShell
        title="Signature colour"
        // Not decoration: describeSignatureColor feeds the portrait prompt, so
        // this tints the render as well as the UI. Players were choosing it as
        // an accent and then wondering why their portrait changed.
        subtitle="Tints your UI accents and your portrait."
        cost={pricing.prices.signature_color?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.signature_color}
        changed={changedKeys.has('signatureColor')}
        disabled={disabled}
      >
        <ColorSwatchGrid
          groupLabel="Signature colour"
          options={colorOptions}
          value={selectedValueForHex(colorOptions, colorHex)}
          onChange={(v) => onStage('signatureColor', v)}
        />
      </EditCardShell>

      <View />
    </ScrollView>
  );
}
