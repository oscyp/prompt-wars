import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
export function ShopFilterControl({
  ownedOnly,
  onChange,
}: {
  ownedOnly: boolean;
  onChange: (owned: boolean) => void;
}) {
  const colors = useThemedColors();
  return (
    <View style={[styles.filter, { borderColor: colors.primary }]}>
      {[false, true].map((owned) => (
        <Pressable
          key={String(owned)}
          accessibilityRole="button"
          accessibilityLabel={`${owned ? 'Owned' : 'All'} filter`}
          accessibilityState={{ selected: ownedOnly === owned }}
          onPress={() => onChange(owned)}
          style={[
            styles.segment,
            {
              backgroundColor:
                ownedOnly === owned ? colors.primary : 'transparent',
            },
          ]}
        >
          <GameText
            variant="label"
            style={{
              color:
                ownedOnly === owned ? colors.background : colors.textSecondary,
            }}
          >
            {owned ? 'Owned' : 'All'}
          </GameText>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  filter: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  segment: {
    minHeight: 48,
    minWidth: 90,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
