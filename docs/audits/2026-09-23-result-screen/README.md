# Battle result screen — implementation and validation

The [result refinement](../../plans/2026-09-23-battle-result-refinement.md) and [Visible Stats and Consistent Cards follow-up](../../plans/2026-09-23-visible-result-stats.md) are implemented in the current working tree. Review the [native comparison gallery](comparison.html), [capture provenance](captures.json), [automated results](verification.json) and [native observations](native-checks.md).

## Visible stats follow-up — 23 September 2026

- [x] Theme and round statistics are visible without expanding Battle details. The theme reuses BattleThemePlaque and its mapped banner, gold title and scrim; it contains no deciding-rule text. Missing themes are omitted.
- [x] Round by round uses the restrained double-gold GamePanel with existing separators and values. Legacy single battles omit the list. No-contest retains Played rounds and the explicit historical-reference notice.
- [x] Result info opens a bounded sheet with a fixed heading, visible Close and scrolling body. It presents available recorded progress, reward eligibility, quest titles, deciding-rule and judge/move notes; empty groups are omitted and revised original notes are labelled Before review.
- [x] Close keeps page scroll/content intact and restores the opener focus through the shared sheet contract. View quests dismisses before navigating to Arena, with once-only completion handling. The sheet only consumes already-loaded data.
- [x] Existing 20-point gaps, result/media/sharing/reward/offer order, appeals, safety and footer remain intact. No new data or paid operation was introduced.
- [x] Thirteen new behavioral cases cover visibility, both player perspectives, single/no-contest, missing/long themes, unknown HP, dismissal/focus, empty sections, quest navigation and an adjudication change while the sheet is open. Existing theme mapping tests also pass.

The follow-up code review approved the task-only diff with no findings. ResultDetails extracts the existing round presentation so visibility and modal lifecycle can be tested independently; changing that boundary later would be a client-only component merge. The optional shared-sheet dismissal callback leaves existing consumers unchanged.

Native follow-up captures are labelled **Visible stats** in the gallery. They use an existing completed AndrewTwo versus Nova practice defeat, not fabricated records. Default and accessibility-large text, sheet scrolling/Close, matching gold frames, theme wrapping, reachable footer actions and return to the same page position were inspected. On the standard phone, View quests was followed through to the actual Arena.

Two existing observations are kept separate from acceptance of this presentation change: completed bot-loss round rows can still say **Pending** under the unchanged round-outcome helper; and a development LogBox reported a transient **Network request failed** while known result content remained available. The LogBox was dismissed for clean screenshots, without suppressing errors in code. This work does not claim to fix either issue.

## Changes checklist

- [x] Bundled wordmark, two battle-recorded equipped fighters, names/archetypes/roles, one viewer-oriented series score and optional authoritative HP inside the emphasized verdict frame. Legacy single battles omit series score; no-contest suppresses original score, winner, KO and HP in the current verdict.
- [x] Consistent 16-point gutters/panel padding, 20-point section gaps and responsive identity layout. Persistent Arena and primary Battle Again remain reachable.
- [x] Paused, contained 220-point cinematic preview with explicit full-screen playback, native controls, recorded video-job round label and historical-media restriction. Close retains position; background/navigation pauses; released-player cleanup is safe.
- [x] Result-only captions/transcript UI, errors and caption queries removed. Existing media files, stored captions and other consumers remain untouched.
- [x] Shared Share card / Share video / Replay reveal actions. Share layout switches at 390 points and font scale 1.15. Card export remains independent at full size; card/video sharing is guarded by the current adjudication revision.
- [x] Compact Rewards/Progress, actual diamond awards separate from completed quests, recorded streak values, explicit unavailable/pending states and no blank confirmed-empty panel. Eligibility, quest titles and personal-best details live in Result info.
- [x] Reviewed outcomes hide original competitive figures, retain awarded diamonds and distinguish a known nonzero reversal from a neutral reviewed status. Quality-floor rating eligibility stays separate from diamond eligibility.
- [x] Design language, product concept, acceptance documentation and isolated native fixtures updated.

The result route retains data/mutation/export ownership. Presentation is split across ResultVerdict, ResultMedia, ResultActions, ResultMediaSection, ResultRewards, ResultDetails and ResultInfoSheet, with small media/reward presentation helpers. The shared free-reveal/reward helper, media recovery hook, battle-character resolver and full-size export components are [byte-identical to the pre-task baseline](preservation.json).

## Automated verification

- **Jest: 197 suites / 1,605 tests passed**, none failed or skipped.
- **TypeScript passed.**
- **ESLint: zero errors**, one pre-existing `require()` warning in `app/_layout.tsx:29`.
- **Fixture isolation checks passed.** Direct-call/config isolation is not a transitive network audit.
- The earlier refinement verification is retained in [the prior check record](verification-before-visible-stats.json).
- Focused checks cover both perspectives, legacy/Bo3/current reviews, unknown HP, frozen equipment, media lifecycle/recovery, caption-free route composition, shared-action states, revision changes during sharing, reward eligibility/unknowns/corrections and empty-section omission. The final regression verifies that failed fullscreen presentation → Retry → Close restores focus to the remounted Play control, never its removed predecessor.

Earlier task reviews approved the verdict, media and rewards changes after scoped fixes. That integrated review approved the retry-focus repair. The latest full verification above also includes the visible-stats follow-up; a fresh scoped review approved it without further fixes. This report is not a store-release approval.

## Native evidence

The gallery contains **31 captures: 25 actual-route and six component-fixture captures**, including four before images. Eleven actual-route captures document the visible-stats follow-up; earlier captures retain their original stage labels. Both actual viewports are covered: **375×812 and 402×874**. Tool JPEGs are downscaled; labels describe simulator points.

Actual existing AndrewTwo versus Nova practice results exercise equipped avatars, recorded HP, the Round 2 cinematic, paused preview, native full-screen controls/Close, both native share sheets, free reveal/replay, Reduced Motion, accessibility text, compact rewards and result-to-Arena navigation. The actual independent [share-card export is 1152×1320](share-card-actual.png). No share destination was selected.

Native testing caught two defects and verified their repairs: inline `nativeControls=false` hid full-screen controls in the installed expo-video runtime; and parent player disposal could race child pause cleanup when leaving the result. Full-screen controls now follow confirmed native presentation, and the exact View quests navigation path returns safely to Arena. Both phone sizes were checked after the lifecycle fix. Wallet stayed at 128; no battle, generation, purchase, reward claim or equipment mutation was used to obtain evidence.

No-contest/Unicode, long unbroken names, signing failure, unavailable rewards and retained reviewed awards use labelled isolated fixtures. They show client presentation, not real appeal/moderation/payment processing. Default text size and the original Reduce Motion setting were restored; the isolated fixture server was stopped and the normal app server remains available.

## Remaining native acceptance

- **Android remains blocked** until a test environment is available, as instructed.
- **Live VoiceOver remains unverified.** The iOS 26.5 simulator Accessibility → Vision UI has no VoiceOver control. Native accessibility labels and focus behavior are covered by inspection/tests; a device VoiceOver traversal is still needed.
- Exact mid-playback time retention was not measured natively; tests verify pause without seek and reset only after completion. Native Close and background return were exercised.
- Provider/payment failures and real revised human outcomes were not manufactured in production. Recovery and revision isolation have behavioral tests and labelled fixtures.
- Local browser policy blocked opening the HTML gallery. Its files, links and filter metadata are checked statically; no browser-rendering claim is made and no alternate-browser workaround was used.
- Prior audit acceptance gaps, including the earlier Japanese-heading observation, are not closed by this task.

## Interpretation decisions

| Decision | Reason | Cost if changed |
| --- | --- | --- |
| Keep explicitly labelled Played rounds visible for no-contest; hide original competitive values from the current verdict/export. | The follow-up plan explicitly preserves Played rounds with a historical-reference notice. | A presentation-only follow-up could hide that history too; server/audit records remain unchanged. |
| Say rating was reversed only for a known eligible nonzero original contribution; otherwise show Reviewed and no replacement award. | Review status alone does not establish that rating points moved. | Copy may be refined with additional authoritative data; no client rating calculation or server change is involved. |
| Display recorded zero streak as `0`, without inferring a reset from a historical personal best. | The result payload does not establish the immediately preceding streak. | Only the display label changes if an authoritative before-value becomes available. |

## Delivery boundaries

Current branch and unrelated working-tree changes are preserved. No dependency upgrade, native/production build, backend contract, migration, deployment, rollout flag, version bump, commit or store submission was performed for this task. This implementation is ready for code review with the native acceptance limits above.
