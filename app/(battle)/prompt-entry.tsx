import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import {
  getBattle,
  getPromptTemplates,
  submitPrompt,
  MoveType,
} from '@/utils/battles';
import {
  ActivityIndicator,
} from 'react-native';
import {
  Card,
  GlassInput,
  GlowGradientButton,
  HapticPressable,
  MoveTypeSegmented,
  ProgressBar,
  ScreenContainer,
  SectionHeader,
} from '@/components';

const MIN_CHARS = 20;
const MAX_CHARS = 800;

const MOVE_META: Record<
  MoveType,
  {
    gradient: readonly string[];
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    label: string;
    counter: string;
  }
> = {
  attack: {
    gradient: Gradients.heroAttack,
    icon: 'sword',
    label: 'ATTACK',
    counter: 'Beats Finisher',
  },
  defense: {
    gradient: Gradients.heroDefense,
    icon: 'shield',
    label: 'DEFENSE',
    counter: 'Beats Attack',
  },
  finisher: {
    gradient: Gradients.heroFinisher,
    icon: 'star-four-points',
    label: 'FINISHER',
    counter: 'Beats Defense',
  },
};

export default function PromptEntryScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const [battle, setBattle] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [moveType, setMoveType] = useState<MoveType>('attack');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  const loadData = async () => {
    if (!battleId) {
      Alert.alert('Error', 'No battle ID');
      router.back();
      return;
    }
    try {
      const [battleData, templatesData] = await Promise.all([
        getBattle(battleId as string),
        getPromptTemplates(),
      ]);
      setBattle(battleData);
      setTemplates(templatesData || []);
    } catch (err) {
      console.error('Failed to load prompt entry data:', err);
      Alert.alert('Error', 'Failed to load battle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!battleId) return;
    if (!isCustom && !selectedTemplate) {
      Alert.alert('Select a Prompt', 'Please select a template or write a custom prompt');
      return;
    }
    if (isCustom && customText.trim().length < MIN_CHARS) {
      Alert.alert('Prompt Too Short', `Custom prompts must be at least ${MIN_CHARS} characters`);
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitPrompt(
        battleId as string,
        moveType,
        isCustom ? undefined : selectedTemplate || undefined,
        isCustom ? customText : undefined,
      );
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/(battle)/waiting?battleId=${battleId}`);
      } else {
        throw new Error(result.error || 'Failed to submit prompt');
      }
    } catch (err) {
      console.error('Submit error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const meta = MOVE_META[moveType];
  const charLen = customText.length;
  const charProgress = Math.min(charLen / MAX_CHARS, 1);

  return (
    <ScreenContainer padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + Spacing.lg,
              paddingBottom: insets.bottom + Spacing.xxl,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Theme banner */}
          {battle?.theme && (
            <LinearGradient
              colors={meta.gradient as unknown as readonly [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.themeBanner}
            >
              <Text style={styles.themeEyebrow}>TODAY'S THEME</Text>
              <Text style={styles.themeText}>"{battle.theme}"</Text>
            </LinearGradient>
          )}

          <View style={{ height: Spacing.lg }} />

          <Text style={[styles.label, { color: colors.text }]}>Move Type</Text>
          <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
            Attack beats Finisher · Defense beats Attack · Finisher beats Defense
          </Text>
          <MoveTypeSegmented value={moveType} onChange={setMoveType} />

          <View style={styles.toggleRow}>
            {(['template', 'custom'] as const).map((opt) => {
              const isActive = (opt === 'custom') === isCustom;
              return (
                <HapticPressable
                  key={opt}
                  onPress={() => setIsCustom(opt === 'custom')}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={opt === 'custom' ? 'Write custom' : 'Use templates'}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor: isActive
                        ? `${colors.accent}26`
                        : colors.surface1,
                      borderColor: isActive ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={opt === 'custom' ? 'pencil-outline' : 'view-list-outline'}
                    size={16}
                    color={isActive ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      { color: isActive ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {opt === 'custom' ? 'Custom' : 'Templates'}
                  </Text>
                </HapticPressable>
              );
            })}
          </View>

          {!isCustom ? (
            <View style={styles.section}>
              <SectionHeader title="Choose a Template" size="md" />
              {templates.slice(0, 5).map((template) => {
                const selected = selectedTemplate === template.id;
                return (
                  <HapticPressable
                    key={template.id}
                    onPress={() => setSelectedTemplate(template.id)}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`Select template: ${template.title}`}
                  >
                    <Card
                      variant={selected ? 'neon' : 'glass'}
                      style={styles.templateCard}
                    >
                      <View style={styles.templateHeader}>
                        <Text
                          style={[
                            styles.templateTitle,
                            { color: colors.text },
                          ]}
                        >
                          {template.title}
                        </Text>
                        {selected && (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={20}
                            color={colors.accent}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.templateText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {template.body}
                      </Text>
                    </Card>
                  </HapticPressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.section}>
              <GlassInput
                label="Your Prompt"
                placeholder={`${MIN_CHARS}–${MAX_CHARS} characters…`}
                value={customText}
                onChangeText={setCustomText}
                multiline
                numberOfLines={6}
                maxLength={MAX_CHARS}
                accessibilityLabel="Custom prompt input"
                style={{ minHeight: 160 }}
              />
              <View style={styles.charRow}>
                <ProgressBar
                  progress={charProgress}
                  height={4}
                  gradient={meta.gradient as unknown as readonly [string, string]}
                />
                <Text
                  style={[styles.charCount, { color: colors.textTertiary }]}
                >
                  {charLen} / {MAX_CHARS}
                </Text>
              </View>
            </View>
          )}

          <View style={{ height: Spacing.md }} />
          <GlowGradientButton
            title={isSubmitting ? 'Submitting…' : `Submit ${meta.label}`}
            onPress={handleSubmit}
            variant={moveType}
            size="lg"
            loading={isSubmitting}
            disabled={isSubmitting}
            fullWidth
            iconRight="arrow-right-bold"
            accessibilityLabel="Submit prompt"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  themeBanner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  themeEyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.xl,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.tight,
    lineHeight: Typography.sizes.xl * 1.2,
  },
  label: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.lg,
    letterSpacing: Typography.letterSpacing.wide,
    marginBottom: Spacing.xs,
  },
  sublabel: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  toggleText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    letterSpacing: Typography.letterSpacing.wide,
  },
  section: {
    marginTop: Spacing.lg,
  },
  templateCard: {
    marginBottom: Spacing.sm,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  templateTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
    flex: 1,
    marginRight: Spacing.sm,
  },
  templateText: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    lineHeight: Typography.sizes.sm * 1.5,
  },
  charRow: {
    marginTop: Spacing.sm,
  },
  charCount: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
    marginTop: 4,
  },
});
