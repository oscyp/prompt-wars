import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  PALETTES,
  TRAIT_LABELS,
  TRAIT_DESCRIPTIONS,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  type PaletteKey,
} from '@/constants/CharacterTraits';
import { formatCredits } from '@/utils/credits';
import { formatCooldown, type EditPricing } from '@/utils/editCooldowns';
import type { StageTraitKey } from '@/utils/characterEditPricing';
import TraitStepper, { type StepperOption } from '../TraitStepper';
import ColorSwatchGrid, { type ColorSwatchOption } from '../ColorSwatchGrid';
import EditCardShell from './EditCardShell';
import { editStyles as s } from './styles';

const STEPPERS: { key: StageTraitKey; title: string }[] = [
  { key: 'vibe', title: 'Vibe' },
  { key: 'silhouette', title: 'Silhouette' },
  { key: 'era', title: 'Era' },
  { key: 'expression', title: 'Expression' },
];

const COLUMN: Record<StageTraitKey, string> = {
  palette: 'palette_key',
  vibe: 'vibe',
  silhouette: 'silhouette',
  era: 'era',
  expression: 'expression',
};

const PALETTE_OPTIONS: ColorSwatchOption[] = PALETTES.map((p) => ({
  value: p.key,
  label: TRAIT_LABELS.palette[p.key],
  hex: p.hex,
}));

export function stepperOptions(key: StageTraitKey): StepperOption[] {
  switch (key) {
    case 'palette':
      return PALETTES.map((p) => ({
        value: p.key,
        label: TRAIT_LABELS.palette[p.key],
        swatch: p.hex,
      }));
    case 'vibe':
      return VIBES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.vibe[v],
        description: TRAIT_DESCRIPTIONS.vibe[v],
      }));
    case 'silhouette':
      return SILHOUETTES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.silhouette[v],
        description: TRAIT_DESCRIPTIONS.silhouette[v],
      }));
    case 'era':
      return ERAS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.era[v],
        description: TRAIT_DESCRIPTIONS.era[v],
      }));
    case 'expression':
      return EXPRESSIONS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.expression[v],
        description: TRAIT_DESCRIPTIONS.expression[v],
      }));
  }
}

export interface LookPanelProps {
  character: Record<string, unknown>;
  staged: Partial<Record<StageTraitKey, string>>;
  changed: StageTraitKey[];
  pricing: EditPricing;
  /** False when live prices could not be read; paid controls are held back. */
  pricingVerified: boolean;
  disabled?: boolean;
  busy?: boolean;
  onStage: (key: StageTraitKey, value: string) => void;
  onRandomize: () => void;
}

/**
 * Outfit palette and the four abstract traits.
 *
 * Renamed from "Traits": what this tab changes is how the fighter looks, and
 * "trait" reads like a stat. The palette's 24-hour cooldown is enforced here --
 * it was fetched and passed into this panel all along, then never rendered, so
 * the first the player heard of it was a server error after staging a change.
 */
export default function LookPanel({
  character,
  staged,
  changed,
  pricing,
  pricingVerified,
  disabled = false,
  busy = false,
  onStage,
  onRandomize,
}: LookPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const paletteCooldown = pricing.cooldownMs.palette ?? 0;
  const paletteCooling = paletteCooldown > 0;
  const swapCost = pricing.prices.traits_single_swap?.credits ?? 1;
  const rerollCost = pricing.prices.traits_full_reroll?.credits ?? 2;
  const paletteValue =
    staged.palette ??
    (character[COLUMN.palette] as PaletteKey | null) ??
    undefined;

  return (
    <ScrollView
      style={s.panelScroll}
      contentContainerStyle={s.panel}
      showsVerticalScrollIndicator={false}
    >
      <EditCardShell
        title="Outfit palette"
        subtitle="The colour story your render is built around."
        cost={pricing.prices.palette?.credits ?? 0}
        cooldownMs={paletteCooldown}
        changed={changed.includes('palette')}
        disabled={disabled}
      >
        <ColorSwatchGrid
          groupLabel="Outfit palette"
          options={PALETTE_OPTIONS}
          value={paletteValue}
          onChange={(v) => onStage('palette', v)}
          disabled={disabled || paletteCooling}
          disabledReason={
            paletteCooling
              ? `Available in ${formatCooldown(paletteCooldown)}`
              : undefined
          }
        />
      </EditCardShell>

      {STEPPERS.map((def) => (
        <EditCardShell
          key={def.key}
          title={def.title}
          cost={swapCost}
          changed={changed.includes(def.key)}
          disabled={disabled || !pricingVerified}
        >
          <TraitStepper
            title=""
            costLabel={formatCredits(swapCost)}
            options={stepperOptions(def.key)}
            value={
              staged[def.key] ??
              (character[COLUMN[def.key]] as string | null) ??
              undefined
            }
            onChange={(v) => onStage(def.key, v)}
            changed={changed.includes(def.key)}
            disabled={busy || disabled || !pricingVerified}
          />
        </EditCardShell>
      ))}

      <View style={[s.card, { backgroundColor: colors.card }]}>
        <Text style={[s.cardTitle, accessibleText, { color: colors.text }]}>
          Randomize traits
        </Text>
        {/* Spelled out because the visible result of this costs another credit:
            new traits leave the existing render in place until it is re-rendered,
            and players read "randomize" as "show me something new". */}
        <Text
          style={[s.cardSub, accessibleText, { color: colors.textSecondary }]}
        >
          A fresh random set of traits. Doesn&apos;t include a new portrait
          render.
        </Text>
        <TouchableOpacity
          onPress={onRandomize}
          disabled={busy || disabled || !pricingVerified}
          accessibilityRole="button"
          accessibilityLabel={`Randomize traits, ${formatCredits(rerollCost, 'sentence')}`}
          style={[
            s.secondaryBtn,
            { borderColor: colors.border },
            (busy || disabled || !pricingVerified) && s.btnDisabled,
          ]}
        >
          <Text style={[s.secondaryBtnText, { color: colors.text }]}>
            {`Randomize traits · ${formatCredits(rerollCost)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
