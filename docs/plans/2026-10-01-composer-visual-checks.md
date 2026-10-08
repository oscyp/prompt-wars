# Composer visual verification

Local web fixture: `scripts/visual-fixtures.sh --offline`, `/prompt-composer`.
Uses the production composer, move picker, situation, footer and existing game artwork; replaces authenticated battle/network actions with local state. This is component presentation evidence, not a native end-to-end battle.

## Observed checks

| Logical width | Document width | Interactive targets below 48 × 48 | State |
| --- | --- | --- | --- |
| 320 | 320 | None | Build |
| 375 | 375 | None | Build |
| 390 | 390 | None | Build |
| 402 | 402 | None | Build |
| 768 | 768 | None | Build |

Measured from rendered DOM geometry through the in-app browser, with a 1024-point viewport height. At 390 points, action choices were 358 × 72, mode controls 48 high, move controls 98 high, and Lock in 64 high. Full-form rendering was also inspected at 390 × 2000. Obsidian surfaces, muted gold borders, lavender selection/CTA, Barlow labels and the existing citadel artwork remain in use.

The ready state at 320 displayed the exact 154-character action + intention text. The Write state displayed that same text, the `Your move` editor and enabled Lock in. These were fixture-selected states, not a successful automated click-through.

Two local preview issues were corrected: fixture web output avoids native-only server rendering, and the bundled avatar URI helper has a React Native Web-compatible asset resolver. The battle backdrop is clipped to its container; its intrinsic image width had expanded document scrolling before the fix.

Browser click dispatch and some navigation waits repeatedly timed out. Do not count the browser session as completed interaction QA. Screenshot capture also produced inconsistent scaling; it is not accepted as the native screenshot matrix. Automated component/reducer tests separately cover choice, edit, replacement, undo and incomplete submission behavior.

## Still required before release

- iOS and Android at 320/375/390/402 and tablet equivalents, normal and enlarged text.
- Native keyboard show/hide, cursor visibility, focus stability, safe area and pinned submission.
- VoiceOver, TalkBack and Reduced Motion.
- Long names/situations, 800-character prompt, loaded/fallback/error/pending/purchase/recovery states.
- Real authenticated round through submission, resolution, appeal and next round, on a staging environment with the new migrations.

No simulator was booted in this session. Web measurements and Jest fixtures do not satisfy those native release gates. Temporary browser viewport overrides were reset after inspection.
