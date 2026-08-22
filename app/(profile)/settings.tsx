import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  getThemePreference,
  loadThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/utils/themeSettings';
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
  // Dyslexia-friendly spacing (§22a) — applied to the Accessibility section so
  // toggling it gives immediate on-screen feedback where the switch lives.
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();

  // Theme preference — dark-first (docs/DESIGN_LANGUAGE.md), persisted.
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());

  useEffect(() => {
    loadThemePreference().then(setTheme);
  }, []);

  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  // App Store 5.1.1(v). Two-step confirm: the destructive alert, then the
  // Edge Function, which requires an explicit "DELETE" confirmation string so
  // a stray invocation cannot erase an account.
  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and personal data. Past battles ' +
        'remain on your opponents\u2019 records, anonymized. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await invokeAuthenticatedFunction('delete-account', {
                confirm: 'DELETE',
              });
              await supabase.auth.signOut();
              // The auth gate in app/_layout.tsx routes to sign-in once the
              // session clears.
            } catch (err) {
              setIsDeleting(false);
              Alert.alert(
                'Could not delete account',
                err instanceof Error
                  ? err.message
                  : 'Something went wrong. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      {/* Appearance */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Appearance
        </Text>
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
        <Text
          style={[styles.sectionTitle, { color: colors.text }, accessibleText]}
        >
          Accessibility
        </Text>

        {/* "Dynamic Type" used to be a switch here. It wrote a preference that
            nothing read -- no allowFontScaling, no maxFontSizeMultiplier, no
            consumer anywhere -- so flipping it did nothing at all.
            It is removed rather than wired because React Native honours the
            OS text-size setting by default (allowFontScaling defaults to true),
            so the app already supports Dynamic Type. The switch promised
            control over something that needs no control, and an accessibility
            toggle that silently does nothing is worse than no toggle. */}

        <View style={styles.settingRow}>
          <Text
            style={[
              styles.settingLabel,
              { color: colors.text },
              accessibleText,
            ]}
          >
            Dyslexia-Friendly Font
          </Text>
          <Switch
            value={a11y.dyslexiaFont}
            onValueChange={(v) => toggleA11y('dyslexiaFont', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle dyslexia-friendly font"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Reduced Motion
          </Text>
          <Switch
            value={a11y.reducedMotion}
            onValueChange={(v) => toggleA11y('reducedMotion', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle reduced motion"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            High Contrast Mode
          </Text>
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
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Notifications
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Max 2 per day, must-send only for results
        </Text>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Battle Results (Must-Send)
          </Text>
          <Switch
            value={true}
            disabled
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Result notifications are always on"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Opponent&apos;s Turn
          </Text>
          <Switch
            value={notifPrefs.opponent_submitted}
            onValueChange={(v) => toggleNotif('opponent_submitted', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle opponent submitted notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Cinematic Video Ready
          </Text>
          <Switch
            value={notifPrefs.video_ready}
            onValueChange={(v) => toggleNotif('video_ready', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle video ready notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Daily Quests
          </Text>
          <Switch
            value={notifPrefs.daily_quest}
            onValueChange={(v) => toggleNotif('daily_quest', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle quest notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Friend Challenges
          </Text>
          <Switch
            value={notifPrefs.friend_challenge}
            onValueChange={(v) => toggleNotif('friend_challenge', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle challenge notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Season Ending
          </Text>
          <Switch
            value={notifPrefs.season_ending}
            onValueChange={(v) => toggleNotif('season_ending', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle season ending notifications"
          />
        </View>
      </View>

      <Text style={[styles.note, { color: colors.textTertiary }]}>
        Battle results always notify you. All other categories respect the
        2-per-day cap and your quiet hours.
      </Text>

      {/* Safety — App Store 1.2 wants blocking discoverable and reversible. */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Safety</Text>
        <Pressable
          style={styles.settingRow}
          onPress={() => router.push('/(profile)/blocked')}
          accessibilityRole="button"
          accessibilityLabel="Blocked players"
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Blocked Players
          </Text>
          <Text style={[styles.settingLabel, { color: colors.textTertiary }]}>
            ›
          </Text>
        </Pressable>
      </View>

      {/* Legal — App Store 3.1.2 requires these reachable in-app. */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Legal</Text>
        <Pressable
          style={styles.settingRow}
          onPress={() => Linking.openURL(Links.privacyPolicy)}
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Privacy Policy
          </Text>
          <Text style={[styles.settingLabel, { color: colors.textTertiary }]}>
            ›
          </Text>
        </Pressable>
        <Pressable
          style={styles.settingRow}
          onPress={() => Linking.openURL(Links.termsAndConditions)}
          accessibilityRole="link"
          accessibilityLabel="Terms and conditions"
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>
            Terms &amp; Conditions
          </Text>
          <Text style={[styles.settingLabel, { color: colors.textTertiary }]}>
            ›
          </Text>
        </Pressable>
      </View>

      {/* Account deletion — App Store 5.1.1(v). */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Account
        </Text>
        <Pressable
          style={styles.settingRow}
          onPress={confirmDeleteAccount}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Text style={[styles.settingLabel, { color: colors.error }]}>
            Delete Account
          </Text>
          {isDeleting ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={[styles.settingLabel, { color: colors.textTertiary }]}>
              ›
            </Text>
          )}
        </Pressable>
        <Text style={[styles.note, { color: colors.textTertiary }]}>
          Permanently deletes your account and personal data. Past battles stay
          on your opponents&apos; records, anonymized. This cannot be undone.
        </Text>
      </View>
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
