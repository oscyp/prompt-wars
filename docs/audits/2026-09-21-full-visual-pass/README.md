# Complete visual audit — 21 September 2026

[Open the comparison gallery](comparison.html) · [Screen coverage](coverage.json) · [Capture manifest](captures.json)

The collectible direction is working. The compact Arena/Profile heroes, stat dividers, raised Battle action, visible Edit Look categories, Shop tabs and new environment system should be retained. The next pass should correct shared rendering and layout defects, then finish the secondary surfaces.

**This pass contains 10 findings: 3 high-priority visual defects, 6 medium-priority adjustments and 1 lower-priority hierarchy pass.** It includes source review of all **21 screens** and **28 fresh native captures covering 15 routes plus overlays/reveal states**. Six routes were reviewed in source only. A source review is not native acceptance.

## Basis and limits

- Reviewed the current working checkout against [the approved collectible mockups](../../../output/mockups/2026-09-14-collectible-direction/index.html), [Edit Look board](../../../output/mockups/2026-09-16-edit-look/concept-board.png), [design language](../../DESIGN_LANGUAGE.md) and actual source.
- Real app routes ran through the current Metro bundle and existing iOS development binary: standard phone **402×874 pt** with the existing signed-in fighter; small phone **375×812 pt**, signed out. Small signup was also captured at **accessibility-extra-large**. Its original text size, **large**, was restored and verified.
- Some standard-phone images contain a **development LogBox error toast**. The newly implemented avatar endpoint is not deployed in this environment. The toast is retained as evidence and is not counted as a production footer/layout defect.
- No new battle, purchase, equip, draw, save, block/report, signup or password-reset email was initiated. Existing editor draft values were not changed. Opening a completed result may use the app’s normal seen-result tracking.
- Source-only states are explicitly identified below. VoiceOver, Reduced Motion, actual active-round keyboard states, offline recovery and all payment/provider states were not fully exercised in this pass. **Android validation remains blocked** under the existing instruction.
- This is an audit, not a production patch or release. No version/build/store/backend changes were made. Existing unrelated working-tree changes remain intact. Automated product suites were not rerun for documentation-only work.

## Prioritized findings

P1 means fix before another visual release; P2 means complete in the next consistency pass; P3 is polish after correctness. These are visual priorities, not claims of crashes or competitive-integrity failures.

### F1 · P1 — Metallic headings render as two misaligned text layers

**Evidence:** Native + source. **Surfaces:** Wallet, Sign-in, Sign-up.

Long and multiline headings visibly double up. The end of “WALLET & SUBSCRIPTION” and “PROMPT WARS” is especially affected; accessibility text makes the split more obvious.

**Implementation evidence:** GameDisplayTitle paints native GameText and an independent SVG text layer. The native result proves that their glyph metrics do not always agree; the exact combination of weight, baseline and letter spacing still needs isolation.

**Recommended adjustment:** Use one readable glyph rendering path. Keep solid native text as the reliable fallback; retain metallic treatment only when it shares exactly the same geometry. Do not shrink text or disable scaling.

**Acceptance:** Single, sharp glyphs for one-line, multiline, long, diacritic and non-Latin headings at default/accessibility sizes, including font loading/failure and live size changes.

Captures: [Wallet · overview](screenshots/08-wallet.jpg) · [Sign-in · 375-point phone](screenshots/23-small-sign-in.jpg) · [Sign-up · accessibility-extra-large](screenshots/25-small-sign-up-large-text.jpg).

Source: [components/game/GameDisplayTitle.tsx](../../../components/game/GameDisplayTitle.tsx), [components/game/GameText.tsx](../../../components/game/GameText.tsx).

### F2 · P1 — Banner buttons squeeze explanatory text

**Evidence:** Native + source. **Surfaces:** Settings, Shared feedback.

At the standard 402-point width, the notification explanation is compressed into a narrow five-line column beside a button stretched to the full paragraph height.

**Implementation evidence:** InlineBanner puts flexible text and a full GameButton in one wrapping row; the action also uses alignSelf: stretch.

**Recommended adjustment:** Give the explanation the available width and put a compact utility action below it when a message/action pair cannot fit comfortably. Share the fix with editor locks, retries and other banners.

**Acceptance:** At 375/402 points and large text, full messages and action labels remain readable, actions keep at least 48-point targets, and buttons do not stretch to paragraph height.

Captures: [Settings · notification warning](screenshots/12-settings.jpg).

Source: [components/InlineBanner.tsx](../../../components/InlineBanner.tsx), [app/(profile)/settings.tsx](../../../app/(profile)/settings.tsx).

### F3 · P1 — The series headline breaks its score across lines

**Evidence:** Native + source. **Surfaces:** Series result, Result sharing.

A normal 2–1 practice win displays “You won the series 2-” with “1” alone on the next line. The same score already appears between the portraits.

**Implementation evidence:** ResultShareCard renders a sentence containing the score as a large display heading, in addition to a separate score field.

**Recommended adjustment:** Lead with a short outcome label and render the complete series score separately as an unbroken unit. Preserve the precise outcome explanation, KO, reviewed-result revision and legacy single-battle support.

**Acceptance:** Win, loss, draw, no-contest and reviewed states have a clear outcome; no score is split mid-number or duplicated unnecessarily in the headline. Verify exported cards too.

Captures: [Series result · 2–1 practice victory](screenshots/18-series-summary.jpg).

Source: [components/ResultShareCard.tsx](../../../components/ResultShareCard.tsx), [utils/resultView.ts](../../../utils/resultView.ts), [app/(battle)/result.tsx](../../../app/(battle)/result.tsx).

### F4 · P2 — Scrolling content passes behind the status bar and Back control

**Evidence:** Native + source. **Surfaces:** Arena, Profile, Stats, Wallet, Authentication.

Scrolled labels, numbers and controls remain visible behind system status indicators. At large text the sign-up wordmark also reaches the floating Back area.

**Implementation evidence:** Several routes add top padding to scrolling content, but leave the status/header area transparent. Authentication uses fixed vertical content padding.

**Recommended adjustment:** Give each screen one explicit safe-area/header owner. Use a steady background or scrim above scrolling content and reserve the Back area. Harmonize the visual placement of Back while retaining each route’s existing fallback.

**Acceptance:** Content remains legible while scrolling and cannot visually collide with status indicators or Back at default/large text; no double safe-area padding is introduced.

Captures: [Arena · quests and progression](screenshots/28-arena-progress.jpg) · [Profile · rivals and destinations](screenshots/04-profile-navigation.jpg) · [Stats · scrolled detail](screenshots/07-stats-details.jpg) · [Sign-up · accessibility-extra-large](screenshots/25-small-sign-up-large-text.jpg).

Source: [app/(tabs)/home.tsx](../../../app/(tabs)/home.tsx), [app/(tabs)/profile.tsx](../../../app/(tabs)/profile.tsx), [app/(profile)/stats.tsx](../../../app/(profile)/stats.tsx), [app/(profile)/wallet.tsx](../../../app/(profile)/wallet.tsx), [app/(auth)/sign-up.tsx](../../../app/(auth)/sign-up.tsx), [components/game/GameScreen.tsx](../../../components/game/GameScreen.tsx).

### F5 · P2 — Equipped frames disappear on a few identity surfaces

**Evidence:** Native + source. **Surfaces:** Cosmetic Shop, Series result, Result sharing.

Shop says “Wearing Neon Circuit” but its summary avatar uses only a plain accent ring. Result/share portraits likewise have no equipment renderer. Profile and Edit Look demonstrate the intended equipped treatment.

**Implementation evidence:** ShopEquippedSummary does not pass frame/aura data to PortraitPreview. ShareCardFighter has no cosmetic fields and renders a raw circular Image.

**Recommended adjustment:** Carry the actual equipment into the shared portrait renderer. Use current equipment for the Shop and recorded equipment for battle results; keep legacy and bot fallbacks. Cosmetic borders should replace the default ring treatment rather than accumulate around it.

**Acceptance:** The same equipped fighter is recognizable across Profile, Shop, result and export. Frozen results do not acquire equipment purchased later; null legacy snapshots remain valid.

Captures: [Shop · collection](screenshots/10-shop.jpg) · [Profile · first viewport](screenshots/02-profile.jpg) · [Series result · 2–1 practice victory](screenshots/18-series-summary.jpg).

Source: [components/shop/ShopEquippedSummary.tsx](../../../components/shop/ShopEquippedSummary.tsx), [components/ResultShareCard.tsx](../../../components/ResultShareCard.tsx), [components/PortraitPreview.tsx](../../../components/PortraitPreview.tsx).

### F6 · P2 — Secondary panels still mix old and new visual treatments

**Evidence:** Native + source. **Surfaces:** Profile/Rivals, Shop preview, Wallet, Results, Battle recovery.

Rivals uses a plain rounded panel/system heading beside beveled navigation rows. Shop preview names are generic body text. Credit packs and result/reward cards combine rounded borders with an angular bevel. The rewards beat’s heading is much smaller than the verdict heading.

**Implementation evidence:** Shared GameText/GameBevel imports were added while several local font-size, border-radius and border-width rules remained in place.

**Recommended adjustment:** Assign explicit title/fighter/body variants and one border treatment per surface. Use quiet panels for information, controlled ornament for fighter/reveal moments, and existing utility buttons for retry/navigation. Give reward numbers prominence and put long explanatory values below their labels. Extend the custom glyph family to remaining product outcome icons; retain familiar system utilities and native controls.

**Acceptance:** No rounded outline protrudes behind an angular frame. Heading levels and fighter names are consistent. Prices and longer reward explanations reflow without a narrow value column. Forms do not gain unnecessary ornament.

Captures: [Profile · rivals and destinations](screenshots/04-profile-navigation.jpg) · [Shop · frame preview](screenshots/11-shop-preview.jpg) · [Wallet · credit packs](screenshots/09-wallet-offers.jpg) · [Free reveal · rewards beat](screenshots/21-reveal-rewards.jpg).

Source: [app/(tabs)/profile.tsx](../../../app/(tabs)/profile.tsx), [app/(profile)/shop.tsx](../../../app/(profile)/shop.tsx), [components/CosmeticPreview.tsx](../../../components/CosmeticPreview.tsx), [app/(profile)/wallet.tsx](../../../app/(profile)/wallet.tsx), [components/ResultShareCard.tsx](../../../components/ResultShareCard.tsx), [components/reveal/RevealPayoffBeat.tsx](../../../components/reveal/RevealPayoffBeat.tsx), [components/reveal/RevealJudgeBeat.tsx](../../../components/reveal/RevealJudgeBeat.tsx), [app/(battle)/round-result.tsx](../../../app/(battle)/round-result.tsx).

### F7 · P2 — Winner artwork pushes its identity below the reveal viewport

**Evidence:** Native + source. **Surfaces:** Free result cinematic.

The winner beat presents a very tall framed fighter; the name/caption lies below the visible stage at default text size. The view scrolls, but the first impression does not identify the winner beside the artwork.

**Implementation evidence:** RevealWinnerBeat uses an uncapped width-sized FighterCard inside a scrolling stage.

**Recommended adjustment:** Budget the artwork against the reveal stage height, reserving space for the outcome, fighter identity and persistent controls. Reuse the height-aware card capability. Keep full-body art contained, with the full-size viewer/share composition independent.

**Acceptance:** At default text on small/standard phones, the winning name and recognizable fighter are visible together. Accessibility text may scroll naturally; replay/skip/footer remain reachable.

Captures: [Free reveal · winner beat](screenshots/20-reveal-winner.jpg).

Source: [components/reveal/RevealWinnerBeat.tsx](../../../components/reveal/RevealWinnerBeat.tsx), [components/game/FighterCard.tsx](../../../components/game/FighterCard.tsx), [utils/revealLayout.ts](../../../utils/revealLayout.ts).

### F8 · P2 — The writing workspace has redundant authoring chrome

**Evidence:** Source only in this pass. **Surfaces:** Battle workspace.

Above the writing/suggestion content, the source includes a YOUR PROMPT header with Ideas action, another Ideas/Write-your-own selector, explanatory copy, entitlement copy and another ideas heading. Suggestion titles are restricted to one line.

**Implementation evidence:** Useful controls have accumulated across earlier iterations, consuming vertical space beyond the compact writing hierarchy in the approved mockup.

**Recommended adjustment:** Use one authoring-mode control and a concise allowance/next-price row. Move repeat explanations into expandable help, keep exact paid costs visible before commitment, and let suggestion titles wrap. Preserve the controlled editor, draft state, keyboard ownership and hold-to-submit.

**Acceptance:** Capture a real active round at 375/402 points with the keyboard. The prompt area appears promptly, every authoring mode remains discoverable, and switching moves/modes does not remount or lose text.

Source: [app/(battle)/prompt-entry.tsx](../../../app/(battle)/prompt-entry.tsx).

### F9 · P2 — Loading and empty states do not match the finished screens

**Evidence:** Native empty states + source. **Surfaces:** Profile loading, Rankings, Blocked users, Startup/recovery.

Blocked users and the ended-season view feel unfinished compared with populated screens. Profile’s skeleton still describes the previous tall hero, three action pills and a large progress block.

**Implementation evidence:** The loaded layouts evolved, while skeleton geometry and some minimal message-only states did not.

**Recommended adjustment:** Match Profile skeleton geometry to the measured hero/stat/two-action layout. Give empty/ended/error states a consistent compact custom glyph, functional heading, concise explanation and an existing action only when useful. Preserve distinct loading, confirmed-empty and failure states.

**Acceptance:** Loading does not imply a different layout; transitions avoid unnecessary jumps. No invented season dates, reward promises or unavailable actions appear. Retry states retain known content.

Captures: [Blocked users · empty](screenshots/13-blocked.jpg) · [Rankings · ended season](screenshots/14-rankings-ended.jpg).

Source: [components/profile/ProfileSkeleton.tsx](../../../components/profile/ProfileSkeleton.tsx), [app/(tabs)/rankings.tsx](../../../app/(tabs)/rankings.tsx), [app/(profile)/blocked.tsx](../../../app/(profile)/blocked.tsx), [app/index.tsx](../../../app/index.tsx), [app/_layout.tsx](../../../app/_layout.tsx).

### F10 · P3 — Entry and routine lists need a quieter visual hierarchy

**Evidence:** Native + source; onboarding is source only. **Surfaces:** Sign-in, Sign-up, Welcome, Create fighter, Battles, Rankings/Rivals.

On the small phone, large branded headings consume most of the signup entry viewport at accessibility size. Every history row has a strong gold enclosure. The creator still uses an older art-style picker, and its full archetype catalogue is visually heavy relative to Edit Look.

**Implementation evidence:** Branding and emphasis are applied uniformly instead of reflecting the current task or row priority.

**Recommended adjustment:** Keep compact branding plus a functional auth heading, with scalable text. Make Welcome artwork height-aware so Play practice is encountered early. Reuse appropriate editor style/preset presentation without removing choices. Quiet ordinary finished rows and reserve stronger accents for action-required states. Keep Report and Block independently discoverable in compact row-level safety controls.

**Acceptance:** Auth controls become visible earlier without reducing text scale. Onboarding retains every step/allowance. Lists are easier to scan, and safety actions keep 48-point targets and visible labels.

Captures: [Sign-in · 375-point phone](screenshots/23-small-sign-in.jpg) · [Sign-up · accessibility-extra-large](screenshots/25-small-sign-up-large-text.jpg) · [Battles · played history](screenshots/17-battles.jpg).

Source: [app/(auth)/sign-in.tsx](../../../app/(auth)/sign-in.tsx), [app/(auth)/sign-up.tsx](../../../app/(auth)/sign-up.tsx), [app/(onboarding)/welcome.tsx](../../../app/(onboarding)/welcome.tsx), [app/(onboarding)/create-character.tsx](../../../app/(onboarding)/create-character.tsx), [components/ArtStylePicker.tsx](../../../components/ArtStylePicker.tsx), [app/(tabs)/battles.tsx](../../../app/(tabs)/battles.tsx), [components/profile/RivalRow.tsx](../../../components/profile/RivalRow.tsx), [components/PodiumHeader.tsx](../../../components/PodiumHeader.tsx).

## Related interaction issue

**C1 — Shop’s loadout shortcut does not match its label.** The expanded summary says “Edit Look · Signature colour”, but `ShopEquippedSummary` receives a parameterless editor route at `app/(profile)/shop.tsx:233`. The other colour action correctly passes `section=fighter&focus=signature-color` at lines 169–174. Reuse that destination so the labelled action reaches its field. This is a source-confirmed navigation inconsistency found while auditing the visual surface.

## What is already correct

- Arena/Profile now keep the fighter, stat strip and two primary actions together on the captured standard phone. Do not reopen the old tall-hero redesign. The signed-in small-phone criterion is still a release check.
- Stat dividers, move glyphs, theme banners, the central Battle action, Shop category tabs/trust copy and the compact editor are implemented. The older audit findings should not be treated as still missing.
- The full-card viewer is allowed to show large contained artwork. F7 concerns the time-based winner beat, where identity should be visible immediately.
- Actual generated list avatars and six environment pairs were implemented in [the preceding delivery](../2026-09-21-hero-avatars-environments/README.md). The avatar endpoint must be deployed before a later client distribution. Stock bot art and legacy snapshot fallbacks in these captures are valid.
- Keep native switches, Apple sign-in, payment dialogs, quiet inputs and system utility icons where appropriate. Consistency does not require putting gold frames around every control or replacing familiar system affordances.
- No additional environment/fighter generation or new font is needed for this pass.

## Screen coverage

| Screen | Evidence this pass | Disposition |
| --- | --- | --- |
| [Arena](../../../app/(tabs)/home.tsx) | Native + source · [01](screenshots/01-arena.jpg), [28](screenshots/28-arena-progress.jpg) | Compact hero/stat/actions retained. F4; verify urgent rows and 375-point signed-in layout later. |
| [Profile](../../../app/(tabs)/profile.tsx) | Native + source · [02](screenshots/02-profile.jpg), [03](screenshots/03-profile-progress.jpg), [04](screenshots/04-profile-navigation.jpg) | Hero is improved. F4/F6/F9; sharing was verified in the preceding implementation, not recaptured here. |
| [Battles](../../../app/(tabs)/battles.tsx) | Native + source · [17](screenshots/17-battles.jpg) | Played bot/legacy history inspected. F10; live active/frozen human avatar states remain a release check. |
| [Rankings](../../../app/(tabs)/rankings.tsx) | Native + source · [14](screenshots/14-rankings-ended.jpg) | Ended-season route captured. F9/F10; populated podium/list, 0–4 populations reviewed in source only. |
| [Mode picker](../../../app/create.tsx) | Native + source · [22](screenshots/22-mode-picker.jpg), [27](screenshots/27-battle-mode-sheet.jpg) | Shared illustrated modes work; harmonize header/Back. No matchmaking started. |
| [Matchmaking](../../../app/(battle)/matchmaking.tsx) | Source only | Fighter entrance/Return to Arena retained. Normalize retry/error controls through F6; capture actual active state later. |
| [Battle workspace](../../../app/(battle)/prompt-entry.tsx) | Source only | New environment, duel, move glyphs and lock-in already exist. F8; real active keyboard/submission states not exercised. |
| [Waiting](../../../app/(battle)/waiting.tsx) | Source only | Matching environment, snapshot portraits, deadline and footer retained. Capture actual waiting/long-theme/offline states later. |
| [Round result](../../../app/(battle)/round-result.tsx) | Source only | Outcome, HP/score, details and pinned Continue retained. F6 for remaining icons/borders/retry controls. |
| [Series result](../../../app/(battle)/result.tsx) | Native + source · [18](screenshots/18-series-summary.jpg), [19](screenshots/19-reveal-verdict.jpg), [20](screenshots/20-reveal-winner.jpg), [21](screenshots/21-reveal-rewards.jpg) | Historical practice result and replay captured. F3/F5/F6/F7; live appeals/paid-video recovery not exercised. |
| [Sign-in](../../../app/(auth)/sign-in.tsx) | Native + source · [23](screenshots/23-small-sign-in.jpg) | F1/F4/F10. No login or password-reset request submitted. |
| [Sign-up](../../../app/(auth)/sign-up.tsx) | Native + source · [24](screenshots/24-small-sign-up.jpg), [25](screenshots/25-small-sign-up-large-text.jpg) | Default and accessibility-extra-large on small iPhone. F1/F4/F10. No account created. |
| [Password reset](../../../app/(auth)/reset-password.tsx) | Native + source · [26](screenshots/26-small-reset-expired.jpg) | Expired-link state captured; actual password-entry/success reviewed in source only. |
| [Welcome](../../../app/(onboarding)/welcome.tsx) | Source only | F10: large brand, fixed 240-point illustration and action panel. Starter/practice flow untouched. |
| [Create fighter](../../../app/(onboarding)/create-character.tsx) | Source only | F10: preset/style presentation differs from Edit Look; new illustrated item grid already integrated. All creator steps retained. |
| [Edit Look](../../../app/(profile)/edit-character.tsx) | Native + source · [15](screenshots/15-edit-look.jpg), [16](screenshots/16-editor-card-viewer.jpg) | Visible tabs/compact preview are improved. Existing draft retained. Lock/pending/history/review states inspected in source, not newly triggered. |
| [Cosmetic Shop](../../../app/(profile)/shop.tsx) | Native + source · [10](screenshots/10-shop.jpg), [11](screenshots/11-shop-preview.jpg) | Tabs/filters/trust strip/explicit previews remain. F5/F6 plus C1 link inconsistency; no buying/equipping. |
| [Stats](../../../app/(profile)/stats.tsx) | Native + source · [06](screenshots/06-stats.jpg), [07](screenshots/07-stats-details.jpg) | Quieter data panels and recent-window copy retained. F4; chart/data hierarchy can follow shared utility typography. |
| [Wallet](../../../app/(profile)/wallet.tsx) | Native + source · [08](screenshots/08-wallet.jpg), [09](screenshots/09-wallet-offers.jpg) | F1/F4/F6. Purchase, restore and ledger recovery read in source; no billing flow triggered. |
| [Settings](../../../app/(profile)/settings.tsx) | Native + source · [12](screenshots/12-settings.jpg) | F2. Native switches remain appropriate; no setting changed. |
| [Blocked users](../../../app/(profile)/blocked.tsx) | Native + source · [13](screenshots/13-blocked.jpg) | F9 empty-state polish. Populated unblock states reviewed in source; no block changes. |

## Shared surface coverage

| Surface | Evidence | Disposition |
| --- | --- | --- |
| Root, tabs and cold-link shell | Source + native navigation | Raised Battle action remains centered; legacy face-off/move-select routes still redirect. F4 concerns presentation, not replacing navigation. |
| Startup/splash and font fallback | Source only this pass | Branded splash/failsafe and known-character error handling retained; cold-launch offline/font failure not newly captured. |
| Mode sheet | Native + source | Capture 27. Bounded scrolling and explicit Close retained; no mode selected. |
| Report/block and player safety | Report sheet native; block source | Capture 05. Independent safety actions retained. F10 proposes a more compact presentation, not removing them. |
| Confirm sheets: purchase, forfeit, discard, render | Source | Shared BottomSheet/ConfirmSheet keep scrolling content and pinned actions. Apply F2/F6 where wrappers differ; no destructive or paid confirm executed. |
| Offers and pending purchases | Source | FirstTimeOfferModal and wallet recovery states retain live price and Check status. Audit does not establish native payment acceptance. |
| Archetype, gear, styles, respec and previous looks | Source; editor/card viewer native | Recent illustrated controls remain. Actual locks, restore, cooldown, status recovery and pending render were not induced. |
| Portrait viewer and render reveal | Viewer native; render reveal source | Capture 16 shows contained full fighter/frame. Preserve full-size viewing and known-artwork fallback. |
| Tutorial hints, toasts and inline errors | Source; InlineBanner native | F2 shared layout correction; retain dismissibility, access semantics and existing progress behavior. |
| Free result cinematic | Native verdict/winner/rewards + source all beats | F6/F7. Judge beat reviewed in source, not represented by a fresh screenshot. |
| Fighter/result export and generated media | Source; previous fighter-export evidence linked | F3/F5 apply to result export. Existing generated videos/audio branding unchanged. |

## Suggested implementation order

1. **Shared readability:** F1 metallic text, F2 banner layout and F4 safe-area/header ownership. Verify on the same two simulators before expanding the change.
2. **Result clarity and identity:** F3 outcome/score composition, F5 equipment continuity and F7 winner sizing. Keep reviewed-result/export data authoritative and full-size fighter export independent.
3. **Remaining presentation:** F6 panel/type/control cleanup, F9 state feedback and C1’s precise destination. Limit changes to the identified consumers rather than restyling every component.
4. **Interaction hierarchy:** validate F8 against a real active workspace, then F10 auth/onboarding/list density. Keep pricing, allowance explanations, all authoring modes and independent safety actions.

## Verification needed for that implementation

- Focused behavior tests for single-title fallback, responsive banner layout, unbroken result scores, retained snapshot equipment, measured winner sizing, skeleton geometry and the signature-colour route.
- Exercise existing draft/navigation/editor, avatar expiry/removal/account isolation, purchases, media recovery and appeal-display suites. Run TypeScript, ESLint and the complete Jest suite after product changes.
- Native comparisons on the same small/standard phones at default/accessibility text; long and non-Latin names, localized prices, long themes, keyboard transitions and live font-size changes. Test actual VoiceOver focus/order and Reduced Motion rather than inferring them from screenshots.
- Real active-round workspace/waiting, two- and three-round results, draw/no-contest/reviewed results, empty/populated Rankings, editor lock/pending/failure and wallet delayed-recovery states.
- After the compatible avatar endpoint is deployed, verify current versus frozen human identities, equipped frames, blocked/removed assets and offline/signing recovery on real accounts.
- Android remains blocked until a test environment is available. This report does not mark the release acceptance matrix as passed.

## Artifact verification

All 21 route paths, finding source paths, 28 image references and local report links were checked. Capture names identify observed states; the rewards screenshot is not presented as a judge-beat capture. Automated browser preview was attempted but blocked by the browser URL security policy for this local file. No workaround was attempted. The gallery’s browser rendering and interactive filters are therefore **not runtime-verified**; its artifact structure, routes and image links are verified. The native app screenshots themselves were inspected through the iOS screenshot tools.

