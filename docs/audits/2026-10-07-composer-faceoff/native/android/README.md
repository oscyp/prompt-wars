# Face-off composer — Android development verification

Verified on 2026-10-07 in the existing task-owned Android 15/API35 AOSP arm64 emulator (5582), dedicated ADB5038, Expo Go SDK55 and fixture Metro8083. No native app build, release artifact, store submission, live account action, provider generation or wallet purchase was created.

The fixture imports production components, composer reducer/navigation and hold control, but supplies local authored choices and fixture callbacks. Its backend origin is the non-serving localhost port9. These checks establish native component/state behavior; they do not establish a full authenticated route or paid HTTP pipeline working on a device.

## Passed checks

- Face-off includes both fighters, HP, theme, full expanded situation and mode selection. Next opens Action with no selected type and no action cards. Selecting Attack reveals exactly three choices.
- Action, Intention, Approach and Your move are distinct views. Picking a card does not advance automatically. No visible builder TextInput or AI-origin label. The preview text exactly joins the three selected fragments.
- Back preserves selections. Switching to an unused type blocks Next; switching back restores the original action, intention and approach. A short tap does not submit; an 850ms native press invokes the existing 600ms hold threshold and displays the fixture's submitted state.
- All three one-credit controls open fixture purchase previews. Cancel preserves the selected content. The intention preview's delivered state requires explicit Use new ideas; this uses fixture data and is not a real generation or charge.
- Face-off → Write your own → Your move: actual Android software keyboard input, focused editor/cursor and enabled reachable Next; exact 83-character prompt and Finisher displayed in review; Back preserves the text.

| Logical width | Font scale | Result |
| ---: | ---: | --- |
|390dp|1.0|Native keyboard, exact review and Back passed; three type buttons fit horizontally.|
|320dp|1.0|Native keyboard, exact review and Back passed; type controls stack with full readable labels.|
|320dp|1.5|Native keyboard, exact review and Back passed; content scrolls and footer remains reachable.|

`matrix-results.json` records actual bounds and the 8 dp type-to-action spacing. `*-ime.txt` records `mIsInputViewShown=true`. Screenshots and XML were both inspected; off-screen nodes were not treated as proof of visibility. Review and editor require scrolling on smaller/large-font screens, as designed.

Reduced Motion smoke: review remained usable with all three Android animation scales set to 0, then restored to 1. This is not measurement of every animation. The bounded 600-entry AndroidRuntime:E/ReactNativeJS:E read was empty (`native-errors.txt`). Separately, Metro printed one `ERR_STREAM_UNABLE_TO_PIPE` during repeated fixture restarts, and the emulator printed software-renderer warnings; the subsequent final UI checks passed. Early harness retries were needed for Fast Refresh and for scrolling off-screen editor/review text into view. This is not a claim that every development-tool log was warning-free.

## Visual findings addressed

The native pass caught excess vertical space after the move-type row, clipped Finisher text, and a one-credit button label clipped at 150% text. The root implementation corrected the type row's intrinsic sizing/padding, restored label growth, stacks the type controls below 360 dp or above 1.3 font scale, and allows purchase labels to occupy available width. Final type-control evidence uses `final-390-1.0-actions.png` and `final-320-1.0-actions.png`. Final purchase-label evidence uses `final-large-cost-label-action.png`, `final-large-cost-label-intention.png` and `final-large-cost-label-approach.png`; all three labels and the price are visually readable. Earlier `final-320-1.5-actions.png` still shows the intermediate clipped purchase label. Early `390-*` files document the functional flow and intermediate layout, not the final control layout.

The pre-existing large VersusStrip wraps the fixture name Andrew onto two lines at 390 dp, with all characters present. The full context is always expanded but remains part of the scroll content; it is not fixed above the keyboard. Expo Go Tools and the DEV notice are development-runtime chrome, not product UI.

## Limits

TalkBack is not installed and no accessibility reader service is enabled (`runtime-accessibility.json`); spoken order and reader-specific tap-confirm were not verified here. No physical device, additional keyboard vendor, other widths, landscape, native saved-draft restart, real purchase/recovery or complete live battle was tested in this fixture pass. SQL and Jest evidence cover separate contracts and are not substituted for this missing native integration coverage.

`builder-flow.json` captures the exact synthetic review text and flow assertions. Cleanup confirmation is in `task-cleanup.json`; cached SDK/AVD data is retained for future development checks.
