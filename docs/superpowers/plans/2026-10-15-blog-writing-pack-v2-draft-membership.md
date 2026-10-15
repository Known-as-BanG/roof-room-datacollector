# Blog v2 Slice 2 — draft membership

Task authority: user-approved multi-Run design and Slice 2 implementation request.
Scope: revalidate explicit selections through Slice 1, assemble a membership-only
draft, persist it immutably using the existing Blog store, and reload it.

## Inspected seams

- `assembleBlogWritingPack` and `BlogWritingPackStore.publish/readManifest` are v1-only.
- `resolveBlogWritingPackV2Selections` already validates exact accepted evidence;
  `ProductionDataPackageLoader.verifyAcceptedJobArtifact` checks size and SHA-256.
- Package persistence is filesystem-backed; no database migration is necessary.
- The v1 COMPLETE/PARTIAL model cannot describe unevaluated v2 membership.

## Contract and steps

1. Add failing isolated tests in `tests/integration/blog-writing-packs/` for
   assembly, reload, stable membership, fresh identity/integrity rejection,
   same-family Jobs, Workspace isolation, and non-overwrite behavior.
2. Add a v2 draft type in `src/shared/blog-writing-pack-v2-draft.ts` and a
   version-specific assembler in `src/main/blog-writing-packs/blog-writing-pack-assembler.ts`.
   Assembly always reuses the Slice 1 resolver; no cached resolved selection.
3. Extend `BlogWritingPackStore` with `saveDraft/readDraft` using its existing
   staging and refusal-to-overwrite pattern. Store only `BLOG_DRAFT.json`, with
   `state: DRAFT` and `readiness_status: NOT_EVALUATED`; no rows/raw copies/workbook.
   Leave v1 publish/readManifest unchanged so drafts cannot open as deliveries.
4. Document the additive disk contract in `DATA_CONTRACTS.md`.
5. Run Slice 1/Slice 2 tests, v1 Blog gate, accepted-artifact loader gate,
   TypeScript, lint, shell syntax, and `git diff --check`.

Acceptance: persisted selection order and all actual identities/contexts survive
reload independently of newer Runs; no COMPLETE claim, source mutation, export
overwrite, new Run, provider request, migration, commit, or push.

`dataset_type` is the existing dataset identity field; there is no persisted
`dataset_id` to invent. Unresolved field/window/coverage semantics remain Slice 3.

## Verification result

Completed locally without commit or push. The Slice 2 suite was RED with the
missing assembler assertion, then GREEN at 8/8. Slice 1 passed 7/7; the existing
Blog v1 gate (including store and desktop smoke) and Production Data Package loader
gate passed. `npx tsc --noEmit`, `npm run lint`, shell syntax, and diff checks passed
using installed Node 24.19.0. Test files and persistence were isolated from
production evidence. Full Blog v2 readiness and delivery remain unimplemented.
