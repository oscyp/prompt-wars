import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import {
  getThemePreference,
  loadThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/utils/themeSettings';
import {
  isSoundEnabled,
  setSoundEnabled,
  loadSoundEnabled,
} from '@/utils/soundSettings';
import {
  getAccessibilityPreferences,
  loadAccessibilityPreferences,
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  type AccessibilityPreferences,
} from '@/utils/accessibilitySettings';
import {
  getNotificationPreferences,
  updateNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/utils/notifications';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const colors = useThemedColors();
  const { user } = useAuth();

  // Theme preference — dark-first (docs/DESIGN_LANGUAGE.md), persisted.
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());

  useEffect(() => {
    loadThemePreference().then(setTheme);
  }, []);

  const selectTheme = (value: ThemePreference) => {
    setTheme(value);
    setThemePreference(value);
  };

  // Accessibility preferences — persisted and read by the app (concept §22a).
  // `reducedMotion` is OR-ed with the OS setting inside `useReducedMotion`.
  const [a11y, setA11y] = useState<AccessibilityPreferences>(
    getAccessibilityPreferences() ?? DEFAULT_ACCESSIBILITY_PREFERENCES,
  );

  useEffect(() => {
    loadAccessibilityPreferences().then(setA11y);
  }, []);

  const toggleA11y = (key: keyof AccessibilityPreferences, value: boolean) => {
    setA11y((prev) => ({ ...prev, [key]: value }));
    setAccessibilityPreference(key, value);
  };

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

      {/* Appearance */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
        <View
          style={styles.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="App theme"
        >
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value;
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected
                      ? colors.primary
                      : colors.backgroundTertiary,
                  },
                ]}
                onPress={() => selectTheme(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.label} theme`}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Accessibility */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Accessibility</Text>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Dynamic Type</Text>
          <Switch
            value={a11y.dynamicType}
            onValueChange={(v) => toggleA11y('dynamicType', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle dynamic type"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Dyslexia-Friendly Font</Text>
          <Switch
            value={a11y.dyslexiaFont}
            onValueChange={(v) => toggleA11y('dyslexiaFont', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle dyslexia-friendly font"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reduced Motion</Text>
          <Switch
            value={a11y.reducedMotion}
            onValueChange={(v) => toggleA11y('reducedMotion', v)}
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
            value={a11y.highContrast}
            onValueChange={(v) => toggleA11y('highContrast', v)}
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
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  note: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
