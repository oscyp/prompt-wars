# Prompt composer implementation

> Superseded activation policy: The subsequent 1 October user instruction removes all six composer rollout flags and primary calibration blocking of new ranked assignments, and authorizes applying migrations and deploying the compatible implementation. New series in all modes, AI and explicit paid rerolls are enabled by default. The original staged/default-off task wording below is retained as execution history and is superseded for activation only; calibration, independent appeals, legacy pinning and money-safety requirements remain. See [the current release instructions](2026-10-01-composer-release.md).

The approved specification is the comprehensive Prompt Wars composer plan supplied in this task on 2026-10-01. This execution document records interfaces, ownership, decisions and verification; it does not replace product requirements.

## Shared contracts

- Battle `prompt_experience_version`: nullable/1 legacy, 2 composer. Separate from combat `rules_version`.
- Battle `judge_policy_version`: legacy `v1.0.0-mvp`, new `v2.0.0-ideas`; frozen for the series.
- Battle `situation_catalog_version`: nullable legacy, `1` for initial authored catalogue.
- Round `situation_snapshot`: nullable legacy, `{ id, catalogVersion: 1, environmentId, text }`.
- Client contract 3 supports composer, situations and explicit suggestion purchases. All new rollout flags default false.
- Structured suggestions retain title/body and add `id`, `structureVersion: 2`, `action`, `intentHints: {id,text}[]` (exactly three). Final text is trimmed action + one space + trimmed intent, with no AI rewriting.
- Suggestion request `operation: ensure_free | reroll`, reroll requires `idempotencyKey`, `expectedCredits`; omitted operation is always free-only. Keep naming consistent with existing transport conventions and document any translation.
- Same published situation feeds player, suggestions, bot, judge, appeals, result and video; no exposure of hidden opponent prompt.
- No ranking/HP/damage/RPS math changes, no paid scoring inputs. Legacy single and Bo3 retain original behavior.

## Task 1: Mobile composer and drafts

Own app/(battle)/prompt-entry.tsx, hooks/usePromptComposer.ts, hooks/useMoveSuggestions.ts, utils/battleDrafts.ts, hooks/useBattleDraft.ts, new composer utilities/components under components/battle, mobile tests, and optional mobile visual fixture. Do not edit utils/battles.ts, server, telemetry or result routes (root owns those integration surfaces).

Implement Build move / Write your own, remembered account preference overridden by draft, action then contextual intent (three choices each or custom), deterministic preview, stable mounted full editor. Default builder for experience 2; preserve legacy workflow for legacy matches. Detached state after full-text edits; switching mode does not alter text; confirm before applying builder over edited prose; atomic undo restores text/fields/IDs/validity. Action changes clear suggested intent but preserve custom intent. Pending incomplete builder cannot submit stale text. Move changes preserve prose and detach incompatible IDs. V2 account/battle/round draft migration preserves v1 text without inventing fields; keep serialization/tombstones/race guards.

Use existing obsidian/gold/lavender Game components, Barlow labels and system 16pt body, 16 gutters/padding, 20 section gaps, 8-12 inside; 48pt targets, wrapping Dynamic Type, selected accessibility states, reduced motion. Compact art/context while keyboard focused; keep full context accessible. No simulated score/word-quality meter. V2 uses tap + confirmation for every player, as required by approved spec 2.5; legacy retains hold with accessible confirmation. Add BattleSituation and collapsible OpponentMoveHistory (resolved max5 oldest-to-newest, no bots/empty/predictions). Late AI must never replace active choices; explicit apply new set. Free authored fallback always available; pending/errors/offline never prevent drafting. Price unknown blocks purchase only. Root will provide shared fallback catalogue utility if needed; coordinate imports.

Meaningful Jest tests: no-typing submission readiness, edit/detach/replace/cancel/full undo, incomplete builder, move changes, late async response/account/round scope, migration/restoration/deletion, stable editor and accessibility.

## Task 2: Safe structured suggestions

Own supabase/functions/generate-move-suggestions, _shared/suggestion-service.ts, _shared/move-suggestions.ts, prefetch-move-suggestions, new suggestion migration and SQL tests, relevant Deno tests. Do not edit providers.ts, battle lifecycle or client files.

Implement explicit ensure_free (never charges), reroll (key + expected price), atomic reservation/current price/debit, replay original operation/price, owner + battle + round + move + operation binding, renewable full-pipeline lease and fencing on completion/failure/refund/cleanup. Stale worker after successor success cannot modify or refund. Legacy omitted operation is free-only. Paid failures/moderation refund once, network retries recover pending result. Preserve existing first-free per player/battle/round/move economy, limits, RLS and guest parity. Structured three actions each with three matching intents, stable IDs + version plus compatible title/body. Validate/moderate fragments and complete pairs, bounded generation budgets. Use round situation_snapshot for generation. Safe authored fallback is free and not persisted as purchased AI success. Flags permit independently disabling paid rerolls and AI generation. Follow existing auth/provider adapters/helper conventions. Tests must exercise business branches, concurrency and RLS, not just source text.

## Task 3: Versioned judge and calibration

Own _shared/providers.ts, _shared/judge.ts, _shared/appeals.ts, run-judge-calibration, judge-battle/resolve-round only judge wiring (coordinate root), related Deno tests, new calibration data/tool/report docs. Root owns lifecycle/context migration and shared prompt-experience helper.

Implement actual provider template dispatch legacy v1.0.0-mvp vs v2.0.0-ideas, frozen battle version and immutable round situation across both judge calls/tiebreak/appeals/calibration. New six wire-compatible 0-10 criteria: action/intent clarity, useful originality, concrete causality, coherent shared context (no mandatory prop/keyword echo), internal consistency, legible scene consequence. No source/money/authoring method; no length/style advantage or forced differing scores, language errors only affect understandable meaning, automatic-victory claims not proof, moves handled by combat. Remove word-only normalization penalty only v2. Mock is fallback/test, never fairness evidence. Reuse stored explanation with specific reason; do not add AI advice calls.

Provide >=200 labeled evaluation cases separated tuning/holdout with short/verbose semantic equivalence, expected draws, same-text authoring invariance, keyword abuse, no prop, victory claims, PL/EN/mixed locales, archetypes/moves/bots. Clearly distinguish authored expected labels from independently human-reviewed gold data; do not fabricate calibration/pilot results. Promotion gates >=90% actual-model no-fallback holdout, verbosity direction <=1/60, swapped positions/locales, draw and KO change <=5pp, median gap change <=20%; real model runs require configured credentials/cost and are not assumed passed. Ranked rollout stays off absent gates and season boundary approval.

## Task 4: Root integration

Own shared catalogue (15 situations, three per existing theme, 20-35 words, neutral facts with 2-3 affordances, no repeats within series), fallback move catalogue, lifecycle and version migration, matchmaking/tutorial/friend/rematch gating with legacy queue/invite resume, root utils/battles.ts and Realtime types, context propagation bot/video/results, round-aware nonblocking private telemetry with active foreground duration, concept/design docs and rollout runbook. Additive migrations created by CLI; immutable snapshots assigned atomically before deadline. Rollback stops new assignments, retains handling existing v2 series. Tests cover both legacy and new flow, client contracts, privacy and complete round.

## Task 5: Review and release evidence

Run meaningful Jest/Deno/SQL checks, TypeScript/lint on changed code and targeted integration. Review finance/state/compatibility and visual design. Prepare native QA matrix for 320/375/390/402/tablet, iOS/Android, keyboard, accessibility, error/recovery; use available local tooling and record actual evidence only. Native readers and 12-person pilot remain explicit release gates if unavailable (>=10/12 unassisted, >=9/12 authorship4/5, zero lost drafts/spend). Do not deploy, purchase, reset DB or activate flags merely to claim completion. Provide precise implemented/verified/remaining outcome.

## Execution ledger

- Baseline HEAD d66e621264fb56b6471ecbaa4a7971bb689abaca on codex/visual-audit-remediation-20260921. Existing working tree includes substantial unrelated and prerequisite uncommitted changes.
- Ruling: implement in current user-specified checkout with bounded file ownership; new worktree from HEAD would omit required current visuals/auth/suggestion behavior. Preserve all existing work and do not commit broad mixed changes.
- Ruling: independent agents may implement disjoint surfaces concurrently, per proactive delegation instruction; coordinate shared contracts here and root owns shared files.
- Ruling: public activation, live calibration, native accessibility and human pilot cannot be represented as completed by unit tests. Supply executable checks/runbook and leave rollout off until evidence exists.
- Preflight interface table: mobile consumes root battle/version/situation API and backend additive suggestions; backend consumes root round snapshot; judge consumes root version and snapshot; root calls all. Each task uses unchanged combat math and optional legacy fields. No conflicting file owners after listed exclusions.
- Initial baseline targeted Jest: 19 tests passed.
- Implemented all five code workstreams: composer/drafts, explicit suggestion operations, situation/version lifecycle, versioned judge/evaluation, and result/video/telemetry integration. Rollout remains disabled.
- Independent review corrected atomic Undo baseline, pending composer context, late round draft restoration, missing first-change telemetry, stored-row client contract gates, replay face-off recovery, paid operation contract validation, bot video outcome selection, and actual ranked calibration enforcement. See task reports for regression evidence.
- Native release acceptance, independently reviewed real-model calibration and the 12-person pilot are still required. They cannot be completed or inferred from automated fixtures.
- Reports: `2026-10-01-composer-mobile-report.md`, `2026-10-01-composer-suggestions-report.md`, `2026-10-01-composer-judge-report.md`, `2026-10-01-composer-visual-checks.md`, and `2026-10-01-composer-release.md` in this directory.
- Final verification: 215 Jest suites / 1,749 tests; 457 Deno tests / 49 steps, 7 remote-only tests ignored; app TypeScript, relevant Edge type checks and targeted ESLint passed; `git diff --check` passed. Local SQL transactions were rolled back; four real suggestion-concurrency scenarios passed.
- Final review follow-ups preserve one validated Undo version across restarts, keep frozen move inputs after an appeal, require tap + confirmation for all v2 users, enforce exact-model ranked calibration and support explicit long-run CLI calibration persistence. No model calls, hosted writes or deployment were performed.
- Temporary local fixture server was stopped and browser viewport overrides reset after inspection. Production behavior stays gated by disabled-by-default switches; release acceptance remains as recorded in the runbook.
