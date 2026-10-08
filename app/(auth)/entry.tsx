import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameButton, GameHeader, GamePanel, GameText } from '@/components/game';
import BrandMark from '@/components/game/BrandMark';
import { GameFeedback } from '@/components/game/GameFeedback';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  getRegistrationConfiguration,
  type RegistrationConfiguration,
} from '@/utils/registration';

export default function EntryScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  const [configuration, setConfiguration] =
    useState<RegistrationConfiguration | null>(null);
  const [failed, setFailed] = useState(false);
  const socialEnabled = process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1';
  const adultGuestEnabled = process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED === '1';
  const enabled = socialEnabled || adultGuestEnabled;
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const result = await getRegistrationConfiguration();
      if (mounted.current) setConfiguration(result);
    } catch {
      if (mounted.current) setFailed(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (enabled) void load();
    return () => {
      mounted.current = false;
    };
  }, [enabled, load]);

  if (!enabled) return <Redirect href="/(auth)/sign-in" />;
  const guestAvailable =
    (socialEnabled &&
      configuration?.enabled === true &&
      configuration.guest_signup_enabled === true) ||
    (!socialEnabled &&
      adultGuestEnabled &&
      configuration?.enabled === false &&
      configuration.adult_guest_signup_enabled === true);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <BrandMark size={240} style={{ alignSelf: 'center' }} />
      <GamePanel style={styles.panel}>
        <GameHeader title="Your words. Your fighter." />
        <GameText>Build a fighter and battle with your imagination.</GameText>
        {guestAvailable ? (
          <>
            <GameButton
              label="Play now"
              onPress={() => router.push('/(auth)/sign-up?guest=1')}
            />
            <GameText variant="caption">
              Start as a guest. Secure your progress later.
            </GameText>
          </>
        ) : !configuration ? (
          <GameFeedback
            icon="shield-check"
            title={
              failed ? 'Could not check guest play' : 'Checking guest play…'
            }
            busy={!failed}
            message={
              failed ? 'Check your connection and try again.' : undefined
            }
            action={
              failed
                ? { label: 'Retry', onPress: () => void load() }
                : undefined
            }
          />
        ) : null}
        <GameButton
          label="Sign in"
          tone="secondary"
          onPress={() => router.push('/(auth)/sign-in')}
        />
        <GameButton
          label="Create an account"
          tone="secondary"
          onPress={() => router.push('/(auth)/sign-up')}
        />
      </GamePanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
});
