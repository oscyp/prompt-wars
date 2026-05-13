import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ARCHETYPES, ARCHETYPE_LIST, ArchetypeId } from '@/constants/Archetypes';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { checkAccountEligibility, getDeviceFingerprint } from '@/utils/safety';
import {
  ArchetypeCard,
  GlassInput,
  GlowGradientButton,
  NeonGridBackground,
  ScreenContainer,
  SectionHeader,
} from '@/components';

const getDefaultUsername = (userId: string) =>
  `user_${userId.replace(/-/g, '').slice(0, 15)}`;

export default function CreateCharacterScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<ArchetypeId>(
    ARCHETYPE_LIST[0].id
  );
  const [battleCry, setBattleCry] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const cardWidth = Math.min(width - Spacing.xl * 2, 280);
  const sidePad = (width - cardWidth) / 2;
  const listRef = useRef<FlatList>(null);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    const clamped = Math.max(0, Math.min(ARCHETYPE_LIST.length - 1, idx));
    setArchetype(ARCHETYPE_LIST[clamped].id);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedBattleCry = battleCry.trim();
    if (
      !user ||
      !archetype ||
      trimmedName.length < 3 ||
      trimmedBattleCry.length < 3
    ) {
      return;
    }
    setIsCreating(true);
    try {
      const { data: existingProfile, error: profileLookupError } =
        await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();
      if (profileLookupError) throw new Error(profileLookupError.message);

      if (existingProfile) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ display_name: trimmedName })
          .eq('id', user.id);
        if (profileError) throw new Error(profileError.message);
      } else {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: user.id,
          username: getDefaultUsername(user.id),
          display_name: trimmedName,
        });
        if (profileError) throw new Error(profileError.message);
      }

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
      }

      const { data: character, error: characterError } = await supabase
        .from('characters')
        .insert({
          profile_id: user.id,
          name: trimmedName,
          archetype,
          battle_cry: trimmedBattleCry,
          signature_color: ARCHETYPES[archetype].color,
        })
        .select()
        .single();
      if (characterError) throw new Error(characterError.message);
      console.log('Character created:', character);

      router.replace('/(tabs)/home');
    } catch (err) {
      console.error('Failed to create character:', err);
      Alert.alert(
        'Error',
        err instanceof Error
          ? err.message
          : 'Failed to create character. Please try again.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate =
    name.trim().length >= 3 &&
    Boolean(archetype) &&
    battleCry.trim().length >= 3 &&
    !isCreating;

  const selectedArch = ARCHETYPES[archetype];

  return (
    <ScreenContainer padded={false}>
      <NeonGridBackground
        glowColors={[`${selectedArch.gradient[1]}88`, `${colors.background}00`, `${colors.background}00`]}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <FlatList
          data={[null]}
          renderItem={null}
          keyExtractor={(_, i) => `wrap-${i}`}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              <View style={{ paddingHorizontal: Spacing.lg }}>
                <SectionHeader
                  title="Forge Your Warrior"
                  eyebrow="Step 1 of 1"
                  subtitle="Choose your name, archetype, and battle cry."
                  size="lg"
                />
                <View style={{ height: Spacing.md }} />
                <GlassInput
                  label="Warrior Name"
                  iconLeft="account-edit-outline"
                  placeholder="e.g., Nyx the Quiet"
                  value={name}
                  onChangeText={setName}
                  maxLength={30}
                  accessibilityLabel="Character name input"
                />
                <View style={{ height: Spacing.lg }} />
                <Text style={[styles.label, { color: colors.text }]}>
                  Choose Your Archetype
                </Text>
                <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
                  All archetypes are free and balanced.
                </Text>
              </View>

              <FlatList
                ref={listRef}
                data={ARCHETYPE_LIST}
                horizontal
                pagingEnabled={false}
                snapToInterval={cardWidth}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: sidePad }}
                onMomentumScrollEnd={onMomentumScrollEnd}
                initialScrollIndex={0}
                getItemLayout={(_, idx) => ({
                  length: cardWidth,
                  offset: cardWidth * idx,
                  index: idx,
                })}
                renderItem={({ item }) => (
                  <View style={{ width: cardWidth, paddingHorizontal: Spacing.xs }}>
                    <ArchetypeCard
                      archetypeId={item.id}
                      selected={item.id === archetype}
                      onPress={() => {
                        setArchetype(item.id);
                        const idx = ARCHETYPE_LIST.findIndex(
                          (a) => a.id === item.id
                        );
                        listRef.current?.scrollToIndex({
                          index: idx,
                          animated: true,
                        });
                      }}
                    />
                  </View>
                )}
                keyExtractor={(item) => item.id}
              />

              <View style={styles.dots}>
                {ARCHETYPE_LIST.map((arch) => (
                  <View
                    key={arch.id}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          arch.id === archetype ? arch.color : colors.borderStrong,
                        width: arch.id === archetype ? 20 : 6,
                      },
                    ]}
                  />
                ))}
              </View>

              <View
                style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}
              >
                <GlassInput
                  label="Battle Cry"
                  helper={`${battleCry.length}/60 · Shown on every result`}
                  iconLeft="bullhorn-outline"
                  placeholder="Victory through wisdom!"
                  value={battleCry}
                  onChangeText={setBattleCry}
                  maxLength={60}
                  accessibilityLabel="Battle cry input"
                />
                <View style={{ height: Spacing.xl }} />
                <GlowGradientButton
                  title={canCreate ? 'Enter the Arena' : 'Complete All Fields'}
                  onPress={handleCreate}
                  variant="primary"
                  size="lg"
                  loading={isCreating}
                  disabled={!canCreate}
                  fullWidth
                  iconRight="arrow-right-bold"
                  accessibilityLabel="Create character"
                />
              </View>
            </>
          }
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxxl * 2,
  },
  label: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.lg,
    letterSpacing: Typography.letterSpacing.wide,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  sublabel: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
