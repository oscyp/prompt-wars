import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

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

  const handleContinue = () => {
    if (ageConfirmed) {
      router.push('/(onboarding)/create-character');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Welcome to Prompt Wars
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Battle through prompts. Create your character and enter the arena.
        </Text>

        {!ageConfirmed ? (
          <View style={styles.ageGate}>
            <Text style={[styles.ageQuestion, { color: colors.text }]}>
              Are you 18 years or older?
            </Text>
            <View style={styles.ageButtons}>
              <TouchableOpacity
                style={[styles.ageButton, { backgroundColor: colors.primary }]}
                onPress={() => handleAgeConfirmation(true)}
                accessibilityLabel="Confirm you are 18 or older"
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Yes, I'm 18+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ageButton, { backgroundColor: colors.error }]}
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
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={handleContinue}
            accessibilityLabel="Create your character"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Create Your Character</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.xxl,
    textAlign: 'center',
    maxWidth: 400,
  },
  ageGate: {
    alignItems: 'center',
    width: '100%',
  },
  ageQuestion: {
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
    height: 48,
    borderRadius: 8,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  button: {
    height: 48,
    borderRadius: 8,
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
