import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Spacing,
  Typography,
  BorderRadius,
  Elevation,
  Gradients,
  Ink,
  Layout,
} from '@/constants/DesignTokens';
import { UiArt } from '@/constants/UiArt';
import { useAuth } from '@/providers/AuthProvider';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { hapticSelection } from '@/utils/haptics';

/**
 * First impression of the game: full-bleed arena hero (bundled generated art)
 * with a bottom scrim for AA text, brand title, the value line and one CTA.
 *
 * The 18+ gate that used to sit here was a duplicate: sign-up already requires
 * the confirmation and persists it server-side (`handle_new_user` rejects
 * sign-ups without it), so asking again here only added a screen between a new
 * player and their fighter.
 *
 * Rendered on fixed dark styling — the hero art defines the palette here.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const accessibleText = useAccessibleTextStyle();
  const [signingOut, setSigningOut] = useState(false);

  const handleContinue = () => {
    hapticSelection();
    router.push('/(onboarding)/create-character');
  };

  // Wrong-account escape. Without it a player who signed in with the wrong
  // email had no way out short of creating a fighter on it.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
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
        style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <Text accessibilityRole="header" style={styles.title}>
          Prompt Wars
        </Text>
        <Text style={[styles.description, accessibleText]}>
          Battle with prompts. Create your fighter and enter the arena.
        </Text>

        <TouchableOpacity
          style={[styles.ctaButton, Elevation.md]}
          onPress={handleContinue}
          accessibilityLabel="Create your character"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Create your character</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Not you? Sign out"
          accessibilityState={{ disabled: signingOut }}
          style={styles.signOut}
        >
          <Text style={[styles.signOutText, accessibleText]}>
            Not you? Sign out
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Cinematic surface: fixed near-black per design language §7.
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
    color: Ink.onAccentLight,
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
  ctaButton: {
    minHeight: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    // The game's verb on the game's own surface: brand, not a player colour.
    backgroundColor: Gradients.brand[0],
  },
  buttonText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  signOut: {
    minHeight: Layout.inputHeight,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Typography.sizes.sm,
    textDecorationLine: 'underline',
  },
});
