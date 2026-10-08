# Battle Result — Visible Stats and Consistent Cards

Approved in chat: keep theme and round statistics visible; move explanatory content to Result info.

## Implementation

1. Use the existing illustrated BattleThemePlaque and restrained double-gold GamePanel for the visible theme and round list, with 20-point section gaps. Remove the Battle details toggle and keep existing page ordering and footer. Single battles omit the round list; no contest retains labelled Played rounds history.
2. Add a small ResultInfoSheet using the existing bounded BottomSheet, fixed heading, Close, scrolling body and opener focus restoration. Move recorded progress, reward eligibility, quest titles, deciding explanation and judge/move commentary there. Omit empty groups. View quests dismisses before Arena navigation. Keep appeals and safety on the page; use existing loaded data only.
3. Run TypeScript, lint and all Jest tests. Cover visible stats, both perspectives, legacy/reviewed results, missing/long themes, sheet lifecycle, focus and read-only behavior. Capture actual 375×812 and 402×874 iPhone results, including large text. Update the existing gallery/report; Android remains blocked and unavailable states must be explicit.

## Constraints

Preserve the current working tree. Reuse assets and dependencies. No backend, version, rollout, build/distribution, deployment or submission changes. The previous result-screen refinement remains the baseline for this follow-up.
