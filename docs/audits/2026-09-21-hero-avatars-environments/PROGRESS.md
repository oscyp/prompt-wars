# Hero, avatar and environment implementation ledger

Scope: approved user plan, 21 September 2026. Preserve unrelated working changes. No version/build/submission/deployment/migration.

1. Hero sizing + independent sharing: implemented. Geometry tests RED → GREEN; share readiness/error/font fallback tests pass. Native route sizing pending.
2. Avatar endpoint/cache/list integration: implemented. New batched authenticated, service-owned signing; private tables unchanged. Deno 25/25 (new resolver + compatible old endpoint), focused list/cache tests pass. Complete regression pending.
3. Environment art: 12 separately generated originals, 12 optimized bundled JPEGs, 2,153,283 bytes; contact sheet visually inspected. Explicit mappings and unchanged audio mapping tests pass. Native integration pending.
4. Native/regression/docs: in progress. Android remains blocked by the user's instruction.

Ruling: add current identity fields to profile avatar results, because Rivals previously reconstructed historical identity and the public cosmetics view does not expose fighter names. These are read-only public-facing fighter fields; blocked relationships expose neither identity nor art.
Ruling: coalesce mounted row requests and preload loaded pages into the same 50-ID cache. Retain the legacy battle-portrait endpoint unchanged.
Ruling: use the current working checkout as explicitly requested; do not isolate away earlier uncommitted fixes.

Final review findings fixed: the block query now bounds each direction to the at-most-50 resolved owners (RED >1,000 fixture → GREEN). Visibility/ref changes now read fresh cache; only focus/foreground and explicit retry force signing (RED staggered-prefetch test → GREEN).

Native findings: actual standard Arena/Profile actions fit, native share export is complete at 1152×2235; small simulator's actual app is signed out. New avatar endpoint is intentionally undeployed, so live human avatar acceptance awaits deployment. In-place Dynamic Type change exposed stale native text metrics in the current binary; applying a shared native-text-node refresh keyed by font scale, leaving editors/screen state mounted, then repeating native checks.


Final: implementation and automated verification complete. Native Dynamic Type live transition retest passed after native-text-only refresh; editor nodes are unchanged. Full suite rerun: 168/168 suites, 1,379/1,379 tests; 26 Deno checks; TypeScript pass; ESLint 0 errors with one prior startup warning. Art manifest hashes/dimensions/bytes verified. Native evidence/report records remaining release gates accurately. No distribution or deployment performed.
