import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleEligibility } from '../eligibility/index.ts';
import { handleConsentCallback } from '../guardian-consent-callback/index.ts';
import {
  applyVerifiedConsentEvent,
  type VerifiedConsentEvent,
} from '../_shared/consent-events.ts';

Deno.test(
  'eligibility management derives account from auth, never body, and requires authentication',
  async () => {
    let args: Record<string, unknown> = {};
    const deps = {
      userId: async () => 'authenticated-user',
      rpc: async (_name: string, input: Record<string, unknown>) => {
        args = input;
        return {};
      },
    };
    const req = () =>
      new Request('https://example.test/eligibility', {
        method: 'POST',
        body: JSON.stringify({
          action: 'complete',
          profile_id: 'other-user',
          registration_token: 'a'.repeat(64),
        }),
      });
    assertEquals((await handleEligibility(req(), deps)).status, 200);
    assertEquals(args.p_profile_id, 'authenticated-user');
    deps.userId = async () => {
      throw new Error('sensitive-auth-error');
    };
    assertEquals((await handleEligibility(req(), deps)).status, 401);
  },
);
Deno.test(
  'unconfigured consent callback rejects redirects and forged approvals without applying anything',
  async () => {
    let applied = false;
    const response = await handleConsentCallback(
      new Request('https://example.test/callback?approved=true', {
        method: 'POST',
        body: JSON.stringify({ decision: 'approved', consentGranted: true }),
      }),
      undefined,
      async () => {
        applied = true;
      },
    );
    assertEquals(response.status, 503);
    assertEquals(applied, false);
  },
);
Deno.test(
  'verified consent events require both adult verification and explicit consent evidence',
  async () => {
    const event: VerifiedConsentEvent = {
      verifiedBy: 'kws_consent_management',
      eventId: 'event-id',
      registrationId: 'registration-id',
      providerReference: 'provider-ref',
      policyVersion: 'reviewed-v1',
      occurredAt: new Date().toISOString(),
      decision: 'approved',
    };
    let writes = 0;
    const rpc = async (_name: string, args?: Record<string, unknown>) => {
      writes++;
      return args?.p_decision === 'revoked';
    };
    await assertRejects(() => applyVerifiedConsentEvent(event, rpc));
    assertEquals(writes, 0);
    assertEquals(
      await applyVerifiedConsentEvent({ ...event, decision: 'revoked' }, rpc),
      true,
    );
    assertEquals(writes, 1);
  },
);

Deno.test(
  'consent evidence requires boolean true and rejects malformed decisions before RPC',
  async () => {
    const approved: VerifiedConsentEvent = {
      verifiedBy: 'kws_consent_management',
      eventId: 'event-id',
      registrationId: 'registration-id',
      providerReference: 'provider-ref',
      policyVersion: 'reviewed-v1',
      occurredAt: new Date().toISOString(),
      decision: 'approved',
      evidence: {
        guardianVerified: true,
        consentGranted: true,
        reference: 'evidence-ref',
      },
    };
    let writes = 0;
    const rpc = async () => {
      writes++;
      return true;
    };
    for (const event of [
      {
        ...approved,
        evidence: { ...approved.evidence, guardianVerified: 'false' },
      },
      {
        ...approved,
        evidence: { ...approved.evidence, consentGranted: 'false' },
      },
      { ...approved, evidence: { ...approved.evidence, reference: ' ' } },
      { ...approved, decision: 'verified' },
    ]) {
      await assertRejects(() =>
        applyVerifiedConsentEvent(event as VerifiedConsentEvent, rpc),
      );
    }
    assertEquals(writes, 0);
    assertEquals(await applyVerifiedConsentEvent(approved, rpc), true);
    assertEquals(writes, 1);
  },
);
