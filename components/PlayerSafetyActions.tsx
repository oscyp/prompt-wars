import { GameText as Text, GamePanel } from '@/components/game';
import React, { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import ReportBlockSheet from './ReportBlockSheet';

/** Keep this beside a row's navigation action, never inside its accessible parent. */
export default function PlayerSafetyActions({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) {
  const trigger = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const colors = useThemedColors();
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`Report or block ${name}`}
        onPress={() => setVisible(true)}
        style={{
          minHeight: 48,
          paddingHorizontal: 8,
          justifyContent: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 4,
        }}
      >
        <GameIcon name="shield-check" size={18} color={colors.textSecondary} />
        <Text
          variant="label"
          style={{ color: colors.textSecondary, fontSize: 16 }}
        >
          Safety
        </Text>
      </Pressable>
      <ReportBlockSheet
        returnFocusRef={trigger}
        visible={visible}
        onClose={() => setVisible(false)}
        reportedType="profile"
        reportedId={profileId}
        reportedProfileId={profileId}
        subjectLabel={name}
      />
    </>
  );
}

export function PlayerSafetyRow({
  profileId,
  name,
  children,
  framed = false,
  emphasized = false,
}: {
  profileId?: string | null;
  name: string;
  children: React.ReactNode;
  framed?: boolean;
  emphasized?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const [available, setAvailable] = useState(0);
  const Container = framed ? GamePanel : View;
  return (
    <Container
      {...(framed
        ? { tone: emphasized ? ('ornate' as const) : ('quiet' as const) }
        : {})}
      testID="player-row-frame"
      onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}
      style={{ padding: 0, width: '100%', marginBottom: 8 }}
    >
      <View
        testID="player-row-navigation"
        style={{ width: '100%', minWidth: 0 }}
      >
        {children}
      </View>
      {profileId ? (
        <View
          style={{
            flexDirection:
              fontScale > 1.15 || available < 300 ? 'column' : 'row',
            alignItems: 'flex-start',
            paddingHorizontal: framed ? 12 : 0,
            paddingBottom: framed ? 6 : 0,
          }}
        >
          <PlayerSafetyActions profileId={profileId} name={name} />
        </View>
      ) : null}
    </Container>
  );
}
