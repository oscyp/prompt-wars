# Native checks — 2026-09-23

Environment: existing Debug iOS 26.5 app with current Metro code. No native dependency changed. 375×812 and 402×874 simulators; evidence labels refer to points, not the downscaled JPEG export dimensions.

## Observed

- Actual completed practice result, both sizes: equipped AndrewTwo avatar and frozen Nova bot identity, one 2–0 score, known 100/100 and 0/100 HP, shared framing and persistent actions.
- 402 default text: complete verdict and contained 220-point cinematic region fit above the footer. Cinematic identifies its recorded Round 2.
- Explicit Play opens the approved existing video full screen. The native transport, Close, mute and timeline are available. Video ends without looping; native Close returns to the previous result scroll position and last contained frame.
- A native controls defect was caught before acceptance: the installed expo-video implementation propagates nativeControls=false into fullscreen. Controls now follow confirmed fullscreen state; they remain available at completion and are removed from the inline preview.
- Background/foreground round trip resumes the same result/player session paused. Precise mid-playback time retention was not measured natively; focused lifecycle tests cover pause-without-seek on exit and replay reset only after completion.
- 375 fixtures: no-contest with Unicode names suppresses deliberately stale score/HP/KO/winner values. Accessibility-large uses real OS text sizing; fighter information stacks and essential names remain visible through scrolling.
- 375 fixture: long unbroken name, defeat and signing failure show a reachable Retry action. Tapping Retry increments only the local fixture counter. Production retry isolation is separately verified by behavioral tests.

- Actual Share card produced the native PNG share sheet, then was dismissed without choosing a destination. The resulting [1152×1320 PNG](share-card-actual.png) was inspected: complete logo, score, equipped avatars and names, independent of the compact screen sizing. No share destination was selected.
- Actual Share video opened the native video share sheet for the existing 11.7 MB cinematic; it was dismissed without selecting a destination. No generation or purchase was initiated.
- With OS Reduce Motion enabled, Replay reveal opened the unchanged free result sequence with visible Next/Skip controls; Skip returned to summary.

- Actual compact rewards captured on both phone sizes and at accessibility-large on the small phone. The completed practice result shows recorded streak and two completed quests without promising historical claims or adding unawarded diamonds.
- A native exit defect was caught: Expo disposed the player before child cleanup called pause. Narrow released-object cleanup guards now cover that race. The exact standard-phone Battle details → View quests path and small-phone Arena footer both return to Arena without the error; wallet remains 128.

## Evidence limits

- Actual routes use already-existing battle/media records. No battle start, generation, purchase, reward claim or equipment change was performed to produce evidence.
- Rare reviewed/error states use explicitly labelled isolated component fixtures, not staged production records.
- Native accessibility-tree labels were inspected. Live VoiceOver traversal/focus announcements remain unverified: the iOS 26.5 simulator Accessibility → Vision list has no VoiceOver control (native UI inspected). A device VoiceOver pass remains required.
- OS Reduce Motion was enabled for the 402 check, then restored to its original OFF value (verified native switch value 0).
- Android native acceptance remains blocked until a test environment is available.
- Local browser URL policy blocked opening the HTML gallery; its files and links are checked statically, without an alternate-browser workaround.

## Visible stats follow-up

- Actual completed AndrewTwo versus Nova practice defeat on 375×812 and 402×874: the illustrated Storm Citadel theme plaque and restrained double-gold Round by round panel appear directly on the page, without a disclosure. Internal separators and the existing perspective-correct score/HP values are retained. Theme and round cards maintain section gaps; Arena/Battle Again remain reachable.
- Result info opens at its bounded usable height, with no drag handle or expansion gesture. Close and Result info stay fixed while the body scrolls. Recorded progress and the deciding explanation are separated from the main theme card. Empty judge content in this actual result is omitted.
- On the standard phone, Close returned to the unchanged result scroll position; reopening then choosing View quests dismissed the sheet and reached the actual Arena. Wallet still displayed 128. Opener accessibility focus is covered by host-handle tests; no live VoiceOver announcement claim is made.
- On the small phone, live OS accessibility-large resizing kept the sheet open and its text scrollable. The deciding paragraph and View quests were reachable at the bottom, with Close remaining fixed. On the result page, the theme grows for wrapped text, scores/HP wrap, and footer labels grow without losing their actions.
- Known pre-existing observation: completed bot-loss rows show Pending under the unchanged round helper. This follow-up preserves the existing round data and outcome helper; it does not certify that label as correct.
- A development LogBox showed Network request failed during existing result loading. Known content was retained; the overlay was dismissed for screenshots. No error suppression, generation or purchase retry was added.

The new captures exercise the actual route. No new fixture captures or production review records were created for this follow-up. Single, reviewed/no-contest, empty-info and long/missing-theme behavior use automated component coverage; previous fixture captures remain historical evidence and are labelled accordingly. Android remains blocked and live VoiceOver remains unverified. This follow-up does not repeat the earlier cinematic/share/Reduced Motion tests or close their documented limits.

The standard-phone accessibility-large pass also verified the expanding theme and complete round panel, followed by scrolling within Result info while its heading and Close stayed fixed. Both simulators were restored to their original default `large` text category. The app remains running on the actual result route. Eleven new actual-route captures are recorded in captures.json.
