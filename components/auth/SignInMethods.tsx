import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { GameText } from '@/components/game/GameText';
import { GameButton } from '@/components/game/GameButton';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  type AuthOperation,
} from '@/utils/authSession';
import {
  getAvailableSocialProviders,
  isSocialAuthCancelled,
  linkSocialIdentity,
  SocialAuthError,
  type SocialProvider,
} from '@/utils/socialAuth';
import { SocialAuthButtons } from './SocialAuthButtons';
import { EmailLinkingForm } from './EmailLinkingForm';

const names: Record<string, string> = {
  email: 'Email',
  apple: 'Apple',
  google: 'Google',
};

export function SignInMethods({
  onLoadExistingAccount,
}: { onLoadExistingAccount?: () => void } = {}) {
  const { user } = useAuth();
  const colors = useThemedColors();
  const [available, setAvailable] = useState<SocialProvider[]>([]);
  const [identityUser, setIdentityUser] = useState<User | null>(user);
  const [showEmail, setShowEmail] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const revision = useRef(0);
  const pendingLink = useRef<AuthOperation | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    const request = ++revision.current;
    setIdentityUser(user);
    if (!user) return;
    getAvailableSocialProviders()
      .then(async (providers) => {
        if (revision.current !== request) return;
        setAvailable(providers);
        const { data, error } = await supabase.auth.getUser();
        if (
          !error &&
          data.user?.id === currentUserId.current &&
          revision.current === request
        )
          setIdentityUser(data.user);
      })
      .catch(() => {});
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the operation counter on unmount/account change.
      revision.current++;
    };
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    setShowEmail(false);
    setConflict(false);
    setConnecting(false);
    setConnectionError(null);
    return () => {
      mounted.current = false;
      if (pendingLink.current) {
        try {
          assertAuthOperationCurrent(pendingLink.current);
          beginAuthOperation();
        } catch {
          /* A newer account intent already replaced this request. */
        }
      }
    };
  }, [user?.id]);

  if (!user) return null;
  const account = identityUser?.id === user.id ? identityUser : user;
  const connected = new Set(
    account.identities
      ?.filter(
        (identity) =>
          identity.provider !== 'email' || account.is_anonymous !== true,
      )
      .map((identity) => identity.provider),
  );
  // Linking and Apple authorization retention can finish separately. Always
  // leave a fresh Apple authorization path available, including after remount.
  const connectable = available.filter(
    (provider) => provider === 'apple' || !connected.has(provider),
  );
  const connect = async (provider: SocialProvider) => {
    const expectedUserId = user.id;
    const request = ++revision.current;
    const operation = beginAuthOperation();
    pendingLink.current = operation;
    setConnecting(true);
    setConflict(false);
    setConnectionError(null);
    try {
      const linkedUser = await linkSocialIdentity(
        provider,
        expectedUserId,
        operation,
      );
      if (
        linkedUser &&
        revision.current === request &&
        currentUserId.current === expectedUserId
      )
        setIdentityUser(linkedUser);
    } catch (error) {
      if (!mounted.current || currentUserId.current !== expectedUserId) return;
      if (
        error instanceof SocialAuthError &&
        error.code === 'identity_collision'
      )
        setConflict(true);
      else if (!isSocialAuthCancelled(error))
        setConnectionError(
          error instanceof SocialAuthError
            ? error.message
            : 'Could not connect this sign-in method. Please try again.',
        );
    } finally {
      pendingLink.current = null;
      if (mounted.current && currentUserId.current === expectedUserId)
        setConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <GameText variant="title" accessibilityRole="header">
        {account.is_anonymous ? 'Guest account' : 'Sign-in methods'}
      </GameText>
      <GameText style={{ color: colors.textSecondary }}>
        {account.is_anonymous
          ? 'Secure progress by connecting Apple, Google or email. Your battles, credits and purchases stay on this account.'
          : 'Connect another way to sign in to this account.'}
      </GameText>
      {account.is_anonymous && (
        <GameText style={{ color: colors.textSecondary }}>
          Progress is saved on our servers. If this device loses its session,
          you may lose access unless you connect a sign-in method.
        </GameText>
      )}
      {Array.from(connected)
        .filter((provider) => names[provider])
        .map((provider) => (
          <GameText key={provider}>{names[provider]} · Connected</GameText>
        ))}
      {connectionError && (
        <GameText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: colors.error }}
        >
          {connectionError}
        </GameText>
      )}
      {conflict ? (
        <>
          <GameText accessibilityRole="alert">
            This sign-in method belongs to another account. Your current
            progress and purchases stay here; accounts cannot be merged.
          </GameText>
          <GameButton
            label="Keep playing"
            tone="secondary"
            onPress={() => {
              setConflict(false);
              setShowEmail(false);
            }}
          />
          <GameButton
            label="Use another method"
            tone="secondary"
            onPress={() => {
              setConflict(false);
              setShowEmail(false);
            }}
          />
          {onLoadExistingAccount && (
            <GameButton
              label="Load existing account"
              tone="secondary"
              onPress={onLoadExistingAccount}
            />
          )}
        </>
      ) : showEmail ? (
        <EmailLinkingForm
          key={user.id}
          user={account}
          onComplete={(linked) => {
            if (linked.id === currentUserId.current) {
              setIdentityUser(linked);
              setShowEmail(false);
            }
          }}
          onCancel={() => setShowEmail(false)}
          onConflict={() => setConflict(true)}
        />
      ) : (
        <>
          <SocialAuthButtons
            key={user.id}
            mode="connect"
            providers={connectable}
            providerLabels={
              connected.has('apple') ? { apple: 'Reconnect Apple' } : undefined
            }
            onPress={connect}
          />
          <GameButton
            label={
              account.new_email
                ? 'Continue email setup'
                : connected.has('email') && account.email_confirmed_at
                  ? 'Set email password'
                  : 'Connect email'
            }
            disabled={connecting}
            tone="secondary"
            onPress={() => setShowEmail(true)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: 12 } });
