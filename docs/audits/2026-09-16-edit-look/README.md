# Edit Look — UX/UI audit and recommended direction

16 September 2026. Audit of the current working implementation against the approved collectible-game visual direction. This is a design recommendation; no application code was changed.

**Recommendation: replace the large scroll-collapsing stage with a full-page editor that opens with a compact fighter preview, visible category navigation and immediately accessible controls.** Keep full artwork available through an explicit **View full card** action. Editing should not require discovering a handle, holding, or dragging a panel into position.

## Evidence and limits

- Inspected the running iOS app on iPhone 17 Pro / iOS 26.5, native viewport 402 × 874, default text size. This is the existing development binary with current JavaScript, not a TestFlight runtime check.
- Opened Profile → Edit look; selected Look and Gear; opened and dismissed Archetype details. Existing fighter: AndrewTwo with Neon Circuit frame. The fighter was locked by an active battle. No save, generation, purchase, equipment, restore or forfeit action was invoked.
- Compared with the approved Arena reference and current design language. There is no approved Edit Look mockup; the proposed layout applies the established visual language to this screen.
- Native bounds place the Look/Gear tabs at y=797–845 and the first Gear heading at y=905, below the 874-point viewport. The selected Look screenshot likewise exposes no editing fields.
- Gesture automation over the preview and tabs did not move the screen. Because coordinate automation also failed to activate ordinary navigation while accessibility activation worked, those failures alone do **not** prove a physical-touch defect. The covered scroll area and absent visible controls are separately supported by source and native bounds.
- Unlocked editing, keyboard use, actual VoiceOver operation, small-phone and accessibility-size behavior were reviewed in source but not exercised in this live, battle-locked session. Android remains unvalidated.

| Entry | After selecting Look |
|---|---|
| ![Current editor entry](/Users/patdom/sources/prompt-wars/docs/audits/2026-09-16-edit-look/screens/entry-fighter-locked.jpg) | ![Look selected with no fields visible](/Users/patdom/sources/prompt-wars/docs/audits/2026-09-16-edit-look/screens/look-selected-options-hidden.jpg) |

## Findings

P1 = address before accepting the redesigned editor. P2 = important hierarchy, clarity or visual consistency work. “Source” identifies findings not reproduced through unlocked native interaction.

| ID / priority | Finding and evidence | Recommended adjustment |
|---|---|---|
| EL1 · P1 | **The primary task is below the visible screen.** The large preview, notice, metadata and generation controls push the editing surface out of view. `CollapsingStage` is an absolute sibling above the scroll view; its height responds to scrolling underneath it. There is no long-press recognizer, explicit expand-edit action or draggable-sheet controller. | Open with a compact preview and at least the first editable group visible. Use normal scrolling for the form. Remove the collapse dependency from access to controls; reserve full artwork for an explicit preview action. |
| EL2 · P1 | **Entry and category changes do not take users to the requested work.** Profile says Edit look, but the route initializes Fighter. Category taps only change the panel; they neither collapse the preview nor reveal the panel heading. The shared scroll offset can also carry users deep into a different category. | Edit look opens Look. Arena Customize may open the editor overview/Fighter; Shop colour links open the relevant colour control. Selecting a category brings its heading into view, with deliberate per-category scroll restoration. Keep the current route compatible. |
| EL3 · P1 | **Saved artwork, staged choices and saved description are not consistently distinguished.** Name/art-style/accent in the preview derive from saved data, while the archetype chip uses staged data. The stale-art message only reacts to a saved appearance-version change. Save is free; Draw saves first and generates for the displayed price. Those two commitments live in different places. | Label the picture **Current artwork**. Show **Unsaved changes** or **Saved · artwork not updated** as appropriate, with a concise change summary. Use one stable footer that distinguishes free Save changes from paid/free Draw. Update immediate text/accent previews consistently; never imply that selecting a trait has generated new art. |
| EL4 · P1 | **Writing-mode switches can erase custom text.** Source: switching from Your own words to Guided stages `portraitPromptRaw=null`; switching back uses the now-null value and produces an empty string. Guided traits survive, but custom text does not. | Keep independent local guided and written drafts plus an explicit active mode. Switching modes changes which inputs are used, without discarding either draft. Preserve the existing wire semantics when saving. |
| EL5 · P1 | **Unsaved edits do not survive a restart.** Source: `useCharacterEditDraft` stores values only in React state. The Back guard offers Keep editing or Discard; it does not provide durable recovery. | Persist local drafts by account and fighter, including mode, text, selections and category. Restore visibly, reconcile against refreshed saved data, and retain failed/partially saved changes. Clear only acknowledged changes or an explicit discard. |
| EL6 · P2 | **Randomize is an unlabeled paid dice button.** Native entry shows a dice icon beside Draw. The visible random price is absent even though accessibility text and confirmation know the price. | Use a labeled secondary **Shuffle & draw · [live price]** action in an obvious secondary action area. Retain confirmation of cost and discarded staged changes. Keep it separate from free trait selection. |
| EL7 · P1 | **Locked/unused controls rely partly on dimming and touch interception.** `EditCardShell` uses `pointerEvents=none` and opacity. Identity fields/swatches are not all passed disabled/editable state; native accessibility still describes the locked name as a settable field. Written mode leaves inactive guided controls in the accessibility tree. | Keep current values readable; expose actual disabled/read-only semantics on every control and guard handlers. Show a compact reason with one clear Manage battles action. Hide inactive mode controls or place them behind an explicitly inactive summary. Preserve current server restrictions. |
| EL8 · P1 | **Current Gear can appear missing.** Native Profile identifies the fighter with Lipstick; Gear says Choose a catalogue item below. Source filters to predefined items before resolving the equipped item, so legacy/custom equipment cannot be represented by that lookup. | Resolve and display the current item separately from the browseable catalogue. Show a retained/legacy status where needed. Keep new selection limited to the existing approved catalogue; do not reintroduce custom-item creation. |
| EL9 · P2 | **The screen still mixes presentation systems.** The native header has no title. The fighter frame matches the new direction, but detached name/meta rows, a rounded archetype pill, bespoke Draw/dice controls and ornate wrappers around every form compete with it. Some category glyphs are already custom; a blanket icon replacement is unnecessary. | Add a compact metallic **EDIT LOOK** heading, reuse fighter-card identity treatment, gold-underlined category tabs and shared beveled buttons. Use quiet obsidian form surfaces, a consistent selection check and the existing custom icon family. Keep ornament concentrated on the fighter and primary action. |
| EL10 · P2 | **Look is a long questionnaire with repeated free labels and weak visual comparison.** Guided mode shows description, style, palette and four trait groups. Written mode retains a long dimmed trait section. Art style already has bundled thumbnails, while other trait choices are text. | Use progressive disclosure: Style/Palette first, then labeled trait rows showing their current selection; tap to open inline options. Expand the first relevant group automatically. Keep the descriptive summary compact and accessible. Reuse style thumbnails; add small existing-family symbols where they clarify meaning. State free editing once, alongside the generation distinction. |
| EL11 · P2 | **History and archetype details consume prime editing space.** Earlier renders occupy the side of the preview and are sliced by available height without a visible View all entry. Archetype appears both beside the portrait and in Fighter. The chip’s “Originality” label can still imply a judging advantage despite the detail sheet saying no bonus. | Add a labeled **Previous looks** gallery entry for available saved renders. Use thumbnails with distinguishable metadata and explicit free Restore. Keep one archetype editing location; the chip can open the same details. Display the archetype name without the scoring-like qualifier. |
| EL12 · P1 | **Responsive behavior changes the interaction model abruptly.** Below 390 points, at fontScale >1.15, or on shorter screens, the stage becomes ordinary scroll content; tabs also become three stacked rows. Other subcomponents switch at fontScale 1.3. This adds vertical cost when space is most constrained. Keyboard/footer reachability is not established by this audit. | Use the same editor model at all sizes. Adapt preview and tab rail by measured space; use a horizontal rail when labels need more room. Measure the action footer, keep one keyboard-inset owner, and prioritize the active field when typing. Never require a precise drag or disable text scaling. |

## Recommended screen and interaction

The first viewport should establish the editing task, the current fighter and where to start:

```text
Back                  EDIT LOOK              Credits

Compact current-fighter card        View full card
Current artwork / Unsaved changes / Artwork pending

LOOK          FIGHTER          GEAR
────
Guided                 Your own words

Art style       Comic Book          [visual options]
Outfit palette  Royal               [swatches]
Vibe            Regal              [expand]
Silhouette      Heavy Bruiser      [expand]
Era             Ancient            [expand]
Expression      Roar               [expand]

             Normal scrolling form

Changes and generation status
Save changes · Free       Review & draw · [live cost]
```

This is a hierarchy sketch, not a fixed-height layout. At large text sizes, the footer can stack and the portrait can reduce to an avatar/name row. Important fields, prices and controls wrap without truncation. Full-screen portrait preview returns to the same category, scroll position and draft.

**Category behavior:** Look edits artwork inputs, Fighter edits identity and exposes the existing stat-respec feature as a clearly separate action, and Gear edits the signature item. Cosmetic frames/titles remain accessible through the existing Cosmetics destination. Do not mix a signature item that changes portrait inputs with an immediately equipped cosmetic frame.

**Feedback:** selection immediately updates the selected state, text summary and unsaved marker. It does not pretend to change generated artwork. Art style and palette use visual choices; traits can open inline. Written mode displays the text editor and the still-applicable art-style control, with an expandable inactive-traits summary. All choices remain available without a special gesture.

**Footer states:**

| State | Main action / supporting action |
|---|---|
| Identity-only draft | Save changes · Free; show any cooldown before confirmation. |
| Visual draft | Review & draw · live cost, with Save changes · Free as the secondary action. Say explicitly that saving alone keeps the existing picture. |
| Saved inputs differ from art | Draw updated look · live cost; keep the current artwork visible. |
| No draft/current art | Draw another version · live cost when available; Previous looks remains a separate visible entry. |
| Free portrait allowance | Use the actual server allowance and a Free label; show remaining allowance without implying an unlimited grant. |
| Generation/pending result | Persistent progress or Check status, preserving request recovery; no second purchase caused by a status check. |
| Failure or partial success | Show what saved/generated, what is still pending, and the existing retry/recovery/refund path. Retain the draft and known artwork. |
| Locked or price unavailable | Clear reason and recovery action; browsing current values remains possible. Never present an estimated price as verified. |

**Secondary sheets still have a useful role:** item details, archetype explanation, purchase confirmation and render comparison. Keep their existing bounded body, pinned actions, close button and focus restoration. They should be explicitly opened and already usable at presentation, with drag dismissal only optional.

## Alternatives considered

1. **Add an Expand editor button to the existing stage.** Useful short-term repair, but retains two header trees, measurement complexity and the large preview competing with the form.
2. **Compact-preview full-page editor — recommended.** Makes the primary task visible, reuses current panels and supports one-handed editing without a special gesture. Portrait inspection stays one tap away.
3. **Separate preview and edit screens.** Gives each task space but creates repeated trips between artwork and inputs. Better as optional full-card preview than the default workflow.

## Scope and verification for the follow-up

Prioritize access/layout and mode/draft safety, then consolidate actions and status, then finish visual/option/history treatment. Keep the current pricing, allowances, moderation, server-owned data, free saves, cooldowns, active-battle restrictions, respec rules and refund/recovery contracts. Do not add image generation on option taps or regenerate the cosmetic artwork.

Acceptance should cover:

- At 375 and 402/430 points, the selected category and first relevant controls are discoverable on entry; no drag-to-open requirement.
- Category navigation and full-card preview preserve draft and deliberate scroll state. Look and colour entry links land at the requested section.
- Custom text survives Guided ↔ Your own words, background/restart and failed saving. Discard is explicit. Partially saved identity/look changes reconcile accurately.
- Save and Draw have distinct effects and visible live prices/allowances. Shuffle discloses its price and replacement consequences before commit.
- Current signature equipment remains recognizable even when absent from the selectable catalogue.
- Current artwork is never confused with a live preview of unsaved generation inputs; portrait/avatar recovery remains independent.
- Keyboard, accessibility text, VoiceOver/TalkBack, Reduced Motion and long names/prices keep actions reachable and states understandable. Verify disabled/read-only semantics using an actual screen reader.
- No audio, combat, matchmaking or appeal change is required by this redesign.

## Source anchors

- [Editor initialization and layout](/Users/patdom/sources/prompt-wars/app/(profile)/edit-character.tsx:203), [category change and scroll](/Users/patdom/sources/prompt-wars/app/(profile)/edit-character.tsx:1228), [preview data](/Users/patdom/sources/prompt-wars/app/(profile)/edit-character.tsx:428).
- [Absolute collapsing stage](/Users/patdom/sources/prompt-wars/components/edit-character/CollapsingStage.tsx:127), [height estimates](/Users/patdom/sources/prompt-wars/components/edit-character/stageMath.ts:115), [category breakpoints](/Users/patdom/sources/prompt-wars/components/SegmentedCategoryBar.tsx:46).
- [Mode switching and inactive controls](/Users/patdom/sources/prompt-wars/components/edit-character/LookPanel.tsx:72), [in-memory draft](/Users/patdom/sources/prompt-wars/hooks/useCharacterEditDraft.ts:267), [Back guard](/Users/patdom/sources/prompt-wars/app/(profile)/edit-character.tsx:1008).
- [Randomize presentation](/Users/patdom/sources/prompt-wars/components/edit-character/StageExpanded.tsx:340), [price/confirmation copy](/Users/patdom/sources/prompt-wars/utils/editDialogCopy.ts:86), [save/generate behavior](/Users/patdom/sources/prompt-wars/app/(profile)/edit-character.tsx:674).
- [Disabled wrapper](/Users/patdom/sources/prompt-wars/components/edit-character/EditCardShell.tsx:97), [identity fields](/Users/patdom/sources/prompt-wars/components/edit-character/IdentityPanel.tsx:111), [equipped-item lookup](/Users/patdom/sources/prompt-wars/components/edit-character/GearPanel.tsx:68).
- [Design language](/Users/patdom/sources/prompt-wars/docs/DESIGN_LANGUAGE.md).

## External guidance applied

Apple recommends making essential functionality visible and treating undiscoverable gestures as shortcuts. This supports explicit category and preview actions here; it does not require copying a native system aesthetic. [Apple: Discoverable design](https://developer.apple.com/videos/play/wwdc2021/10126/).

WCAG 2.2 describes a non-drag alternative for author-created dragging interactions. This is a useful design benchmark if a custom drawer is retained. Ordinary user-agent scrolling is treated separately, so this audit does not declare the current scroll view a WCAG dragging violation. [W3C: Understanding Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
