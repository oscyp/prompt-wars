import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  describeLook,
  type StageTraitKey,
  type PaletteKey,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { traitOptions, PALETTE_SWATCH_OPTIONS } from '@/utils/traitOptions';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import OptionGrid from '../OptionGrid';
import ArtStylePicker from '../ArtStylePicker';
import ColorSwatchGrid from '../ColorSwatchGrid';
import EditCardShell from './EditCardShell';
import ModeToggle, { type DescribeMode } from './ModeToggle';
import { editStyles as s } from './styles';

const PROMPT_MAX = 200;

/** Ordered by how much each changes the render. Palette has its own grid. */
const GRIDS: { key: Exclude<StageTraitKey, 'palette'>; title: string }[] = [
  { key: 'vibe', title: 'Vibe' },
  { key: 'silhouette', title: 'Silhouette' },
  { key: 'era', title: 'Era' },
  { key: 'expression', title: 'Expression' },
];

export interface LookPanelProps {
  /** Saved values merged with anything staged. */
  look: {
    artStyle: ArtStyle;
    palette: PaletteKey | null;
    vibe: string | null;
    silhouette: string | null;
    era: string | null;
    expression: string | null;
    portraitPromptRaw: string | null;
  };
  changedKeys: Set<string>;
  disabled?: boolean;
  onStage: (key: string, value: string | null) => void;
}

/**
 * Everything about how the character looks — and none of it costs anything.
 *
 * Traits were priced per swap, which put a taxi meter on the one behaviour the
 * screen exists to encourage and, worse, charged for a change nobody could see:
 * the portrait did not move until the player paid again to render it. A trait is
 * an input to a render, no image is generated when somebody taps through Vibe,
 * so the money moved to the render and this tab has no prices on it at all.
 *
 * The random-character action used to live at the bottom of this panel; it is a
 * paid render, not a description, so it sits with the other paid actions on the
 * Stage now. This panel does not scroll itself: the screen's single scroll owns
 * that, along with `keyboardShouldPersistTaps`.
 */
export default function LookPanel({
  look,
  changedKeys,
  disabled = false,
  onStage,
}: LookPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const mode: DescribeMode =
    look.portraitPromptRaw != null ? 'prompt' : 'guided';
  const guided = mode === 'guided';

  const setMode = (next: DescribeMode) => {
    // Clearing the prompt is what returns the resolver to the traits; the trait
    // values were never touched, so switching back is lossless.
    onStage(
      'portraitPromptRaw',
      next === 'prompt' ? (look.portraitPromptRaw ?? '') : null,
    );
  };

  return (
    <View style={s.panel}>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <ModeToggle value={mode} onChange={setMode} disabled={disabled} />
      </View>

      {/* The description the player is building, in plain English. Four of the
          controls below are abstract adjectives with no thumbnail, so without
          this there is nothing on screen connecting them to anything until a
          render exists. */}
      <View
        style={[
          styles.preview,
          {
            borderColor: colors.border,
            backgroundColor: colors.backgroundSecondary,
          },
        ]}
      >
        <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>
          You&apos;re describing
        </Text>
        <Text
          style={[styles.previewText, accessibleText, { color: colors.text }]}
        >
          {guided
            ? describeLook({
                vibe: look.vibe as never,
                silhouette: look.silhouette as never,
                expression: look.expression as never,
                palette: look.palette,
                era: look.era as never,
                artStyle: look.artStyle,
              })
            : look.portraitPromptRaw?.trim() ||
              'Write a description and it will appear here.'}
        </Text>
      </View>

      {!guided ? (
        <EditCardShell
          title="Your description"
          subtitle="Replaces the traits below entirely."
          cost={0}
          changed={changedKeys.has('portraitPromptRaw')}
          disabled={disabled}
        >
          <TextInput
            value={look.portraitPromptRaw ?? ''}
            onChangeText={(v) => onStage('portraitPromptRaw', v)}
            placeholder="A knight forged from stained glass"
            placeholderTextColor={colors.textTertiary}
            maxLength={PROMPT_MAX}
            multiline
            style={[
              s.input,
              s.multiline,
              { backgroundColor: colors.background, color: colors.text },
            ]}
            accessibilityLabel="Your portrait description"
          />
          <Text style={[s.counter, { color: colors.textTertiary }]}>
            {`${(look.portraitPromptRaw ?? '').length}/${PROMPT_MAX}`}
          </Text>
        </EditCardShell>
      ) : null}

      {/* Art style leads: it changes the render more than any single trait. */}
      <EditCardShell
        title="Art style"
        subtitle="The biggest single change you can make to the render."
        cost={0}
        changed={changedKeys.has('artStyle')}
        disabled={disabled}
      >
        <ArtStylePicker
          title=""
          value={look.artStyle}
          onChange={(v) => onStage('artStyle', v)}
          disabled={disabled}
        />
      </EditCardShell>

      {!guided ? (
        <Text
          style={[
            s.hint,
            accessibleText,
            styles.inertNote,
            { color: colors.warning },
          ]}
        >
          The traits below aren&apos;t used while you&apos;re writing your own
          description. Switch back to Guided to use them again — nothing is
          lost.
        </Text>
      ) : null}

      <View
        style={!guided ? styles.inert : undefined}
        pointerEvents={guided ? 'auto' : 'none'}
      >
        <View style={styles.stack}>
          <EditCardShell
            title="Outfit palette"
            subtitle="The colour story your render is built around."
            cost={0}
            changed={changedKeys.has('palette')}
            disabled={disabled}
          >
            <ColorSwatchGrid
              groupLabel="Outfit palette"
              options={PALETTE_SWATCH_OPTIONS}
              value={look.palette ?? undefined}
              onChange={(v) => onStage('palette', v)}
              disabled={disabled}
            />
          </EditCardShell>

          {/* No `title` on the grids: EditCardShell draws it. */}
          {GRIDS.map((def) => (
            <EditCardShell
              key={def.key}
              title={def.title}
              cost={0}
              changed={changedKeys.has(def.key)}
              disabled={disabled}
            >
              <OptionGrid
                label={def.title}
                options={traitOptions(def.key)}
                value={look[def.key]}
                onChange={(v) => onStage(def.key, v)}
                disabled={disabled}
              />
            </EditCardShell>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  previewLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  previewText: {
    fontSize: Typography.sizes.sm,
    lineHeight: 21,
  },
  stack: { gap: Spacing.md },
  // Greyed rather than hidden: the values are still on the row, so switching
  // back is obviously available and obviously lossless.
  inert: { opacity: 0.4 },
  inertNote: { paddingHorizontal: Spacing.xs },
});
