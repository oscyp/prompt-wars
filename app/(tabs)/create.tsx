import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Layout,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import {
  HapticPressable,
  ScreenContainer,
  SectionHeader,
} from '@/components';

type Mode = {
  id: 'ranked' | 'unranked' | 'bot';
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  gradient: readonly string[];
  glow: string;
};

const MODES: Mode[] = [
  {
    id: 'ranked',
    title: 'Ranked Battle',
    subtitle: 'COMPETE FOR GLORY',
    description: 'Climb the ladder. Rating on the line.',
    icon: 'sword-cross',
    gradient: Gradients.heroPrimary,
    glow: '#7B5BFF',
  },
  {
    id: 'unranked',
    title: 'Unranked',
    subtitle: 'PRACTICE & PLAY',
    description: 'Sharpen your craft. No rating risk.',
    icon: 'target',
    gradient: Gradients.heroDefense,
    glow: '#22D3EE',
  },
  {
    id: 'bot',
    title: 'Practice vs Bot',
    subtitle: 'LEARN THE BASICS',
    description: 'Train against AI. Free entries.',
    icon: 'robot-outline',
    gradient: Gradients.cardSurface,
    glow: '#6B7280',
  },
];

export default function CreateScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();

  const startBattle = (mode: Mode['id']) => {
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom:
              insets.bottom + Layout.tabBarHeight + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader
          title="Choose Your Battle"
          eyebrow="Pick your weapon"
          subtitle="Three ways to enter the arena."
          size="hero"
        />

        <View style={styles.list}>
          {MODES.map((mode, i) => (
            <Animated.View
              key={mode.id}
              entering={FadeInDown.duration(400).delay(i * 80)}
            >
              <HapticPressable
                onPress={() => startBattle(mode.id)}
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={`Start ${mode.title}`}
                style={[
                  styles.cardShadow,
                  { shadowColor: mode.glow },
                  Shadows.cardElevated,
                ]}
              >
                <LinearGradient
                  colors={
                    mode.gradient as unknown as readonly [string, string]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modeCard}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: 'rgba(255,255,255,0.15)' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={mode.icon}
                      size={32}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.subtitle}>{mode.subtitle}</Text>
                  <Text style={styles.title}>{mode.title}</Text>
                  <Text style={styles.description}>{mode.description}</Text>
                  <View style={styles.cta}>
                    <Text style={styles.ctaText}>Enter Arena</Text>
                    <MaterialCommunityIcons
                      name="arrow-right-circle"
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                </LinearGradient>
              </HapticPressable>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.lg,
  },
  list: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cardShadow: {
    borderRadius: BorderRadius.xl,
  },
  modeCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    minHeight: 180,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display3,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
    marginBottom: Spacing.xs,
  },
  description: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: Spacing.md,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 'auto',
  },
  ctaText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
  },
});
