# Prompt Wars — Orchestrator Gap Review (Mobile App)

_Coordinated against `docs/prompt-wars-implementation-concept.md` (the source of truth).
Role: `.github/agents/prompt-wars-orchestrator.agent.md`. Domains touched: QA, Mobile,
Safety/Accessibility, Backend._

## Decision summary

The backend and mobile feature surface are broad and largely built out. The highest-value,
**verifiable** gaps were in the project's own quality tooling (typecheck + test harness were
effectively non-functional) and in accessibility settings that looked implemented but did
nothing. Those were fixed and verified this pass. Remaining gaps are real but need backend
work and/or on-device visual QA, so they are documented as prioritized next steps rather than
shipped blind.

## Fixed and verified this pass

| # | Gap | Concept ref | Fix | Verified by |
|---|-----|-------------|-----|-------------|
| 1 | `tsc --noEmit` reported **376 errors** — the app `tsconfig` pulled in Deno edge-function code that has its own `deno.json`. Typecheck was unusable as a signal / CI gate. | §11 | Added `"exclude": ["node_modules", "supabase/functions"]` to `tsconfig.json`. | `tsc --noEmit` → **0 errors**. |
| 2 | **Entire Jest suite was dead.** `jest.setup.js` mocked `react-native/Libraries/Animated/NativeAnimatedHelper`, a path that no longer exists in RN 0.83 (moved to `src/private/animated/`), throwing "Cannot find module" for *every* suite. | §16 / CLAUDE.md | Removed the stale mock (jest-expo already silences the warning). | `yarn test` runs. |
| 3 | Jest also discovered only the two **Deno** `*.test.ts` files under `supabase/functions/_tests/` (they import `https://deno.land/...` and can't run under Jest). | §16 | Added `testPathIgnorePatterns: ["/node_modules/", "<rootDir>/supabase/"]`. | Jest no longer picks up Deno tests. |
| 4 | `react-test-renderer@19.2.4` did not match `react@19.2.0`; `@testing-library/react-native`'s peer check hard-failed, so **no component/hook test could ever run**. | §16 | Pinned `react-test-renderer` to `19.2.0` (offline install from cache). | `renderHook` test runs. |
| 5 | **Settings → Accessibility toggles were dead state.** Dynamic Type / Dyslexia Font / Reduced Motion / High Contrast were `useState` values that were never persisted and never read anywhere — flipping them did nothing and they reset on every mount. | §22a | New `utils/accessibilitySettings.ts` (persist + subscriber registry, mirrors `soundSettings.ts`); hydrated in `app/_layout.tsx`; Settings screen reads/writes it. **Reduced Motion is now OR-ed with the OS setting inside `useReducedMotion`**, so it actually gates every reveal/HP/counter animation. | 13 passing unit tests incl. the OR logic. |
| 6 | **Zero RN app tests** despite CLAUDE.md documenting `yarn test`. | §16 | Added `__tests__/` suite: `accessibilitySettings`, `soundSettings`, `useReducedMotion`. | 3 suites / 13 tests green. |

Verification: `tsc --noEmit` = 0 errors · `yarn test` = 3 suites / 13 tests pass · ESLint clean on all changed files.

> Note on #5: Reduced Motion is now fully functional. Dyslexia Font, High Contrast, and
> Dynamic Type are now **persisted and centrally readable** (a real improvement over dead
> state) but their full theming/typography application is a follow-up (see below).

## Recommended next steps (verified gaps, backend / visual-QA dependent)

Priority order:

1. **AI-generated content disclosure (§22 — store-readiness commitment).** No client reference
   exists on reveal, share, or profile assets. Bake a visible "AI-generated" label into the
   rendered result card (captured by `shareResultCard`) and the on-screen reveal; ensure the
   server-side video watermark carries the tag. Small but **App Store review-critical**;
   needs the reveal UI + on-device visual QA.
2. **One-tap "Poke" after 30 min opponent inactivity (§7.5 / §14 / §20).** Entirely missing
   (client and backend). Needs: a new user-initiated edge function `poke-opponent`
   (validate participant → `waiting_for_prompts` → opponent unlocked → ≥30 min since opponent
   activity → **one poke per battle**), a new `poke` push category (extend `PushCategory` +
   `can_send_notification` gate + `notification_preferences`), a migration for one-per-battle
   enforcement, a client `pokeOpponent()` util, and a button + 30-min gate on `waiting.tsx`.
   Requires a live Supabase to verify.
3. **Move-type legibility (§7.1).** `prompt-entry.tsx` shows opponent's last-5 move types
   **only for Bo3** and only from the current battle; the **counter-pick win-rate vs the
   opponent's archetype** is missing entirely. Needs a backend RPC returning aggregated
   opponent move-type history + counter win-rates (RLS blocks reading opponents' prompts
   directly), then surface it for single-format battles too.
4. **Missing retention screens:** Rival panel (§5/§14/§20 — `rivals` table exists, 0 client
   refs), Judge-a-friend minigame (§10.1/§14 — 0 refs), Prompt journal (§14/§20), and the
   daily-theme leaderboard tab in Rankings (§14).
5. **Dyslexia-font / High-contrast application (§22a).** Preferences now persist; wire a
   bundled dyslexia typeface and a high-contrast palette variant through `useThemedColors` /
   a text wrapper.

## Risks & open questions

- Items 1–4 change outward-facing behavior and/or economy/safety state; they must go through
  the relevant executor (backend, safety, ai-video) and a live Supabase before shipping.
- `app/_layout.tsx:20` has a pre-existing `require('react-native-reanimated')` lint warning
  (not introduced here) — left as-is.

## Verification checklist

- [x] `npx tsc --noEmit` — 0 errors (was 376)
- [x] `yarn test` — 3 suites, 13 tests pass (was: whole suite crashed on load)
- [x] `npx eslint` — clean on all changed/added files
- [ ] On-device: confirm Reduced Motion toggle removes reveal animation (manual QA)
- [ ] Next steps 1–5 above
