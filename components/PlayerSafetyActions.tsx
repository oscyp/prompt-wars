import { GameText as Text } from '@/components/game';
import React, { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
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
          paddingHorizontal: 12,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textSecondary }}>Report / Block</Text>
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
