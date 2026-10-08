import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { GameButton, GamePanel, GameText } from '@/components/game';
import { supabase } from '@/utils/supabase';
import { Spacing } from '@/constants/DesignTokens';

/** Only mounted for an anonymous user; no extra read for linked accounts. */
export function GuestProgressReminder({ userId }: { userId: string }) {
  const router = useRouter();
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  const key = `guest-progress-reminder:${userId}`;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setVisibleFor(null);
      void (async () => {
        if ((await AsyncStorage.getItem(key)) === 'dismissed') return;
        const { data, error } = await supabase
          .from('battles')
          .select('id')
          .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
          .eq('status', 'completed')
          .limit(1);
        if (active && !error && data?.length) setVisibleFor(userId);
      })().catch(() => {});
      return () => {
        active = false;
      };
    }, [key, userId]),
  );
  if (visibleFor !== userId) return null;
  return (
    <GamePanel style={styles.panel}>
      <GameText variant="title">Secure your progress</GameText>
      <GameText>
        Link Apple, Google or email to recover your fighter if this device loses
        its session. You can keep playing as a guest.
      </GameText>
      <View style={styles.actions}>
        <GameButton
          label="Secure progress"
          accessibilityLabel="Secure your progress"
          onPress={() =>
            router.push({
              pathname: '/(profile)/settings',
              params: { secure: '1' },
            })
          }
        />
        <GameButton
          label="Not now"
          accessibilityLabel="Dismiss account reminder"
          tone="secondary"
          onPress={() => {
            setVisibleFor(null);
            void AsyncStorage.setItem(key, 'dismissed').catch(() => {});
          }}
        />
      </View>
    </GamePanel>
  );
}
const styles = StyleSheet.create({
  panel: { marginBottom: Spacing.md, gap: Spacing.sm },
  actions: { gap: Spacing.sm },
});
