# Selective delivery inventory

Preparation only. Do not infer any hosted deployment or new EAS build from this file.

## Backend

Project: `uoyjhudegdpanrgllfoj` (`prompt-wars`). Supabase CLI: `node_modules/.bin/supabase`, version 2.98.2. Read-only linked access is verified.

Apply only migration `20261007122059_composer_three_decision_operations.sql` after the final source review. It includes additive completion operations, compatibility wrappers and the separate occurrence-telemetry table. Re-run the remote dry run immediately before applying; stop if any unrelated migration appears.

```sh
rtk proxy node_modules/.bin/supabase db push --linked --dry-run
rtk proxy node_modules/.bin/supabase db push --linked --yes
```

Deploy these three entrypoints explicitly after the migration:

```sh
rtk proxy node_modules/.bin/supabase functions deploy generate-move-suggestions --project-ref uoyjhudegdpanrgllfoj --use-api
rtk proxy node_modules/.bin/supabase functions deploy complete-move-suggestion --project-ref uoyjhudegdpanrgllfoj --use-api
rtk proxy node_modules/.bin/supabase functions deploy record-funnel-event --project-ref uoyjhudegdpanrgllfoj --use-api
```

Do not use an unqualified all-functions deployment or `--prune`. The new type-only moderation roles and composition helpers are bundled into their importing entrypoints. Existing `prefetch-move-suggestions`, `battle-advance` and face-off callers retain the compatible ten-argument reservation wrapper; they do not need unrelated redeployment for this change. No judge or resolver rollout is included.

After deployment, verify installed function identities and migration history. An unauthenticated request must remain unauthorized. Authenticated, quota, purchase and telemetry observations require explicit controlled integration verification; local tests alone do not establish hosted behavior. Preserve the existing emergency `SUGGESTIONS_AI_DISABLED=true` procedure if generation/billing becomes unsafe; do not restore removed rollout flags.

## Source freeze and EAS

Verified CLI: `/Users/patdom/.npm/_npx/6bc7bae5c2059953/node_modules/eas-cli/bin/run`, version 23.1.0. Existing project: `@prompt-wars/prompt-wars`; bundle/package `gg.promptwars.app`; App Store Connect app `6788787677`. Read-only counters were iOS 17 / Android 8, version 1.3.3. Refresh them at build creation and identify builds by their returned IDs.

After all owners stop editing production source, generate official archive previews into fresh temporary directories:

```sh
rtk proxy node /Users/patdom/.npm/_npx/6bc7bae5c2059953/node_modules/eas-cli/bin/run build:inspect --platform ios --profile production --stage archive --output /tmp/prompt-wars-four-view-ios-archive
rtk proxy node /Users/patdom/.npm/_npx/6bc7bae5c2059953/node_modules/eas-cli/bin/run build:inspect --platform android --profile preview --stage archive --output /tmp/prompt-wars-four-view-android-archive
```

Hash every archived input and save the SHA-256 manifest with the release evidence before uploads. Compare the source again immediately after each upload. Existing `.easignore` excludes secrets, signing material, docs, tests, local fixtures and backend implementation. Only the three existing pure shared composer files are allowed from Supabase: `prompt-situations.ts`, `composer-events.ts`, `prompt-affordances.ts`. Confirm all actual new client imports are present and every server-only provider/endpoint/private-bot file remains absent. The dirty working tree contains prior user changes; the old Git commit in EAS is metadata, not a complete source snapshot.

Build the reviewed source with existing profiles:

```sh
rtk proxy node /Users/patdom/.npm/_npx/6bc7bae5c2059953/node_modules/eas-cli/bin/run build --platform ios --profile production --non-interactive --no-wait --json
rtk proxy node /Users/patdom/.npm/_npx/6bc7bae5c2059953/node_modules/eas-cli/bin/run build --platform android --profile preview --non-interactive --no-wait --json
```

Inspect the exact signed artifacts, bundle/package versions, new composer markers and private-file exclusion before submission. Once the intended iOS build finishes, submit its explicit returned ID using `--platform ios --profile production --id BUILD_ID --groups 'Team (Expo)' --groups testers --no-auto-testflight-setup --non-interactive --no-wait`. Do not submit whatever build happens to be latest. Verify exact submission completion and fresh Apple processing/internal-testing status with the supported `submit:view` and `submit:status` commands. A queued submission is not tester availability.

Keep Android as an internal preview APK. No Google Play submission, external beta invitations, new tester groups or public store release is included.
