import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_RECOVERY_COPY =
  'Your progress is saved on our servers. If this device loses its session, ' +
  'you may lose access to your fighter, credits and purchases. Link a sign-in ' +
  'method to recover this account on another device.';

export function confirmGuestExit({
  onSecure,
  onContinue,
}: {
  onSecure: () => void;
  onContinue: () => void;
}) {
  Alert.alert(
    'Secure your progress first?',
    GUEST_RECOVERY_COPY +
      ' Loading another account keeps the two saves separate.',
    [
      { text: 'Secure progress', onPress: onSecure },
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue without securing',
        style: 'destructive',
        onPress: onContinue,
      },
    ],
  );
}

type GuestPurchaseDecision = 'continue' | 'secure' | 'cancel';
export async function confirmGuestPurchase(
  accountId: string,
): Promise<GuestPurchaseDecision> {
  const key = `guest-purchase-notice:${accountId}`;
  if ((await AsyncStorage.getItem(key).catch(() => null)) === 'acknowledged')
    return 'continue';
  const decision = await new Promise<GuestPurchaseDecision>((resolve) => {
    Alert.alert(
      'Keep access to your purchases',
      GUEST_RECOVERY_COPY +
        ' Restoring store purchases does not restore an unlinked fighter account.',
      [
        { text: 'Secure progress', onPress: () => resolve('secure') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Continue as guest', onPress: () => resolve('continue') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
  if (decision === 'continue')
    await AsyncStorage.setItem(key, 'acknowledged').catch(() => {});
  return decision;
}
