import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

export default function SettingsScreen() {
  const colors = useThemedColors();

  // Local state for accessibility preferences
  const [dynamicType, setDynamicType] = useState(true);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // Notification preferences
  const [notifyResults, setNotifyResults] = useState(true);
  const [notifyQuests, setNotifyQuests] = useState(true);
  const [notifyChallenges, setNotifyChallenges] = useState(true);

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
            value={notifyResults}
            onValueChange={setNotifyResults}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle result notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Daily Quests</Text>
          <Switch
            value={notifyQuests}
            onValueChange={setNotifyQuests}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle quest notifications"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Friend Challenges</Text>
          <Switch
            value={notifyChallenges}
            onValueChange={setNotifyChallenges}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Toggle challenge notifications"
          />
        </View>
      </View>

      <Text style={[styles.note, { color: colors.textTertiary }]}>
        Note: These preferences are stored locally. Server-side notification settings will be
        implemented in a future update.
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
