import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { resolveSignatureHex } from '@/utils/characters';
import {
  rivalRecordLabel,
  rivalRecordSentence,
  type RivalRecord,
} from '@/utils/profileView';
import PortraitPreview from '../PortraitPreview';

export interface RivalRowProps {
  name: string;
  archetype: string | null;
  /** The rival's signature colour (hex or palette key); ring falls back to grey. */
  signatureColor: string | null;
  record: RivalRecord;
  battlesCount: number;
}

export const RIVAL_PORTRAIT_SIZE = 40;

export type RivalRecordTone = 'success' | 'error' | 'text';

/** Green when ahead, red when behind, plain when level. */
export function rivalRecordTone(record: RivalRecord): RivalRecordTone {
  if (record.wins > record.losses) return 'success';
  if (record.losses > record.wins) return 'error';
  return 'text';
}

/** "4 battles · 30 days" */
export function rivalCountLabel(battlesCount: number): string {
  return `${battlesCount} ${battlesCount === 1 ? 'battle' : 'battles'} · 30 days`;
}

/** "Vex, 3 wins, 1 loss, 4 battles in 30 days" */
export function rivalRowLabel(input: {
  name: string;
  record: RivalRecord;
  battlesCount: number;
}): string {
  const n = input.battlesCount;
  return `${input.name}, ${rivalRecordSentence(input.record)}, ${n} ${
    n === 1 ? 'battle' : 'battles'
  } in 30 days`;
}

/**
 * One rival: their archetype illustration ringed in their signature colour,
 * their name, and the viewer's record against them. Opponent characters are
 * not readable, so the face is the archetype's bundled art, never a portrait.
 */
export default function RivalRow({
  name,
  archetype,
  signatureColor,
  record,
  battlesCount,
}: RivalRowProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const tone = rivalRecordTone(record);
  const recordColor =
    tone === 'success'
      ? colors.success
      : tone === 'error'
        ? colors.error
        : colors.text;
  const ring = signatureColor
    ? resolveSignatureHex(signatureColor)
    : colors.textSecondary;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={rivalRowLabel({ name, record, battlesCount })}
    >
      <PortraitPreview
        uri={archetypeIllustrationUri(archetype) ?? ''}
        variant="circle"
        size={RIVAL_PORTRAIT_SIZE}
        accentColor={ring}
        accessibilityLabel={`${name}'s archetype`}
      />
      <Text
        style={[styles.name, accessibleText, { color: colors.text }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <View style={styles.right}>
        <Text
          style={[styles.record, NumericFontVariant, { color: recordColor }]}
          testID="rival-record"
        >
          {rivalRecordLabel(record)}
        </Text>
        <Text
          style={[
            styles.count,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {rivalCountLabel(battlesCount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    marginTop: Spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  record: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  count: {
    fontSize: Typography.sizes.xs,
  },
});
