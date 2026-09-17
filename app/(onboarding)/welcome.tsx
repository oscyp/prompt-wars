import {
  GameScreen,
  GameHeader,
  GamePanel,
  GameButton,
  GameText,
} from '@/components/game';
import BrandMark from '@/components/game/BrandMark';

import { useState } from 'react';
import { Alert, Platform, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';

import { UiArt } from '@/constants/UiArt';
import { useAuth } from '@/providers/AuthProvider';

import { startTutorial } from '@/utils/tutorial';
import { checkAccountEligibility, getDeviceFingerprint } from '@/utils/safety';
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
  const { signOut } = useAuth();
  const [starting, setStarting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleContinue = () => {
    hapticSelection();
    router.push('/(onboarding)/create-character');
  };

  const handlePractice = async () => {
    if (starting) return;
    setStarting(true);
    try {
      // Same anti-abuse signal as the Customize first path; grant policy remains
      // in the existing authenticated account-guard handler.
      await checkAccountEligibility({
        action: 'onboarding_credits',
        deviceFingerprint: getDeviceFingerprint(),
        platform: Platform.OS as 'ios' | 'android',
      }).catch(() => undefined);
      const battleId = await startTutorial();
      router.replace(`/(battle)/prompt-entry?battleId=${battleId}`);
    } catch (e) {
      Alert.alert(
        'Practice unavailable',
        e instanceof Error ? e.message : 'Try again.',
      );
    } finally {
      setStarting(false);
    }
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
    <GameScreen contentContainerStyle={styles.content}>
      <BrandMark size={280} style={{ alignSelf: 'center' }} />
      <Image
        source={UiArt.welcomeHero}
        resizeMode="contain"
        accessible={false}
        style={{ width: '100%', height: 240 }}
      />
      <GamePanel tone="ornate" style={{ width: '100%', gap: 16 }}>
        <GameHeader title="Your words. Your fighter." />
        <GameText style={{ textAlign: 'center' }}>
          Try a guided prompt battle with a ready-to-play fighter. Customize
          whenever you like.
        </GameText>
        <GameButton
          label={starting ? 'Preparing practice…' : 'Play practice'}
          accessibilityLabel="Play practice"
          onPress={handlePractice}
          busy={starting}
        />
        <GameButton
          label="Customize first"
          tone="secondary"
          onPress={handleContinue}
          disabled={starting}
        />
        <GameButton
          label="Not you? Sign out"
          tone="secondary"
          onPress={handleSignOut}
          busy={signingOut}
        />
      </GamePanel>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 20,
    padding: 24,
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
  },
});
