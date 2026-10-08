import React from 'react';
import { View } from 'react-native';
import { GameText } from './GameText';
import { GameButton } from './GameButton';
import { GameIcon, type GameIconName } from './icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Quiet, steady feedback. The caller owns the distinction between empty and failed reads. */
export function GameFeedback({
  icon,
  title,
  message,
  action,
  tone = 'neutral',
  busy = false,
  layout = 'stacked',
}: {
  icon: GameIconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  tone?: 'neutral' | 'error';
  busy?: boolean;
  layout?: 'stacked' | 'inline';
}) {
  const colors = useThemedColors();
  const inline = layout === 'inline';
  return (
    <View
      style={{
        padding: 20,
        gap: 12,
        alignItems: 'flex-start',
        alignSelf: 'stretch',
      }}
      accessibilityLiveRegion="polite"
    >
      <View
        style={{
          flexDirection: inline ? 'row' : 'column',
          alignItems: inline ? 'center' : 'flex-start',
          alignSelf: inline ? 'center' : 'stretch',
          maxWidth: '100%',
          gap: 12,
        }}
      >
        <GameIcon
          name={icon}
          size={32}
          color={tone === 'error' ? colors.error : colors.primary}
        />
        <GameText
          variant="title"
          style={{ flexShrink: 1 }}
          accessibilityRole="header"
          accessibilityState={{ busy }}
        >
          {title}
        </GameText>
      </View>
      {message ? (
        <GameText style={{ color: colors.textSecondary }}>{message}</GameText>
      ) : null}
      {action ? (
        <GameButton
          chrome="utility"
          label={action.label}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}
