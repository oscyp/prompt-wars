import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Layout,
} from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import InlineBanner from '@/components/InlineBanner';
import Toast from '@/components/Toast';
import { HEADER_BUTTON_SIZE } from '@/components/HeaderBackButton';
import { invokeAuthenticatedFunction } from '@/utils/supabase';
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
  registerForPushNotifications,
  updateNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/utils/notifications';
import { hapticSelection } from '@/utils/haptics';
import {
  HAPTICS_COPY,
  NOTIFICATION_COPY,
  appVersionLabel,
} from '@/utils/settingsCopy';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const TOAST_MS = 2500;

type ThemeColors = ReturnType<typeof useThemedColors>;

/**
 * A labelled switch whose whole row is the target. A 51×31 switch at the far
 * edge of a row is a small thing to hit; the row is 44pt tall and full width.
 * The Switch itself is hidden from assistive tech so the row is announced once,
 * as one switch, rather than as a label and a separate control.
 */
function SwitchRow({
  label,
  subline,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  colors,
  labelStyle,
  last = false,
}: {
  label: string;
  subline?: string;
  value: boolean;
  onChange?: (next: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  colors: ThemeColors;
  labelStyle?: object;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange?.(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[
        styles.settingRow,
        { borderBottomColor: colors.border },
        last && styles.settingRowLast,
      ]}
    >
      <View style={styles.settingText}>
        <Text style={[styles.settingLabel, { color: colors.text }, labelStyle]}>
          {label}
        </Text>
        {subline ? (
          <Text style={[styles.settingSubline, { color: colors.textTertiary }]}>
            {subline}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

/** A row that goes somewhere: label at the leading edge, chevron trailing. */
function LinkRow({
  label,
  onPress,
  accessibilityLabel,
  role = 'button',
  colors,
  color,
  trailing,
  disabled = false,
  last = false,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  role?: 'button' | 'link';
  colors: ThemeColors;
  color?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.settingRow,
        { borderBottomColor: colors.border },
        last && styles.settingRowLast,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.settingLabel,
          styles.settingText,
          { color: color ?? colors.text },
        ]}
      >
        {label}
      </Text>
      {trailing ?? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textTertiary}
        />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  // Dyslexia-friendly spacing (§22a) — applied to the Accessibility section so
  // toggling it gives immediate on-screen feedback where the switch lives.
  const accessibleText = useAccessibleTextStyle();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  // Theme preference — dark-first (docs/DESIGN_LANGUAGE.md), persisted.
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());

  useEffect(() => {
    loadThemePreference().then(setTheme);
  }, []);

  const [isDeleting, setIsDeleting] = useState(false);

  // Through the provider, not `supabase.auth.signOut()` directly: the provider
  // is what deactivates this device's push token. Calling the client straight
  // left signed-out devices receiving the account's battle notifications.
  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  // App Store 5.1.1(v). Two-step confirm: the destructive alert, then the
  // Edge Function, which requires an explicit "DELETE" confirmation string so
  // a stray invocation cannot erase an account.
  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and personal data. Past battles ' +
        'remain on your opponents’ records, anonymized. This cannot be undone.',
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
              // Through the provider so this device's push token is
              // deactivated; the auth gate in app/_layout.tsx routes to
              // sign-in once the session clears.
              await signOut();
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
  // `reducedMotion` is OR-ed with the OS setting inside `useReducedMotion`;
  // `haptics` drives the global mute in utils/haptics.ts.
  const [a11y, setA11y] = useState<AccessibilityPreferences>(
    getAccessibilityPreferences() ?? DEFAULT_ACCESSIBILITY_PREFERENCES,
  );

  useEffect(() => {
    loadAccessibilityPreferences().then(setA11y);
  }, []);

  const toggleA11y = (key: keyof AccessibilityPreferences, value: boolean) => {
    setA11y((prev) => ({ ...prev, [key]: value }));
    setAccessibilityPreference(key, value);
    // Let the player feel the setting take effect. Runs after the store has
    // applied the new mute state, so turning haptics off stays silent.
    if (key === 'haptics' && value) hapticSelection();
  };

  // Notification preferences (synced with notification_preferences table)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (user?.id) {
      getNotificationPreferences(user.id).then(setNotifPrefs);
    }
  }, [user?.id]);

  // Say up front when the OS has notifications off: every switch below is
  // moot until that changes, and the player can only fix it in Settings.
  useEffect(() => {
    let active = true;
    Notifications.getPermissionsAsync()
      .then((p) => {
        if (active && p.status === 'denied') setPermissionDenied(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const ensurePushPermission = useCallback(async (profileId: string) => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (existing.granted || existing.status === 'granted') {
        setPermissionDenied(false);
        return;
      }
      // Registers the token as a side effect when the prompt is accepted.
      await registerForPushNotifications(profileId);
      const after = await Notifications.getPermissionsAsync();
      setPermissionDenied(!(after.granted || after.status === 'granted'));
    } catch {
      // Permission checks are best-effort; the preference itself still saved.
    }
  }, []);

  const toggleNotif = async (
    category: keyof NotificationPreferences,
    value: boolean,
  ) => {
    if (!user?.id) return;
    const previous = notifPrefs[category];
    setNotifPrefs((prev) => ({ ...prev, [category]: value }));
    try {
      await updateNotificationPreference(user.id, category, value);
    } catch (err) {
      console.warn('Failed to update notification preference:', err);
      setNotifPrefs((prev) => ({ ...prev, [category]: previous }));
      showToast(NOTIFICATION_COPY.updateFailed);
      return;
    }
    if (value) await ensurePushPermission(user.id);
  };

  const version = appVersionLabel(
    Constants.expoConfig?.version,
    Application.nativeBuildVersion,
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + HEADER_BUTTON_SIZE },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Settings
        </Text>

        {/* Appearance */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
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
                  accessibilityState={{ selected, checked: selected }}
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
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
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

          <SwitchRow
            label="Dyslexia-Friendly Font"
            value={a11y.dyslexiaFont}
            onChange={(v) => toggleA11y('dyslexiaFont', v)}
            accessibilityLabel="Toggle dyslexia-friendly font"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Reduced Motion"
            value={a11y.reducedMotion}
            onChange={(v) => toggleA11y('reducedMotion', v)}
            accessibilityLabel="Toggle reduced motion"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="High Contrast Mode"
            value={a11y.highContrast}
            onChange={(v) => toggleA11y('highContrast', v)}
            accessibilityLabel="Toggle high contrast"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label={HAPTICS_COPY.label}
            value={a11y.haptics}
            onChange={(v) => toggleA11y('haptics', v)}
            accessibilityLabel={HAPTICS_COPY.accessibilityLabel}
            colors={colors}
            labelStyle={accessibleText}
            last
          />
        </View>

        {/* Notifications */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Notifications
          </Text>
          <Text
            style={[
              styles.sectionSubtitle,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {NOTIFICATION_COPY.subtitle}
          </Text>

          {permissionDenied ? (
            <View style={styles.banner}>
              <InlineBanner
                tone="warning"
                icon="notifications-off-outline"
                text={NOTIFICATION_COPY.permissionDenied}
                actionLabel={NOTIFICATION_COPY.openSettings}
                onAction={() => Linking.openSettings()}
              />
            </View>
          ) : null}

          <SwitchRow
            label={NOTIFICATION_COPY.resultsLabel}
            subline={NOTIFICATION_COPY.resultsSubline}
            value
            disabled
            accessibilityLabel="Battle result notifications, always on"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Opponent’s Turn"
            value={notifPrefs.opponent_submitted}
            onChange={(v) => toggleNotif('opponent_submitted', v)}
            accessibilityLabel="Toggle opponent submitted notifications"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Cinematic Video Ready"
            value={notifPrefs.video_ready}
            onChange={(v) => toggleNotif('video_ready', v)}
            accessibilityLabel="Toggle video ready notifications"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Daily Quests"
            value={notifPrefs.daily_quest}
            onChange={(v) => toggleNotif('daily_quest', v)}
            accessibilityLabel="Toggle quest notifications"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Friend Challenges"
            value={notifPrefs.friend_challenge}
            onChange={(v) => toggleNotif('friend_challenge', v)}
            accessibilityLabel="Toggle challenge notifications"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Season Ending"
            value={notifPrefs.season_ending}
            onChange={(v) => toggleNotif('season_ending', v)}
            accessibilityLabel="Toggle season ending notifications"
            colors={colors}
            labelStyle={accessibleText}
            last
          />
        </View>

        <Text
          style={[styles.note, accessibleText, { color: colors.textTertiary }]}
        >
          {NOTIFICATION_COPY.note}
        </Text>

        {/* Safety — App Store 1.2 wants blocking discoverable and reversible. */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Safety
          </Text>
          <LinkRow
            label="Blocked Players"
            onPress={() => router.push('/(profile)/blocked')}
            accessibilityLabel="Blocked players"
            colors={colors}
            last
          />
        </View>

        {/* Legal — App Store 3.1.2 requires these reachable in-app. */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Legal
          </Text>
          <LinkRow
            label="Privacy Policy"
            onPress={() => Linking.openURL(Links.privacyPolicy)}
            accessibilityLabel="Privacy policy"
            role="link"
            colors={colors}
          />
          <LinkRow
            label="Terms & Conditions"
            onPress={() => Linking.openURL(Links.termsAndConditions)}
            accessibilityLabel="Terms and conditions"
            role="link"
            colors={colors}
            last
          />
        </View>

        {/* About */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            About
          </Text>
          <View
            style={[styles.settingRow, { borderBottomColor: colors.border }]}
            accessible
            accessibilityLabel={version}
          >
            <Text
              style={[
                styles.settingLabel,
                styles.settingText,
                { color: colors.text },
              ]}
            >
              Version
            </Text>
            <Text
              style={[styles.settingValue, { color: colors.textSecondary }]}
            >
              {version.replace(/^Version /, '')}
            </Text>
          </View>
          {Links.support ? (
            <LinkRow
              label="Support"
              onPress={() => Linking.openURL(Links.support)}
              accessibilityLabel="Support"
              role="link"
              colors={colors}
              trailing={
                <Ionicons
                  name="open-outline"
                  size={18}
                  color={colors.textTertiary}
                />
              }
              last
            />
          ) : null}
        </View>

        {/* Account deletion — App Store 5.1.1(v). */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Account
          </Text>
          <LinkRow
            label="Sign out"
            onPress={confirmSignOut}
            accessibilityLabel="Sign out"
            colors={colors}
          />
          <LinkRow
            label="Delete Account"
            onPress={confirmDeleteAccount}
            accessibilityLabel="Delete account"
            colors={colors}
            color={colors.error}
            disabled={isDeleting}
            trailing={
              isDeleting ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textTertiary}
                />
              )
            }
            last
          />
          <Text
            style={[
              styles.note,
              accessibleText,
              { color: colors.textTertiary },
            ]}
          >
            Permanently deletes your account and personal data. Past battles
            stay on your opponents&apos; records, anonymized. This cannot be
            undone.
          </Text>
        </View>
      </ScrollView>
      {toast ? <Toast text={toast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  section: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.sm,
  },
  banner: {
    marginBottom: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: Typography.sizes.base,
  },
  settingSubline: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  settingValue: {
    fontSize: Typography.sizes.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: Layout.inputHeight,
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
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
});
