import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { GameButton } from '@/components/game/GameButton';
import { GameField } from '@/components/game/GameField';
import { GameText } from '@/components/game/GameText';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  type AuthOperation,
} from '@/utils/authSession';
import {
  EmailLinkingError,
  requestEmailLink,
  verifyEmailLink,
  setLinkedEmailPassword,
} from '@/utils/emailLinking';

interface Props {
  user: User;
  onComplete: (user: User) => void;
  onCancel: () => void;
  onConflict: () => void;
}

/** The Settings parent keys this form by UUID so drafts never cross accounts. */
export function EmailLinkingForm({
  user,
  onComplete,
  onCancel,
  onConflict,
}: Props) {
  const colors = useThemedColors();
  const [step, setStep] = useState<'email' | 'verify' | 'password'>(
    user.new_email
      ? 'verify'
      : user.email_confirmed_at && !user.is_anonymous
        ? 'password'
        : 'email',
  );
  const [email, setEmail] = useState(user.new_email || user.email || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pending = useRef<AuthOperation | null>(null);
  const expectedUserId = useRef(user.id);
  const currentUserId = useRef(user.id);
  currentUserId.current = user.id;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current) {
        try {
          assertAuthOperationCurrent(pending.current);
          beginAuthOperation();
        } catch {
          /* A newer intent already invalidated this request. */
        }
      }
    };
  }, []);
  const run = async (
    work: (operation: AuthOperation) => Promise<User>,
    next: 'verify' | 'password' | 'complete',
  ) => {
    if (pending.current || expectedUserId.current !== currentUserId.current)
      return;
    const operation = beginAuthOperation();
    pending.current = operation;
    setBusy(true);
    setError(null);
    try {
      const result = await work(operation);
      if (!mounted.current || result.id !== currentUserId.current) return;
      assertAuthOperationCurrent(operation);
      setCode('');
      setPassword('');
      if (next === 'complete') onComplete(result);
      else setStep(next);
    } catch (failure) {
      if (!mounted.current || expectedUserId.current !== currentUserId.current)
        return;
      if (
        failure instanceof EmailLinkingError &&
        failure.code === 'identity_collision'
      )
        onConflict();
      else
        setError(
          failure instanceof EmailLinkingError
            ? failure.message
            : 'Your account request changed or could not finish. Please try again.',
        );
    } finally {
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const request = () =>
    run((operation) => requestEmailLink(email, user.id, operation), 'verify');
  return (
    <View style={{ gap: 12 }}>
      <GameText accessibilityRole="header" variant="title">
        {step === 'email'
          ? 'Connect email'
          : step === 'verify'
            ? 'Verify your email'
            : 'Set your email password'}
      </GameText>
      <GameText>
        {step === 'email'
          ? 'Your battles, credits and purchases stay on this account.'
          : step === 'verify'
            ? `Enter the code sent to ${email}. You can keep playing and finish here later.`
            : `Your email ${email} is verified. Set a password to sign in with it later.`}
      </GameText>
      {step === 'email' && (
        <>
          <GameField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            disabled={busy}
          />
          <GameButton
            label="Send verification code"
            disabled={busy}
            onPress={() => void request()}
          />
        </>
      )}
      {step === 'verify' && (
        <>
          <GameField
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={10}
            disabled={busy}
          />
          <GameButton
            label="Verify email"
            disabled={busy}
            onPress={() =>
              void run(
                (operation) => verifyEmailLink(email, code, user.id, operation),
                'password',
              )
            }
          />
          <GameButton
            label="Resend code"
            tone="secondary"
            disabled={busy}
            onPress={() => void request()}
          />
          <GameButton
            label="Use another email"
            tone="secondary"
            disabled={busy}
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </>
      )}
      {step === 'password' && (
        <>
          <GameField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            disabled={busy}
          />
          <GameButton
            label="Save password"
            disabled={busy}
            onPress={() =>
              void run(
                (operation) =>
                  setLinkedEmailPassword(password, email, user.id, operation),
                'complete',
              )
            }
          />
        </>
      )}
      {error && (
        <GameText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: colors.error }}
        >
          {error}
        </GameText>
      )}
      <GameButton label="Keep playing" tone="secondary" onPress={onCancel} />
    </View>
  );
}
