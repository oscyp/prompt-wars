# Client state and integration verification

Verified against the integrated working tree on 2026-10-07, after the final paid-bank recovery and Android move-type label padding fixes. No commit was created.

## Executed checks

| Check | Result |
| --- | --- |
| Full app Jest: `yarn test --runInBand` | **224 suites, 1,900 tests passed**, 46.169 s Jest runtime |
| TypeScript: `node_modules/.bin/tsc --noEmit` | Passed, exit 0 |
| Focused workspace and asynchronous hooks | **4 suites, 74 tests passed** |
| ESLint: suggestion/completion hooks and purchase-hook tests | Passed, no warnings or errors |

The full Jest run supersedes the earlier 1,893-test integration result. Jest emitted existing React test `act` warnings in unrelated character-edit tests; there were no failing suites or tests. These checks do not establish native accessibility or real-provider quality.

## Covered behavior

- Three required fragments, deterministic exact preview, atomic type/text, separate manual/builder buffers, exact parent branch restoration and explicit confirmation of carried custom descendants.
- Draft v4 round/account scope, migrated old complete text preserved through the manual path, incomplete branches blocked, serialized saves and submitted-draft tombstones.
- All 1,215 fallback complete paths pass composer validation while preserving existing action/intent identifiers and text.
- Four distinct workspace stages, explicit Next/Back, stable mounted editor, 600 ms hold, deadline/round/scope fences and exact reviewed submission.
- Cancelled screen-reader confirmation cannot submit through an old callback, including after a replacement confirmation opens.
- Legacy Ideas mode preserves exact prose when its move type changes.
- AI starts only in Build move, fallback is explicit after eight seconds or failure, and late banks require explicit application once the user has interacted.
- Completion work is scoped to account, battle, round and exact parent context; stale workers/timers cannot affect a new scope.
- Old AI banks use no-charge exact-set enrichment rather than consuming custom adaptation quota.
- A recovered delivered purchase remains successful while Approach enrichment is pending or fails. Recovery uses `ensure_free` with the original set ID; no extra paid request or custom adaptation is created. Failed extension preserves the paid bank. Late old extensions cannot replace newer purchases.

## Limits and remaining release evidence

This report covers application tests and code review only. SQL concurrency, RLS, Deno tests, hosted deployment, real xAI latency/moderation, signed EAS binaries, native keyboards/readers and authenticated full-round execution are recorded by their separate owners. No production database reset, paid purchase, or real AI invocation was performed by this verification task. The human repeat-play pilot remains separate. See the main release ledger for outstanding native/provider delivery conditions.
