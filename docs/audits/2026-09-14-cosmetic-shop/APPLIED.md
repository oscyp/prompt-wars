# Cosmetic Shop implementation — 14 September 2026

Status: implemented; scoped backend support deployed. Independent integration review approved. iPhone simulator verification completed, with platform limits below.

## Artwork and catalog

Eight RGBA assets are bundled: portrait and circular-avatar versions of Astral Codex, Emberforge, Neon Circuit and Laureate. Every center and corner is transparent. Portraits are 1024×1536; avatar overlays are 1254×1254. Safe apertures are measured and registered in `constants/Cosmetics.ts`; full-body artwork stays contained. Original generated files remain available in `output/imagegen/prompt-wars-frames/`, excluded from EAS uploads.

Astral Codex, Emberforge and Neon Circuit cost 25 credits each (epic). Laureate costs 40 credits (legendary), with a free 50-win unlock. Existing prices, free paths and Founders exclusivity remain unchanged. New rows require cosmetics contract 2; legacy clients default to contract 1 and cannot buy or equip unsupported new artwork.

## Backend verification and deployment

- Independent backend review approved the scoped change.
- Deno policy/isolation suite: 14 tests passed; endpoint type-check passed.
- Isolated PostgreSQL 15 runtime: migration applied; rollback-only fixture passed purchase/equipment ownership, both client-role denials for every legacy/new RPC signature, service-role grants, positive/negative RLS, free unlock and identity immutability.
- Two real concurrent database transactions were observed waiting on the wallet lock. Duplicate purchases charged once; competing 25-credit items against 30 credits could not overspend. Fixture accounts were removed from the isolated database; no real player purchase occurred.
- Migration `20260914175322_cosmetic_catalog_contract_v2.sql` and the `cosmetics` Edge Function were deployed to the linked project. CLI migration history confirms the same local and remote version. The Supabase connector's read-only SQL call lacked permission; CLI operations succeeded.
- Client helper tests: four passed, including contract version, committed acknowledgment after refresh failure, empty response and authoritative equipment configuration.

## Renderer verification

Independent renderer review approved shared artwork and gradient rendering. The complete app suite passed: 134 suites / 1,100 tests. TypeScript passed, and lint reported zero errors with one pre-existing require-import warning in app/_layout.tsx. Existing reveal/icon tests emit act warnings; the new cosmetic suites pass without those warnings. The final 24 Shop/preview/recovery tests passed after two additional fixes for fallback asset preservation and clearing invalidated refresh indicators; TypeScript and scoped lint passed again.

## Release boundary

This work deploys backward-compatible backend support and updates the client source. No new TestFlight/App Store submission is initiated. Existing combat/appeal feature flags remain unchanged. User audio-provider files retain their original hashes.

## Native and integrated checks

Verified on iPhone 17 Pro / iOS 26.5:
- Profile displays the equipped Neon gradient around the contained fighter, with readable caption and stats.
- Owned filtering works. Equipping Classic from its preview closes the preview and updates the loadout; Neon was restored afterward. The wallet remained at 150 credits.
- Astral Codex portrait and matching avatar are displayed at their intended sizes. New catalog rows expose the expected prices and Laureate's earned alternative.
- Aura preview selects Avatar context automatically. Colour preview shows a visible swatch and explains that generated artwork keeps its original colours.
- Accessibility extra-large text: the complete Shop header scrolls away; preview body scrolls while Clear preview and Equip remain reachable. Original Large text size restored.
- Original equipment restored: Neon Frame, Plus One title, no aura or badge. No paid purchase was performed.

Evidence is in `applied/`. Android/TalkBack, a small-phone simulator and physical-device VoiceOver were not verified. A live simulator text-size change caused pre-existing React Native clipping until screen remount; static default/AXXL layouts were checked after remount. This remains a release-validation caveat, not proof of live text-change recovery.

All ten code-level audit findings are addressed. Recovery and concurrency failures use automated fixtures; native checks do not simulate every transport failure. No new mobile binary has been submitted; new art requires the updated compatible client.

Native testing found the local-PNG intrinsic-size behavior in React Native Image. Explicit frame dimensions now override the bundled source dimensions; five added assertions failed before the fix and the eleven renderer checks pass afterward.
