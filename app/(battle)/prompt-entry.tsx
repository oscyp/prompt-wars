import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { getBattle, getPromptTemplates, submitPrompt, MoveType } from '@/utils/battles';
import { useAuth } from '@/providers/AuthProvider';

export default function PromptEntryScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
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

    if (isCustom && customText.trim().length < 20) {
      Alert.alert('Prompt Too Short', 'Custom prompts must be at least 20 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitPrompt(
        battleId as string,
        moveType,
        isCustom ? undefined : selectedTemplate || undefined,
        isCustom ? customText : undefined
      );

      if (result.success) {
        Alert.alert('Prompt Submitted!', 'Waiting for opponent...', [
          { text: 'OK', onPress: () => router.replace(`/(battle)/waiting?battleId=${battleId}`) }
        ]);
      } else {
        throw new Error(result.error || 'Failed to submit prompt');
      }
    } catch (err) {
      console.error('Submit error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Write Your Prompt</Text>

        {battle?.theme && (
          <View style={[styles.themeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>Battle Theme</Text>
            <Text style={[styles.themeText, { color: colors.primary }]}>{battle.theme}</Text>
          </View>
        )}

        {/* Move Type Selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Move Type</Text>
          <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
            Attack beats Finisher • Defense beats Attack • Finisher beats Defense
          </Text>
          <View style={styles.moveTypeButtons}>
            {(['attack', 'defense', 'finisher'] as MoveType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.moveTypeButton,
                  { backgroundColor: moveType === type ? colors[type] : colors.card },
                ]}
                onPress={() => setMoveType(type)}
                accessibilityLabel={`Select ${type} move`}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.moveTypeText,
                    { color: moveType === type ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Template/Custom Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              !isCustom && { backgroundColor: colors.primary },
              isCustom && { backgroundColor: colors.card },
            ]}
            onPress={() => setIsCustom(false)}
            accessibilityLabel="Use template"
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, { color: !isCustom ? '#FFFFFF' : colors.text }]}>
              Templates
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              isCustom && { backgroundColor: colors.primary },
              !isCustom && { backgroundColor: colors.card },
            ]}
            onPress={() => setIsCustom(true)}
            accessibilityLabel="Write custom"
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, { color: isCustom ? '#FFFFFF' : colors.text }]}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>

        {/* Template List */}
        {!isCustom && (
          <View style={styles.section}>
            {templates.slice(0, 5).map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateCard,
                  { backgroundColor: colors.card },
                  selectedTemplate === template.id && {
                    borderColor: colors.primary,
                    borderWidth: 2,
                  },
                ]}
                onPress={() => setSelectedTemplate(template.id)}
                accessibilityLabel={`Select template: ${template.title}`}
                accessibilityRole="button"
              >
                <Text style={[styles.templateTitle, { color: colors.text }]}>
                  {template.title}
                </Text>
                <Text style={[styles.templateText, { color: colors.textSecondary }]}>
                  {template.body}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Custom Prompt Input */}
        {isCustom && (
          <View style={styles.section}>
            <TextInput
              style={[
                styles.customInput,
                { backgroundColor: colors.card, color: colors.text },
              ]}
              placeholder="Write your prompt (20-800 characters)..."
              placeholderTextColor={colors.textTertiary}
              value={customText}
              onChangeText={setCustomText}
              multiline
              maxLength={800}
              accessibilityLabel="Custom prompt input"
            />
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {customText.length}/800 characters
            </Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary },
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityLabel="Submit prompt"
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Prompt</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  themeCard: {
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.lg,
  },
  themeLabel: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  sublabel: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.md,
  },
  moveTypeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  moveTypeButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  moveTypeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  toggleButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  templateCard: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  templateTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  templateText: {
    fontSize: Typography.sizes.sm,
  },
  customInput: {
    minHeight: 120,
    padding: Spacing.md,
    borderRadius: 8,
    fontSize: Typography.sizes.base,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  submitButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
