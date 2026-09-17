import { GameButton } from '@/components/game';
import { GameText } from '@/components/game';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { supabase, invokeAuthenticatedFunction } from '@/utils/supabase';
import { generateIdempotencyKey } from '@/utils/characters';
import { isValidAllocation, statTotal } from '@/utils/statAllocation';
import type { StatBlock } from '@/types/battle';
import StatAllocator from './StatAllocator';
import BottomSheet from './sheets/BottomSheet';
export default function CharacterRespec({
  characterId,
  disabled = false,
}: {
  characterId: string;
  disabled?: boolean;
}) {
  const colors = useThemedColors();
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const locked = useRef(disabled);
  locked.current = disabled;
  const saving = useRef(false);
  const [stats, setStats] = useState<StatBlock | null>(null);
  const [pool, setPool] = useState(20);
  const [eligible, setEligible] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(generateIdempotencyKey());
  useEffect(() => {
    let active = true;
    setError(false);
    void Promise.all([
      supabase
        .from('character_respecs')
        .select('used_at')
        .eq('character_id', characterId)
        .maybeSingle(),
      supabase
        .from('characters')
        .select('stat_strength,stat_stamina,stat_agility,stat_focus')
        .eq('id', characterId)
        .single(),
    ])
      .then(([r, c]) => {
        if (!active) return;
        if (r.error || c.error) throw new Error();
        setEligible(!!r.data && !r.data.used_at);
        if (c.data) {
          const s = {
            strength: c.data.stat_strength,
            stamina: c.data.stat_stamina,
            agility: c.data.stat_agility,
            focus: c.data.stat_focus,
          };
          setStats(s);
          setPool(statTotal(s));
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [characterId, retry]);
  const save = async () => {
    if (
      locked.current ||
      saving.current ||
      !stats ||
      !isValidAllocation(stats, pool)
    )
      return;
    saving.current = true;
    setBusy(true);
    try {
      await invokeAuthenticatedFunction('respec-character', {
        character_id: characterId,
        request_id: requestId.current,
        stats,
      });
      setEligible(false);
      Alert.alert(
        'Stats updated',
        'Your new allocation applies to future battles.',
      );
    } catch (e) {
      Alert.alert(
        'Could not update stats',
        e instanceof Error ? e.message : 'Try again.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  if (error)
    return (
      <GameButton
        accessibilityRole="button"
        onPress={() => setRetry((v) => v + 1)}
        style={{ minHeight: 48, padding: 16 }}
        tone="secondary"
        label="Retry free respec eligibility"
      />
    );
  if (!eligible || !stats) return null;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <GameButton
        ref={opener}
        label="Reallocate stats · Free"
        tone="secondary"
        onPress={() => setOpen(true)}
      />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Stat allocation"
        closeAccessibilityLabel="Close stat allocation"
        returnFocusRef={opener}
        dismissDisabled={busy}
        footer={
          <GameButton
            label="Back to editing"
            onPress={() => setOpen(false)}
            disabled={busy}
          />
        }
      >
        <GameText
          variant="body"
          accessibilityRole="header"
          style={{ color: colors.text, fontWeight: '600' }}
        >
          Free v2 stat respec
        </GameText>
        <GameText variant="body" style={{ color: colors.text }}>
          Redistribute your {pool} points once, free. Active battles keep their
          original stats.
        </GameText>
        <StatAllocator
          value={stats}
          onChange={(next) => {
            if (!locked.current && !saving.current) setStats(next);
          }}
          pointTotal={pool}
          accentColor={colors.primary}
          disabled={busy || disabled}
        />
        <GameButton
          accessibilityRole="button"
          disabled={busy || disabled || !isValidAllocation(stats, pool)}
          style={{ minHeight: 48, justifyContent: 'center' }}
          onPress={() =>
            Alert.alert(
              'Use your free respec?',
              `Save this allocation of ${pool} points? This uses your one free v2 respec.`,
              [
                { text: 'Keep editing', style: 'cancel' },
                { text: 'Confirm free respec', onPress: () => void save() },
              ],
            )
          }
          tone="secondary"
          label={busy ? 'Saving…' : 'Confirm free respec'}
        />
      </BottomSheet>
    </View>
  );
}
