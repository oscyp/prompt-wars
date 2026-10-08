# Cinematic duration and fidelity implementation — 8 October 2026

Historical status at the end of the first implementation: implemented locally; production rollout remains disabled. No migrations, Edge Functions, reference assets or app build were deployed. The full 24-clip release gate has **not** passed.

The user later requested a 20-second Plus release. Current rollout evidence is tracked in `../2026-10-08-cinematic-release/`; this document retains the original 15-second measurements.

## Implemented contract

- New jobs freeze standard 8-second Bo3 round / 12-second single, or 15-second Plus policy. Either human participant's derived subscription qualifies the shared clip, independently of its funding source. Existing jobs do not change after expiry or rollout rollback.
- Matchmaking freezes character identity, equipment, appearance version and approved reference artwork for both formats. Legacy missing identity captures once per battle with explicit backfill provenance.
- A service-only immutable input holds complete recorded moves, round scene/outcome, identity and reference paths. Retries reuse that input, refresh signatures and recheck moderation. Reference indices explicitly bind each fighter and item to P1/P2.
- Confirmations show duration and funding; stale quotes require reconfirmation. Preview performs no reservation. Atomic single funding, round reservation recovery and idempotent refunds protect failed attempts.
- Worker lease checks fence submission, state changes and reconciliation. Failed billing reconciliation remains resumable. Captions use the frozen round winner and duration. Tier 0 completion remains independent.

## Local verification

- Full app Jest suite: **228 suites, 1,976 tests passed**. Existing act/negative-path console warnings remain.
- Full Edge Function Deno suite: **565 tests and 73 steps passed; 7 gated tests skipped**.
- Four cinematic SQL suites pass inside a rolled-back local transaction; six existing composer SQL suites also passed during integration.
- Independent-session concurrency harness passes shared job creation, input persistence, competing funding, recovery-versus-insertion and single-charge races.
- App TypeScript, request/worker/smoke Deno checks, scoped app ESLint, new cinematic helper lint and scoped diff checks pass. This does not claim repository-wide lint is clean; broader worker lint retains pre-existing issues.
- All 21 bundled asset checksums verified locally without uploading. Native build/install and large-text screenshots were not run.

## Live smoke evidence

The bounded smoke used **synthetic** recorded inputs and the existing bundled engineer/mystic artwork, fountain pen and compass. It is not a representative evaluation of real player battles.

| Measurement | Result |
|---|---|
| Provider / model | xAI / `grok-imagine-video-1.5` |
| Request | Four `reference_images` with explicit `<IMAGE_0>` … `<IMAGE_3>`, 9:16, 720p |
| Requested / submitted / reported | 15 / 15 / 15 seconds |
| Downloaded media duration | 15.042 seconds, measured with AVFoundation |
| Latency | 94.636 seconds |
| Provider moderation signal | Explicit approval; clip kept local for inspection |
| Frozen winner | P2, mystic; sampled final frame shows mystic reaching the flag first |
| Identity | Engineer's green visor/armor and mystic's purple hood retained |
| Move ideas | Pen draws a bridge; compass reveals a path; both visible in sampled frames |
| Equipment limitation | A second compass appears during movement; item fidelity is not yet release-proven |
| Original / stored media audio | Provider output had one audible track; deterministic v2 storage remux removes it. AVFoundation verified 0 audio tracks, 15.042 seconds and readable frames |

Inspect the local corrected, silent sample at `/tmp/prompt-wars-cinematic-smoke-corrected/clip-silent.mp4`. The original provider file is retained separately as `clip.mp4`. `smoke-report.json`, `smoke-input.json` and `smoke-prompt.txt` preserve the reproducible request evidence without credentials or signed URLs. The actual downloaded clip is local evidence, not a published game asset.

An initial smoke used an invalid evaluation-helper property (`index` instead of `referenceIndex`). It was excluded from fidelity evidence, the helper was corrected and typechecked, and the above sample rerun. Production reference resolution used the correct property throughout; runtime adapter validation also rejects malformed mappings before a paid request.

The [official reference API](https://docs.x.ai/developers/model-capabilities/video/reference-to-video) documents the REST shape, zero-based image tags, 15-second limit and 720p reference mode. The [pricing page](https://docs.x.ai/developers/pricing) listed $0.14/second at 720p plus $0.01/reference image when checked: approximately $2.14 for this four-reference 15-second request, $4.28 for the two smoke attempts. These are list-price estimates, not invoice measurements. Runtime `provider_cost_usd` currently estimates configured output seconds; reference input fees must also be considered when assessing economics. No model rate was changed in deployed secrets.

The remux replaces the audio track metadata with an inert box while preserving all video offsets and bytes. Unused audio sample bytes remain in media data; this removes playable audio, not forensic recovery of those bytes. Fragmented or unrecognized layouts fail closed.

The smoke used data URIs. Provider retrieval of private Supabase signed URLs remains a separate required staging check.

## Reproduce without deploying

```sh
rtk deno check --config supabase/functions/deno.json supabase/functions/evaluation/cinematic-smoke.ts
rtk deno run --config supabase/functions/deno.json --allow-read --allow-write=/tmp/prompt-wars-cinematic-smoke supabase/functions/evaluation/cinematic-smoke.ts --legacy-15
# Paid real call, one clip; credentials stay in the local environment file:
rtk deno run --config supabase/functions/deno.json --env-file=supabase/.env --allow-read --allow-write=/tmp/prompt-wars-cinematic-smoke --allow-env --allow-net=api.x.ai,vidgen.x.ai,imgen.x.ai supabase/functions/evaluation/cinematic-smoke.ts --execute --legacy-15
rtk proxy node scripts/publish-cinematic-reference-assets.mjs
```

The last command verifies all 21 bundled assets and performs no uploads. Production publisher execution is a distinct deployment step.

## Remaining release checks

Use twelve approved recorded battle fixtures, each at standard and Plus duration (24 clips). Include all five archetypes, catalog/custom gear, similar silhouettes with different equipment, both winner sides, a draw, bot/starter, manual and structured moves, long approaches and non-English text. Missing-reference and forfeit branches are automated failure cases, not paid sample requests.

For every clip record input hash, model, requested/submitted/measured duration, latency, cost estimate, identity/item recognition, side swaps, both move ideas, outcome, moderation and stripped audio-track count. Required gate:

- 24/24 correct winner/draw; no fighter/item swaps or unsafe publication.
- At least 22/24 recognizable fighters and equipped items.
- At least 20/24 with both move ideas recognizable.
- Every measured duration within 0.5 seconds; no playable audio track.

Native confirmation/pending/replay inspection at large text size was not performed. The copy and state transitions have automated coverage, and isolated fixture routes are available.

## Rollout and rollback

1. Apply the three additive cinematic migrations in timestamp order.
2. Deploy compatible backend functions, including every caller of `startFaceOff`, the video worker and request handler. Publish the verified bundled assets and deploy the client copy.
3. Configure a verified reference-model rate and confirm private signed-URL retrieval. Run the release matrix and native accessibility checks in staging. Investigate duplicated equipment before widening use.
4. Enable `public.cinematic_generation_config.enabled` in the intended environment only after acceptance. This is a global flag; it does not implement a per-user cohort selector.
5. Monitor missing references, preparation/moderation failures, refunds/reconciliation, requested versus actual duration, per-model costs and latency.

Rollback sets `enabled=false`; new jobs use the legacy pipeline and Plus benefit copy disappears. Preserve new columns, frozen inputs, reference assets and the reference provider for already queued v2 jobs. Do not rewrite existing clips or job policy.

Scheduled worker sweeps reclaim orphan credit/grant holds older than 15 minutes. Historical single jobs without a funding audit retain the compatibility refund path; they are not guessed into orphan cleanup.
