# iOS fixture QA — 7 October 2026

Verified the current native components in the **existing installed development host**, using `scripts/visual-fixtures.sh` on port 8082. No build, installation, TestFlight submission, authentication, live battle, provider request, purchase, or server submit was performed. Fixture purchase confirmation and lock-in are local simulations.

## Environment

- iPhone 17 Pro / iOS 26.5, 402 pt, existing booted simulator `5BCEAF70-7392-4F8F-92F6-4249428CA786`.
- Existing Prompt Wars Parity375 simulator `6F8B783F-D76B-4F4F-8174-94F52489E10F`, 375 pt, existing `gg.promptwars.app` installation; booted only for this check.
- Native screenshots saved directly with `simctl io screenshot`; interaction and accessibility-tree inspection through XcodeBuildMCP.
- Normal text scale 1.00. Additional 402 pt check used iOS `accessibility-extra-large`, reported by the fixture as 2.64×.
- The fixture uses non-serving localhost backend settings and no authenticated mutation hooks.

## Checks performed at 402 pt

| Check | Observation / evidence |
| --- | --- |
| Face-off | Player portraits, HP, theme, expanded full shared situation, Build move / Write your own and Next. `402-faceoff.png`, `402-faceoff-modes.png`. |
| Explicit type before actions | Entering Action without a type showed no action cards and disabled Next. Choosing Attack revealed exactly three cards. `402-action-type-first.png`. |
| Final compact type controls | Normal-size Attack / Defense / Finisher labels fit one row including the selected marker; three Finisher cards and price control visible. `402-action-final-controls.png` was captured after final type-control styling. |
| Action → Intention → Approach → Your move | Each selection stayed on its current view; Next advanced. Three intention choices and three approach choices were inspected. `402-action-selected.png`, `402-intention-selected.png`, `402-approach-selected.png`. |
| Exact builder review | Review showed Attack and `I advance beside the torn banner to disguise my striking hand behind its movement. I keep the banner between my near hand and their view.` `402-review-exact.png`. |
| Back | Review → Approach → Intention → Action → Face-off retained the selected branch. The selected Approach remained selected and Next stayed enabled after returning. |
| Selection-only builder | No editable fragment field or AI idea / purchased badge in the inspected builder views. |
| Purchase preview | Action price control opened the existing local preview modal with Cancel and Preview. Preview staged Use new ideas without changing the selected prompt. Intent and Approach price controls were visible. `402-purchase-preview.png`. This is not billing or recovery evidence. |
| Manual text | Face-off mode choice opened the full editor. Native keyboard input produced the exact 87-character text `I wait beside the pillar until the loose banner lifts, then move across the dry stones.` Explicit Defense choice enabled Next. Review retained exact text and type. `402-write-keyboard.png`, `402-write-review.png`. |
| Keyboard | Actual iOS software keyboard and cursor were visible; editor and footer remained reachable. Decorative image left the typing viewport; context remained in the scroll content. |
| Hold | A 100 ms press on the builder review control did not submit. A 1000 ms press on the manual review control completed the fixture and displayed PROMPT LOCKED IN. `402-hold-locked.png`. The implementation threshold remains 600 ms; this check tested below/above it, not exact timing precision. |
| Enlarged text | At 2.64×, type controls stacked with full labels, action cards wrapped vertically, and Next stayed visible in the footer. Scrolling reached the context and choices. `402-large-type-choice.png`, `402-large-action-cards.png`. |

The first captures predate the last compact type-button spacing refinements. `402-action-final-controls.png` confirms the final normal-size control layout; the flow and content checks use the same state and view components.

## Limited 375 pt check

The existing 375 pt host rendered and scrolled Face-off with theme, complete situation, mode buttons and footer. `375-faceoff.png` records its settled layout. The name Andrew wraps within its narrow portrait panel; this is visible, not truncated.

**The 375 pt interaction run is not a pass.** Automation reported successful taps/short presses, but Next and mode buttons did not change the rendered state, including after one host relaunch. Native scrolling continued to work. This was not reproduced in the completed 402 pt flow. The session also logged a development-runtime error during reloads: `AppRegistryBinding::stopSurface failed. Global was not installed.` Its relation to the unresponsive 375 pt run is unproven. Further device/host investigation is needed; no new build was created to bypass it.

## Unverified by this run

- 320 / 390 pt iOS, tablet, physical device, complete 375 pt interaction flow.
- VoiceOver spoken output and activation, screen-reader confirmation, Reduced Motion gestures, maximum-length prompt, device restart/durable draft restoration.
- Live generation, payments/refunds, recovery, real submit and battle result. Automated backend/state tests are separate evidence.
- Android coverage belongs to the separate Android report.

## Cleanup

- Restored original 402 pt simulator content size to `large`; verified by reading it back.
- Left the originally booted iPhone 17 Pro running. Returned the task-booted 375 pt simulator to Shutdown. No simulator was erased.
- Stopped the task-owned Metro process (session 35999) and verified no listener remained on TCP 8082.
- Restored XcodeBuildMCP defaults to their original all-unset state.
- No simulator mirror, build, app installation, account change or production write was made.

Tooling notes: IPv4-first DNS was needed for Metro's advertised `127.0.0.1:8082`; initial IPv6-only attempts were stopped. A stale Expo connection-error accessibility layer remained behind the correctly rendered 402 pt fixture and was not counted as an application failure. During concurrent component edits, Fast Refresh interrupted some attempts; the completed checks were repeated after refresh. The first text-entry attempt opened the development menu; focusing the native field before typing succeeded and the resulting text was verified in the native tree and review.
