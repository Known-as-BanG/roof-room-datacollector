# Blog v2 Slice 3B.2B.3 — Sitemap field compliance

Authority: user-approved focused Sitemap slice. Preserve KWP/İkas WIP and reports. No source acquisition, Core, persistence, database, publication, commit or push changes.

Inspected existing Bitkimark HTTP_XML request, source and parser, accepted-artifact loader, shared Sitemap types and Blog field/evaluation seams. Parser preserves raw loc, nullable validated lastmod, URL versus SITEMAP entry type and document/parent identity; within-document duplicates and malformed entries fail. Source requests only selected verified URLs; indexes do not trigger traversal. changefreq/priority are not normalized. Existing URL-derived annotations are not page types or titles. Sitemap response status is document metadata, never per-page status.

Plan:
1. Add synthetic XML fixtures and failing tests for actual page URLs, missing/malformed loc, unsupported page_type/title/status, optional metadata, index versus URL_SET, duplicate handling, multi-Job provenance, completeness and empty outcomes.
2. Add a source-local inspector reusing existing context validation/parser, using artifact acquisition time only for existing retrieved_at provenance. No parser or acquisition change. Preserve rows, original loc and existing URL rules.
3. Integrate SITEMAP_URLS into the existing Blog field helper/evaluator with existing unsupported status/blocker conventions. Index loc is child-document identity, not a page inventory; website scope stays DECISION_REQUIRED even for one Job. No titles/types/status inference or separate HTTP requests.
4. Update only affected readiness fixtures/expectations for two remaining unchecked families; preserve other source semantics and exact WIP files.
5. Run new suite, existing source/parser gate, all relevant v2 regressions, v1 deterministic gate, accepted loader, TypeScript, lint and diff check. Document exact results and gaps.

Acceptance: URL_SET loc can establish observed url only; page_type/title/per-page status remain source gaps. Metadata is not repurposed; empty/index/multi-Job evidence cannot imply full site coverage. No current-time/freshness default or provider observation is invented. All new evidence is synthetic and local.

## Verified result

Implemented `inspectSitemapFields` in a new source-local inspector, integrated
through `inspectBlogWritingPackV2Fields` and `evaluateBlogWritingPackV2Readiness`.
The existing parser, source fetch, request contract, validator, loader and shared
draft/type contracts remain unchanged. The helper now accepts optional artifact
acquired_at for this source, with no current-time/lastmod fallback. Other source
inspection paths keep their existing behavior.

Files changed in this slice:
- `src/main/sources/bitkimark/bitkimark-sitemap-field-inspector.ts` (new)
- `src/main/blog-writing-packs/blog-writing-pack-v2-field-compliance.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts`
- `tests/integration/blog-writing-packs/blog-v2-sitemap-fixture.cjs` (new)
- `tests/integration/blog-writing-packs/blog-v2-sitemap-compliance.integration.cjs` (new)
- `tests/integration/blog-writing-packs/run-blog-v2-sitemap-compliance-test.sh` (new)
- `tests/integration/blog-writing-packs/blog-v2-readiness-fixture.cjs`
- `tests/integration/blog-writing-packs/blog-v2-readiness.integration.cjs`
- `tests/integration/blog-writing-packs/blog-v2-field-compliance.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

Field matrix: URL_SET loc supplies observed url only; page_type/title/per-page
status have no supported normalized observations and stay UNSUPPORTED with
SOURCE_CHANGE_REQUIRED. Sitemap-index loc is preserved as SITEMAP child-document
identity, with url UNRESOLVED for the webpage contract, DECISION_REQUIRED
(sitemap_document_kind), and a URL observation blocker. No child sitemap traversal
or page classification occurs. Successful mocked HTTP 200 remains document metadata,
not each page's status. No fields are synthesized from slugs, annotations or XML
metadata. lastmod remains observed ISO text/null. changefreq/priority stay only
in raw XML because the existing parser does not normalize them; no new meanings.

Rows retain source_url, parent_sitemap_url, document_kind, entry_type and retrieved_at
as in the existing loader. retrieved_at is artifact acquisition provenance, not
provider page observation time. Frozen requested/observed contexts and every
Run/Job/Attempt/Validation/Artifact reference remain unchanged. Missing acquisition
time fails inspection instead of inventing a timestamp. Existing loc preservation
and URL validation rules remain intact.

Existing parser rejection of missing/blank/malformed/off-host loc, unsupported XML,
duplicate loc within a document and unverified index children is preserved. Equal
URLs across independently selected Jobs remain separate, with no merging or
deduplication. Site inventory scope is DECISION_REQUIRED even for one accepted
Job or cleared decision lists. Existing multi-Job and real-profile freshness
policies remain unresolved. No new freshness threshold was introduced.

Existing blocker codes reused: FIELD_REPRESENTATION_INVALID for incompatible XML
or observations; EVIDENCE_INVALID (sitemap_request_context) for unsupported request
context; FIELD_OBSERVATION_REQUIRED for empty/unproven URL evidence;
SOURCE_CHANGE_REQUIRED for page_type/title/status; DECISION_REQUIRED for website
scope/index interpretation. Empty VALID/NO_DATA/LOW_DATA cannot prove coverage;
warning validation-outcome blockers remain independent. No new blocker code.

TDD: initial RED 0/11 before implementation; GREEN 11/11 after the minimum path.
Additional URL-preservation/no-time-fallback assertions passed; final GREEN 12/12.
The readiness fixture now uses supported synthetic XML/context for Sitemap, and
its assertions distinguish two unchecked families from actual Sitemap/KWP/İkas
gaps. No existing identity, integrity, source semantics or delivery check was
weakened. Fixture XML and page paths are generated locally, using the required
configured host only; no real site evidence was copied or fetched.

Fresh deterministic verification used Node 24.19.0 on PATH:

| Command | Result |
| --- | --- |
| `bash tests/integration/blog-writing-packs/run-blog-v2-sitemap-compliance-test.sh` | 12/12 PASS |
| `bash tests/integration/sources/run-non-google-source-slices-test.sh` | NON-GOOGLE-SOURCES-001 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-selection-test.sh` | 7/7 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-draft-test.sh` | 8/8 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh` | 14/14 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-ikas-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh` | Full deterministic v1 gate PASS, including its existing desktop smoke checks |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

Required follow-ups remain separately approved actual page-title observations,
page-type evidence/rules and per-page HTTP-status acquisition, plus website
selection/completeness and any real-profile freshness policy. This slice adds
none of those acquisition capabilities. Real accepted-artifact/provider QA is
needed before claiming this evaluator's real Sitemap acceptance. Existing source
history does not establish acceptance for this new evaluator. Delivery remains
NOT_EVALUATED and full Blog v2 readiness/delivery is not claimed.

Baseline a99beaf on feat/google-analytics-4-source-v1; no staging, commits or pushes.
Prior KWP/İkas-specific source/test/plan files remain byte-identical by SHA-256;
existing reports retain their earlier recorded hashes. No live website/provider
requests, production imports/Runs/databases/evidence/exports, frozen-draft mutation,
credentials, unrelated source changes, migrations or publication occurred.
