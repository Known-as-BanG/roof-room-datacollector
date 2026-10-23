# RoofRoom Data Collector — Project Handoff

## Current Collector direction — 2026-10-23

This routing section governs the next work; earlier implementation checkpoint
notes below remain preserved evidence, not authorization to expand this task.
Product/architecture/source/package invariants remain in their canonical documents.

**Repository snapshot:** root checkout is `/Users/furkan/Projects/roofroom-data-collector`
on `fix/google-ads-reporting-metrics` at `fdf2dc98ba2adde5d619a0dfe9aa056add1133b9`.
Active worktree is `.worktrees/google-analytics-4-source-v1`, branch
`feat/google-analytics-4-source-v1`, starting HEAD
`6dd1d5f246c31a9706d9d9f50c11999a3946bb44`. Existing upstream is
`origin/feat/google-analytics-4-source-v1`; its observed remote tip is
`a1015a489bb6fa1b190ba997eeefb2456f9492dc`, three implementation commits behind.
The index was empty. Tracked/untracked implementation WIP, earlier documentation
edits, private reports and other worktrees must stay separate from this task's
authorized documentation-only commit/push. Inspect actual ancestry and staged
scope before publishing; do not silently include unrelated pending commits.

**Current capability truth:** general exports are already Run-bound and preserve
accepted raw evidence plus manifests/provenance, with truthful stable partial
snapshots. Their current destination is application-owned Run export storage;
the native export-time destination-parent picker is **not implemented**. GA4
Content v1/v2 and Paid Funnel acquisition/normalization exist; local export
integration and Ads configuration follow-ups remain WIP. Prior deterministic and
synthetic packaged receipts do not establish expanded live acquisition. İkas is
XLSX FILE_IMPORT; direct API is desired feasibility work. Semrush remains future
scope/feasibility. Trends is controlled browser/provider-CSV acquisition, not an
official API. GT01 partial delivery and KWP01's single live Run are bounded prior
acceptance, not source-wide production readiness. The final Keychain-dependent
runtime check remains pending by user choice; no general-export Open/Reveal
acceptance is established by specialized JSON access tests.

**Development priorities:**

1. Preserve the real branch/worktree and implemented/verified/unverified distinctions.
2. Implement the approved per-invocation general export parent-directory picker
   through existing privileged desktop mechanisms: cancellation creates nothing,
   each selected Run gets its own child, no silent overwrite, original evidence
   stays protected. Product contract: `PROJECT_SPEC.md`; focused checks: `TEST_STRATEGY.md`.
3. Separately authorize bounded real collection → accepted raw evidence → Run
   export acceptance. A Blog Run and an Ads Run deliver separate folders; general
   export never automatically combines unrelated Runs.
4. Establish supported direct acquisition feasibility for genuinely manual gaps
   (İkas API, Semrush); no speculative API or new Release 1.0 commitment.
5. Verify practical completion/status/destination reporting and any implemented
   general-export Open/Reveal behavior at the actual changed desktop boundary.

General Collector delivery is independent of specialized Blog/Ads completeness.
Keep existing Blog v2 selection, verified JSON access and selected-window GSC
finality work; `gsc_latest_window`, Planner calendar/currency and other mandatory
specialized blockers remain. Further Blog field-compliance work is separately
approved work, not the next prerequisite for general delivery. No analysis,
recommendations, content generation, scoring, business decisions or automatic
ChatGPT uploads. Users manually import exported files into ChatGPT Projects.

The documentation-only reconciliation changes no runtime behavior and grants no
live-provider, production export, credential, Keychain or packaging authorization.
Commit/push authority here covers only this task's documentation, not existing WIP.

## Preserved implementation checkpoint

**Checkpoint date:** 2026-10-20 — Google Trends evidence and stable partial export.
**Current branch:** `feat/google-analytics-4-source-v1`.
**Scope and Git:** the reviewed work extends Collector checkpoint `a1015a4` on the
existing feature branch. It contains Google Trends CSV/scope compatibility,
packaged SQLite resolution and source-neutral partial export; no new GA4 source
work is included. The final scope/verification/controlled-commit record is
`docs/superpowers/plans/2026-10-20-google-trends-final-review.md`.

## Current acceptance

| Layer | Verified boundary |
| --- | --- |
| Implemented | Observed Turkish weekly CSV compatibility; trusted group/explicit-date selection; Review/Start scope checks; packaged `node:sqlite` resolution; stable partial general export |
| Deterministic | Focused parser/production-validator, controller, export, renderer, TypeScript and lint checks. The final review adds a regression for clearing both source task IDs while retaining the root reviewed task identity |
| Real provider evidence | The historical five-Job Run's GT01 Attempt 2 is COMPLETED/VALID (15/15). Native CSV is 2691 bytes and matches its persisted SHA-256; Excel derivative matches all 525 observations and 205 literal zeros. Attempt 1 remains RATE_LIMITED/HTTP 429 |
| Packaged/runtime and delivery | Prior isolated packaged QA exercised both general export modes through actual UI/IPC. Exported GT01 CSV matches the original bytes/hash; all five Jobs and both GT01 Attempts remain traceable. Published snapshot is INCOMPLETE; historical Run is RETRY_REQUIRED |
| Final review hardening | The missing-source-task-ID bypass was reproduced and corrected in the controller. Its new adversarial case is deterministically verified; prior packaged receipts predate this final guard addition |

Detailed immutable QA evidence remains in
`reports/qa/gt01-attempt-2-accepted-evidence-2026-10-20.md` and
`reports/qa/partial-evidence-export-2026-10-20.md`. The first report records the
former terminal-only export blocker; the later implementation/report supersedes
that export limitation through approved stable partial snapshots. Historical
report contents and evidence files are preserved.

**Open boundaries:** GT02–GT05 remain FAILED; the historical five-Job Run did not
complete. The separately authorized isolated one-Job scope test ended RATE_LIMITED
and must not share provenance with the accepted historical Attempt 2. Google Trends
acquisition beyond the recorded GT01 case, other sources' live acceptance,
large-volume reliability, release/distribution and an installed-app update are not
established. The production application installation remains unchanged. No new live
collection or production mutation is part of this checkpoint.

**Current action:** preserve the accepted evidence and immutable partial exports.
No repeat collection is needed to deliver the GT01 evidence already exported.
Further acquisition, retries or production installation require a separate scope.
General export remains independent of specialized Blog eligibility; Blog v2 source
coverage/publication blockers and previously recorded source limitations below
remain unchanged. Prior broader raw-export/readiness evidence is routed through
`docs/superpowers/plans/2026-10-20-desktop-raw-export-completion.md`,
`docs/superpowers/plans/2026-10-20-isolated-packaged-acceptance.md` and
`docs/superpowers/plans/2026-10-19-development-checkpoint.md`.

---

## 1. Purpose

This file records only the latest verified repository state, material open acceptance boundaries, closed areas, and the next safe action.

It is the router for current work, not a historical changelog.

For stable product, architecture, contracts, validation, testing, or historical rationale, use the authority table below.

---

## 2. Repository state

Authoritative repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Observed current state:

    branch:                     feat/google-analytics-4-source-v1
    latest reviewed work:       Google Trends evidence and stable partial export

The Conversion Configuration production implementation is committed. The focused Conversion Configuration gate and this canonical documentation update form the slice-closing checkpoint that contains this handoff revision.

Observed implementation checkpoints on this branch:

- `09f7bfc` — define the six-dataset Conversion Configuration contract and exact GAQL;
- `6404296` — normalize the six provider-native resources;
- `f032c54` — collect the six datasets through the existing configuration source;
- `b0dbd78` — validate conversion configuration and tracking-settings cardinality;
- `e473870` — verify production registration of the full configuration family and existing connection reuse.

Local and remote feature/fix branches used by the completed work were cleaned up after their relevant commits or patch-equivalent changes were integrated.

---

## 3. Current product state

Release 1.0 local multi-source Collector implementation is complete.

The application now includes:

- Workspace-owned Runs;
- source-keyed multi-source Jobs;
- immutable Attempt history;
- resume, reconciliation, explicit retry, cancellation where safely supported;
- schema-v8 persistence;
- Saved Collection Presets and Last Run Settings;
- Workspace source connections and safe readiness state;
- source-neutral freshness evaluation;
- secure credential boundaries and packaged connection/remediation flows;
- accepted-evidence access;
- generalized Production Data Package export;
- post-R1 desktop UX/operations hardening;
- Google Ads SEARCH reporting family;
- Google Ads configuration Negatives v1 and Conversion Configuration v1 snapshot family;
- `ADS_OPTIMIZATION_PACK v2` with historical v1 read compatibility;
- `BLOG_WRITING_PACK v1`.

Google Trends remains the reference browser-export source, not the generic Core model.

---

## 4. Current persisted baseline

Current SQLite schema version:

```text
8
```

Implemented tables:

```text
schema_migrations
workspaces
runs
jobs
attempts
artifacts
validations
saved_collection_presets
workspace_last_run_settings
workspace_source_connections
```

Important current contracts:

- every Run belongs to exactly one Workspace;
- one Workspace may have at most one active Run in `PENDING`, `RUNNING`, or `MANUAL_ACTION_REQUIRED`;
- `RETRY_REQUIRED` is non-terminal but does not occupy the active slot;
- retry reacquisition, Job transition, and next Attempt creation are atomic;
- a Job is identified within a Run by `source_id + job_key`;
- `query_group_id` is nullable and Google-Trends/legacy-specific;
- non-Google-Trends Jobs never fabricate query groups;
- freshness is derived from accepted completed Job history rather than a freshness cache;
- credential secrets remain outside SQLite behind the privileged credential boundary.

Exact persisted contracts belong in `DATA_CONTRACTS.md`.

---

## 5. Source and dataset state

### Release 1.0 source paths

Local implementation is complete for the approved R1 source paths:

- Google Trends Interest Over Time;
- Google Search Console;
- legacy Google Ads Search Terms;
- Google Ads Keyword Planner API;
- Keyword Planner manual CSV;
- İkas Products XLSX;
- Bitkimark sitemap/XML;
- SerpApi on-demand SERP.

### Later completed expansions

Also implemented:

- GSC query-only `QUERY` datasets and Query × Page `QUERY_PAGE` datasets;
- adjacent Current/Previous 28-day GSC query Jobs;
- GSC Query × Page 28-day, 90-day, and long-window reviewed tasks;
- six-dataset `google-ads-search-reporting` SEARCH family:
  - `CAMPAIGN_PERFORMANCE`
  - `AD_GROUP_PERFORMANCE`
  - `KEYWORD_PERFORMANCE`
  - `SEARCH_TERMS`
  - `AD_PERFORMANCE`
  - `RSA_ASSET_PERFORMANCE`
- reporting schema v2 remains the default; the separate Conversion-Date Performance task explicitly acquires three schema-v3 datasets; historical schema v1 evidence remains readable but not reacquirable;
- schema v2 Campaign/Ad Group/Keyword reporting preserves conversion-efficiency metrics plus Search Top/Absolute Top impression share as distinct provider-native fields;
- eleven-dataset `google-ads-configuration` snapshot family composed of:
  - Negatives v1:
    - `CAMPAIGN_NEGATIVE_KEYWORDS`
    - `AD_GROUP_NEGATIVE_KEYWORDS`
    - `SHARED_NEGATIVE_KEYWORDS`
    - `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
    - `ACCOUNT_NEGATIVE_KEYWORD_LISTS`
  - Conversion Configuration v1:
    - `CONVERSION_ACTIONS`
    - `CUSTOMER_CONVERSION_GOALS`
    - `CONVERSION_GOAL_CAMPAIGN_CONFIGS`
    - `CAMPAIGN_CONVERSION_GOALS`
    - `CUSTOM_CONVERSION_GOALS`
    - `CUSTOMER_CONVERSION_TRACKING_SETTINGS`
- immutable configuration schema-v1 Job context with no requested date window;
- provider-native Conversion Configuration normalization preserving null, real false/zero values, lifecycle/status evidence, ownership, and custom-goal membership without requested-to-observed fabrication;
- tracking-settings validation requiring exactly one normalized customer row, including valid `NOT_CONVERSION_TRACKED` evidence;
- deterministic Keyword Planner 3-month and YoY derived change fields from accepted monthly history;
- `ADS_OPTIMIZATION_PACK v2`;
- `BLOG_WRITING_PACK v1`.

Performance Max remains outside the approved Google Ads reporting contract.

---

## 6. Current credential and connection boundary

Current production credential behavior includes:

- shared Google OAuth application configuration behind the main/Core boundary;
- Workspace/account metadata kept separate from secret material;
- OAuth refresh credentials behind the credential store;
- SerpApi API-key storage behind the same privileged security boundary;
- main-owned native macOS masked secret ingress;
- safe renderer-visible connection/readiness states only.

The Google Ads Developer Token is retired from active application behavior. Legacy persisted fields may remain readable only for backward compatibility.

The full Google Ads configuration family, including Negatives v1 and Conversion Configuration v1, reuses the existing Workspace Google Ads connection keyed by the legacy Search Terms source. It does not create a separate configuration-source credential or Workspace connection record.

Do not reintroduce Developer Token setup as a current requirement without a new approved contract.

---

## 7. Current package boundaries

### Production Data Package

The generic Production Data Package consumes accepted evidence and keeps source datasets separate.

It does not perform cross-source analysis.

### `ADS_OPTIMIZATION_PACK v2`

A source-neutral Task Package layer above accepted evidence.

It:

- requires the six approved Google Ads SEARCH reporting datasets at dataset schema v2;
- uses exact compatible accepted evidence;
- rejects historical schema v1 evidence as CURRENT or PREVIOUS input for the active v2 recipe while preserving historical v1 readability;
- may deterministically filter broader DAILY evidence only by real `performance_date` rows;
- never reconstructs, interpolates, allocates, averages, or infers unavailable source evidence;
- does not own provider acquisition or retry;
- preserves immutable package provenance.

The desktop Review/Start/Open workflow is deterministically implemented.

Expanded live acceptance for the six-dataset reporting family remains separate from deterministic completion.

### `BLOG_WRITING_PACK v1`

Latest verified implementation checkpoint: `33f4734`, followed by validated repair commits and the current documentation checkpoint.

The Blog package:

- is a thin single-Run specialization over Production Data Package;
- has a fixed seven-family recipe;
- records truthful COMPLETE/PARTIAL/MISSING/verified-NO_DATA coverage;
- excludes out-of-recipe evidence before loading;
- preserves Keyword Planner API/manual provenance separately;
- publishes immutable `BLOG_PACKAGE.json` and `BLOG_WRITING_PACK.xlsx`;
- builds/opens/reveals locally without provider acquisition, retry, new Attempts, Run/Job mutation, or schema migration.

Fresh deterministic verification and packaged arm64 acceptance passed. No live provider request was made for this slice.

### `BLOG_WRITING_PACK v2` JSON-only publication

The approved 2026-10-18 contract is canonical in `DATA_CONTRACTS.md`. The additive
programmatic publisher stages verified raw/acquisition bytes, samples creation
time, reevaluates actual readiness and atomically commits verified JSON only when
all mandatory checks pass. Every selected member's identity/integrity remains
required, including optional Trends. No replacement evidence, cached verdict,
workbook or desktop publication flow is introduced. Planner's unknown calendar
context and GSC's unestablished finality are explicit publication blockers; earlier
field/coverage blockers remain. Execution and verification are recorded in
`docs/superpowers/plans/2026-10-18-blog-writing-pack-v2-json-publication.md`.

### `BLOG_WRITING_PACK v2` draft membership

The 2026-10-17 approved delivery requirements and explicit resolutions of older
slice-era assumptions are canonical in `DATA_CONTRACTS.md`. These approvals do
not establish source support or provider acceptance. The slice summaries below
describe the implementation checkpoints. The subsequent GA4 metric/property-window
follow-ups change only GA4 metrics/validation/inspection and its requirements
defaults; other conservative blockers remain effective in the publication path above.

The implementation adds a version-specific selection resolver and draft assembler
above existing accepted evidence. Assembly revalidates exact Run/Job/Attempt/
Validation/Artifact identity, Workspace ownership, and raw artifact integrity.
`BlogWritingPackStore.saveDraft/readDraft` persists fixed multi-Run membership in
`BLOG_DRAFT.json`, with `state: DRAFT` and `readiness_status: NOT_EVALUATED`.
The existing v1 publication/open paths do not accept drafts as delivery packages.

No SQLite migration, Core lifecycle change, normalized row export, workbook,
desktop v2 build flow, final coverage evaluation, or live acceptance is included.
The additive disk contract is in `DATA_CONTRACTS.md`; the focused execution record
is `docs/superpowers/plans/2026-10-15-blog-writing-pack-v2-draft-membership.md`.

Slice 3B.1 adds an in-memory evaluator against the existing stored draft. It
revalidates exact frozen evidence through Slice 1, checks seven mandatory families
and explicitly supplied GSC requested endpoints, and reports decision/source-change
blockers. Coverage is restricted to explicit supported checks; delivery remains
NOT_EVALUATED. The supplied current real requirements profile remains blocked.
It changes no draft bytes, membership rules, source acquisition, or v1 behavior.
The execution record is `docs/superpowers/plans/2026-10-15-blog-writing-pack-v2-readiness.md`.

Slice 3B.2A adds actual Ads/GSC source-field presence and normalization checks
through the verified accepted-artifact loader. Read-only field summaries distinguish
observed values, compatible nulls, absent fields and empty evidence; no row data
is persisted. Ads has no inferred reporting window; explicit approved endpoints
are required. GSC reuses the exact 28-day endpoint validation, with page → page_url
and position → average_position downstream aliases. The other five mandatory
families remain explicitly unresolved even if a caller clears decision lists.
Frozen drafts, source verdicts and v1 remain unchanged. This slice includes no
live, packaged, publication or production-data acceptance. Execution record:
`docs/superpowers/plans/2026-10-15-blog-writing-pack-v2-ads-gsc-compliance.md`.

Slice 3B.2B.1 adds source-backed Keyword Planner API/manual CSV field inspection
through the same evaluator and accepted-artifact seam. Provider-observed identity,
raw presence, history, currency units and competition category/index stay distinct.
The evaluator requires explicit Blog scope rather than inheriting acquisition
constraints; the new Blog contract independently approves 12 completed months.
API currency, manual structured request scope and Blog keyword completeness remain
explicit blockers; no acquisition change or real-data acceptance is included.
Execution record: `docs/superpowers/plans/2026-10-15-blog-writing-pack-v2-keyword-planner-compliance.md`.

Slice 3B.2B.2 adds accepted İkas workbook inspection and mapped-column metadata
without changing existing normalized rows or import acquisition. Product-group
identity, variant granularity and observed name/URL remain intact; category,
product price/availability, stock/lifecycle status, currency and freshness gaps
remain explicit. No URLs, product states, prices or timestamps are reconstructed.
Keyword Planner compliance is included in the same checkpoint. Execution record:
`docs/superpowers/plans/2026-10-16-blog-writing-pack-v2-ikas-compliance.md`.

Slice 3B.2B.3 adds Sitemap URL field inspection above unchanged XML acquisition
and parsing. URL sets establish observed loc values; indexes retain child-document
identity without implying webpage inventory. Page type, title and per-page HTTP
status remain explicit source gaps; document HTTP success/lastmod are not reused
as page observations. Site completeness remains a decision even for one Job.
KWP/İkas compliance is included in the same checkpoint. Execution record:
`docs/superpowers/plans/2026-10-16-blog-writing-pack-v2-sitemap-compliance.md`.

Slice 3B.2B.4 adds accepted SERP field inspection using the unchanged parser and
request contract. Query is a request dimension verified against provider q;
positions remain organic-only, PAA rows stay separate and domain is explicitly
derived from observed link. Follow-ups derive capture_date only from verified
collector receipt and replace capture/freshness decision messages with mandatory
draft-time evidence/age checks. Other scope blockers remain, including exact query
coverage. No lifecycle, requested or provider date can substitute for receipt.
No real-provider or delivery acceptance is included.
The acquisition follow-up captures receipt after full response-body acquisition
and before decoding/parsing, using existing acquisition_metadata and immutable
Attempt-scoped metadata files. Accepted loading validates bindings; v2 membership
freezes optional serp_acquisition with timestamp, collector origin and metadata
hash/path/size. Frozen legacy acquired_at still copies artifact.created_at; missing
receipt evidence is never reconstructed. Controlled synthetic runtime verifies
distinct failed/retry Attempt provenance, delayed artifact registration, accepted
loading and draft reload. Draft creation remains membership-only; readiness uses
draft.created_at by default or explicit evaluated_at for SERP reevaluation, without
changing GA4's reference. Derived counts distinguish capture dates from provider
observations. Fresh/stale checks preserve membership and source acceptance.
The additive v2 JSON publisher above independently checks freshness at package
creation; draft-time tests alone do not prove package-time expiry.
Execution record: `docs/superpowers/plans/2026-10-16-blog-writing-pack-v2-serp-compliance.md`.

Slice 3B.2B.5 checks actual GA4 Content Performance bundles with existing source
validation/normalization. landingPage paths and native sessions/engagement/key-event
observations are preserved. `(not set)` stays raw/normalized provider text but does
not count as an identified landing page; placeholder-only or mixed sets retain an
explicit observation blocker. The metric-completion follow-up adds Content raw
bundle v2 with totalUsers and userEngagementDuration; native total_users and
user_engagement_duration stay separate from active_users and the inspector's
users alias / derived seconds-per-session. Missing inputs or nonpositive sessions
produce null with explicit reasons; malformed numbers fail closed. Legacy v1 keeps
its native row shape and explicit metric gaps. Header/version and normalized row-
count validation fail closed; 250,001-row pagination and both old/new placeholder
behavior are deterministically covered. Property/window follow-up now validates
explicit frozen property and all supplied response timezone observations, derives
last-28-completed-day endpoints at draft.created_at and reports per-Job expected-
window provenance. Missing/invalid/conflicting metadata, cross-Job property/timezone
conflicts and wrong windows remain explicit blockers; legacy context is not repaired.
Independent coverage and provider acceptance remain open. Execution record:
`docs/superpowers/plans/2026-10-16-blog-writing-pack-v2-ga4-compliance.md`.

---

## 8. Verification and live-evidence boundaries

Current evidence includes deterministic release-gate success across the implemented Core/source/package surface and successful local arm64 packaging.

Previously recorded real/live acceptance includes bounded evidence for:

- Google Trends;
- Google Search Console;
- Bitkimark root sitemap;
- real İkas workbook parsing;
- real Keyword Planner manual CSV;
- a bounded Keyword Planner official-API run;
- the legacy Google Ads `search_term_view` SEARCH proof.

SerpApi secure provisioning has packaged human-observed acceptance, but credential provisioning is not provider collection acceptance.

The expanded six-dataset Google Ads SEARCH reporting family is deterministically complete; live acceptance for the additional resources remains a separate explicitly authorized step.

Google Ads configuration Negatives v1 remains deterministically verified across its five dataset contracts.

Conversion Configuration v1 is implemented and deterministically verified across its six dataset/resource contracts, exact GAQL, provider-native normalization, raw SearchStream acquisition, fail-closed semantic validation, five-dataset verified `NO_DATA` behavior, exactly-one-row tracking-settings cardinality, production registration, existing Ads connection reuse, and snapshot-specific capability behavior.

The focused Conversion Configuration gate passed with `PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-GATE-001`. The Negatives gate, production source-composition test, and Google Ads SEARCH reporting gate also passed after the conversion changes, without live-provider calls. `npx tsc --noEmit` passed.

The literal nested-worktree `npm run lint` invocation reproduced the previously observed duplicate `eslint-plugin-import` resolution failure from the worktree and parent repository configurations. With the worktree-local ESLint configuration isolated via `--no-eslintrc --config`, lint exited 0 with zero errors and two non-blocking `import/no-duplicates` warnings in the existing configuration-source import structure. Repository lint configuration was not changed.

Live-provider acceptance for Conversion Configuration v1 was not performed. No packaged/runtime acceptance claim is made for this slice.

Do not convert deterministic, packaged, credential, or feasibility evidence into a live-provider claim.

---

## 9. Closed areas

Do not reopen without new failing evidence or explicit scope approval:

- local-first one-app / multi-source architecture;
- Workspace ownership and one-active-Run database rule;
- source-keyed Jobs and nullable GT-only `query_group_id`;
- immutable Attempt history;
- raw-evidence preservation;
- missing-is-not-zero semantics;
- requested-versus-observed separation;
- execution-versus-validation separation;
- provider semantics staying outside generic Core;
- credential secrets staying outside renderer and ordinary config;
- source-neutral freshness separation;
- current R1 acquisition-mode boundaries;
- Google Trends relative-interest semantics;
- current safe connection/readiness IPC boundary;
- Developer Token retirement;
- Task/Blog package non-acquisition boundary;
- Performance Max remaining outside the approved SEARCH family.

---

## 10. Exact next action

Completed deterministic source checkpoints:

- Google Analytics 4 source vertical slice;
- Google Ads Change History source vertical slice;
- Google Keyword Planner validator migration;
- Google Ads Campaign Settings v1 gate;
- Google Ads Negatives v1 checkpoint;
- Google Ads Search Reporting checkpoint;
- Google Ads Growth provider-target execution binding.

Next:

1. Use `DATA_CONTRACTS.md` → `BLOG_WRITING_PACK v2` approved delivery requirements
   (2026-10-17) for the approved semantics, exact earlier-contract resolutions,
   remaining decisions and source limitations; these remain authoritative for
   follow-up work.
2. GA4 Content metric and property/timezone/window compliance are deterministically
   implemented. Keep legacy missing provenance blocked without automatic repairs.
   Independent coverage and real source/API acceptance remain separate boundaries;
   live execution requires its own explicit scope.
3. Keep required KWP keyword completeness, exact SERP query selection, provider-
   supported İkas stock/status rules, Sitemap scope/page-type/controlled acquisition,
   independent coverage/freshness decisions open. Missing legacy GA4 property or
   timezone evidence remains an explicit per-artifact blocker.
   Real feasibility, currency/missing fields, provider acceptance, a successful
   real-evaluator v2 publication and full delivery remain unproven. JSON mechanics
   and independent publication-time checks are verified above. Preserve blocked-family status and v1/
   Ads Growth boundaries; a later implementation requires its own task scope.

Do not run live provider requests merely to reconfirm already deterministic results.

---

## 11. Authority routing

| Need | Authority |
|---|---|
| Current repository state / next action | `PROJECT_HANDOFF.md` |
| Product scope / stable acceptance boundary | `PROJECT_SPEC.md` |
| Component ownership / dependency direction | `ARCHITECTURE.md` |
| Persisted contracts / nulls / provenance | `DATA_CONTRACTS.md` |
| Evidence acceptance semantics | `VALIDATION_SPEC.md` |
| Test depth / regression / live gates | `TEST_STRATEGY.md` |
| Adding or extending a source | `SOURCE_MODULE_GUIDE.md` |
| Historical architectural rationale | `DECISIONS.md` |

Read only the smallest authority set required by the task.

`DECISIONS.md` is cold history and should not be loaded for ordinary implementation work.

---

## 12. Evidence discipline

Keep these claims distinct:

- planned;
- implemented;
- deterministically verified;
- packaged/runtime verified;
- feasibility approved;
- live-provider verified.

Never upgrade one category into another without evidence.

---


## Asset collection preset checkpoint

Current verified Saved Preset catalog for the Bitkimark Production Workspace:

- `Google Ads Growth`
- `Blog - 7 Day`
- `Blog - 14 Day`
- `Blog - 30 Day`

`Google Ads Growth` preserves the existing Growth preset identity and the approved Growth evidence-source configuration. That preset/configuration completeness must not be read as packaged/runtime or live-provider acceptance.

The Growth execution contract is deterministically verified at the Review/Start boundary: required Google Ads `customer_id`, GA4 `property_id`, and GSC `site_url` values are hydrated from canonical Workspace connection metadata into resolved execution configuration, persisted into relevant immutable Job `source_context`, and validated against the active Workspace connection before provider interaction. Missing required target metadata blocks Growth planning, and post-Review Workspace target drift fails closed rather than silently retargeting collection.

The three Blog presets share the same seven evidence families:

- Google Trends Interest Over Time
- Google Search Console Query × Page
- Google Ads Search Terms
- Google Keyword Planner historical metrics
- İkas Products
- SerpApi Google SERP
- Bitkimark Sitemap

Only the GSC Query × Page and Google Ads Search Terms rolling request windows vary between the Blog presets. Their reusable configurations retain relative 7/14/30-day policies, while Review/Start resolves those requests into exact absolute dates for execution and the Run configuration snapshot.

Google Trends retains its existing 24-calendar-month policy. Keyword Planner, İkas, Sitemap, and SerpApi retain their own source semantics.

The Saved Preset seed path is idempotent:

- existing target presets are updated in place;
- the legacy `Google Ads Growth Rebuild` record migrates to `Google Ads Growth` without replacing its `preset_id`;
- the legacy `Blog Agentic Content Research` record migrates to `Blog - 30 Day` without replacing its `preset_id`;
- missing `Blog - 7 Day` and `Blog - 14 Day` records are created;
- conflicting legacy/target duplicates fail closed instead of being silently deleted or merged.

Production persistence was reconciled against the Bitkimark Production Workspace after a verified SQLite backup. Exact persisted configurations were compared with the production preset factories, and the unrelated `Bitkimark - Test` Saved Preset was preserved unchanged.

Deterministically verified:

- 7/14/30 desktop date-policy resolution;
- truthful GSC Query × Page and Ads Search Terms task identities;
- exact Growth and Blog reusable configurations;
- Growth provider-target hydration, immutable Job binding, missing-target planning blockers, and fail-closed target-drift protection;
- multi-source Review/Start absolute-window resolution with reusable-relative / run-snapshot separation;
- duplicate-free idempotent seed behavior and legacy identity preservation;
- existing desktop multi-source regressions;
- desktop UI preset lifecycle regressions;
- GA4 desktop planning regressions;
- TypeScript compilation.

No 15-day or 60-day asset preset variant is part of the current approved catalog.

Runtime visibility of the reconciled production Saved Preset catalog was explicitly observed in the development desktop runtime: Bitkimark Production was selected by default and the Saved Presets list showed Bitkimark - Test, Google Ads Growth, Blog - 7 Day, Blog - 14 Day, and Blog - 30 Day.

## Latest completed source checkpoints

Latest completed vertical slices:

- Google Analytics 4 source vertical slice
  Commit:
  161b2be feat: add google analytics 4 source vertical slice

- Google Ads Change History source vertical slice
  Commit:
  0cc9d20 feat: add google ads change history source vertical slice

### Completion details for Google Ads Change History

Completed deterministic verification:
- shared source contract
- provider request boundary
- raw artifact preservation path
- provider row normalization
- fail-closed validation
- production runtime registration
- validator registration
- export/package loading

Architecture verification:
- Provider-specific Google Ads Change History semantics remain outside Core.
- Source identity and dataset identity are represented through shared contracts.
- Core remains source-neutral.

### Verification boundary

Completed:
- deterministic integration verification

Not performed:
- live Google Ads API verification
- real credential verification
- packaged desktop runtime verification

These require separate explicit verification scope.

---

## Keyword Planner validator migration checkpoint

Completed:
- Google Keyword Planner validation ownership moved from generic Google API validator path to dedicated KeywordPlannerValidator.
- Existing source identity and dataset contracts preserved.
- Existing Keyword Planner deterministic tests remain passing.

Verification:
- Keyword Planner reviewed API integration tests passed.
- Production source composition verification passed.
- Related Google Ads Change History and export regression checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Campaign Settings v1 checkpoint

Completed:
- Campaign Settings remains within the existing `google-ads-configuration` source family.
- Provider-native Campaign Settings contract, query, normalization, and validation boundaries are implemented.
- Core remains source-neutral and provider semantics remain inside the Google Ads source module.

Verification:
- Google Ads Campaign Settings gate passed.
- Contract, normalization, source, and validation integration checks passed.

Export boundary:
- No dedicated Campaign Settings export mapping was identified as required.
- Existing package/export behavior remains unchanged.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Negatives v1 checkpoint

Completed:
- Google Ads negative evidence contracts are verified.
- Five negative dataset/resource contracts preserve provider-native semantics.
- Negative keyword normalization preserves identities, nulls, and provider status.
- Core remains source-neutral and Google Ads semantics remain inside the source module.

Verification:
- Google Ads Negatives gate passed.
- Contract, normalization, configuration source, and validation integration checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Search Reporting checkpoint

Completed:
- Google Ads Search Reporting vertical slice is deterministically verified.
- Six canonical SEARCH reporting datasets preserve provider-native semantics:
  - CAMPAIGN_PERFORMANCE
  - AD_GROUP_PERFORMANCE
  - KEYWORD_PERFORMANCE
  - SEARCH_TERMS
  - AD_PERFORMANCE
  - RSA_ASSET_PERFORMANCE
- SearchStream raw evidence handling, normalization, and fail-closed validation boundaries are verified.
- Core remains source-neutral and Google Ads reporting semantics remain inside the source module.

Verification:
- Google Ads Search Reporting gate passed.
- Contract, source, SearchStream, normalization, and validation integration checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## 13. Governing handoff rule

> **Record where the repository is now, what remains unproven, and the next smallest safe action. Keep history in Git, not in the active handoff.**
