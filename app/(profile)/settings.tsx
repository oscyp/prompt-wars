import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { GameText as Text, GamePanel, GameNavRow } from '@/components/game';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  getNotificationPreferences,
  registerForPushNotifications,
  updateNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/utils/notifications';
import { NOTIFICATION_COPY, appVersionLabel } from '@/utils/settingsCopy';
import { setAudioPreference, useAudioPreferences } from '@/utils/audioSettings';

const TOAST_MS = 2500;

type ThemeColors = ReturnType<typeof useThemedColors>;

/**
 * A labelled switch whose whole row is the target. A 51×31 switch at the far
 * edge of a row is a small thing to hit; the row is at least 48pt tall and full width.
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

export default function SettingsScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  // Keep persisted readable-text styling on the remaining settings content.
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

  const [isDeleting, setIsDeleting] = useState(false);
  const audio = useAudioPreferences();

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
        <GameDisplayTitle
          accessibilityRole="header"
          style={[styles.title, accessibleText]}
        >
          Settings
        </GameDisplayTitle>

        {/* Battle audio is independent from haptics and split by intent: a
            player may keep event feedback without the ambient loop. */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Audio
          </Text>
          <SwitchRow
            label="Music"
            subline="Ambient music during battles"
            value={audio.music}
            onChange={(value) => setAudioPreference('music', value)}
            accessibilityLabel="Toggle battle music"
            colors={colors}
            labelStyle={accessibleText}
          />
          <SwitchRow
            label="Sound Effects"
            subline="Match, move, lock-in, and transition feedback"
            value={audio.soundEffects}
            onChange={(value) => setAudioPreference('soundEffects', value)}
            accessibilityLabel="Toggle battle sound effects"
            colors={colors}
            labelStyle={accessibleText}
            last
          />
        </GamePanel>

        {/* Notifications */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
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
        </GamePanel>

        <Text
          style={[styles.note, accessibleText, { color: colors.textTertiary }]}
        >
          {NOTIFICATION_COPY.note}
        </Text>

        {/* Safety — App Store 1.2 wants blocking discoverable and reversible. */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Safety
          </Text>
          <GameNavRow
            inline
            title="Blocked Players"
            gameIcon="shield-check"
            onPress={() => router.push('/(profile)/blocked')}
            accessibilityLabel="Blocked players"
            last
          />
        </GamePanel>

        {/* Legal — App Store 3.1.2 requires these reachable in-app. */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Legal
          </Text>
          <GameNavRow
            inline
            title="Privacy Policy"
            gameIcon="defense"
            onPress={() => Linking.openURL(Links.privacyPolicy)}
            accessibilityLabel="Privacy policy"
            role="link"
          />
          <GameNavRow
            inline
            title="Terms & Conditions"
            gameIcon="scroll"
            onPress={() => Linking.openURL(Links.termsAndConditions)}
            accessibilityLabel="Terms and conditions"
            role="link"
            last
          />
        </GamePanel>

        {/* About */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
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
            <GameNavRow
              inline
              title="Support"
              gameIcon="ideas"
              onPress={() => Linking.openURL(Links.support)}
              accessibilityLabel="Support"
              role="link"
              last
            />
          ) : null}
        </GamePanel>

        {/* Account deletion — App Store 5.1.1(v). */}
        <GamePanel style={[styles.section, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Account
          </Text>
          <GameNavRow
            inline
            title="Sign out"
            gameIcon="external"
            onPress={confirmSignOut}
            accessibilityLabel="Sign out"
          />
          <GameNavRow
            inline
            title="Delete Account"
            gameIcon="blocked"
            onPress={confirmDeleteAccount}
            accessibilityLabel="Delete account"
            color={colors.error}
            busy={isDeleting}
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
        </GamePanel>
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
  note: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
});
