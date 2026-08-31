import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import { useAuth } from '@/providers/AuthProvider';
import FaceOffPortraits, { FaceOffPlayer } from '@/components/FaceOffPortraits';
import PortraitViewer from '@/components/PortraitViewer';
import { supabase, invokeFunctionResult } from '@/utils/supabase';
import { StatBlock } from '@/types/battle';
import { BattleMode } from '@/utils/battles';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';

interface CharacterRow {
  id: string;
  name: string | null;
  archetype: string;
  signature_color: string | null;
  battle_cry: string | null;
  cosmetic_config: Record<string, string> | null;
}

/**
 * Response contract of the `sign-battle-portraits` edge function. Signed URLs
 * (~1h TTL) into the private character-portraits bucket, or null for bots and
 * characters without a generated portrait.
 */
interface SignedPortraitSide {
  portrait_url: string | null;
  /** Full-body render for the tap-to-enlarge viewer; null when there is none. */
  fighter_url: string | null;
  archetype: string | null;
}

interface SignBattlePortraitsResponse {
  player_one: SignedPortraitSide | null;
  player_two: SignedPortraitSide | null;
}

export default function FaceOffScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { user } = useAuth();
  const { battle, prompts, format, hp, hp_max, stats_snapshot, isSubscribed } =
    useRealtimeBattle(battleId || null);

  const [chars, setChars] = useState<{
    p1: CharacterRow | null;
    p2: CharacterRow | null;
  }>({ p1: null, p2: null });
  const [portraits, setPortraits] = useState<{
    p1: string | null;
    p2: string | null;
  }>({ p1: null, p2: null });
  // The full-body renders, opened by tapping a portrait. Separate images from
  // the circle-cropped ones above, not larger crops of them.
  const [fighters, setFighters] = useState<{
    p1: string | null;
    p2: string | null;
  }>({ p1: null, p2: null });
  const [viewer, setViewer] = useState<{
    uri: string;
    caption: string;
  } | null>(null);
  const [signNonce, setSignNonce] = useState(0);
  const [loadingChars, setLoadingChars] = useState(true);
  const handledTerminalRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!battle) return;
      const ids = [
        battle.player_one_character_id,
        battle.player_two_character_id,
      ].filter(Boolean) as string[];
      if (ids.length === 0) {
        setLoadingChars(false);
        return;
      }
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, archetype, signature_color, battle_cry, cosmetic_config')
        .in('id', ids);
      if (cancelled) return;
      if (error || !data) {
        setLoadingChars(false);
        return;
      }
      const byId = new Map<string, CharacterRow>(
        data.map((c) => [c.id as string, c as CharacterRow]),
      );
      setChars({
        p1: byId.get(battle.player_one_character_id) ?? null,
        p2: battle.player_two_character_id
          ? (byId.get(battle.player_two_character_id) ?? null)
          : null,
      });
      setLoadingChars(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [battle]);

  // Fetch signed portrait URLs from the private character-portraits bucket via
  // the sign-battle-portraits edge function. Read-only, ~1h TTL signed URLs;
  // returns null for bots or characters with no portrait. Degrades silently to
  // the bundled archetype illustrations on any failure — never blocks the
  // screen. Real photos only appear once the function is deployed.
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    async function signPortraits() {
      try {
        const { data, error } = await invokeFunctionResult(
          'sign-battle-portraits',
          { battle_id: battleId },
        );
        if (cancelled || error || !data) return;
        const payload = data as SignBattlePortraitsResponse;
        setPortraits({
          p1: payload.player_one?.portrait_url ?? null,
          p2: payload.player_two?.portrait_url ?? null,
        });
        setFighters({
          p1: payload.player_one?.fighter_url ?? null,
          p2: payload.player_two?.fighter_url ?? null,
        });
      } catch {
        // Degrade silently to bundled archetype illustrations.
      }
    }
    signPortraits();
    return () => {
      cancelled = true;
    };
    // signNonce re-signs after a URL expires mid-screen; they last ~1h and the
    // face-off can sit open longer than that.
  }, [battleId, signNonce]);

  const advance = useCallback(() => {
    if (!battleId) return;
    router.replace(`/(battle)/move-select?battleId=${battleId}&round=1`);
  }, [battleId, router]);

  const isRankedHumanMatch =
    battle?.mode === 'ranked' &&
    !battle.is_player_two_bot &&
    Boolean(battle.player_two_id);

  const leaveLabel = isRankedHumanMatch ? 'Forfeit' : 'Leave Battle';

  // Nobody can have locked a prompt yet on this screen, so leaving here is
  // always free and the dialog is byte-for-byte the one that shipped before the
  // toll existed. Routed through the shared hook anyway so the six exit
  // surfaces cannot drift into six different answers.
  const leave = useLeaveBattle(battleId || null, {
    format,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(battle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
  });

  const handleLeave = leave.confirmLeave;

  useEffect(() => {
    if (!battle || handledTerminalRef.current) return;

    if (battle.status === 'canceled') {
      handledTerminalRef.current = true;
      Alert.alert('Battle Canceled', 'This battle is no longer available.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/home') },
      ]);
      return;
    }

    if (battle.status === 'completed') {
      handledTerminalRef.current = true;
      router.replace(`/(battle)/result?battleId=${battleId}`);
    }
  }, [battle, battleId, router]);

  // Defensive fallback: if data fails to load within 4s, advance anyway.
  useEffect(() => {
    if (!battleId) return;
    const t = setTimeout(() => {
      if (!battle) {
        advance();
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [battle, battleId, advance]);

  if (!battle || loadingChars) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          {isSubscribed ? 'Preparing the arena…' : 'Connecting…'}
        </Text>
      </SafeAreaView>
    );
  }

  // Undefined when there is nothing to show, so the portrait stays a plain
  // image rather than a button that does nothing.
  const openViewer = (caption: string, uri: string | null) =>
    uri ? () => setViewer({ uri, caption }) : undefined;

  const playerOne = buildPlayer(
    chars.p1,
    stats_snapshot.p1,
    hp.p1,
    hp_max.p1,
    'Player 1',
    portraits.p1,
    openViewer(chars.p1?.name ?? 'Player 1', fighters.p1 ?? portraits.p1),
  );
  const playerTwo = buildPlayer(
    chars.p2,
    stats_snapshot.p2,
    hp.p2,
    hp_max.p2,
    battle.is_player_two_bot ? 'Bot Opponent' : 'Player 2',
    portraits.p2,
    openViewer(
      chars.p2?.name ?? (battle.is_player_two_bot ? 'Bot Opponent' : 'Player 2'),
      fighters.p2 ?? portraits.p2,
    ),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <FaceOffPortraits
        playerOne={playerOne}
        playerTwo={playerTwo}
        theme={battle.theme}
        onAdvance={advance}
        onLeave={handleLeave}
        leaveLabel={leaveLabel}
        actionsDisabled={leave.isLeaving}
      />
      <PortraitViewer
        visible={viewer !== null}
        uri={viewer?.uri ?? null}
        caption={viewer?.caption}
        // A fighter render is 2:3; the avatar fallback is square, and forcing
        // it into a 2:3 frame would letterbox it.
        aspect={
          viewer &&
          (viewer.uri === fighters.p1 || viewer.uri === fighters.p2)
            ? 1.5
            : 1
        }
        onImageError={() => {
          setViewer(null);
          setSignNonce((n) => n + 1);
        }}
        onClose={() => setViewer(null)}
      />
    </SafeAreaView>
  );
}

function buildPlayer(
  c: CharacterRow | null,
  stats: StatBlock,
  hp: number,
  hpMax: number,
  fallbackName: string,
  portraitUrl: string | null,
  onPortraitPress?: () => void,
): FaceOffPlayer {
  return {
    onPortraitPress,
    characterId: c?.id ?? 'unknown',
    displayName: c?.name ?? fallbackName,
    archetype: c?.archetype ?? 'fighter',
    battleCry: c?.battle_cry ?? null,
    signatureColor: c?.signature_color ?? '#8B5CF6',
    portraitUrl: portraitUrl ?? null,
    cosmetics: resolveEquippedCosmetics(c?.cosmetic_config),
    stats,
    hp,
    hpMax,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  loading: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.base,
  },
});
