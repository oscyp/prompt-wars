import React, { useRef } from 'react';
import type { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useTabBalance } from '@/providers/TabBalanceProvider';
import CreditChip from '@/components/CreditChip';
import HeaderBackButton from '@/components/HeaderBackButton';
import BrandMark from './BrandMark';
import { GameHeader } from './GameHeader';

export function TabScreenHeader({ title }: { title: string }) {
  const balance = useTabBalance();
  const ownWalletFocusRef = useRef<View>(null);
  const colors = useThemedColors();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: colors.background }}
    >
      <GameHeader
        presentation="tab"
        title={title === 'Arena' ? undefined : title}
        titleContent={title === 'Arena' ? <BrandMark size={176} /> : undefined}
        trailing={
          <CreditChip
            focusRef={
              title === 'Arena' ? balance.walletFocusRef : ownWalletFocusRef
            }
            credits={balance.credits}
            unavailable={balance.loading || balance.error}
          />
        }
      />
    </SafeAreaView>
  );
}

export function SecondaryScreenHeader({ title }: { title: string }) {
  const colors = useThemedColors();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: colors.background }}
    >
      <GameHeader
        presentation="secondary"
        title={title}
        leading={<HeaderBackButton />}
      />
    </SafeAreaView>
  );
}
