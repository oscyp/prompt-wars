import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import {
  Card,
  HapticPressable,
  ScreenContainer,
  SectionHeader,
} from '@/components';

type Item = {
  key: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
};

function SettingsGroup({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: Item[];
}) {
  const colors = useThemedColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      {subtitle && (
        <Text style={[styles.groupSubtitle, { color: colors.textTertiary }]}>
          {subtitle}
        </Text>
      )}
      <Card variant="glass" style={styles.groupCard}>
        {items.map((item, idx) => (
          <View
            key={item.key}
            style={[
              styles.row,
              idx < items.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: `${colors.accent}1F` },
              ]}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={18}
                color={colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              {item.description && (
                <Text
                  style={[styles.rowDesc, { color: colors.textSecondary }]}
                >
                  {item.description}
                </Text>
              )}
            </View>
            <Switch
              value={item.value}
              onValueChange={item.onChange}
              trackColor={{ false: colors.surface2, true: colors.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.surface2}
              accessibilityLabel={`Toggle ${item.title}`}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [dynamicType, setDynamicType] = useState(true);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const [notifyResults, setNotifyResults] = useState(true);
  const [notifyQuests, setNotifyQuests] = useState(true);
  const [notifyChallenges, setNotifyChallenges] = useState(true);

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HapticPressable
          onPress={() => router.back()}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={colors.text}
          />
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </HapticPressable>

        <SectionHeader
          title="Settings"
          eyebrow="Tune your war room"
          size="hero"
        />

        <SettingsGroup
          title="Accessibility"
          items={[
            {
              key: 'dynamic',
              icon: 'format-size',
              title: 'Dynamic Type',
              description: 'Scale text with system size',
              value: dynamicType,
              onChange: setDynamicType,
            },
            {
              key: 'dyslexia',
              icon: 'alphabetical-variant',
              title: 'Dyslexia-Friendly Font',
              value: dyslexiaFont,
              onChange: setDyslexiaFont,
            },
            {
              key: 'reduced-motion',
              icon: 'motion-pause',
              title: 'Reduce Motion',
              value: reducedMotion,
              onChange: setReducedMotion,
            },
            {
              key: 'contrast',
              icon: 'contrast-circle',
              title: 'High Contrast',
              value: highContrast,
              onChange: setHighContrast,
            },
          ]}
        />

        <SettingsGroup
          title="Notifications"
          subtitle="Max 2 per day, must-send only for results"
          items={[
            {
              key: 'results',
              icon: 'bell-alert-outline',
              title: 'Battle Results',
              description: 'Must-send',
              value: notifyResults,
              onChange: setNotifyResults,
            },
            {
              key: 'quests',
              icon: 'flag-checkered',
              title: 'Daily Quests',
              value: notifyQuests,
              onChange: setNotifyQuests,
            },
            {
              key: 'challenges',
              icon: 'account-group-outline',
              title: 'Friend Challenges',
              value: notifyChallenges,
              onChange: setNotifyChallenges,
            },
          ]}
        />

        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          Preferences stored locally. Server-side sync coming soon.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
  },
  group: {
    marginTop: Spacing.lg,
  },
  groupTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: 4,
  },
  groupSubtitle: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.sm,
  },
  groupCard: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
  },
  rowDesc: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  footer: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
