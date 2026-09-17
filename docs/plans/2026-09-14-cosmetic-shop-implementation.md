# Cosmetic Shop implementation

User authorization: “apply them” following the 14 September cosmetic shop audit and four generated designs. Apply all ten audit findings and integrate the approved artwork. Existing release and unrelated audio changes must remain intact.

## Global constraints

- Work in the existing `codex/ux-game-integrity` checkout; do not commit, stage, push, reset or revert unrelated work. All commands start with `rtk`. No real paid purchase for testing.
- Server owns catalog, ownership, equip and wallet writes; client uses the authenticated function helper. Preserve existing ownership, Founders exclusivity, all free/earned paths, moderation and battle identity snapshots. Cosmetic data never enters judging.
- Four slugs: `astral_codex_frame`, `emberforge_frame`, `neon_circuit_frame`, `laureate_frame`. First three are epic, 25 credits. Laureate is legendary, 40 credits with an alternative 50-win unlock. These follow the existing rarity ladder; no changes to current prices/grants.
- Client cosmetics contract version 2. Existing clients default to 1. New catalog rows require version 2; list/purchase/equip endpoints must enforce this. Legacy items remain available. Do not expose unavailable reveal styles in the main catalog UI.
- New generated portrait assets already exist in `output/imagegen/prompt-wars-frames/`. Bundle under `assets/cosmetics/frames/{astral-codex,emberforge,neon-circuit,laureate}-portrait.png`. Root will generate matching square circular overlays at the same prefix with `-avatar.png`. Preserve alpha and artwork; no programmatic image editing. Render actual gradient stops for existing frames.
- Preserve recognizability: contain full-body art; use avatar references for circles. Frame overlay has no accessibility element or touch interception. Test at ordinary and accessibility text sizes. Use 48-point shop actions and dark ink on green/lavender.

### Task 1: Backend catalog and API

Own only `supabase/functions/cosmetics/**`, new timestamped migration(s), focused Deno tests, `supabase/tests` fixture if needed, and API request/response changes in `utils/cosmetics.ts`. Do not edit renderer or Shop screen.

Implement server-enforced minimum client contract version in additive schema/catalog. Add four frames at the agreed prices/unlock, preserving older rows. Gate new list/purchase/equip for unsupported clients, including direct purchase attempts. Pure policy helpers should be unit tested. Catalog/ownership query errors must fail explicitly, not return empty success. Successful purchases must remain successful even if post-commit catalog fetch fails: return purchased slug and a refresh-needed indicator; never lose the authoritative purchase acknowledgment. Equip must return authoritative slot/config sufficient for client reconciliation. Prevent unsupported reveal-style equips and validate colors do not unexpectedly rewrite identity through Shop. Preserve auth, service-only RPC permissions and exactly-once spending. Use derived entitlements for subscription grant eligibility if touching unlock sync. Unknown network failure on repeated purchase should reconcile `already_owned` safely.

Update client helper requests to always include `client_contract_version: 2`; retain public helper names. Optional response fields `cosmetic_config`, `cosmetic_slug`, `catalog_refresh_required` are additive. Keep `items` an array, with failure typed so UI can retain its last-known catalog. Tests cover legacy/new listing, unsupported purchase/equip, read failures, committed purchase with refresh failure, ownership checks and repeated purchase where practical. Do not deploy.

### Task 2: Shared frame renderer

Own `constants/Cosmetics.ts`, `components/PortraitPreview.tsx`, new renderer helpers/components, `components/profile/FighterHero.tsx`, and their tests. Do not edit `CosmeticPreview.tsx`, Shop, API helpers or backend.

Extend `FramePresentation` additively with portrait/avatar bundled art and measured safe aperture/layout metadata. Keep colors/width/glow for old contracts. Add four slugs and shared artwork rendering. Actual multi-stop gradient borders for existing frames, original single-color borders unchanged. Full-body portraits remain contained within the frame opening, with ornament outside the image mask; square circles use the dedicated circular asset and a safe face aperture. Small-size treatment must preserve silhouette without cropping the face. `PortraitPreview` should support optional `onImageError` so Shop can refresh signing without re-purchasing. Add the same frame to Profile hero without obscuring its fighter, caption or stats. Do not squash a tall frame into a wide hero: use the shared frame in an appropriate portrait area. Preserve existing default/no-frame layout and touch/accessibility contracts. Tests should assert meaningful rendered structure/asset selection and actual colors, not implementation-only snapshots.

### Task 3: Shop UI and recovery

Own `app/(profile)/shop.tsx`, `components/CosmeticPreview.tsx`, new Shop components/hooks/helpers, and tests. Do not edit backend/API, frame registry, PortraitPreview or Profile hero.

Implement a scrollable full header with compact loadout summary (Frame, Title, Aura, Badge), category selection and All/Owned filters, visual item thumbnails, explicit preview/currently-wearing labels, clear preview reset, accessible separate Buy/Equip/Remove actions. Preview can open a bounded scrollable sheet with pinned actions; avoid a large fixed header. Show Portrait/Avatar contexts; choose Avatar automatically for aura and visibly show purchased color swatches without implying generated-image recoloring. Use own avatar/full-body/starter references and appropriate contained presentation. Preserve prices, earned alternatives and confirmation sheet. All actions at least 48 points, labels wrap instead of collide, no white-on-green.

Refresh catalog/character/equipment/balance on focus, foreground and fulfillment/return, retaining scroll/category. Preserve known data on partial failure; distinguish confirmed-empty fighter from failed load. Recover signed artwork on error/foreground/manual Retry without charges. Serialize mutations with a synchronous ref lock and ignore stale request/account results; successful equip clears preview and applies authoritative slot/config. Successful purchase immediately marks ownership even if refresh fails, then reconciles. Preview stays usable during mutation; no overlapping paid/equip mutation. Tests cover audit reproduction, large-text structure, both preview contexts, stale read/mutation responses, focus recovery, owned filtering, errors and purchase acknowledgment recovery.

### Task 4: Assets, integration, review and rollout

Root owns art generation, asset validation/bundling, `.easignore` excluding `/output/`, scoped reviews, aggregate checks and native verification. Check all four PNG pairs have transparent centers and alpha, inspect them at avatar/portrait sizes. Repeat screenshot evidence for Shop normal/large text, preview/equip/reset, Profile frames and existing frames. Preserve simulator starting state and account equipment. Backend deployment follows successful review/checks; only contract-2 clients can see/buy the new catalog. Do not initiate a new App Store/TestFlight build unless requested. Document actual deployment and any platform verification limits.
