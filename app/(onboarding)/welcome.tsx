import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Gradients, Spacing, Typography } from '@/constants/DesignTokens';
import {
  ArchetypeBadge,
  GlowGradientButton,
  NeonGridBackground,
  ScreenContainer,
} from '@/components';
import { ARCHETYPE_LIST } from '@/constants/Archetypes';

export default function WelcomeScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const handleAgeConfirmation = (isAdult: boolean) => {
    if (isAdult) {
      setAgeConfirmed(true);
    } else {
      Alert.alert(
        'Age Requirement',
        'You must be 18 years or older to use Prompt Wars.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <ScreenContainer padded={false}>
      <NeonGridBackground glowColors={[`${Gradients.heroPrimary[0]}AA`, `${colors.background}00`, `${colors.background}00`]} />
      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.sigilRow}>
          {ARCHETYPE_LIST.slice(0, 5).map((arch, i) => (
            <View
              key={arch.id}
              style={{
                marginLeft: i === 0 ? 0 : -16,
                transform: [{ translateY: i % 2 === 0 ? -6 : 6 }],
                opacity: 0.85,
              }}
            >
              <ArchetypeBadge archetypeId={arch.id} size="sm" />
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(700).delay(150)}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            WORDS · STRATEGY · GLORY
          </Text>
          <Text
            style={[
              styles.wordmark,
              {
                color: colors.text,
                textShadowColor: colors.glowPrimary,
              },
            ]}
            accessibilityRole="header"
          >
            PROMPT{'\n'}WARS
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Craft prompts. Outwit opponents. Climb the ranks.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(700).delay(300)}
          style={styles.actions}
        >
          {!ageConfirmed ? (
            <>
              <Text style={[styles.gateQuestion, { color: colors.text }]}>
                Are you 18 or older?
              </Text>
              <View style={styles.ageRow}>
                <GlowGradientButton
                  title="Yes, I'm 18+"
                  onPress={() => handleAgeConfirmation(true)}
                  variant="primary"
                  size="lg"
                  iconLeft="check-circle-outline"
                  style={styles.ageBtn}
                  accessibilityLabel="Confirm you are 18 or older"
                />
                <GlowGradientButton
                  title="No"
                  onPress={() => handleAgeConfirmation(false)}
                  variant="ghost"
                  size="lg"
                  style={styles.ageBtn}
                  accessibilityLabel="Indicate you are under 18"
                />
              </View>
            </>
          ) : (
            <Animated.View entering={FadeIn.duration(400)}>
              <View style={styles.confirmed}>
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={20}
                  color={colors.success}
                />
                <Text
                  style={[
                    styles.confirmedText,
                    { color: colors.success },
                  ]}
                >
                  Verified
                </Text>
              </View>
              <GlowGradientButton
                title="Create Your Warrior"
                onPress={() => router.push('/(onboarding)/create-character')}
                variant="primary"
                size="lg"
                iconRight="sword"
                fullWidth
                accessibilityLabel="Create your character"
              />
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sigilRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  eyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    textAlign: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.xxl,
  },
  wordmark: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero,
    letterSpacing: Typography.letterSpacing.wider,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  description: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    marginTop: Spacing.lg,
    maxWidth: 320,
    alignSelf: 'center',
    lineHeight: Typography.sizes.base * 1.5,
  },
  actions: {
    width: '100%',
  },
  gateQuestion: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.xl,
    letterSpacing: Typography.letterSpacing.wide,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  ageRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  ageBtn: {
    flex: 1,
  },
  confirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  confirmedText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    letterSpacing: Typography.letterSpacing.wide,
  },
});
