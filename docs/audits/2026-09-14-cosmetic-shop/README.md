# Cosmetic Shop and equipment audit

14 September 2026. Scope: the current local client, the existing signed-in iPhone 17 Pro simulator on iOS 26.5, cosmetic preview/equipment, catalog presentation and the related server code. This is an audit and art delivery, not a shop implementation or production catalog change.

## Assessment

Keep the cinematic arena art direction. The shop needs stronger collectible art and clearer feedback about what the player owns, is previewing, and is actually wearing. Adding more colored borders to the current renderer would not solve this: it discards gradient stops, omits the frame on the Profile hero, and cannot show avatar effects in the shop preview.

Four new illustrated frame concepts are saved in [the frame pack](../../../output/imagegen/prompt-wars-frames/README.md): Astral Codex, Emberforge, Neon Circuit and Laureate. They are transparent portrait-frame assets for design review. They have not been added to the catalog, priced, sold, equipped or deployed.

## Findings, ordered by priority

### 1. P1 — Large text makes the catalog impractical to use

The title, explanation and full preview remain above the only scrollable region. At accessibility-extra-large, after navigating away and reopening the shop to obtain a fresh layout, this fixed region occupies most of the phone. The shop title breaks inside “Cosmetic”; the character name is truncated; only the beginning of the first item is visible. Changing text size while the screen remains mounted also produced clipped labels before remounting.

- Evidence: [fresh large-text layout](screens/shop-accessibility-xl-remounted.png), [in-place text-size change](screens/shop-accessibility-xl.png).
- Source: `app/(profile)/shop.tsx:578` and `:607`; row constraints at `:818`, `:826`, `:844`; `components/CosmeticPreview.tsx:69`.
- Fix: put the full header/preview in the main scroll content; retain a compact “Currently wearing / Previewing” summary or a preview button. Use flexible vertical cards at accessibility sizes, wrapping titles and rarity labels, and full-width actions. Essential catalog actions must remain reachable on a small phone.

### 2. P1 — Equipping an item can leave a different item on the preview

Reproduced: preview Gold Frame, then equip the already-owned Classic Frame. The Classic row says “Equipped”, but the preview still wears Gold. `focusedSlug` overrides the saved slot and is not cleared or changed on successful equip. There is no “Previewing Gold” label or “Show equipped” control to explain the mismatch.

- Evidence: [Classic equipped while Gold remains visible](screens/preview-overrides-equipped.png).
- Source: `app/(profile)/shop.tsx:124`, `:306`, `:600`; `components/CosmeticPreview.tsx:45`.
- Fix: explicitly separate `Previewing <item>` from `Currently wearing <item>`. Successful equip should show the authoritative equipped selection; add a clear preview reset. Keep “Equipped” as a status and expose an unambiguous Remove action instead of making the status label secretly toggle removal.

### 3. P1 — Equipped cosmetics do not render consistently

Three concrete defects:

- `PortraitPreview` uses only `frame.colors[0]`. Gold, Plus, Neon and Founders have multi-color definitions that never become gradients. Neon appears cyan rather than cyan/magenta.
- `FighterHero` accepts cosmetics but renders only the title and badge. The restored Neon frame is absent from the Profile hero.
- The shop always renders `variant="fullBody"`; avatar effects are only rendered for `circle`. Previewing Plus Aura produces no visible aura change.

Evidence: [Neon equipped](screens/shop-restored.png), [Profile missing the frame](screens/profile-missing-equipped-frame.png), [before aura preview](screens/effects-before-preview.png), [selected aura without an effect](screens/aura-preview-no-effect.png).

Source: `components/PortraitPreview.tsx:102`, `:105`; `components/CosmeticPreview.tsx:58`; `components/profile/FighterHero.tsx:110`.

Fix: use a shared cosmetic renderer across Shop, Profile, character editing, avatar rows and battle presentations. Support separate portrait and circular-avatar art with deliberate dimensions. Add Portrait / Avatar preview contexts. Do not merely stretch the tall artwork into a circle. Keep battle identity snapshots intact when equipment changes later.

### 4. P1 — The equipped-state text has insufficient contrast

White `#FFFFFF` on the standard dark theme's green `#34D399` is **1.92:1**. Even the large-text 3:1 target is missed. The purchase button's dark ink on lavender is a good pattern to retain.

- Source: `app/(profile)/shop.tsx:368`, `:383`; `constants/Colors.ts`.
- Fix: use dark ink on green; `#171225` on the current green measures **9.50:1**. Add a checkmark plus a text status so equipment is not signaled through color alone. Ensure action targets meet the project's 44-point iOS / 48-dp Android criteria: the current shared `Layout.inputHeight` is 44, including Buy/Equip buttons.

### 5. P2 — The catalog is mostly text, with weak visual differentiation

Six frame entries are descriptions and rarity dots without item thumbnails. A 104-point-wide preview is the only way to compare them. There are no category tabs or Owned filter; titles, color swatches, unavailable reveal styles, avatar effects and badges all occupy one long list. This makes collecting and managing equipment feel like reading settings.

- Evidence: [frame rows](screens/gold-preview.png), [effects and badges](screens/aura-preview-no-effect.png).
- Source: `app/(profile)/shop.tsx:618`, `:639`; `constants/Cosmetics.ts:90`.
- Fix: add recognizable item art, category filters and All / Owned. Show a small current-loadout summary for Frame, Title, Aura and Badge. Keep colors clearly identified as appearance options. Move unavailable reveal styles out of the main purchasable catalog. Use shape and material, as well as color, to distinguish frame families.

### 6. P2 — Returning from Wallet or character editing can leave stale state

Shop data loads from `useEffect` on mount. There is no focus or foreground refresh. With the persistent navigation stack, returning from Wallet after topping up or from character editing need not remount Shop. The cached credit amount, portrait and equipped config can remain old until pull-to-refresh. Portrait signing expires after 600 seconds and has no retry-on-error path here.

- Source: `app/(profile)/shop.tsx:146`, `:211`, `:232`; `components/PortraitPreview.tsx` image loading.
- Fix: refresh on focus, foreground and successful fulfillment, preserving category and scroll state. Recover expired artwork URLs independently. Resolve the same avatar/full-body and starter-art references used elsewhere, rather than reverting to an unrelated fallback on a failed read.

### 7. P2 — Partial read failures can masquerade as an empty shop or missing ownership

The Edge Function's `listCatalog` ignores both catalog and ownership query errors and substitutes empty arrays. A failed ownership read therefore makes owned items appear unowned. The screen similarly ignores the character query's error and sets `characterId` to null and equipment to `{}` while declaring the catalog ready; an old `character` preview may remain. This can produce “No active character” for a network error.

- Source: `supabase/functions/cosmetics/index.ts:26`; `app/(profile)/shop.tsx:190`.
- Fix: propagate typed failures; retain last-known equipment with a visible retry state. Distinguish confirmed-empty from unavailable. After a successful purchase, use the returned ownership result immediately and reconcile; a failed refresh should not leave Buy visible as if the unlock failed. The server's ownership guard prevents a second purchase from simply succeeding, but the UI should recover without confusing the player.

### 8. P2 — Equipment mutations are not serialized in the client

`busySlug` only replaces the active item's action. Another item remains tappable and can start an overlapping equip request. Responses update local equipment in response order and clear the same busy field. Delayed responses can leave the UI showing a different selection from the last server write. This was found by code review; deliberate concurrent mutations were not run against the signed-in account.

- Source: `app/(profile)/shop.tsx:297`, `:306`, `:320`, `:325`.
- Fix: serialize equipment changes per character/slot or fence stale responses and reconcile against the returned authoritative config. Keep Preview available during mutations. Retain visible pending state and an actionable failure message.

### 9. P2 — Color try-on does not demonstrate the actual change

Owning a color correctly unlocks a swatch in Edit character and does not silently spend portrait-render credits. However, the shop preview changes only `accentColor`, which an equipped frame overrides; the generated portrait itself also remains unchanged. The “Preview” action can therefore appear to do nothing.

- Source: `components/CosmeticPreview.tsx:50`, `:60`; `components/PortraitPreview.tsx:102`.
- Fix: show the actual color swatch and label, explain where it applies, and use the deliberate Edit character route for appearance changes. Do not imply a live recolor of the artwork or automatically initiate another paid render.

### 10. P2 — New frame sales need client capability checks

Presentation is a hard-coded slug registry. An unknown slug resolves to null, while the server purchase guard checks only cosmetic type. Publishing new frame rows before compatible clients ship can therefore sell an invisible item to older clients. `preview_asset_path` is currently not consumed by this renderer.

- Source: `constants/Cosmetics.ts:157`; `utils/cosmetics.ts:181`; `supabase/functions/cosmetics/index.ts:70`.
- Fix: ship the renderer and known assets first, then activate catalog rows only for supported clients using a server-enforced contract/capability gate. Keep the new art inactive until portrait/avatar display coverage and ownership/purchase tests pass. Preserve all existing ownership, earned alternatives and Founders exclusivity.

## What already works

- Preview and Buy/Equip are separate controls in non-actionable cards.
- The purchase sheet shows the price, balance after purchase and earned alternative. Cancel was verified; no purchase was confirmed. [Confirmation](screens/purchase-confirmation.png).
- Server functions derive the caller from authentication and check character ownership, item ownership and cosmetic type. Purchase uses a per-wallet advisory lock and a stable ledger key; these protections should be retained.
- Unsupported reveal styles are blocked from purchase by the Edge Function and labeled Coming soon in the UI.
- Signature colors unlock swatches rather than silently triggering paid regeneration.
- Existing collectible identity, dark neutral surfaces and brand/move colors can be retained.

## Recommended remediation order

1. Correct preview/equipment reconciliation, render parity and contrast. Add focused tests for these actual failures.
2. Make the header responsive; add category and Owned filtering, image thumbnails and an explicit loadout summary. Expand a selected item into a scrollable preview sheet with a reachable action footer.
3. Add focus/foreground reconciliation, partial-error handling, portrait signing recovery and mutation serialization.
4. Integrate selected frame art through the shared renderer. Prepare separate circular versions, tune safe openings and thumbnail detail, and validate on actual character art. Do not add combat bonuses or infer that expensive cosmetics increase scoring.
5. Ship client support before activating new server catalog entries. Use the existing economy rules for any later pricing decision; this audit changes no prices or grants.

## Verification and limits

Native walkthrough covered default Large and accessibility-extra-large text, frame try-on, a free owned-item equip, restoration, purchase-sheet cancellation, avatar-effect preview, Profile display and navigation back to Shop. The original **Neon Frame** and **Plus One** title remain equipped; aura was only previewed. The visible balance remained **150 credits**. Original Large text was restored and the already-running simulator was left open on Shop.

The small development-menu gear visible in screenshots is a simulator development overlay, not a shop control; it is excluded from product findings.

Focused existing Jest checks passed: **3 suites / 44 tests** (`cosmetics`, `cosmeticPreview`, `walletView`). Their coverage is mostly registry, copy and presentation resolution; they do not catch the rendered frame omission, preview/equip mismatch or native large-text geometry.

No paid purchase, subscription change, real-money transaction, schema change, catalog activation or release was performed. Android, a smaller physical phone, VoiceOver/TalkBack interaction, deliberately failed remote reads and concurrent production purchase/equipment requests were not exercised. Code-reviewed risks are identified above rather than presented as reproduced network failures.

## Practice references

- [Apple: Designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) — legible game interfaces and touch interaction.
- [Apple: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — scalable text, contrast and interaction targets.
- [Apple: UI Design Dos and Don'ts](https://developer.apple.com/design/tips/) — readable text and 44-point controls.
- [Android: Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) — at least 48-dp focusable touch targets.
