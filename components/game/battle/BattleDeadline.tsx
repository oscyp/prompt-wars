import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { exactBattleDeadline } from '@/utils/battleCopy';
import { NumericFontVariant } from '@/constants/DesignTokens';
import { hapticWarning } from '@/utils/haptics';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useBattlePresentationActive } from './useBattlePresentationActive';
export function BattleDeadline({ deadline }: { deadline: string | null }) {
  const active = useBattlePresentationActive();
  const colors = useThemedColors();
  const [now, setNow] = useState(Date.now);
  const fired = useRef(false);
  const ms = deadline ? Date.parse(deadline) : NaN;
  const hasDeadline = Number.isFinite(ms);
  useEffect(() => {
    fired.current = false;
  }, [deadline]);
  useEffect(() => {
    if (!active || !Number.isFinite(ms)) return;
    const currentTime = Date.now();
    setNow(currentTime);
    if (currentTime >= ms) return;
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= ms) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [active, ms]);
  const remaining = ms - now;
  const critical = remaining > 0 && remaining <= 120000;
  useEffect(() => {
    if (active && critical && !fired.current) {
      fired.current = true;
      hapticWarning();
    }
  }, [active, critical, ms]);
  const expired = hasDeadline && remaining <= 0;
  const color =
    critical || expired
      ? colors.error
      : remaining <= 600000
        ? colors.warning
        : colors.textSecondary;
  const totalSeconds = hasDeadline
    ? Math.max(0, Math.ceil(remaining / 1000))
    : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
  const spokenTime = [
    hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : null,
    minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : null,
    seconds ? `${seconds} ${seconds === 1 ? 'second' : 'seconds'}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const label = !hasDeadline
    ? exactBattleDeadline(deadline)
    : expired
      ? 'Lock-in deadline passed'
      : `Lock in · ${clock}`;
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLiveRegion={expired ? 'polite' : 'none'}
      accessibilityLabel={
        hasDeadline && !expired
          ? `${spokenTime} remaining to lock in. ${exactBattleDeadline(deadline)}.`
          : label
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
      }}
    >
      <GameIcon name="clock" size={20} color={color} />
      <GameText style={[NumericFontVariant, { color, flexShrink: 1 }]}>
        {label}
      </GameText>
    </View>
  );
}
