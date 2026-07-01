import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import {
  isSoundEnabled,
  setSoundEnabled,
  loadSoundEnabled,
} from '@/utils/soundSettings';
import {
  getNotificationPreferences,
  updateNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/utils/notifications';

export default function SettingsScreen() {
  const colors = useThemedColors();
  const { user } = useAuth();

  // Local state for accessibility preferences
  const [dynamicType, setDynamicType] = useState(true);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // Sound & Music (SFX) preference — persisted, read by the reveal audio layer.
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());

  useEffect(() => {
    loadSoundEnabled().then(setSoundEnabledState);
  }, []);

  const toggleSound = (value: boolean) => {
    setSoundEnabledState(value);
    setSoundEnabled(value);
  };

  // Notification preferences (synced with notification_preferences table)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  useEffect(() => {
    if (user?.id) {
      getNotificationPreferences(user.id).then(setNotifPrefs);
    }
  }, [user?.id]);

  const toggleNotif = (
    category: keyof NotificationPreferences,
    value: boolean,
  ) => {
    setNotifPrefs((prev) => ({ ...prev, [category]: value }));
    if (user?.id) {
      updateNotificationPreference(user.id, category, value);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      {/* Accessibility */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Accessibility</Text>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Dynamic Type</Text>
          <Switch
            value={dynamicType}
            onValueChange={setDynamicType}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle dynamic type"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Dyslexia-Friendly Font</Text>
          <Switch
            value={dyslexiaFont}
            onValueChange={setDyslexiaFont}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle dyslexia-friendly font"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reduced Motion</Text>
          <Switch
            value={reducedMotion}
            onValueChange={setReducedMotion}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle reduced motion"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Sound &amp; Music</Text>
          <Switch
            value={soundEnabled}
            onValueChange={toggleSound}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle sound effects and music"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>High Contrast Mode</Text>
          <Switch
            value={highContrast}
            onValueChange={setHighContrast}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle high contrast"
          />
        </View>
      </View>

      {/* Notifications */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Max 2 per day, must-send only for results
        </Text>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Battle Results (Must-Send)</Text>
          <Switch
            value={true}
            disabled
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Result notifications are always on"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Opponent&apos;s Turn</Text>
          <Switch
            value={notifPrefs.opponent_submitted}
            onValueChange={(v) => toggleNotif('opponent_submitted', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle opponent submitted notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Cinematic Video Ready</Text>
          <Switch
            value={notifPrefs.video_ready}
            onValueChange={(v) => toggleNotif('video_ready', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle video ready notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Daily Quests</Text>
          <Switch
            value={notifPrefs.daily_quest}
            onValueChange={(v) => toggleNotif('daily_quest', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle quest notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Friend Challenges</Text>
          <Switch
            value={notifPrefs.friend_challenge}
            onValueChange={(v) => toggleNotif('friend_challenge', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle challenge notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Season Ending</Text>
          <Switch
            value={notifPrefs.season_ending}
            onValueChange={(v) => toggleNotif('season_ending', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle season ending notifications"
          />
        </View>
      </View>

      <Text style={[styles.note, { color: colors.textTertiary }]}>
        Battle results always notify you. All other categories respect the 2-per-day cap and your
        quiet hours.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  section: {
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  settingLabel: {
    fontSize: Typography.sizes.base,
    flex: 1,
  },
  note: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
