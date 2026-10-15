# Blog v2 Slice 3B.1 — explicit readiness evaluation

Authority: user implementation request for Slice 3B.1 and Slice 3A findings.
Scope: a Blog-only versioned requirements/evaluation contract, mandatory presence,
explicit GSC requested-date equality, declared decision/source-change blockers,
and evidence revalidation against immutable stored draft membership.

## Inspected seams and decisions

- Read drafts through `BlogWritingPackStore.readDraft`; do not change its format.
- Reuse `resolveBlogWritingPackV2Selections` and existing loader integrity checks;
  compare resolved provenance with the frozen draft, without replacing selections.
- Require an explicit profile. Export the currently unresolved Blog requirements
  as conservative input data; do not supply approved date or metric defaults.
- Coverage measures only the implemented explicit checks. Delivery readiness is
  always NOT_EVALUATED. Synthetic complete profiles are deterministic test inputs,
  not approval of the real downstream contract.
- LOW_DATA/NO_DATA and multi-Job family coverage stay DECISION_REQUIRED here.

## Steps and files

1. Add failing `blog-v2-readiness.integration.cjs` tests and an isolated runner.
2. Add `src/shared/blog-writing-pack-v2-readiness.ts` and the source-local
   `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts` evaluator.
3. Document explicit-check scope, blockers, and unresolved semantics in
   DATA_CONTRACTS.md and route current work in PROJECT_HANDOFF.md.
4. Run the new suite, Slice 1/2, existing Blog v1 and accepted-artifact loader
   gates, TypeScript, lint, shell syntax, and diff checks using Node 24.19.0.

Acceptance: the requested A–I cases pass; real current requirements stay blocked;
draft bytes and membership are unchanged; Slice 1/2 and v1 interfaces stay intact.
No source acquisition, row generation, migration, Core/UI change, publication,
production access, provider request, commit, or push.

## Verified result

Implemented without changing Slice 1/2 contracts or implementation. Initial RED
was the missing-evaluator assertion. A second focused RED caught a GSC NO_DATA
window check being skipped; separating verified identity from usable VALID
coverage made that check independent. Final readiness suite: 10/10 GREEN.

Slice 1 passed 7/7 and Slice 2 passed 8/8. The Blog v1 gate (including store,
controller, IPC, file access, and desktop smoke) and accepted-artifact loader gate
passed. Project TypeScript initially exposed null inference in the requirements
constant; an explicit interface annotation fixed it. Fresh TypeScript, lint,
readiness tests, shell syntax, and diff checks passed using Node 24.19.0.

All evidence/persistence tests used isolated fixtures. No production access,
source requests, draft mutation, schema migration, publication, commit, or push.
