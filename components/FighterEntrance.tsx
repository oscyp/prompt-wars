import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import PortraitPreview from '@/components/PortraitPreview';
import {
  BorderRadius,
  Motion,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import type { EquippedCosmetics } from '@/utils/cosmetics';

export interface FighterEntranceProps {
  name: string;
  /** Archetype id (`titan`), or empty when the character could not be read. */
  archetype: string | null | undefined;
  signatureColor: string;
  /** Signed avatar or portrait URL; null falls back to the archetype art. */
  portraitUrl: string | null;
  cosmetics: EquippedCosmetics;
  /** "Ranked Battle", "Casual Battle", "Practice vs Bot" (`modeLabel`). */
  modeLabel: string;
  reduceMotion: boolean;
}

export const PORTRAIT_SIZE = 96;
/** The signature-colour disc behind the portrait, showing as a 10pt halo. */
const GLOW_SIZE = PORTRAIT_SIZE + 20;
const GLOW_MIN = 0.4;
const GLOW_MAX = 0.7;
const GLOW_HALF_PERIOD_MS = 900;

/** "The Titan" for a known id, a capitalised copy of anything else, null for none. */
export function archetypeDisplayName(
  archetype: string | null | undefined,
): string | null {
  const key = (archetype ?? '').trim();
  if (!key) return null;
  const known = ARCHETYPES[key.toLowerCase() as ArchetypeId];
  if (known) return known.name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** The whole card as one sentence for a screen reader. */
export function fighterEntranceLabel(input: {
  name: string;
  archetype: string | null | undefined;
  modeLabel: string;
}): string {
  const parts = [input.name, archetypeDisplayName(input.archetype)].filter(
    (p): p is string => Boolean(p),
  );
  return `${parts.join(', ')}, entering the ${input.modeLabel} arena`;
}

/**
 * The player's own fighter stepping into the arena while the queue searches:
 * portrait ringed in the signature colour over a breathing halo, name,
 * archetype, the mode badge.
 *
 * Under motion the portrait settles from 0.9 to full size once and the halo
 * breathes between 40% and 70%; under Reduce Motion both hold still at their
 * resting values. Text is white on the fixed-dark scrim (design language
 * §3/§7). The card is one accessibility element so VoiceOver reads it as a
 * sentence rather than four fragments.
 */
export default function FighterEntrance({
  name,
  archetype,
  signatureColor,
  portraitUrl,
  cosmetics,
  modeLabel,
  reduceMotion,
}: FighterEntranceProps) {
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.9)).current;
  const glow = useRef(
    new Animated.Value(reduceMotion ? (GLOW_MIN + GLOW_MAX) / 2 : GLOW_MIN),
  ).current;

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      glow.setValue((GLOW_MIN + GLOW_MAX) / 2);
      return;
    }
    const entrance = Animated.timing(scale, {
      toValue: 1,
      duration: Motion.durations.reveal,
      easing: Easing.bezier(...Motion.easing.decelerate),
      useNativeDriver: true,
    });
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: GLOW_MAX,
          duration: GLOW_HALF_PERIOD_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: GLOW_MIN,
          duration: GLOW_HALF_PERIOD_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    entrance.start();
    breathe.start();
    return () => {
      entrance.stop();
      breathe.stop();
    };
  }, [reduceMotion, scale, glow]);

  const archetypeName = archetypeDisplayName(archetype);
  const uri = portraitUrl ?? archetypeIllustrationUri(archetype) ?? '';

  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={fighterEntranceLabel({ name, archetype, modeLabel })}
    >
      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.glow,
            { backgroundColor: signatureColor, opacity: glow },
          ]}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <PortraitPreview
            uri={uri}
            variant="circle"
            size={PORTRAIT_SIZE}
            accentColor={signatureColor}
            frame={cosmetics.frame}
            avatarEffect={cosmetics.avatarEffect}
            accessibilityLabel={`${name}'s portrait`}
          />
        </Animated.View>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {archetypeName ? (
        <Text style={styles.archetype} numberOfLines={1}>
          {archetypeName}
        </Text>
      ) : null}

      <View style={styles.modeBadge}>
        <Text style={styles.modeText}>{modeLabel.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  stage: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GLOW_SIZE / 2,
  },
  // On-scrim text is fixed white so it stays AA over the arena illustration in
  // both app themes; the same rule the matchmaking title follows.
  name: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  archetype: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  modeBadge: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
