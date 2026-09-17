# Native audit session — 13 September 2026

## Environment and scope

- Checkout: `5e0e6ce` (`Improve prompt preparation UX`). Existing audio-provider edits retained.
- iPhone 15 Pro simulator, iOS 26.5; app bundle `gg.promptwars.app`; existing signed-in account.
- Existing native development build connected to this checkout through Metro. No fresh release build or production-deployment parity check.
- Default Dynamic Type category: `large`. Accessibility probes: `accessibility-extra-large`. Restored to `large` after each probe.
- Software keyboard temporarily shown for prompt-entry inspection, then hidden again to restore the simulator's earlier state.
- Native tool screenshots exported at 369 × 800. The floating development gear is excluded from product findings.

## Reproduced interactions

1. Arena showed Today's theme / Open Arena. Start a Battle offered Ranked, Casual, Practice vs Bot.
2. Chose Practice vs Bot. Matched with Whisper under The calm before the storm. No human/ranked queue was started.
3. Selected Defense and submitted a custom round-one prompt by holding Lock In for approximately 850 ms.
4. Waiting showed score/HUD content in the status-bar region. Round one resolved in the player's favor, 1–0, 100 vs 40 HP.
5. From the round-result top, two upward swipes were needed to expose Continue after the large portrait, HP/modifier information, rubric, and explanation.
6. Round two: chose Finisher and entered 172 characters. Change move returned to move selection; Continue and Write your own produced an empty 0/800 field. Captured both states.
7. Re-entered the draft. Showing the software keyboard left the focused editor out of view. A subsequent manual upward swipe still showed HUD/status content rather than the text. Captured both views. Hid the keyboard afterward.
8. Submitted round two. The series completed 2–0 by knockout. Opened the series reveal, rewards, breakdown, optional cinematic/captions, and final action area.
9. Opened Report this battle, without submitting anything. At enlarged text, lower reasons and Cancel/Submit extended beyond the screen; the sheet itself had no scroll body. Restored default size and canceled.
10. Back to Arena → Battles → Rankings → Profile. Opened Wallet, Shop, Settings, Stats, and the character editor. No buy/equip/redraw/save controls were activated.
11. Profile → Wallet → Shop → Back → Back returned to Arena. Independently reproduced Profile → Settings → Back returning to Arena. Stats/editor return also returned to Arena. Profile had to be reselected and reloaded.
12. Wallet's four purchase cards broke words and overlapped the Standard badge at default text. Captured the displayed localized prices/quantities and subscription claims.
13. Opened the mode sheet at enlarged text: the Practice option was cut off below the viewport; mode descriptions were truncated. Restored default text and closed the sheet.
14. Returned to Arena. The two achieved quests had Claim buttons, while the header said 0 of 3 complete. No quest reward buttons were manually pressed.

Normal app behavior updated bot history/progression and displayed an automatically available cinematic; the balance changed from 19 to 20 during the session. This was not a read-only backend session. No manual purchase, paid reroll/redraw, report, block, human message, or ranked battle was performed. No database reset, data cleanup, account edit, or application-source edit was performed.

## Coverage boundaries

Native inspection establishes these visual/navigation observations in one environment. It does not establish production prevalence, full screen-reader usability, Android behavior, frame-rate performance, or all remote failure states. Source findings and proposed acceptance tests are labeled separately in the main report and technical appendix.

The native accessibility snapshot exposed Shop cards as Preview buttons without independent nested Buy/Equip targets. This supports investigating the nested controls; it is not a substitute for a complete VoiceOver/TalkBack run.

The first web-preview attempt failed on an SSR `window is not defined` path involving browser storage. Native gameplay was used for the audit instead; the web error is not classified as a native gameplay defect.

## Artifact verification and cleanup

- Verified all 33 unique gallery image paths and all local document links; checked 77 source path/line references.
- Opened the gallery in the browser, inspected its layout, and exercised category filtering and reset.
- Recomputed contrast: white/lavender 2.7214:1; dark/lavender 7.2185:1. Displayed Standard unit price $0.166333; Mega $0.09995.
- Restored default simulator text size and the original shut-down simulator state; stopped the temporary native Metro server. The local gallery preview remains available for review while its temporary server runs.
