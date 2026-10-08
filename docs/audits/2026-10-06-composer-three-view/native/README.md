# Native composer checks

Observed October 6–7, 2026, using the current local presentation fixture in an existing development host (`gg.promptwars.app`, 1.3.2), not the new signed release binary. The host ran on the existing iPhone 17 Pro simulator, iOS 26.5, 402 pt, UDID `5BCEAF70-7392-4F8F-92F6-4249428CA786`. XcodeBuildMCP supplied runtime snapshots and native touch/keyboard input. Its screenshots are resized JPEGs; image pixel width does not establish the device's logical width.

The fixture performs no authentication, telemetry, AI requests, purchases or live submit. Its `PROMPT LOCKED IN` state proves only the local gesture and guards. Production route, persistence and backend verification must be recorded separately.

## Observed interactions

- All nine authored actions appeared in three open groups, with wrapping, full-width rows. Selecting `I watch their reflection in the puddles` kept the action list visible and enabled Next; it did not advance automatically.
- Next showed the Defense action and its three compatible intentions. Selecting `to track a low movement outside my direct view.` stayed on that view and enabled Review. Review showed the exact 87-character combination and Defense.
- A 300 ms press and release did not lock the prompt. A later 750 ms hold on the exact review reached the local locked state, with no additional ordinary-user confirmation.
- Edit full text kept the same text and type. After explicitly focusing the native field, typing ` I keep my balance.` produced 106 characters. The caret and Review footer remained visible above the actual keyboard. Write → Review dismissed the keyboard and preserved the exact 106 characters and Defense. Edit restored the same text.
- A transport request intended to replace the field instead appended 800 characters, yielding 906. The app correctly displayed its 800-character validation error and disabled Review. Native Backspace input reduced this to exactly 800; the error cleared and Review became available.
- The 800-character prompt survived Write → Review → Edit → focused native keyboard → Review. The long review scrolled to its edit controls while the hold footer remained reachable. `ios-402-valid800-review-bottom.jpg` records the end of that review; `ios-402-valid800-edit-keyboard.jpg` records the reopened editor and keyboard.
- After a clean final-source Metro restart, a type-only manual change from Attack to Defense kept the exact 82-character text. Review displayed Defense. Returning to Build showed all nine actions without a stale selection and disabled Next. Choosing a Finisher action opened the replacement confirmation. Keep mine preserved the text and Defense, verified on Review. Use builder entered the incomplete replacement state; Undo restored the complete detached text and Defense, again verified on Review.

## Evidence

- `ios-402-action-selected.jpg`: selected Defense action with the list still open.
- `ios-402-intention.jpg`: compatible intention view.
- `ios-402-builder-review.jpg`: exact builder review.
- `ios-402-native-keyboard-caret.jpg`: actual keyboard, 106-character editor and footer.
- `ios-402-manual-review.jpg`: preserved manual text/type after keyboard dismissal.
- `ios-402-overflow906-keyboard.jpg`: invalid 906-character state caused by transport append.
- `ios-402-valid800-keyboard.jpg`: corrected 800-character editor, actual keyboard and enabled Review.
- `ios-402-valid800-review-start.jpg`, `ios-402-valid800-review-bottom.jpg`: long review scrolling.
- `ios-402-valid800-edit-keyboard.jpg`: 800-character text retained after Edit.
- `ios-402-hold-complete-local.jpg`: fixture-only local hold completion.
- `ios-402-write-before-focus.jpg`: diagnostic capture before field focus, not keyboard evidence.
- `ios-402-final-manual-type-review.jpg`: final-source manual type-only change, exact text retained.
- `ios-402-final-detached-actions.jpg`, `ios-402-final-detached-actions-bottom.jpg`: all nine unselected actions after returning from manual writing.
- `ios-402-final-replacement-confirmation.jpg`, `ios-402-final-cancel-review.jpg`: replacement confirmation and cancellation retaining text/type.
- `ios-402-final-incomplete-replacement.jpg`, `ios-402-final-undo-review.jpg`: incomplete builder replacement and Undo retaining text/type.

## Tooling and limits

Native `touch` on observed runtime element refs activated the React Native controls. `tap` sometimes reported success without an app transition; success was judged from fresh snapshots and screenshots. `type_text` required explicit native focus. Its `replaceExisting` option appended on this host, so field value and counters were checked after every input. A React Native performance overlay was accidentally toggled by unfocused HID input and appears in some early screenshots; it is development tooling, not product UI, and the final reload cleared it. A stale Expo launch error remained in the early underlying accessibility tree from an earlier bad development URL; it was not the visible fixture screen and was absent after final reload.

Screen-reader behavior, Reduced Motion, large text, 320/375/390 pt, tablet and signed release binary verification are not established by this 402 pt run. Persistence across restart is not implemented by this presentation fixture and is not claimed. Background/stage cancellation races are covered by app regressions, not by the native brief-hold observation above. Android results and later final-source rechecks are recorded separately by their owners.

## Production-route Practice Bo3 check

On October 7, the same existing development host loaded the frozen source from the production-route Metro server on port 8084, using the normal project environment and no fixture route flag. The already signed-in `AndrewTwo` account started exactly one free Practice Bo3 against `Echo` through the app's official flow. No account was created, no credentials were extracted, no direct database write was made, and no paid reroll or video action was selected.

- Round 1 published the forge/workbench/chains situation for `Turn weakness into strength`. The builder created `I pull a hanging chain across my approach to place a swinging obstacle beside my strike.` (88 characters, Attack). The full preview matched the visible fragments.
- The player navigated back through the wizard and parked the battle at Arena. The app process was stopped and relaunched. Continue battle restored the chosen action, intention, exact 88-character prompt and Attack; Next and Review became available at their respective views. This establishes native persistence for this one production-route draft, separately from the nonpersistent presentation fixture.
- Edit full text changed the move type to Defense without changing the text. Actual keyboard input appended ` I keep the chain between us.`. Review preserved the exact 117-character text and Defense and dismissed the keyboard. A 300 ms release did not submit. A later 750 ms hold submitted through the official backend flow and reached the waiting screen.
- Round 1 displayed scores 44.125 versus 51.9, HP 103/132 versus 100/100 and series 0–1. Continue opened round 2 with a new channel/ledge/soot situation. No old action selection or prompt leaked into the new round.
- Round 2 used the builder to produce `I step diagonally across the floor channel to force their guard to follow a changing angle.` (91 characters, Attack). A 750 ms hold submitted it. Scores were 43.575 versus 50.25, HP 76/132 versus 100/100 and final series 0–2. The official continuation routed to the free Tier 0 reveal and final Defeat summary; it did not open a third round. The app returned to Arena afterward.
- Tier 0 showed six score axes and the actual explanation: “Both plans use the channel to control engagement angles or approach speed, directly turning the environmental feature into a tactical advantage without assuming extra abilities.”

This check also exposed unresolved result presentation and telemetry observations, recorded separately from composer behavior. Both round-result headers remained `Waiting for the judge…` even after scores, damage, HP and series totals appeared. The round-2 CTA read `Continue to round 3` despite 0–2, and the final round-by-round summary marked round 2 `Pending`. Round 1's notes said they were unavailable; Tier 0 did show the round-2 explanation, while Echo's prompt card said `Prompt not recorded.`. The development warning overlay reported only `record-funnel-event`, HTTP 400. No response/request bodies or tokens were inspected. These observations do not establish their server or client cause. No frozen production source was changed during this QA run.

Evidence: `ios-402-live-action.jpg`, `ios-402-live-review-before-park.jpg`, `ios-402-live-draft-restored-after-restart.jpg`, `ios-402-live-manual-keyboard.jpg`, `ios-402-live-manual-review.jpg`, `ios-402-live-submit-pending.jpg`, `ios-402-live-round1-result-pending.jpg`, `ios-402-live-round1-breakdown.jpg`, `ios-402-live-round2-action.jpg`, `ios-402-live-round2-review.jpg`, `ios-402-live-round2-result-pending.jpg`, `ios-402-live-tier0-winner.jpg`, `ios-402-live-tier0-judge-breakdown.jpg`, `ios-402-live-final-summary.jpg`, `ios-402-live-final-rounds.jpg`, and `ios-402-live-telemetry-warning.jpg`.

This is one live iOS Practice series using an existing development host, not signed-release, ranked, casual, payment, accessibility or broad-device acceptance. The separate [Android local QA record](android-local-qa.md) describes its own fixture matrix and limits.
