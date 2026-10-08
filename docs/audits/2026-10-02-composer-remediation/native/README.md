# Composer remediation — native QA, 2 October 2026

## Environment and scope

- iPhone 17 Pro simulator, iOS 26.5, UDID `5BCEAF70-7392-4F8F-92F6-4249428CA786`, actual native width 402 pt.
- Existing Prompt Wars 1.3.2 development host running the current remediation JavaScript. This is development-client evidence, not an installed production 1.3.3 binary test.
- Isolated component fixture served by the existing fixture launcher on 8082; no auth, requests, purchases or battle mutations in that fixture. The ordinary app was subsequently loaded from a separate Metro server on 8081 for one explicitly authorized free Practice vs Bot battle.
- Native frames and input came through `serve-sim` at `http://localhost:3200/`, using the Browser runtime in Chrome because this delegated session could not acquire the in-app browser. Browser screenshots show the simulator frame. Mirror scaling is not a change in native device width.
- Large-text checks used simulator Text Size setting 6 with Reduce Motion ON. Standard checks restored Text Size 3; the fixture index reported font scale 1.00. VoiceOver was enabled briefly, then disabled.
- A narrowly temporary `__DEV__` submit-result diagnostic was used for one retry after the first live submit failed. The exact original route bytes were restored immediately after the successful retry; all 503 files in the then-frozen iOS build 15 source manifest matched their hashes. `diagnostic-restore-proof.json`. No diagnostic remains. A separately owned result-label correction was initiated after the completed bot series exposed incorrect Pending labels; its native recheck is recorded below.

## Observed native behavior

| Check | Result and evidence |
| --- | --- |
| Nine initial authored actions | Three Attack, three Defense and three Finisher cards were traversed in the large-text fixture and ordinary practice route. `large-defense-finisher-groups.jpg`, `live-nine-actions.jpg`. |
| Commit action, collapse groups, reveal intentions | Selecting the last Finisher from the bottom of the fixture collapsed all groups and scrolled its summary and intentions into view. `large-finisher-selected.jpg`. The ordinary route also scrolled to its selected Finisher summary. |
| Full type and exact text confirmation | Fixture modal displayed **Finisher** and the complete composed sentence. `large-finisher-confirmation.jpg`. Ordinary route modal likewise displayed its complete Finisher sentence. `live-round1-confirmation.jpg`. |
| Cancel confirmation | Keep editing returned to the same action, intention and ready state in both fixture and ordinary route. |
| Own-field focus / Fabric correction | Focusing the own-intention field brought the native field into view. `large-own-field-focus.jpg`. Root owner polled the fixture Metro after the new selection/focus actions and reported no new `measureLayout` warning; ordinary Metro emitted no new warning during this flow. |
| Partial AI-bank failure | Ordinary practice retained its authored Finisher and ready CTA while showing the persistent error/retry message plus separate ready Defense and Finisher bank buttons. `live-partial-ai-failure.jpg`. No retry or paid idea purchase was used. |
| Failed submit recovery | First actual Lock in request returned “Couldn't lock in”; the app kept the text and showed Try Again. `live-submit-failure.jpg`. See live outcome below. |

The earlier `large-confirmation.jpg` capture predates this delegated pass and shows the context screen rather than a modal. Use `large-finisher-confirmation.jpg` for confirmation evidence.

## Live practice outcome

The existing signed-in Arena was inspected. Its ongoing battle was left untouched. Exactly one new **Practice vs Bot** series was opened against Nova, with the UI identifying Practice / AI opponent / First to 2 wins. No ranked, invitation, purchase, credit-funded idea request or extra battle was used. `live-arena.jpg`, `live-practice-context.jpg`.

The player composed this authored Finisher using two selections and no typing:

> I threaten one side of the pillar then reverse to catch their committed turn with a final strike.

At the initial attempt, confirmation and Cancel behaved correctly, but submission failed and retained the draft. A full ordinary-app reload restored the exact type and sentence (`live-restored-draft.jpg`). One bounded retry succeeded; the temporary diagnostic never displayed an error. The first failure remains **unclassified/transient**: no transport status was captured and no product source fix is claimed.

Round 1 completed with 39.9 vs 50.4, series 0–1, human HP97/132. The judge explanation and six-score breakdown were reachable (`live-round1-result.jpg`, `live-round1-explanation.jpg`). Continue opened round 2 with a new situation, empty draft and disabled lock button (`live-round2-empty.jpg`).

Round 2 used **Defense**: “I retreat up the nearest low stairway to make their approach take an extra step.” Its exact confirmation was captured (`live-round2-confirmation.jpg`) and submission succeeded on the first attempt after the diagnostic had been removed. The same Bo3 series completed **Defeat, 0–2**, with human HP64/132 vs bot HP100/100 (`live-final-result.jpg`). Round 2 scores were 37.9 vs 47.6 (`live-final-breakdown.jpg`). The reward screen identified Practice and no rating change (`live-practice-rewards.jpg`). No paid upgrade, reroll, video action, share or reward claim was clicked. The existing automatic cinematic rendered asynchronously; it did not block completion. Returned to Arena after the final breakdown.

The completed result also exposed an independent presentation defect: both bot-won rounds were labelled Pending despite completed scores, and the round header earlier said Waiting for judge. This was reported immediately; the backend owner confirmed completed round state and delegated a result-label correction. The original incorrect labels are preserved in `live-final-breakdown.jpg`. The corrected native result was reopened from the October 2 completed battle entry after the independently implemented fix. Both rows now say **Opponent won**, with their original numeric scores and HP unchanged; both Review moves buttons are available (`live-final-breakdown-corrected.jpg`). The dedicated round-result route redirects a completed series to the final result, so its separate corrected header was not re-exercised natively. The independent agent reported 88 passing tests across four suites for the shared outcome helper and route; no extra battle was created for that header.

## Limits and outstanding checks

- 402 pt was exercised throughout the fixture/live series. The already-installed app on existing iOS26.5 simulator `Prompt Wars Parity 375` (`6F8B783F-D76B-4F4F-8174-94F52489E10F`) was opened against the isolated fixture, with no runtime download or app install. The fixture reported actual native width 375 / font scale 1.00 (`narrow375-device-proof.jpg`), and unified theme/situation text plus fixed CTA fit (`narrow375-context.jpg`). The mirror did not reliably deliver native drags/taps to this additional device, including after reconnection, so broader 375 interaction checks are **unverified**, not passed. 320, 390 pt and tablet native layouts remain unverified.
- The mirror enabled VoiceOver and displayed native focus/gesture help (`voiceover-enabled.jpg`), but reliable focus-order traversal and spoken announcements were not established. This does not count as a VoiceOver accessibility pass.
- Native field focus was verified. The software keyboard did not appear through this mirror; multi-character text delivery was unreliable. A single character eventually arrived in the intention field, and the original draft later reappeared after Undo, but this is not sufficient evidence for a full manual-edit/Undo or keyboard-geometry pass.
- Full-text editing, selection replacement/Cancel/Undo type restoration, long 800-character confirmation scrolling, maximum accessibility text categories, paid-bank native view, device rotation and Android native acceptance remain covered only where separately documented or by automated checks; they were not completed in this native pass.
- These observations do not establish release-binary behavior, offline cold launch, successful AI moderation for every bank, human prompt-quality calibration, or the planned pilot.

## Restoration and cleanup

Text Size 3, Reduce Motion OFF, VoiceOver OFF and accessibility overlay OFF were confirmed for the original 402 simulator (`settings-restored.jpg`) and again on return from the 375 check. The 375 device retained the same original settings (`narrow375-settings.jpg`). The live Bo3 is complete and the ordinary app returned to Arena.

Only the 375 simulator started by this delegated pass was shut down; the mirror then showed its Start button, with the original 402 simulator still running. The delegated Chrome mirror tab was closed. The delegated ordinary Metro server (final session 55242) exited successfully and port 8081 had no listener. Root was told it was safe to stop the root-owned fixture Metro 17763 and mirror 14758. The root-owned402 simulator and unrelated apps/servers were not stopped. Expo’s separate React Native DevTools window could not be acquired through the Browser runtime; it was not used to read requests, credentials or unrelated tabs.


## Bounded keyboard follow-up

A final isolated follow-up on the original 402 pt simulator attempted to make the local simulator window available for supported keyboard delivery. The Computer Use app registry exposed Apple's Device Hub (`com.apple.dt.Devices`), but both UI-state requests timed out. No Simulator window could be acquired. This is consistent with the earlier root-owned mirror shutdown log reporting that Device Hub had no visible simulator window and was using legacy HID. The attempt stopped after those two timeouts; no alternate automation path or runtime download was used.

One final seeded Write fixture attempt focused the exact editor and displayed a caret. The attempted multi-character insertion did not change its 82-character sentence, and no software keyboard appeared (`keyboard-followup-focus-no-input.jpg`). This establishes focus/caret visibility only. It does **not** establish native text entry, full-text edit/Undo, keyboard geometry, or large-font keyboard behavior. Tablet testing was not continued after this bounded local UI failure.

No runtime source, settings, live battle or API operation changed in this follow-up. The mirror still reported Text Size 3 with Reduce Motion, VoiceOver and accessibility overlay off. Its settings controls were reported as disabled; no setting mutation was attempted. The isolated Chrome tab was closed. The follow-up-owned fixture Metro 39126 and mirror 19446 were stopped, including the mirror's device-scoped cleanup trap; ports 8082 and 3200 had no listening process afterward. The original 402 simulator remains running at the isolated fixture screen; the earlier completed live series was not reopened or changed. No additional simulator was booted.

## Later Android native follow-up

The iOS-only limitations above remain accurate for that pass. A subsequently authorized disposable official Android15 ARM emulator enabled a separate release-startup and isolated Expo Go fixture pass, detailed in [the Android native report](android-local-README.md). That report records Android 6 signed-out startup, native text entry, exact full-text Cancel/Undo restoration, an 800-character confirmation, 320dp/130%text and 800dp tablet-sized layouts. It also records the reproduced Android IME overlap, its narrow conditional-padding correction, and three successful keyboard show/hide cycles. Authenticated release-composer, TalkBack/VoiceOver traversal and physical-device coverage remain limited. Final signed Android 7 subsequently installed with verified versionCode 7, cold-launched in 539 ms and supported unsubmitted signed-out native keyboard input; its own process log had no fatal or JavaScript error. Exact 375/390/402 dp layout captures and the separate paid-bank fixture were also completed. The report preserves the distinction between signed-release startup and isolated composer coverage, plus the buffered Expo Router/emulator diagnostics. All owned Android processes and reverse mappings are now stopped, device display settings were restored, and ports 5037/5580/5581/8082 were clear. iOS 16 behavior did not change.
