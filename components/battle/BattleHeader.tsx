import React, { useId, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameButton, GameHeader, GameText } from '@/components/game';
/** Screen owns the existing confirmation hook; parking never forfeits. */
export default function BattleHeader({
  onPark,
  parkLabel = 'Arena',
  onLeave,
  leaveDisabled = false,
  leaveLabel = 'Leave',
}: {
  onPark: () => void;
  parkLabel?: string;
  onLeave?: () => void;
  leaveDisabled?: boolean;
  leaveLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const gradientId = `battle-header-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  return (
    <SafeAreaView edges={['top', 'left', 'right']}>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#080714" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#080714" stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      <GameHeader
        presentation="battle"
        titleContent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={parkLabel}
            onPress={onPark}
            style={({ pressed }) => [
              styles.control,
              { alignSelf: 'stretch', opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <GameText variant="label">
              ‹ {parkLabel}
            </GameText>
          </Pressable>
        }
        trailing={
          onLeave ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Battle options"
              onPress={() => setOpen((v) => !v)}
              accessibilityState={{ expanded: open }}
              style={({ pressed }) => [
                styles.control,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <GameText variant="label">Battle options</GameText>
            </Pressable>
          ) : undefined
        }
      />
      {open && onLeave ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
          <GameButton
            label={leaveLabel === 'Leave' ? 'Cancel battle' : leaveLabel}
            tone="secondary"
            disabled={leaveDisabled}
            onPress={() => {
              setOpen(false);
              onLeave();
            }}
          />
          {leaveDisabled ? (
            <GameText variant="caption">
              This battle is finishing. You can still return to Arena.
            </GameText>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  control: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingVertical: 8,
  },
});
