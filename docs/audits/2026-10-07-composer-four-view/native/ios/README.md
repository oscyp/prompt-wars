# iOS native verification — 2026-10-07

This is observed simulator evidence, not a complete device accessibility certification. Source was frozen during this pass; no production code was edited.

## Environments

- Xcode 27 / Device Hub and iOS 26.5; installed `gg.promptwars.app` development host loading the frozen application JavaScript through Metro.
- iPhone 17 Pro, 402 pt: local presentation fixtures and one real authenticated Practice Bo3 against the hosted backend.
- Existing 375 pt parity simulator: fixture review at standard and accessibility-large Dynamic Type.
- iPhone 17e, 390 pt: fixture Approach layout.
- iPad Pro 11-inch (M5): fixture Review in **375 pt iPhone compatibility mode**. `app.config.js` has `supportsTablet: false`; this does not establish the full-width tablet layout.
- Fixtures use the real composer components/state with local data and no authentication, suggestion requests, telemetry, purchases or live battle writes. They do not establish hosted integration.

## Checks actually performed

| Check | Observation / evidence |
| --- | --- |
| Action → Intention → Approach → Your move | Four views navigated on 402 pt; explicit Next/Back; selected Approach survived returning from Review. Earlier captures: `402-intention-selected.png`, `402-approach-selected.png`, `402-your-move.png`. |
| Exact manual review | A 95-character fixture prompt, then 145- and 146-character live prompts were verified in the native field and Review; type was preserved. `manual-review-verified.png`, `live-round3-review.png`. |
| Real iOS software keyboard | Live round 2 showed cursor, full 145-character text and reachable Review CTA above the software keyboard. Space and Delete on the actual keyboard restored the same text. `live-round2-native-keyboard.png`. |
| Hold | A short press did not submit; a 1,000 ms press invoked the 600 ms hold path. Fixture displayed PROMPT LOCKED IN; live rounds 1 and 3 were accepted. `manual-held-large.png`. |
| Accessibility confirmation | Device Hub enabled the actual simulator VoiceOver setting. Lock changed to the tap/confirmation path. The modal showed the exact text and Attack type. Keep editing cancelled without changing the text; opening it again and confirming submitted round 2. `live-voiceover-confirmation.png`. This verifies the screen-reader-enabled branch, not a complete spoken VoiceOver traversal. |
| Reduced Motion | Enabled in Device Hub alongside the confirmation check; Review, cancellation and submission worked. Restored off afterward. No frame-by-frame animation audit was performed. |
| Large text | 402 pt and 375 pt accessibility-large text remained vertically scrollable, including full situation and Review; footer remained reachable and its label wrapped. `large-review-scrolled.png`, `375-large-review.png`. Restored original `large` size. |
| Additional widths | 375 pt standard Review and 390 pt Approach had wrapping rows and vertical scrolling without observed horizontal overflow. `375-review.png`, `390-approach.png`. |
| iPad compatibility mode | Full situation and exact Review text were reachable by vertical scrolling; hold footer remained reachable. `tablet-phone-compat-review.png`, `tablet-phone-compat-review-text.png`. This is an iPhone-size window on an iPad, not a tablet-width composer. |
| Mode preference | After round 2 used Write your own, round 3 opened in that mode. No builder bank was started in round 3. |

The earlier incorrectly named keyboard capture was renamed `402-manual-empty-no-keyboard.png`; it shows neither entered text nor an open keyboard and is not evidence of successful input.

## One hosted Practice Bo3

Battle `bf0772be-c215-4d00-898e-a690f4eeb59a`, existing signed-in AndrewTwo vs Echo. Started around 13:00–13:01 UTC and reached final summary at approximately 13:16 UTC. No additional battle was created, no paid reroll/video purchase was requested, and no custom adaptation or manual AI retry was invoked.

| Round | Authoring | Result observed |
| --- | --- | --- |
| 1 | Explicit Use starter ideas after AI waiting/error; Attack; complete Action/Intention/Approach; exact 129-character review | Opponent won, 42.275 vs 51.975, series 0–1; player HP 99/132 vs 100/100. |
| 2 | Write your own; Attack; exact 145-character prompt; native keyboard and accessible cancel/confirm flow | Draw, 42.275 vs 43.05, series remained 0–1; no damage. |
| 3 | Restored Write your own; Finisher; exact 146-character prompt; hold to submit | Final Defeat 0–2, HP 77/132 vs 100/100. |

Screenshots: `live-round1-review-text.png`, `live-round1-result.png`, `live-round2-native-keyboard.png`, `live-round3-review.png`, `live-final-reveal-missing-bot-prompt.png`, `live-final-result.png`.

Visible AI failure copy: “Some ideas are unavailable. You can write your own or use starter ideas.” It appeared after the initial wait (roughly one minute observed from entering the round). The UI does not explain the cause. The backend owner's separate read-only report confirms the three round-1 composition-v3 banks failed after approximately 45.6 seconds each, with no charge. Round 2 automatically started banks before switching to manual; round 3 did not. See the backend evidence for exact operation totals and reasons.

The final backend snapshot independently confirmed all three prompts locked/approved, battle completed 0–2, no round-3 bank, no custom completion and **zero wallet transactions, debits or refunds**. One zero-credit video job existed and succeeded. The live test did not request that video.

## Result-path observations requiring follow-up

These are observations in the unchanged result path. This run does not establish when they were introduced or their cause.

- Round 1 showed “Waiting for the judge…” even while numeric scores and Continue to round 2 were already available.
- Earlier round screens showed “The judge’s notes aren’t available for this round.” The backend reports that all three persisted rounds contain judge explanations; the final reveal did show an explanation.
- Final reveal displayed Echo’s text as “Prompt not recorded.”
- Final summary initially displayed “Cinematic video — Rendering — about a minute. You don’t have to wait here.” No paid action was taken; the backend confirmed a zero-credit job. The UI state alone does not prove a charge or a stuck job.

## Remaining limits

- No full spoken VoiceOver reading order / focus traversal audit, no physical-device pass, and no signed TestFlight-binary interaction in this pass.
- Native 320 pt iOS coverage is not established. Additional widths above are bounded layout checks, not every loading, error, maximum-text and keyboard state at every size.
- Full-width iPad coverage remains open because the native app is configured for phone compatibility mode. No app capability change was made during QA.
- The large-text checks prove scroll/reachability for observed content, not universal clipping/contrast compliance.
- Restart/offline draft recovery, every parent-branch permutation and late paid recovery have automated coverage; this native pass did not repeat the whole automated matrix.
- Xcode 27 `tap` and `type_text` sometimes reported success without changing React Native UI. Every asserted input was verified by a fresh accessibility snapshot and screenshot; a 100 ms native press was used when ordinary tool taps failed. The Mac later locked, so remaining layout work used the dedicated simulator plugin rather than desktop UI.

## Cleanup

VoiceOver and Reduce Motion on the live 402 pt simulator were restored off; text size on 402 pt and 375 pt was restored to `large`. The task's normal-app Metro 8084 was stopped (session 27638, exit 130). The three extra simulators booted for QA (375 pt, iPhone 17e and iPad Pro 11-inch) were shut down; the originally booted iPhone 17 Pro was preserved and the MCP default restored to it. Root stopped fixture Metro 8082 and mirror 3200, verified their listeners closed, and closed only the task-created mirror browser tab. No app data was erased.
