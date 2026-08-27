import React from 'react';
import { View, Text } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { formatCredits } from '@/utils/credits';
import { formatCooldown } from '@/utils/editCooldowns';
import { editStyles as s } from './styles';

export interface EditCardShellProps {
  title: string;
  subtitle?: string;
  cost: number;
  /** Remaining cooldown. When > 0 the card's controls stop taking taps. */
  cooldownMs?: number;
  /** Marks the card as carrying an unsaved change. */
  changed?: boolean;
  /** Disables the card for a reason other than cooldown (battle lock, pricing). */
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Wrapper for one editable field: title, one badge, and its controls.
 *
 * The badge is deliberately singular. Cards used to carry both a "Free · 24h
 * cooldown" subtitle and a separate green "Free" badge, so the same fact was
 * stated twice and the cooldown -- the part that actually blocks you -- was the
 * half buried in prose. Now the badge shows the wait when there is one and the
 * price otherwise.
 */
export default function EditCardShell({
  title,
  subtitle,
  cost,
  cooldownMs,
  changed = false,
  disabled = false,
  children,
}: EditCardShellProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const cooling = typeof cooldownMs === 'number' && cooldownMs > 0;
  const inert = cooling || disabled;

  return (
    <View style={[s.card, { backgroundColor: colors.card }]}>
      <View style={s.cardHeader}>
        <View style={s.flex1}>
          <View style={s.titleWrap}>
            <Text style={[s.cardTitle, accessibleText, { color: colors.text }]}>
              {title}
            </Text>
            {changed ? (
              <View
                style={[s.changedDot, { backgroundColor: colors.primary }]}
              />
            ) : null}
          </View>
          {subtitle ? (
            <Text
              style={[
                s.cardSub,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={s.badge}>
          <Text
            style={[
              s.badgeText,
              {
                color: cooling
                  ? colors.warning
                  : cost === 0
                    ? colors.success
                    : colors.primary,
              },
            ]}
          >
            {cooling
              ? `Available in ${formatCooldown(cooldownMs)}`
              : formatCredits(cost)}
          </Text>
        </View>
      </View>
      <View
        pointerEvents={inert ? 'none' : 'auto'}
        style={inert ? s.cooledDown : undefined}
      >
        {children}
      </View>
    </View>
  );
}
