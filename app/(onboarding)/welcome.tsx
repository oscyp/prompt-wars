import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Typography, BorderRadius, Elevation } from '@/constants/DesignTokens';
import { UiArt } from '@/constants/UiArt';

/**
 * First impression of the game: full-bleed arena hero (bundled generated art)
 * with a bottom scrim for AA text, brand title, and the blocking 18+ age gate.
 * Rendered on fixed dark styling — the hero art defines the palette here.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const handleContinue = () => {
    if (ageConfirmed) {
      router.push('/(onboarding)/create-character');
    }
  };

  return (
    <ImageBackground
      source={UiArt.welcomeHero}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Bottom scrim keeps every word AA-readable over the illustration. */}
      <View style={styles.scrim} />
      <View
        style={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        <Text style={styles.title}>Prompt Wars</Text>
        <Text style={styles.description}>
          Battle through prompts. Create your character and enter the arena.
        </Text>

        {!ageConfirmed ? (
          <View style={styles.ageGate}>
            <Text style={styles.ageQuestion}>
              Are you 18 years or older?
            </Text>
            <View style={styles.ageButtons}>
              <TouchableOpacity
                style={[styles.ageButton, styles.primaryButton, Elevation.md]}
                onPress={() => handleAgeConfirmation(true)}
                accessibilityLabel="Confirm you are 18 or older"
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Yes, I&apos;m 18+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ageButton, styles.secondaryButton]}
                onPress={() => handleAgeConfirmation(false)}
                accessibilityLabel="Indicate you are under 18"
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.ctaButton, styles.primaryButton, Elevation.md]}
            onPress={handleContinue}
            accessibilityLabel="Create your character"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Create Your Character</Text>
          </TouchableOpacity>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 11, 15, 0.30)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  title: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.xl,
    textAlign: 'center',
    maxWidth: 400,
  },
  ageGate: {
    alignItems: 'center',
    width: '100%',
  },
  ageQuestion: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  ageButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  ageButton: {
    height: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 130,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ctaButton: {
    height: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
