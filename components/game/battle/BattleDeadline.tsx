import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { exactBattleDeadline, formatRemaining } from '@/utils/battleCopy';
import { hapticWarning } from '@/utils/haptics';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useBattlePresentationActive } from './useBattlePresentationActive';
export function BattleDeadline({ deadline }: { deadline: string | null }) {
  const active = useBattlePresentationActive();
  const colors = useThemedColors();
  const [now, setNow] = useState(Date.now);
  const fired = useRef(false);
  const ms = deadline ? Date.parse(deadline) : NaN;
  useEffect(() => {
    fired.current = false;
  }, [deadline]);
  useEffect(() => {
    if (!active || !Number.isFinite(ms)) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, ms]);
  const remaining = ms - now;
  const critical = remaining > 0 && remaining <= 120000;
  useEffect(() => {
    if (active && critical && !fired.current) {
      fired.current = true;
      hapticWarning();
    }
  }, [active, critical]);
  const warning = remaining <= 600000;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <GameIcon name="clock" size={20} />
        <GameText style={{ color: colors.textSecondary, flexShrink: 1 }}>
          {exactBattleDeadline(deadline)}
        </GameText>
      </View>
      {warning && (
        <GameText
          accessibilityLiveRegion="polite"
          style={{
            color: critical || remaining <= 0 ? colors.error : colors.warning,
          }}
        >
          {remaining <= 0
            ? 'Lock-in deadline passed'
            : `${formatRemaining(remaining)} to lock in`}
        </GameText>
      )}
    </View>
  );
}
