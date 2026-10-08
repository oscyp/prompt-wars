# Prompt Wars 1.3.4 — cinematic rollout and iOS TestFlight

**Backend rollout is enabled** (2026-10-08 11:11:44 UTC); new Plus jobs target 20 seconds. Live capabilities report `enabled: true` and `plus_duration_seconds: 20`. Final worker deployment is active, version 40.

Production iOS build **1.3.4 (19)** completed and its exact Expo submission finished. Apple confirms **VALID / IN_BETA_TESTING** for the matching build and submission IDs. This is internal TestFlight delivery; no public App Review or Android build was performed.

- [Build 6ccdf2ab](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/6ccdf2ab-8a5e-407c-89a8-fc8601c53faa)
- [Submission a1353759](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/submissions/a1353759-705a-4169-ac41-a6541ccf001e)
- [Apple proof](ios19-apple-status-proof.json) and [delivery summary](delivery-result.json)

The submission requested the existing **Team (Expo)** and **testers** internal groups, with automatic group setup disabled. No new groups, invitations or explicit tester notifications were requested. The supported CLI confirms internal beta state but does not independently enumerate exact group assignments or verify installation by any tester. No local observer remains running.

## Version and source

Version 1.3.4 is synchronized in package.json, app.config.js, native Info.plist and both Xcode marketing versions. EAS remote versioning incremented the iOS build number from 18 to 19. Existing signing credentials were reused with credential updates frozen.

Official EAS production archive inspection captured **525 files / 48,947,599 bytes**, manifest SHA-256 `76d760fcfbe8b019b1c6236cd48542993091e1bcac2554e978058a574e632f45`. Environment files, signing credentials, private backend modules and visual fixtures are excluded; only the three pure shared composer modules are permitted under supabase/. The bounded archive scan found no private-key or provider-secret markers. [Source manifest](ios-source-manifest.json).

The actual dirty working-tree files were included without a commit. EAS Git metadata alone is not a description of the uploaded source. [Upload comparison](upload-source-drift.json) established zero drift immediately after upload. The later [comparison](final-source-drift.json) records one changed backend test harness, scripts/test-cinematic-concurrency.py, which is included in the source archive but not imported into the mobile runtime. The verified IPA retains the exact uploaded source; no app/runtime source drift was detected.

## Exact IPA verification

The downloaded IPA has bundle **gg.promptwars.app**, version **1.3.4**, build **19** and SHA-256 `10dab8401f7cd8fb386d08e2b1ad43c2492074d3cbef6c36468c518c4beeeae9`. ZIP integrity, both Barlow fonts, JavaScript bundle and five cinematic feature/quote markers passed. Checked fixture and private backend markers are absent. Strict recursive code-signature verification passed; the production application/team/push entitlements match, debugging is disabled, and the profile expires in July 2027. [Artifact inspection](ios-19-ipa-inspection.json) and [signature verification](ios-signature-verification.txt).

Local validation passed **228 Jest suites / 1,978 tests**, app TypeScript, scoped ESLint, native plist validation and fixture isolation. The updated request/gate tests passed **2 tests / 15 behavioral steps**, including 20-second/v3 preview metadata and preserved existing 15-second/v2 job metadata. [Validation summary](verification.json). New native screen screenshots, physical-device installation and tester playback were not independently verified by this delivery work.

## Testing notes and backend

English testing notes are [prepared locally](testflight-notes-en-US.txt). Expo rejected the optional What to Test/changelog parameter because it requires an Enterprise plan; this happened before any submission was scheduled. The recent-submission list confirmed unchanged state, and the successful exact-ID submission omitted the optional field. No paid plan change was performed, and those notes were not saved to Apple. [Limitation record](submission-notes-limitation.json).

The backend owner records the 20-second cinematic rollout, silent MP4 handling, moderation and funding recovery separately. TestFlight delivery alone does not establish provider quality, backend rollout status or native playback acceptance.

## Backend release and live 20-second verification

The user explicitly requested 20 seconds for Plus, a version bump and rollout after reviewing the earlier 15-second implementation. New jobs use policy `cinematics-v3`: standard 8-second Bo3 rounds / 12-second singles; Plus 20 seconds when either human participant qualifies through derived entitlements. Existing v2 jobs keep their frozen 15-second policy. One credit or allowance unit still buys one round. The first 15 seconds use frozen fighter/item references and complete recorded moves; an approved private base is extended by five generated seconds. Intermediate media has no client-playable video row.

The four additive migrations were applied with their history records in one transaction. Hosted history matches all 126 local versions; no unrelated migration was pending. All 21 immutable bundled reference assets were uploaded and checksum-verified. The 15-function dependency closure was deployed with existing JWT settings preserved. The final worker patch is recorded separately in [backend deployment evidence](backend-deployment.json), together with the final rollout flag, versions, source hashes and authenticated readiness results.

Final local verification: **592 Deno tests / 74 steps passed, 7 gated skips**; five cinematic SQL suites, six existing composer SQL suites and the independent-session concurrency harness passed. Worker/input/provider type checks and scoped lint passed. Duration helper lint excludes the repository's existing inline-import rule for Deno test imports. Full repository lint is not claimed. No database reset was used.

A bounded synthetic provider test used four private Supabase signed reference URLs, then signed private base storage for the extension. The base was reported as 15 seconds; the extension API reported 5 seconds even though its returned file contains the full **20.0416667 seconds**. That discrepancy initially tripped the conservative duration check. The existing completed requests were downloaded and inspected without another paid generation. Production now measures the downloaded MP4 movie/video timelines before upload, rejects short or inconsistent media, and records measured final duration. Version-zero and version-one headers, missing/truncated timelines and a short-video/long-movie mismatch have regression coverage.

AVFoundation and the production duration reader agree on 15.0416667 seconds for the base and 20.0416667 for the final file. Silent remux gives **zero playable audio tracks**, and all nine compared sampled video frames are unchanged. Provider moderation explicitly approved both stages. Actual billed usage was **$2.14 + $0.50 = $2.64**, with roughly 202 seconds to finish both provider calls. The temporary private evaluation base was deleted. [Original report](smoke-original-report.json) is preserved separately from [verified media evidence](smoke-verification.json).

Sampled frames retain the engineer, mystic, pen and compass ownership and the recorded P2 victory. The added segment contains continued movement and a finale. The move ideas blend into a shared glowing path; the mystic's mask/face and compass color shift later. This establishes provider compatibility and a bounded visual sample, not perfect fidelity across player content. The planned 24-clip recorded-battle matrix and native large-text/playback inspection remain unperformed. The smoke passed the original provider base into extension; production strips its audio before extension using the same validated remux. The full production queue was exercised through deterministic worker tests plus real SQL stage checks, rather than creating a synthetic battle in the hosted user database.

Roll back new job adoption by setting `cinematic_generation_config.enabled=false`. Preserve the v3 worker, immutable inputs, reference assets and private base bucket so existing jobs can finish or refund. Do not rewrite frozen job policies.

## Unreleased follow-up: clean frame and audio on Play

After build 19 was delivered, the user requested removal of cinematic-frame metadata and audio when tapping the cinematic. Those follow-up changes are implemented locally and **are not included in TestFlight build 19 or the deployed worker v40**.

The ready frame now shows its preview and Play control without duration/round headings. Loading copy has no clip-duration label or completion estimate. Explicit fullscreen playback unmutes immediately before playing; exit, screen/app inactivity, URL/player replacement and unmount pause and remute. Native device/player volume stays unchanged. Background battle music remains stopped on the result screen.

New cinematic requests enable generated audio and request synchronized ambient/action sound effects without dialogue, narration or music. Both base and final storage retain the original provider bytes; moderation, frozen identity, measured 15/20-second validation, leases and refunds remain covered. Previously saved silent clips are not regenerated or rewritten. This supersedes the earlier silent-output product policy for future generation, while the historical live-smoke evidence above remains unchanged.

Validation for the audio follow-up: **228 app suites / 1,986 tests passed**, app TypeScript and scoped lint passed; **592 Deno tests / 74 steps passed, 7 gated skips**, and changed backend/evaluator modules type-check. Tests cover audio enabled before play, no sound from unsolicited/stale entry, pause/remute on every exit path, and exact audio/video byte preservation in stored base and final files. No new paid generation, native audible playback, app build or backend deployment was performed for this follow-up. The provider's documented audio switch is described in [xAI video generation](https://docs.x.ai/developers/model-capabilities/video/generation#audio).
