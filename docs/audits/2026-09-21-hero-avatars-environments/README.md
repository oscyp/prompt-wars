# Hero, avatar and environment implementation

21 September 2026 · current working checkout · client + one additive authenticated Edge Function

[Native/art comparison gallery](comparison.html) · [implementation ledger](PROGRESS.md) · [asset manifest](../../../assets/images/environments/manifest.json)

## Implemented

- Arena and Profile reserve measured space for headers, identity/caption, stats and primary actions before choosing artwork height (180–320 pt, additionally constrained by available width/frame aspect). Measured apertures, caption overlap and contained fighter art remain intact. Urgent Arena entries stay first and now use the same battle avatar presenter. Battle cry and secondary Profile metadata follow the primary actions.
- Profile sharing mounts a separate 384-point composition only for export. It waits for layout, artwork, equipped frame and fonts/system fallback. Loading failure leaves a retryable error instead of exporting incomplete artwork. Native export verified at **1152×2235 pixels**, independently of the shortened visible hero; the complete fighter and signature item are visible.
- `sign-player-avatars` authenticates before read/signing. It accepts only UUID profile/battle IDs, deduplicates and caps a combined batch at 50. It resolves current active fighter avatar pointers or the participant's frozen opponent avatar, and checks kind, character/profile ownership, current approval and both block directions. Block reads are restricted to the batch's owner IDs, so the API row limit cannot omit a denial. No caller-supplied path is accepted; missing/rejected/removed/legacy/bot references remain unavailable. Storage signing is batched and read-only. The existing battle-portrait endpoint remains unchanged.
- Shared list loading covers Rankings podium/rows, Battles/history, Arena rows and Rivals. Current player results include public-facing identity/equipment for Rivals; battle rows retain recorded equipment. The memory cache isolates accounts and identity contexts, stores opaque asset references, deduplicates row/page requests, caps signing calls at 50, refreshes before expiry and revalidates on focus/foreground. Scrolling uses fresh cache entries. Failures retain known art; authoritative unavailability clears it. Image retries perform signing only and are bounded to avoid error loops.
- Six environments each have an independently composed portrait and wide banner. Twelve optimized JPEGs total **2,153,283 bytes**. The new visual resolver handles all five explicit themes, deterministic legacy themes and the missing-theme default. Theme plaques use the wide composition across their full width with a native scrim; keyboard mode remains artwork-free. Face-off and waiting use matching portrait art. Existing audio selection and audio files have no diff from this work.

## Verification

| Check | Result |
|---|---|
| TypeScript (`yarn tsc --noEmit`) | Passed |
| Complete Jest (`yarn test --runInBand`) | **168 suites, 1,379 tests passed** |
| Deno new resolver + compatible battle portrait resolver | **26 passed** |
| Deno endpoint type check | Passed |
| ESLint app/components + new hooks/helpers/resolver | 0 errors; existing `app/_layout.tsx:29` require-import warning |
| Diff whitespace check | Passed; existing CRLF conversion notices only |
| New asset count/size/dimensions, five mappings, deterministic fallback, audio mapping | Automated and visual contact-sheet checks passed |
| Independent read-only code review | Two findings fixed with observed failing/passing regressions: bounded block checks, cached row visibility |

Coverage includes authentication, mixed authorized/unauthorized requests, both block directions including >1,000 unrelated rows, private portrait ownership/kind/approval/removal, frozen non-current images, provider/signing failures, batching/pagination, account and row recycling, expiry, stale/removed artwork, frame preservation, hero geometry, share readiness/failure/font fallback, Unicode names and complete existing regression suites. Tests use recording database fixtures; they **do not claim a live deployed RLS integration pass**. No policies, table grants or migrations changed.

Logs: [Jest](jest.log), [Deno](deno.log), [ESLint](lint.log).

## Native evidence and limits

The standard iPhone simulator (`5BCEAF70-7392-4F8F-92F6-4249428CA786`, 402×874 pt) ran the actual current Arena/Profile/Battles routes through the existing native development binary and Metro on port 8081. Arena and Profile show their generated full fighter, equipped illustrated frame, four stats and both primary actions in the first viewport. The captured share sheet and full PNG verify independent full-size export. Battles remained browseable with the new endpoint unavailable. Debug endpoint-error toast in one capture is recorded rather than removed.

The small iPhone simulator (`6F8B783F-D76B-4F4F-8174-94F52489E10F`, 375×812 pt) is signed out of the actual app. The battle captures there use the existing isolated component fixture on port 8083 with dummy backend configuration, bundled stand-in fighters and synthetic deadline. Changing OS text size in place to accessibility-extra-large exposed clipping across the pre-existing Debug text layout, including the plaque, labels and deadline. The failing diagnostic is retained in the gallery. A cold restart reflowed correctly; refreshing only the shared native Text node when font scale changes then fixed the live transition. The repeated accessibility-extra-large capture shows the complete theme and deadline without restarting. Editor/input nodes and local draft state remain mounted. Default text size was restored afterward. These images establish shared banner/reflow presentation, **not** live workspace navigation, submissions or waiting behavior. No new battle, paid operation or store flow was initiated for these captures.

Open release checks:

1. Sign into the small iPhone and capture actual Arena/Profile at 375×812, including urgent battles, long names and accessibility text. The first-viewport criterion is verified on the standard phone only.
2. Deploy the compatible avatar endpoint to the intended environment before client distribution, then verify distinct approved human avatars/current Rivals versus frozen battle identities, blocked/removed assets and offline/signing recovery on real accounts. The endpoint is intentionally **not deployed** in this scope, so current native list captures show fallback behavior.
3. Capture actual workspace/waiting with long themes, keyboard transitions, VoiceOver/TalkBack and Reduced Motion; finish the complete small/standard accessibility and offline matrix. Existing behavior and automated regressions are preserved, but these device cases were not all exercised here.
4. **Android remains blocked** by the user's explicit instruction until a test environment is available.

## Delivery boundary

No version bump, production build, store submission, database migration, server deployment, combat/appeal rollout flag or audio-provider change was made for this task. The earlier unrelated dirty work is retained. Deploy `sign-player-avatars` before a later compatible client release; a missing endpoint degrades to list fallbacks. Existing schema/RLS and the old signing endpoint remain compatible.

Private storage access follows [Supabase's documented access model](https://supabase.com/docs/guides/storage/security/access-control): service credentials stay server-side, and this function performs authorization before signing.
