// Account Farm Guard Edge Function
// Evaluates signup/onboarding credit eligibility using server-side signals
// No hard dependency on unavailable provider; uses heuristic checks

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface AccountGuardRequest {
  action: 'signup' | 'ftuo' | 'onboarding_credits';
  device_fingerprint?: string;
  ip_address?: string;
  platform?: 'ios' | 'android' | 'web';
  device_attestation_token?: string;
}

interface AccountGuardResponse {
  eligible: boolean;
  reason?: string;
  flagged: boolean;
  signals: {
    ip_velocity?: number;
    device_velocity?: number;
    ip_country?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const {
      action,
      device_fingerprint,
      ip_address,
      platform,
      device_attestation_token,
    }: AccountGuardRequest = await req.json();

    if (!action) {
      return errorResponse('action required');
    }

    const supabase = createServiceClient();

    // Get or create abuse signals for this profile
    const { data: abuseSignals, error: signalsError } = await supabase
      .from('account_abuse_signals')
      .select('*')
      .eq('profile_id', userId)
      .single();

    let signals = abuseSignals;

    // If no signals exist, create them (signup case)
    if (!signals) {
      // Get IP from request headers (Cloudflare or standard)
      const requestIp =
        ip_address ||
        req.headers.get('CF-Connecting-IP') ||
        req.headers.get('X-Forwarded-For')?.split(',')[0] ||
        req.headers.get('X-Real-IP') ||
        'unknown';

      const { data: newSignals, error: createError } = await supabase
        .from('account_abuse_signals')
        .insert({
          profile_id: userId,
          signup_device_fingerprint: device_fingerprint || null,
          signup_ip_address: requestIp !== 'unknown' ? requestIp : null,
          signup_platform: platform || 'unknown',
          device_attestation_token: device_attestation_token || null,
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create abuse signals:', createError);
        // Fail open: allow but flag
        signals = null;
      } else {
        signals = newSignals;
      }
    }

    // Compute velocity signals
    let ipVelocity = 0;
    let deviceVelocity = 0;
    let ipCountry = null;

    if (signals?.signup_ip_address) {
      const { data: velocityData } = await supabase.rpc('ip_signup_velocity', {
        p_ip_address: signals.signup_ip_address,
      });
      ipVelocity = velocityData || 0;

      // Get IP geolocation (optional, requires service)
      const ipGeoKey = Deno.env.get('IP_GEOLOCATION_API_KEY');
      if (ipGeoKey) {
        try {
          const geoResponse = await fetch(
            `https://api.ipgeolocation.io/ipgeo?apiKey=${ipGeoKey}&ip=${signals.signup_ip_address}`
          );
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            ipCountry = geoData.country_code2;

            // Update signals with country
            await supabase
              .from('account_abuse_signals')
              .update({ signup_ip_country: ipCountry })
              .eq('profile_id', userId);
          }
        } catch (error) {
          console.error('IP geolocation error:', error);
        }
      }
    }

    if (signals?.signup_device_fingerprint) {
      const { data: velocityData } = await supabase.rpc('device_signup_velocity', {
        p_device_fingerprint: signals.signup_device_fingerprint,
      });
      deviceVelocity = velocityData || 0;
    }

    // Update velocity counters in abuse signals
    if (signals) {
      await supabase
        .from('account_abuse_signals')
        .update({
          ip_signup_count_24h: ipVelocity,
          device_signup_count_24h: deviceVelocity,
        })
        .eq('profile_id', userId);
    }

    // Decision logic based on action
    let eligible = true;
    let reason = '';
    let flagged = false;

    // Thresholds (tunable)
    const IP_VELOCITY_THRESHOLD = 10; // Max 10 signups per IP per 24h
    const DEVICE_VELOCITY_THRESHOLD = 3; // Max 3 signups per device per 24h
    const IP_VELOCITY_FLAG_THRESHOLD = 5; // Flag if > 5

    if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
      eligible = false;
      reason = 'IP velocity limit exceeded';
      flagged = true;
    } else if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
      eligible = false;
      reason = 'Device velocity limit exceeded';
      flagged = true;
    } else if (ipVelocity >= IP_VELOCITY_FLAG_THRESHOLD || deviceVelocity >= 2) {
      flagged = true;
      reason = 'Elevated velocity signals';
    }

    // Verify device attestation if available (iOS/Android)
    if (device_attestation_token && platform && eligible) {
      const attestationValid = await verifyDeviceAttestation(
        device_attestation_token,
        platform
      );

      if (!attestationValid) {
        flagged = true;
        reason = 'Device attestation failed';
        // Don't block completely, but flag for review
      } else {
        await supabase
          .from('account_abuse_signals')
          .update({ device_attestation_verified: true })
          .eq('profile_id', userId);
      }
    }

    // If flagged, update abuse signals
    if (flagged && signals) {
      await supabase
        .from('account_abuse_signals')
        .update({
          is_flagged_suspicious: true,
          flagged_reason: reason,
          flagged_at: new Date().toISOString(),
        })
        .eq('profile_id', userId);
    }

    // Update FTUO/onboarding credit eligibility
    if (action === 'ftuo' && eligible) {
      await supabase
        .from('account_abuse_signals')
        .update({ ftuo_shown_at: new Date().toISOString() })
        .eq('profile_id', userId);
    } else if (action === 'onboarding_credits' && eligible) {
      await supabase
        .from('account_abuse_signals')
        .update({
          onboarding_credits_granted: true,
          onboarding_credits_granted_at: new Date().toISOString(),
        })
        .eq('profile_id', userId);
    }

    const response: AccountGuardResponse = {
      eligible,
      reason: eligible ? undefined : reason,
      flagged,
      signals: {
        ip_velocity: ipVelocity,
        device_velocity: deviceVelocity,
        ip_country: ipCountry || undefined,
      },
    };

    return successResponse(response);
  } catch (error) {
    console.error('Account guard error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});

/**
 * Verify device attestation token (iOS DeviceCheck or Android SafetyNet)
 * Stub implementation; real integration requires provider SDK
 */
async function verifyDeviceAttestation(
  token: string,
  platform: string
): Promise<boolean> {
  // iOS DeviceCheck
  if (platform === 'ios') {
    const appleTeamId = Deno.env.get('APPLE_TEAM_ID');
    const appleKeyId = Deno.env.get('APPLE_KEY_ID');
    const applePrivateKey = Deno.env.get('APPLE_PRIVATE_KEY');

    if (appleTeamId && appleKeyId && applePrivateKey) {
      // Real implementation would verify token with Apple's DeviceCheck API
      // https://developer.apple.com/documentation/devicecheck
      // Stub: assume valid if token present
      return token.length > 10;
    }
  }

  // Android SafetyNet (deprecated) or Play Integrity API
  if (platform === 'android') {
    const googleApiKey = Deno.env.get('GOOGLE_PLAY_INTEGRITY_API_KEY');

    if (googleApiKey) {
      // Real implementation would verify with Google Play Integrity API
      // https://developer.android.com/google/play/integrity
      // Stub: assume valid if token present
      return token.length > 10;
    }
  }

  // No attestation configured, fail open (don't block user)
  return true;
}
