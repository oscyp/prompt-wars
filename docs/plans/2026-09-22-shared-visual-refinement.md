# Prompt Wars — Shared Visual System and Screen Refinement

Approved implementation brief from the 2026-09-22 conversation. The user's full plan is authoritative.

## Constraints

Client and bundled assets only. Preserve the working tree, particularly authentication, eligibility, purchases and audio. No backend/API/schema changes, rollout flags, dependencies, version bump, production build or submission. Keep existing navigation, drafts, snapshot identity, moderation, server-owned outcomes and recovery. Android native acceptance remains blocked until an environment is available.

## 1. Shared foundation

Extend GamePanel/GameBevel with muted/bright double gold: outer 1.5, inner .75, inset 4. No competing borders; equipment frames remain independent. Extend GameHeader with compact tab/secondary/battle presentations (64 minimum content height, natural scaling/wrapping), one safe-area owner. Arena wordmark, other tabs named headings; one account-scoped tab balance reader refreshed on focus/foreground/account/Wallet return. Secondary Back and cold fallbacks remain; Wallet title simplified. GameScreen gets an optional background outside safe-area content.

CreditAmount is a reusable accessible diamond/amount, signed/unknown/size-aware; buttons compose structured amounts. Real-money localization stays unchanged. Unknown differs from zero; prices never inferred. Preserve credits wording in speech/native dialogs/explanations.

## 2. Arena/Profile/lists/Wallet

Remove Arena fighter/header promotional content and customization actions. Order urgent battles, quests/streak, standing/rivals, secondary content/offers. Central Battle and all modes stay; remove repeated mode tagline. Profile keeps compact fighter/stats/actions, puts wrapped battle cry in caption/budget; independent share export stays full size. All battle rows full width with Safety inside frame as a sibling to navigation, lower metadata row and scalable stacking; same rule for rankings/rivals. Preserve avatars/history/cancelled groups.

Wallet has framed sections, one ledger panel with icons/reason/date/signed amount, chevrons only when navigable. Spending neutral/lavender, failures red. Preserve purchase eligibility/references/restore/disclosures and separate empty/error/pending states; recovery never purchases again.

## 3. Edit Look

Trait rows open bounded fixed-heading/Close sheets with scrolling grid, no handle/drag. Selection stages then closes, dismissal changes nothing, opener focus restored. Two columns at width >=390 and fontScale <=1.15, else one. Preserve all 6 vibe/6 silhouette/5 era/6 expression values/descriptions. Bundle 23 original 512px JPEG reference illustrations <=2MB total target, consistent character within each set, prompts/manifest, fallbacks/reference caption. Existing archetype art enlarged above labels, keep creator unselected/cooldowns/locks.

Gradient palette swatches retain meaning/keys/checkmarks. Custom dice. Save changes; Review & draw for every normal draw, structured live amount only when paid; N included draws remaining; remove routine Free/help/success copy. Pending Check status stays separate. Remove catalogue search/query/empty-search UI, retain first six/Browse all/all equipment/current legacy/custom/preview. Ignore obsolete accordion UI state without losing staged values or modes.

Keyboard: one inset owner, hide preview while typing, header/tabs stay, reveal focused input/caret on focus and size changes with inputs mounted. Compact Save changes/Done (Done only dismisses) replaces drawing footer. Preserve drafts, scroll/cursor, flush/guards/partial saves/cooldowns/render references.

## 4. Battle and final validation

Full-screen environment outside safe-area content and top scrim; quiet writing and compact keyboard mode. Arena parks, labelled Battle options houses existing Forfeit/Cancel handlers/confirmations; no duplicate back/footer. Keep resolution restrictions/parking and legacy redirects.

Round results outcome/score then paired fighters/HP/damage beside receiving fighter using authoritative orientation, omit absent legacy values. Extended content in Battle details, persistent Continue. Final: current verdict -> media -> framed rewards -> expandable details. Ready approved video high; pending/signing compact status/retry, unpurchased offer below rewards. Preserve Tier0 replay/pinned actions/no-charge recovery/moderation/captions/revisions. KO badge replaces main deciding sentence, full rule in details, no-contest/review/exhibition stay explicit.

## Verification

Behavioral coverage: shared accessibility/header/fallback/tab state/account-safe balances; Safety/nav independent; currency unknown/zero/live/included/pending; all trait mappings/selection/dismissal/locks/draft compatibility; keyboard focus/Save vs Done/recovery; damage orientation/legacy/outcomes/media ordering/revision/no-charge retries. TypeScript, ESLint and complete Jest. Native actual routes on 375x812 and 402x874 with default/accessibility text, keyboard, long/Unicode text, localized amounts, VoiceOver, Reduced Motion, recovery. Label fixtures and unavailable evidence. Update design language/concept/acceptance, checklist and comparison gallery. No release step.
