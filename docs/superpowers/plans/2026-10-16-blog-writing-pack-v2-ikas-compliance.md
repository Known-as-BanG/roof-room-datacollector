# Blog v2 Slice 3B.2B.2 — İkas Products field compliance

Authority: user-approved focused slice request. Preserve uncommitted Keyword Planner work and reports; no acquisition, Core, persistence, publication, database, commit or push changes.

Inspected existing workbook parser, validator, FILE_IMPORT context, product/variant contract, accepted loader, field helper and evaluator. Product-group ID and variant ID are separate. Optional URL is null-filled; header presence is needed to distinguish absent columns. Categories/type fields have no singular-primary rule. Prices remain per variant row with separate sale_price, no captured currency. Availability is an existing derivation from deleted/variant_active/stock/continue_selling; it does not prove product stock/lifecycle status. Artifact acquired_at is not a provider observation timestamp.

Plan:
1. Add focused RED tests with synthetic XLSX bytes and the existing isolated readiness fixture. Cover supported identity/name/URL, variant separation, absent/blank values, unresolved categories/price/availability, unsupported stock/status/currency, empty outcomes, freshness, multi-Job provenance and invalid artifacts.
2. Add mapped-header metadata to the existing parser without changing its rows/normalization. Add an İkas-local inspector reusing it and the supported sanitized FILE_IMPORT context, never the original path.
3. Extend the existing Blog field helper/evaluator for PRODUCTS, reuse field counts and blocker codes, retain unresolved semantics explicitly. No required value is synthesized; no product/variant aggregation or deduplication. Keep independent provenance, unchanged immutable drafts and delivery NOT_EVALUATED.
4. Adapt only affected synthetic readiness expectations for three remaining unimplemented families. Preserve KWP behavior and run its regression.
5. Run new tests, source/import tests, v2 suites, v1 deterministic gate, accepted loader, TypeScript, lint and diff check; document exact results and remaining approval/source gaps.

Acceptance: eight required fields have honest source-backed observations or explicit blockers. Missing URL remains missing; no variant-to-product ID substitution, arbitrary price/category/status mapping or freshness rule. Existing KWP/source semantics and reports remain unchanged. No real data or live/import acceptance claim.

## Verified implementation result

Implemented the product inspection path above existing accepted-evidence loading.
The parser adds mapped_fields header metadata only; existing rows and source
validator/acquisition behavior remain unchanged. The new source inspector checks
sanitized FILE_IMPORT identity and exact workbook bytes, catches unsupported
representations/invalid numeric data and URL shapes, and exposes actual source
presence and semantic limitations. No original import path is reopened.

Changed in this slice (in addition to preserved pre-existing KWP WIP):
- `src/main/sources/ikas/ikas-products-parser.ts`
- `src/main/sources/ikas/ikas-products-field-inspector.ts` (new)
- `src/main/blog-writing-packs/blog-writing-pack-v2-field-compliance.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts`
- `src/shared/blog-writing-pack-v2-readiness.ts`
- `tests/integration/blog-writing-packs/blog-v2-ikas-fixture.cjs` (new)
- `tests/integration/blog-writing-packs/blog-v2-ikas-compliance.integration.cjs` (new)
- `tests/integration/blog-writing-packs/run-blog-v2-ikas-compliance-test.sh` (new)
- `tests/integration/blog-writing-packs/blog-v2-readiness-fixture.cjs`
- `tests/integration/blog-writing-packs/blog-v2-readiness.integration.cjs`
- `tests/integration/blog-writing-packs/blog-v2-field-compliance.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

Field matrix and current semantics are recorded in DATA_CONTRACTS.md:
- product_id is observed Product ID / Ürün Grup ID, distinct from variant_id.
- product_name aliases observed product_title; never derived from slug.
- product_url aliases observed url; missing column and blank cell are distinct;
  no domain, slug, ID or name construction is performed.
- native categories/categories_product_type/product_type strings stay separate;
  singular category selection and hierarchy/primary rules remain unapproved.
- price and sale_price stay per-row native numeric observations, including null
  and true zero. No arbitrary product price, variant merge, minimum or sale/list
  equivalence. Currency is not captured by current normalized source mapping.
- availability remains the existing variant-oriented derivation from flags/stock,
  including UNKNOWN. A raw availability column is overwritten by the existing
  parser's derivation; its presence is reported unresolved, never as missing or
  direct provider product availability. The original raw workbook is unchanged.
- stock_status and product_status have no approved mapping from numeric stock,
  availability, deleted/variant-active or sales-channel flags. They are UNSUPPORTED.
- acquired_at stays artifact acquisition provenance; observed_context remains
  unchanged/null. No provider observation timestamp or maximum age is invented.

Existing blocker codes reused: FIELD_ABSENT for absent supported columns;
FIELD_OBSERVATION_REQUIRED for blank required ID/name/URL observations;
FIELD_REPRESENTATION_INVALID for malformed/incompatible workbooks, source numeric
errors, identity schema or URL shape; EVIDENCE_INVALID for incompatible import
context; DECISION_REQUIRED for category/price/availability/freshness and existing
multi-Job coverage; SOURCE_CHANGE_REQUIRED for stock_status/product_status and
currency_context. Known unsupported fields now have UNSUPPORTED field status;
UNRESOLVED remains distinct from native observed/null counts. No new blocker code.

Per-Job product_issues carry only fixed safe conditions. Multiple selected Jobs,
variant rows and duplicate rows retain independent provenance and order. Frozen
draft and accepted bytes remain unchanged; newer Runs never float into membership.
LOW_DATA/NO_DATA retain existing source verdict and coverage decision; empty XLSX
fails the existing parser and cannot establish field coverage. Source VALID does
not imply Blog product compliance. The current requirements profile now separates
product decisions from the established source gaps. Sitemap/SERP/GA4 remain outside
field implementation. KWP provider semantics and its own tests remain unchanged.

TDD evidence: initial RED 0/11 before production changes; initial GREEN 11/11.
Added availability-column and blank-name/invalid-URL regressions. The availability
case was RED at 12/13 because the raw column was incorrectly classified ABSENT;
including that actual mapped column made it UNRESOLVED. Final GREEN 13/13.
The existing synthetic readiness fixture now supplies supported XLSX bytes/context;
its assertions distinguish three unchecked families from product and KWP blockers.

Fresh deterministic verification used Node 24.19.0 on PATH:

| Command | Result |
| --- | --- |
| `bash tests/integration/blog-writing-packs/run-blog-v2-ikas-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/sources/run-non-google-source-slices-test.sh` | NON-GOOGLE-SOURCES-001 PASS |
| `bash tests/integration/file-import/run-ikas-reviewed-file-import-test.sh` | 2/2 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-selection-test.sh` | 7/7 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-draft-test.sh` | 8/8 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh` | 14/14 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh` | Full deterministic v1 gate PASS, including its existing desktop smoke checks |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

Follow-up requires separate approval of singular category selection, product/variant
price and sale/list semantics, product availability, freshness age/timestamp basis
and multi-Job completeness. Capturing actual currency, stock status or product
lifecycle status may require source/import-schema extensions. Provider URLs must
come from actual evidence. No such acquisition/schema extension was implemented.
A separately authorized real accepted-artifact/import QA is required before claiming
this evaluator has real İkas acceptance. No live/import acceptance or delivery
acceptance is established; product and full Blog v2 coverage remain blocked.

Git baseline remains a99beaf on feat/google-analytics-4-source-v1. No staging,
commits or pushes. Existing KWP-specific source/test/runner/plan files and reports
are preserved by before/after SHA-256 comparison. No production imports, provider
calls, credentials, Runs, historical evidence, databases, exports or migrations
changed. All new XLSX data is synthetic and generated inside isolated tests.
