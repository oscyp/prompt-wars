import { GameField } from '@/components/game';
import { GameText } from '@/components/game';

import { View, type LayoutChangeEvent } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { PALETTES, TRAIT_LABELS } from '@/constants/CharacterTraits';
import type { ArchetypeId } from '@/constants/Archetypes';
import {
  describeCooldownLength,
  type EditPricing,
} from '@/utils/editCooldowns';
import { archetypeOptions } from '@/utils/traitOptions';
import type { DraftKey } from '@/hooks/useCharacterEditDraft';
import OptionGrid from '../OptionGrid';
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
  /**
   * Signature colours unlocked by owning `color` cosmetics.
   *
   * A colour cosmetic deliberately does not apply itself: signature_color feeds
   * the portrait prompt, so equipping one automatically would bump
   * appearance_version and tell the player their portrait is out of date --
   * turning a paid cosmetic into a prompt to pay again for a re-render they
   * never asked for. Owning it unlocks the swatch; wearing it stays free and
   * deliberate.
   */
  unlockedColors?: ColorSwatchOption[];
  onStage: (key: DraftKey, value: string) => void;
  onColorLayout?: (event: LayoutChangeEvent) => void;
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
 *
 * Does not scroll itself: the screen's single scroll owns that.
 */
export default function IdentityPanel({
  character,
  staged,
  changedKeys,
  pricing,
  disabled = false,
  unlockedColors = [],
  onStage,
  onColorLayout,
}: IdentityPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const name = (staged.name as string) ?? character.name;
  const archetype = (staged.archetype ?? character.archetype) as ArchetypeId;
  const battleCry = (staged.battleCry as string) ?? character.battle_cry;
  const colorHex =
    (staged.signatureColor as string) ?? character.signature_color;

  const colorOptions = withCustomOption(
    [
      ...PALETTE_SWATCHES,
      ...unlockedColors.filter(
        (c) =>
          !PALETTE_SWATCHES.some(
            (p) => p.hex.toLowerCase() === c.hex.toLowerCase(),
          ),
      ),
    ],
    character.signature_color,
  );

  // Said before the change, not after: once a cooldown is running the card's
  // badge already shows the countdown, so repeating the lock length would be
  // the same fact twice.
  const archetypeLockLength = pricing.cooldownMs.archetype
    ? null
    : describeCooldownLength(pricing.prices.archetype?.cooldownSeconds ?? 0);

  const blocked = (
    key: 'rename' | 'archetype' | 'battle_cry' | 'signature_color',
  ) => disabled || (pricing.cooldownMs[key] ?? 0) > 0;

  return (
    <View style={s.panel}>
      <EditCardShell
        title="Name"
        subtitle="What opponents see on the versus screen."
        cost={pricing.prices.rename?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.rename}
        changed={changedKeys.has('name')}
        disabled={disabled}
      >
        <GameField
          value={name}
          disabled={blocked('rename')}
          onChangeText={(v) => {
            if (!blocked('rename')) onStage('name', v);
          }}
          placeholder="Fighter name"
          placeholderTextColor={colors.textTertiary}
          maxLength={NAME_MAX}
          style={[
            s.input,
            { backgroundColor: colors.background, color: colors.text },
          ]}
          accessibilityLabel="Fighter name"
        />
        <GameText
          variant="caption"
          style={[s.counter, { color: colors.textTertiary }]}
        >
          {`${name.length}/${NAME_MAX}`}
        </GameText>
      </EditCardShell>

      <EditCardShell
        title="Archetype"
        subtitle="A free identity preset for your fighter and portrait. No scoring bonus."
        cost={pricing.prices.archetype?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.archetype}
        changed={changedKeys.has('archetype')}
        disabled={disabled}
      >
        <OptionGrid
          label="Archetype"
          options={archetypeOptions()}
          value={archetype}
          onChange={(v) => {
            if (!blocked('archetype')) onStage('archetype', v);
          }}
          disabled={blocked('archetype')}
        />
        {archetypeLockLength ? (
          <GameText
            variant="caption"
            style={[s.hint, accessibleText, { color: colors.textTertiary }]}
          >
            {`A change locks it for ${archetypeLockLength}.`}
          </GameText>
        ) : null}
      </EditCardShell>

      <EditCardShell
        title="Battle cry"
        subtitle="Shown on reveals and share cards."
        cost={pricing.prices.battle_cry?.credits ?? 0}
        cooldownMs={pricing.cooldownMs.battle_cry}
        changed={changedKeys.has('battleCry')}
        disabled={disabled}
      >
        <GameField
          value={battleCry}
          disabled={blocked('battle_cry')}
          onChangeText={(v) => {
            if (!blocked('battle_cry')) onStage('battleCry', v);
          }}
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
        <GameText
          variant="caption"
          style={[s.counter, { color: colors.textTertiary }]}
        >
          {`${battleCry.length}/${BATTLE_CRY_MAX}`}
        </GameText>
      </EditCardShell>

      <View onLayout={onColorLayout}>
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
            disabled={blocked('signature_color')}
            options={colorOptions}
            value={selectedValueForHex(colorOptions, colorHex)}
            onChange={(v) => {
              if (!blocked('signature_color')) onStage('signatureColor', v);
            }}
          />
        </EditCardShell>
      </View>
    </View>
  );
}
