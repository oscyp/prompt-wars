import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { checkAccountEligibility, getDeviceFingerprint } from '@/utils/safety';
import { Platform } from 'react-native';

export default function CreateCharacterScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<ArchetypeId | null>(null);
  const [battleCry, setBattleCry] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!user || !archetype) return;

    setIsCreating(true);

    try {
      // First check if user already has a profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      // Create or update profile if needed
      if (!existingProfile) {
        const username = user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`;
        
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            username,
            display_name: name,
          });

        if (profileError) {
          throw new Error(profileError.message);
        }
      }

      // Check account eligibility for onboarding credits
      try {
        const deviceFp = getDeviceFingerprint();
        const eligibility = await checkAccountEligibility({
          action: 'onboarding_credits',
          deviceFingerprint: deviceFp,
          platform: Platform.OS as 'ios' | 'android',
        });

        console.log('Account eligibility:', eligibility);
      } catch (err) {
        console.warn('Account guard check failed:', err);
        // Continue anyway - server will make final decision
      }

      // Create character
      const { data: character, error: characterError } = await supabase
        .from('characters')
        .insert({
          profile_id: user.id,
          name,
          archetype,
          battle_cry: battleCry,
          signature_color: ARCHETYPES[archetype].color,
        })
        .select()
        .single();

      if (characterError) {
        throw new Error(characterError.message);
      }

      console.log('Character created:', character);

      // Navigate to main app
      router.replace('/(tabs)/home');
    } catch (err) {
      console.error('Failed to create character:', err);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to create character. Please try again.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = name.length >= 3 && archetype && battleCry.length >= 3 && !isCreating;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Create Your Character
      </Text>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.card, color: colors.text },
          ]}
          placeholder="Enter your warrior name"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
          maxLength={30}
          accessibilityLabel="Character name input"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>
          Choose Your Archetype
        </Text>
        <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
          All archetypes are free and balanced
        </Text>

        {Object.values(ARCHETYPES).map((arch) => (
          <TouchableOpacity
            key={arch.id}
            style={[
              styles.archetypeCard,
              { backgroundColor: colors.card },
              archetype === arch.id && {
                borderColor: arch.color,
                borderWidth: 2,
              },
            ]}
            onPress={() => setArchetype(arch.id)}
            accessibilityLabel={`Select ${arch.name} archetype`}
            accessibilityRole="button"
          >
            <View style={styles.archetypeHeader}>
              <View
                style={[styles.archetypeColor, { backgroundColor: arch.color }]}
              />
              <Text style={[styles.archetypeName, { color: colors.text }]}>
                {arch.name}
              </Text>
            </View>
            <Text
              style={[styles.archetypeDescription, { color: colors.textSecondary }]}
            >
              {arch.description}
            </Text>
            <Text style={[styles.archetypeTrait, { color: colors.textTertiary }]}>
              Trait: {arch.trait}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>
          Battle Cry
        </Text>
        <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
          A short phrase shown on every result (max 60 characters)
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.card, color: colors.text },
          ]}
          placeholder="e.g., Victory through wisdom!"
          placeholderTextColor={colors.textTertiary}
          value={battleCry}
          onChangeText={setBattleCry}
          maxLength={60}
          accessibilityLabel="Battle cry input"
        />
        <Text style={[styles.characterCount, { color: colors.textTertiary }]}>
          {battleCry.length}/60
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: colors.primary },
          !canCreate && styles.buttonDisabled,
        ]}
        onPress={handleCreate}
        disabled={!canCreate}
        accessibilityLabel="Create character button"
        accessibilityRole="button"
      >
        {isCreating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {canCreate ? 'Enter the Arena' : 'Complete All Fields'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  sublabel: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.md,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.sizes.base,
  },
  characterCount: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  archetypeCard: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  archetypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  archetypeColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: Spacing.sm,
  },
  archetypeName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  archetypeDescription: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  archetypeTrait: {
    fontSize: Typography.sizes.xs,
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
