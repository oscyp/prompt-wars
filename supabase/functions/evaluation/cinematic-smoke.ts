/** One bounded, synthetic smoke. Dry-run by default; execution may use private temporary storage. */
import {
  XAIVideoProvider,
  type VideoGenerationRequest,
} from '../_shared/providers.ts';
import { CINEMATIC_BUNDLED_ASSETS } from '../_shared/cinematic-bundled-assets.ts';
import { snapshotCinematicFighter } from '../_shared/cinematic-identity.ts';
import {
  buildCinematicInput,
  hashCinematicInput,
} from '../_shared/cinematic-inputs.ts';
import {
  composeCinematicBasePrompt,
  composeCinematicExtensionPrompt,
} from '../_shared/cinematic-prompt.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { createServiceClient } from '../_shared/utils.ts';
import { readCinematicDurationSeconds } from '../_shared/cinematic-media.ts';

const execute = Deno.args.includes('--execute');
const duration = Deno.args.includes('--legacy-15') ? 15 : 20;
const signedReferences = Deno.args.includes('--signed-references');
const storage = signedReferences && execute ? createServiceClient() : null;
const outArg = Deno.args.find((a) => a.startsWith('--output='));
const out =
  outArg?.slice('--output='.length) ?? '/tmp/prompt-wars-cinematic-smoke';
const identity = (name: string, archetype: string, itemName: string) =>
  snapshotCinematicFighter({
    character: {
      id: name,
      profile_id: name,
      name,
      archetype,
      starter_asset_key: `bundled:${archetype}`,
      signature_item_id: `${name}-item`,
    },
    signatureItem: {
      id: `${name}-item`,
      kind: 'catalog',
      name: itemName,
      moderation_status: 'approved',
    },
  });
const input = buildCinematicInput({
  battle: {
    id: 'synthetic-smoke',
    format: 'single',
    status: 'result_ready',
    player_one_id: 'Ari',
    player_two_id: 'Mira',
    is_draw: false,
    winner_id: 'Mira',
    theme: 'Playful rooftop obstacle contest',
    identity_snapshot: {
      player_one: identity('Ari', 'engineer', 'Fountain Pen'),
      player_two: identity('Mira', 'mystic', 'Compass'),
    },
    score_payload: {
      frozen_inputs: {
        player_one: {
          text: 'I use my fountain pen to draw a glowing bridge across the gap and step onto it.',
          moveType: 'attack',
        },
        player_two: {
          text: 'I turn my compass to reveal a shorter floating path, then skip across it and reach the rooftop flag first.',
          moveType: 'defense',
        },
      },
    },
  },
  policy: {
    cinematic_profile: 'plus',
    target_duration_seconds: duration,
    duration_policy_version:
      duration === 20 ? 'cinematics-v3' : 'cinematics-v2',
  },
});
const refs = [];
for (const kind of ['fighter', 'item'] as const)
  for (const side of ['p1', 'p2'] as const) {
    const storageRef =
      kind === 'fighter'
        ? input.fighters[side].reference
        : input.fighters[side].item?.reference;
    if (!storageRef) throw Error(`Smoke reference missing: ${side}/${kind}`);
    const manifest = Object.values(CINEMATIC_BUNDLED_ASSETS).find(
      (a) => a.path === storageRef.path,
    );
    if (!manifest) throw Error('Only bundled fixture assets may be sent');
    const bytes = await Deno.readFile(manifest.local_path);
    const actual = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (actual !== manifest.version)
      throw Error('Bundled fixture checksum mismatch');
    let url = `data:image/jpeg;base64,${encodeBase64(bytes)}`;
    if (storage) {
      const { data, error } = await storage.storage
        .from(manifest.bucket)
        .createSignedUrl(manifest.path, 1800);
      if (error || !data?.signedUrl)
        throw Error('Published reference signing failed');
      url = data.signedUrl;
    }
    refs.push({
      side,
      kind,
      storageRef,
      referenceIndex: refs.length,
      url,
    });
  }
await Deno.mkdir(out, { recursive: true, mode: 0o700 });
const report: any = {
  fixture: 'synthetic-bundled-smoke',
  requestedDuration: duration,
  referenceTransport: signedReferences ? 'supabase-signed-https' : 'data-uri',
  inputHash: await hashCinematicInput(input),
  referenceCount: refs.length,
  status: 'dry-run',
  visualGate: 'not_evaluated',
};
await Deno.writeTextFile(`${out}/input.json`, JSON.stringify(input, null, 2));
await Deno.writeTextFile(
  `${out}/prompt.txt`,
  composeCinematicBasePrompt(input, refs),
);
const save = () =>
  Deno.writeTextFile(`${out}/report.json`, JSON.stringify(report, null, 2));
if (execute) {
  if (!Deno.env.get('XAI_API_KEY'))
    throw Error('XAI_API_KEY is required for --execute');
  const provider = new XAIVideoProvider();
  const request: VideoGenerationRequest = {
    battleId: input.battleId,
    playerOneCharacterName: 'Ari',
    playerTwoCharacterName: 'Mira',
    playerOneArchetype: 'engineer',
    playerTwoArchetype: 'mystic',
    playerOnePrompt: input.moves.p1!.text,
    playerTwoPrompt: input.moves.p2!.text,
    playerOneMoveType: 'attack',
    playerTwoMoveType: 'defense',
    winnerId: 'p2',
    isDraw: false,
    theme: input.theme,
    targetDurationSeconds: duration,
    aspectRatio: '9:16',
    safetyConstraints: ['no_violence', 'no_dialogue_or_narration'],
    cinematicInput: input,
    cinematicReferences: refs,
  };
  const started = Date.now();
  try {
    const submitted = await provider.submitVideoGeneration(request);
    Object.assign(report, {
      status: 'submitted',
      model: submitted.model,
      providerJobId: submitted.providerJobId,
      submittedDuration: submitted.durationSeconds,
    });
    await save();
    console.log(
      JSON.stringify({
        status: 'submitted',
        model: report.model,
        requestedDuration: duration,
      }),
    );
    let activeSubmission = submitted;
    let extensionSubmitted = false;
    while (Date.now() - started < 600000) {
      await new Promise((r) => setTimeout(r, 10000));
      const result = await provider.pollVideoStatus(
        activeSubmission.providerJobId,
      );
      Object.assign(report, {
        status: result.status,
        latencySeconds: (Date.now() - started) / 1000,
        providerReportedDuration: result.durationSeconds ?? null,
        providerModerationApproved: result.moderationApproved ?? null,
      });
      if (result.status === 'failed') break;
      if (result.status === 'succeeded') {
        if (result.moderationApproved !== true || !result.videoUrl)
          throw Error('Provider output did not pass explicit moderation');
        if (duration === 20 && !extensionSubmitted) {
          let baseUrl = result.videoUrl;
          const response = await fetch(baseUrl);
          if (!response.ok) throw Error('Base download unavailable');
          const baseBytes = new Uint8Array(await response.arrayBuffer());
          const baseDuration = readCinematicDurationSeconds(baseBytes);
          if (Math.abs(baseDuration - 15) > 0.5)
            throw Error('Unexpected base duration');
          if (storage) {
            const path = `evaluation/${crypto.randomUUID()}/base.mp4`;
            const { error } = await storage.storage
              .from('cinematic-work')
              .upload(path, baseBytes, {
                contentType: 'video/mp4',
                upsert: false,
              });
            if (error) throw Error('Private smoke base upload failed');
            report.privateBasePath = path;
            const signed = await storage.storage
              .from('cinematic-work')
              .createSignedUrl(path, 1800);
            if (signed.error || !signed.data?.signedUrl)
              throw Error('Private smoke base signing failed');
            baseUrl = signed.data.signedUrl;
          }
          const prompt = composeCinematicExtensionPrompt(input);
          await Deno.writeTextFile(`${out}/extension-prompt.txt`, prompt);
          activeSubmission = await provider.submitVideoExtension({
            videoUrl: baseUrl,
            prompt,
            durationSeconds: 5,
          });
          Object.assign(report, {
            status: 'extension_submitted',
            baseDuration,
            baseProviderReportedDuration: result.durationSeconds,
            baseCostUsd: result.costUsd ?? null,
            baseLatencySeconds: (Date.now() - started) / 1000,
            extensionProviderJobId: activeSubmission.providerJobId,
            extensionModel: activeSubmission.model,
            extensionSubmittedDuration: activeSubmission.durationSeconds,
          });
          extensionSubmitted = true;
          await save();
          console.log(
            JSON.stringify({
              status: 'extension_submitted',
              requestedDuration: duration,
            }),
          );
          continue;
        }
        report.finalRequestCostUsd = result.costUsd ?? null;
        report.totalCostUsd =
          duration === 20
            ? report.baseCostUsd != null && result.costUsd != null
              ? report.baseCostUsd + result.costUsd
              : null
            : (result.costUsd ?? null);
        // Never publish; only download for private human inspection after provider approval.
        if (result.moderationApproved === true && result.videoUrl) {
          const response = await fetch(result.videoUrl);
          if (!response.ok) throw Error(`Download failed: ${response.status}`);
          const original = new Uint8Array(await response.arrayBuffer());
          report.actualDuration = readCinematicDurationSeconds(original);
          if (Math.abs(report.actualDuration - duration) > 0.5)
            throw Error('Final cinematic duration differs from quote');
          await Deno.writeFile(`${out}/clip.mp4`, original, { mode: 0o600 });
          report.clip = 'clip.mp4';
          report.audioHandling =
            'Provider audio retained; playback starts on user action';
        }
        break;
      }
      await save();
    }
    if (!['failed', 'succeeded'].includes(report.status))
      report.status = 'timed_out';
  } catch (error) {
    report.status = 'error';
    // Provider errors may contain request content; never persist or print them unredacted.
    report.error = String(error)
      .replaceAll(Deno.env.get('XAI_API_KEY')!, '[redacted]')
      .slice(0, 600);
  } finally {
    if (storage && report.privateBasePath) {
      const { error } = await storage.storage
        .from('cinematic-work')
        .remove([report.privateBasePath]);
      report.privateBaseRemoved = !error;
    }
  }
}
await save();
console.log(JSON.stringify(report));
if (execute && report.status !== 'succeeded') Deno.exit(1);
