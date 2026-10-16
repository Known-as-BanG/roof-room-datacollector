# RoofRoom Data Collector — Data Contracts

**Status:** Canonical contracts reconciled with schema v8 and current source/package contracts
**Scope:** Persisted IDs/states, null semantics, provenance, source-native meaning, and package evidence rules

---

## 1. Contract principles

1. Preserve source meaning.
2. Missing is not zero.
3. Raw evidence is immutable whenever practical.
4. Requested and observed context remain distinct.
5. Execution and validation are separate domains.
6. Source, dataset, source mode, and acquisition mode are separate.
7. Stable machine IDs and human labels are different concerns.
8. Documentation does not perform a migration.

---

## 2. Serialization

Persisted JSON/database fields use `snake_case`.

Dates:

```text
YYYY-MM-DD
```

Persisted timestamps:

```text
UTC ISO 8601 ending in Z
```

Provider-native calendar dates remain dates unless the provider contract proves otherwise.

---

## 3. Current source identities

Implemented source/module identities include:

| `source_id` | Acquisition | Main dataset(s) |
|---|---|---|
| `google-trends` | `BROWSER_EXPORT` | `INTEREST_OVER_TIME` |
| `google-search-console-query` | `OFFICIAL_API` | `QUERY` |
| `google-search-console-query-page` | `OFFICIAL_API` | `QUERY_PAGE` |
| `google-ads-search-terms` | `OFFICIAL_API` | `SEARCH_TERMS` |
| `google-ads-search-reporting` | `OFFICIAL_API` | six SEARCH reporting datasets |
| `google-keyword-planner` | `OFFICIAL_API` | `KEYWORD_HISTORICAL_METRICS` |
| `google-keyword-planner-csv` | `FILE_IMPORT` | `KEYWORD_HISTORICAL_METRICS` |
| `ikas-products` | `FILE_IMPORT` | `PRODUCTS` |
| `bitkimark-sitemap` | `HTTP_XML` | `SITEMAP_URLS` |
| `serpapi` | `THIRD_PARTY_API` | `GOOGLE_SERP` |

Google Trends query-group IDs match the live implementation contract and remain GT-specific.

Current Run IDs:

```text
rr_<UTC timestamp>_<6 lowercase hex>
```

Current Workspace IDs:

```text
ws_<UTC timestamp>_<6 lowercase hex>
```

---

## 4. Current persisted statuses

### Run

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
RETRY_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

### Execution

```text
PENDING
RUNNING
VALIDATING
COMPLETED
FAILED
CANCELLED
MANUAL_ACTION_REQUIRED
RETRY_PENDING
```

### Validation

```text
NOT_RUN
VALID
LOW_DATA
NO_DATA
INVALID_SCHEMA
ERROR_NOT_DATA
DATE_MISMATCH
QUERY_MISMATCH
```

Operational auth/config/quota/provider/import failures are not automatically validation statuses.

---

## 5. Readiness and freshness domains

Source readiness and desktop remediation are separate from freshness.

Safe readiness may represent states such as ready, configuration required, connection required, file required, manual action required, unavailable, or error according to the implemented boundary.

Freshness is source-neutral and conceptually includes:

```text
FRESH
DUE
STALE
IMPORT_NEEDED
ON_DEMAND
UNKNOWN
```

Do not collapse readiness, freshness, execution, and validation into one state.

---

## 6. Workspace / Run / Job / Attempt

```text
Workspace
└── Run
    └── Job
        ├── Attempt 1
        └── Attempt N
```

### Workspace

Stores first-class brand/business identity.

### Run

Requires `workspace_id`.

May contain Jobs from multiple sources.

One Workspace may have at most one active Run in the implemented active-status set.

### Job

Independent execution/resume/retry unit.

Identity within a Run:

```text
source_id + job_key
```

`query_group_id` is nullable and GT/legacy-specific.

Non-GT Jobs use no fake query group.

### Attempt

Immutable execution history.

Retry creates a new Attempt and preserves previous attempts/artifacts/validations/error evidence.

---

## 7. Artifact contract

Current kinds include:

```text
RAW_SOURCE_FILE
METADATA_JSON
VALIDATION_JSON
NORMALIZED_CSV
EXPORT_XLSX
LOG_FILE
```

Current states:

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

Artifact provenance includes Run/Job/Attempt/source identity, path, media type, byte size, SHA-256 where available, and timestamps.

Raw evidence is never rewritten into normalized output.

---

## 8. SQLite boundary

Current schema version:

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

There is no general analytical warehouse.

Credential secrets remain outside SQLite.

Freshness is derived from accepted completed Job history.

---

## 9. Evidence lifecycle

```text
provider/file bytes
→ RAW_SOURCE_FILE / CANDIDATE
→ parse
→ source validation
→ ACCEPTED | ACCEPTED_WITH_WARNING | REJECTED
→ optional deterministic normalization
→ metadata / validation / package / export artifacts
```

Rejected raw evidence remains preserved when practical.

Only eligible accepted evidence enters normal packages/exports.

---

## 10. Provenance baseline

Accepted evidence must remain traceable to relevant:

```text
workspace_id
run_id
job_id
attempt
source_id
source_mode
dataset_type
acquisition mode
raw_artifact_id
raw_relative_path
byte_size / sha256 where available
retrieved_at / imported_at
validation_status
requested context
observed context where proven
application/schema version
```

Provider-specific provenance may add fields required by that source.

Do not force unrelated provider metadata into a generic record.

---

## 11. Requested versus observed

Examples:

```text
requested dates      / observed dates
requested dimensions / returned dimensions
requested country    / observed country
requested mode       / observed mode
requested device     / observed device
```

Requested values must not populate observed fields without provider evidence.

Unavailable observed values remain missing.

---

## 12. Missing and numeric semantics

Canonical missing representations:

```text
JSON   → null or absent optional field
SQLite → NULL
CSV    → blank
XLSX   → empty cell
```

True numeric zero remains zero only when actually returned or deterministically derived under an approved contract.

Do not turn parse failures, blanks, withheld values, absent stock, or unavailable provider metrics into zero.

Provider-native units remain explicit.

---

## 13. Source-native semantics

### Google Trends

`relative_interest` is provider-native 0–100 relative interest.

Comparison-group context remains part of identity/meaning.

Do not convert it to absolute search counts.

### Google Search Console

Keep `QUERY` and `QUERY_PAGE` contracts distinct.

GSC country scope provenance: Newly reviewed `google-search-console-query` and `google-search-console-query-page` executions freeze `country_filter: "TUR"` in the resolved source configuration and each planned Job `source_context`. The provider request uses the corresponding native `country` dimension filter without changing dataset dimensions. Historical Jobs without `source_context.country_filter` remain unfiltered; absence must not be interpreted as `"TUR"` or as a measured value. Unsupported explicit country values are invalid. The reviewed request scope and raw provider responses remain separately traceable.

Preserve clicks, impressions, CTR, position, dimensions, property/search-type/date context, raw response pages, and provider limitations.

### Google Ads SEARCH reporting

Approved SEARCH-only datasets:

```text
CAMPAIGN_PERFORMANCE
AD_GROUP_PERFORMANCE
KEYWORD_PERFORMANCE
SEARCH_TERMS
AD_PERFORMANCE
RSA_ASSET_PERFORMANCE
```

Preserve dataset/resource identity, provider-native units, date/segment context, and raw SearchStream evidence.

Existing `google-ads-search-reporting` tasks acquire dataset schema v2 by default. Historical schema v1 Job contexts remain readable for preserved evidence, but current provider reacquisition must not run under a v1 context. The separate Google Ads — Conversion-Date Performance task explicitly acquires schema v3 only for `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, and `KEYWORD_PERFORMANCE`; other v3 dataset selections fail before provider access.

For `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, and `KEYWORD_PERFORMANCE`, schema v2 additionally preserves provider-native:

- `conversions_from_interactions_rate`
- `cost_per_conversion`
- `conversions_value_per_cost`
- `search_top_impression_share`
- `search_absolute_top_impression_share`

`search_top_impression_share` and `search_absolute_top_impression_share` remain distinct from `top_impression_percentage` and `absolute_top_impression_percentage`.

`cost_per_conversion` preserves the provider field as a numeric value and is not renamed into the `_micros` canonical field family.

Schema v3 retains all standard v2 conversion fields and adds four distinct provider-native numeric fields: `conversions_by_conversion_date`, `conversions_value_by_conversion_date`, `all_conversions_by_conversion_date`, and `all_conversions_value_by_conversion_date`. A provider `null` remains null and a true zero remains zero. A missing selected v3 metric fails validation rather than becoming zero. Raw SearchStream artifacts and immutable Job context preserve the source, account, exact requested dates, and schema version. Accepted v3 rows remain available through the Production Data Package loader; they do not satisfy `ADS_OPTIMIZATION_PACK v2` schema-v2 requirements.

The conversion-date desktop task fixes the three v3 datasets and uses the existing Google Ads reporting connection. Review resolves the connected customer ID and exact dates into its Job plans without changing reusable configuration. Start rejects a changed account. A selection that attempts colliding v2/v3 Jobs under the same `source_id + job_key` is blocked before Run creation.

Legacy `google-ads-search-terms` remains compatible.

Performance Max is outside this contract.

### Google Ads configuration — Negatives v1

`google-ads-configuration` is an `OFFICIAL_API` current-configuration snapshot source.

Approved dataset schema v1 datasets are exactly:

- `CAMPAIGN_NEGATIVE_KEYWORDS`
- `AD_GROUP_NEGATIVE_KEYWORDS`
- `SHARED_NEGATIVE_KEYWORDS`
- `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
- `ACCOUNT_NEGATIVE_KEYWORD_LISTS`

The immutable Job context contains exactly source identity, dataset type, provider resource mode, customer ID, and `dataset_schema_version: 1`. This source is not date-windowed and does not support custom date ranges.

The adopted v1 boundary is keyword negatives only. Campaign-direct and ad-group-direct negatives preserve provider criterion identity and require SEARCH campaign scope, provider criterion type `KEYWORD`, and `negative: true`. Shared negative keyword members remain separate shared-criterion evidence. Campaign-list and account-list attachments remain separate provider attachment evidence.

Direct criteria, shared members, campaign-list attachments, and account-list attachments are independent evidence datasets. Do not reconstruct one dataset from another. In particular, an account attachment does not prove or reconstruct the members of its referenced shared set.

Raw Google Ads SearchStream response bytes remain authoritative. Provider identities and provider-native status/type values remain evidence; `REMOVED` is preserved. Optional unavailable provider fields normalize to `null`, never empty strings, zero, or synthetic values.

A structurally valid SearchStream response that normalizes to zero rows may validate as `NO_DATA`. Malformed envelopes or semantic normalization failures fail closed and must not be converted into `NO_DATA`. Missing remains distinct from zero.

This source reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not create a separate `google-ads-configuration` credential or connection record.

Negatives v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.


### Google Ads configuration — Campaign Settings v1

Campaign Settings v1 adds these provider-native snapshot datasets:

- `CAMPAIGN_SETTINGS`
- `CAMPAIGN_BUDGETS`
- `CAMPAIGN_TARGETING_CRITERIA`

They remain under the existing Google Ads configuration source and Workspace Google Ads connection boundary.

CAMPAIGN_SETTINGS grain: one row per Campaign resource.

Scope is Search-only where required by the provider contract.

Preserved provider-native evidence includes campaign identity, status, advertising channel type, keyword match type, bidding configuration, network settings, geo routing, and returned AI Max-related fields.

CAMPAIGN_BUDGETS grain: one row per CampaignBudget resource.

Budget evidence preserves amount micros, delivery method, explicit shared state, reference count, and provider-native resource relationships.

CAMPAIGN_TARGETING_CRITERIA grain: one row per CampaignCriterion resource.

Accepted targeting types:
- LOCATION
- LANGUAGE
- DEVICE
- AD_SCHEDULE

Targeting evidence preserves provider-native criterion identity, negative LOCATION evidence, observed LOCATION references, resolver provenance, and lossless raw evidence bundle contents.

Human-readable geo fields require provider resolver evidence.

Missing raw evidence, malformed evidence bundles, and reconstructed evidence are not accepted.

REMOVED snapshots remain historical provider observations. No effective-current state is synthesized.

### Google Ads configuration — Conversion Configuration v1

`google-ads-configuration` also owns six provider-native Conversion Configuration schema-v1 snapshot datasets:

- `CONVERSION_ACTIONS` → `CONVERSION_ACTION`
- `CUSTOMER_CONVERSION_GOALS` → `CUSTOMER_CONVERSION_GOAL`
- `CONVERSION_GOAL_CAMPAIGN_CONFIGS` → `CONVERSION_GOAL_CAMPAIGN_CONFIG`
- `CAMPAIGN_CONVERSION_GOALS` → `CAMPAIGN_CONVERSION_GOAL`
- `CUSTOM_CONVERSION_GOALS` → `CUSTOM_CONVERSION_GOAL`
- `CUSTOMER_CONVERSION_TRACKING_SETTINGS` → `CUSTOMER`

Together with the five Negatives v1 datasets, the current `google-ads-configuration` family contains exactly eleven independent dataset types.

Conversion Configuration v1 is a current-configuration snapshot contract. It has no requested date window and keeps `supports_custom_date_range: false`.

Raw Google Ads SearchStream response bytes remain authoritative. Normalized rows preserve provider resource identity, lifecycle/status values, real `false` and zero values, and nullable optional evidence without fabricating replacements.

`CONVERSION_ACTIONS` preserves provider-native action identity, status/type/category/origin, ownership, counting and goal flags, lookback settings, attribution settings, default value/currency settings, and Google Analytics 4 linkage where returned. `include_in_conversions_metric` is preserved only as legacy provider evidence; RoofRoom does not reinterpret it as a current effective-goal decision.

`CUSTOM_CONVERSION_GOALS.conversion_action_resource_names` preserves provider-returned membership exactly. A provider-returned empty array remains `[]`; missing or unproven membership must not be normalized into an empty array.

Requested `customer_id` is immutable request context and must not be copied into observed ownership or conversion-customer fields without provider evidence.

RoofRoom does not derive an effective campaign conversion-goal model from these datasets. It does not infer goal precedence, bidding behavior, or optimization intent.

Conversion Configuration v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.

The family reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not add a configuration-specific credential, connection type, or Developer Token requirement.

### Keyword Planner

Preserve provider-native monthly history.

For API evidence, `change_3_month` and `change_yoy` may be deterministic RoofRoom-derived fields under the locked month-comparison rules.

They remain null if required evidence is missing or baseline is zero.

Do not widen provider requests merely to manufacture YoY.

For manual CSV, provider-exported change fields remain source-native imported evidence.

### İkas

Preserve original XLSX and exact evidence-backed field mapping.

Blank sale price/stock remain missing.

Do not create storefront URLs when unavailable.

### Bitkimark

Preserve request/response metadata, raw XML, sitemap relationships, `loc`, nullable `lastmod`.

### SERP

Preserve request context, raw JSON/provider metadata, organic result evidence, and provider-returned features.

Do not add analysis/recommendation fields.

---

## 14. Workspace configuration contracts

Saved Collection Presets and Last Run Settings are Workspace-owned reusable configuration.

A reviewed Run persists its own immutable resolved snapshot.

Run reservation and Last Run Settings update are atomic under the implemented contract.

Workspace source connections store only safe metadata and opaque credential references.

Secret material remains behind the credential-store boundary.

---

## 15. Package contracts

### Production Data Package

Indexes accepted source datasets separately and preserves exact Run/Job/source/artifact/checksum/request provenance.

No cross-source row join is implied.

### `ADS_OPTIMIZATION_PACK v2`

Active recipe version is 2 and requires exactly the six approved Google Ads SEARCH reporting datasets at dataset schema v2.

Historical recipe/schema v1 packages remain readable. They are not compatible CURRENT evidence or PREVIOUS baselines for the active v2 recipe.

Task Package manifest format remains `manifest_version: 1`. Supported recipe/schema pairs are exactly `1/1` and `2/2`; mixed pairs fail closed.

Current window semantics are code-defined and exact.

Evidence reuse is permitted only when compatibility is proven.

A broader populated DAILY artifact may be filtered only using real date rows.

A broader `NO_DATA` result cannot prove a narrower window.

PREVIOUS comes from a verified immutable prior package, never from reconstruction.

No interpolation, subtraction, averaging, allocation, or historical configuration backfill may manufacture evidence.

Package manifests/tables/workbooks are derived outputs; raw artifacts remain canonical.

### `BLOG_WRITING_PACK v1`

Fixed logical families:

```text
INTEREST_OVER_TIME
QUERY_PAGE
SEARCH_TERMS
KEYWORD_HISTORICAL_METRICS
PRODUCTS
SITEMAP_URLS
GOOGLE_SERP
```

Out-of-recipe evidence is excluded before loading.

Zero accepted in-recipe datasets is `NOT_READY`.

Otherwise coverage is truthful per family; overall package is complete only when every expected family is covered.

Verified `NO_DATA` may satisfy coverage without fabricated rows.

Keyword Planner API/manual provenance remains distinct.

Blog packaging is local-only and creates no provider call, retry, Attempt, Run/Job transition, or schema migration.

### `BLOG_WRITING_PACK v2` draft membership (Slice 2)

This additive draft format records explicitly selected accepted evidence from
multiple completed Runs in one Workspace. It does not change the v1 contract.

`assembleBlogWritingPackV2Draft` takes package identity, creation time, application
version, and the Slice 1 selection intent (`recipe_version: 2`, `workspace_id`,
`selections: [{run_id, job_id, artifact_id}]`). Each assembly calls the Slice 1
resolver afresh to verify ownership, completed Run/Job/Attempt state, accepted
artifact identity, Validation association, byte size, and SHA-256. It never selects
a newer Run or repairs changed evidence; resolver blockers propagate to the caller.

`BlogWritingPackStore.saveDraft/readDraft` stores and reads exactly one
`BLOG_DRAFT.json` file under the existing `blog-writing-packs/<package_id>/` root:

```text
draft_version: 1
recipe_id: BLOG_WRITING_PACK
recipe_version: 2
package_id, workspace_id, created_at, application_version
state: DRAFT
readiness_status: NOT_EVALUATED
selected_evidence: [Slice 1 resolved evidence, in explicit selection order]
```

Each membership entry preserves `workspace_id`, `source_id`, `dataset_type`,
`run_id`, `job_id`, the actual `attempt_id` and `validation_id`, validation status,
`artifact_id`, SHA-256, byte size, sanitized requested context, acquisition time,
and the resolver's observed context (currently null). `dataset_type` is the
existing dataset identity field; no persisted `dataset_id` is invented.

Membership is a snapshot: reload validates the stored format without resolving
against current Runs. Newer Runs cannot alter it. Distinct same-family Jobs remain
separate; exact duplicate selections and mixed Workspaces are rejected. Draft
persistence stages and validates the file before rename and refuses existing
package IDs, including existing v1 package IDs. It copies no raw evidence or rows.

A draft has no single Run ID, coverage status, workbook, generic Data Package
manifest, or delivery claim. Extra readiness/coverage fields are rejected. The
v1 published-package reader does not accept drafts. Seven references do not imply
COMPLETE; source field semantics, reporting windows, mandatory coverage, and full
delivery validation remain unevaluated. No SQLite migration or Core lifecycle
change is involved.

### `BLOG_WRITING_PACK v2` explicit readiness evaluation (Slices 3B.1–3B.2B.5)

`evaluateBlogWritingPackV2Readiness({package_id, workspace_id, requirements},
{store, repository, loader})` reads `BLOG_DRAFT.json` through `readDraft` and
returns an in-memory evaluation; it never writes or promotes the draft. The
version-1 requirements profile is explicit input with `recipe_version: 2`,
per-family `open_decisions` / `required_source_changes` lists, and
`gsc_requested_dates: {start_date, end_date} | null` and optional
`ads_requested_dates: {start_date, end_date} | null`. Omitted/null Ads endpoints
remain DECISION_REQUIRED; supplied endpoints must be real, ordered calendar dates.
The current profile supplies neither source's endpoints. Unknown requirement fields
are rejected rather than silently treated as checked. Omitted family policy
produces DECISION_REQUIRED.

The evaluator reuses Slice 1 for each exact selected reference and compares all
resolved provenance with frozen membership. Changed context, IDs, or integrity
references produce MEMBERSHIP_CHANGED. Rejected evidence and byte/checksum
failures are blockers, never grounds to select a newer Run. No raw provider
response or filesystem error path is included in blocker reports.

Seven mandatory dataset types are fixed: SEARCH_TERMS, QUERY_PAGE,
KEYWORD_HISTORICAL_METRICS, PRODUCTS, SITEMAP_URLS, GOOGLE_SERP, and
GA4_CONTENT_PERFORMANCE. INTEREST_OVER_TIME remains optional. Each mandatory
family reports MISSING, BLOCKED, or SATISFIED, selected count, and usable count.
Here usable means exact revalidated identity with a VALID source verdict; it does
not mean all downstream fields have been checked. LOW_DATA/NO_DATA coverage and
multi-Job scope semantics remain DECISION_REQUIRED in this slice.

GSC compares requested start/end dates with explicitly supplied approved
endpoints (exactly 28 inclusive calendar dates). No reference date or timezone
policy is derived. Wrong or missing requested dates produce WINDOW_MISMATCH;
missing approved endpoints produce DECISION_REQUIRED. This date check applies
independently of an accepted empty-result coverage decision. Aggregate rows are
not reconstructed, filtered into daily data, or summed.

Overall coverage is NOT_READY when no mandatory selection is usable, PARTIAL
when some are usable but mandatory blockers remain, and COMPLETE only when all
seven families satisfy the explicit supported requirements with no mandatory
blocker. Every result includes `coverage_scope: EXPLICIT_REQUIREMENTS_ONLY`, the
requirements snapshot and unchanged selected provenance, and
`delivery_readiness: NOT_EVALUATED`. It does not claim full downstream delivery.
All seven mandatory families now have source-backed field inspection. Empty
decision lists cannot approve unresolved meanings, scope or source capabilities;
absent families remain MISSING. Real Blog v2 COMPLETE coverage remains blocked
on the explicit decisions and acquisition gaps documented below.

`BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS` records current real open decisions
and known source gaps, with no automatic date or metric defaults. Using it cannot
produce real COMPLETE coverage while those blockers remain. Blockers carry a
dataset type, mandatory/optional designation, actual selection IDs, requirement,
expected/actual safe condition, and next action. Supported codes are
DATASET_MISSING, DECISION_REQUIRED, SOURCE_CHANGE_REQUIRED, WINDOW_MISMATCH,
EVIDENCE_INVALID, ARTIFACT_INTEGRITY_FAILED, MEMBERSHIP_CHANGED, FIELD_ABSENT,
FIELD_OBSERVATION_REQUIRED, and FIELD_REPRESENTATION_INVALID.

For implemented families, the evaluator uses the existing loader's verified byte-read
capability (`readAcceptedJobArtifact`) and existing source normalizers with
source-local raw field-presence inspection. The read rechecks accepted ownership,
size, SHA-256 and frozen artifact/context references. Invalid representations
produce safe blockers without copying provider responses into reports.

Ads requires search_term, campaign, ad_group, impressions, clicks, ctr, cost,
conversions and conversion_value. Canonical SearchStream text comes from
searchTermView.searchTerm, campaign.name and adGroup.name; metrics retain
provider meaning, with costMicros divided by 1,000,000 through the existing
normalizer and conversionsValue mapped to conversion_value. Legacy flat raw
rows retain their existing mappings, including cost_micros conversion. Observed
segments.date (or supported legacy performance_date/date) remains performance_date;
no date is invented. Requested Ads endpoints are compared exactly, using the
same endpoint-comparison path as GSC, with no default duration. Open decision
lists remain authoritative and must explicitly be resolved by the caller.

GSC query/page come from query × page row keys; page maps to page_url and
position to average_position. Clicks, impressions, CTR fractions and provider
average position are retained without recalculation. Requested GSC endpoints
remain separate from provider row values; the existing exact 28-day check applies.

Read-only `field_checks` contain per-selection IDs, row counts and field counts
(observed, normalized null from present fields, absent); they contain no business row values. Field
status is OBSERVED, NULL, ABSENT, UNRESOLVED (empty or semantically unresolved),
or UNSUPPORTED (an explicit source capability gap). A missing raw property
cannot become observed merely because normalization emits null. Explicit
source-compatible nulls and zeros remain distinct. Existing legacy/GSC empty-string
to null normalization is retained; it never proves an absent raw property. Incompatible source shapes
or values produce FIELD_REPRESENTATION_INVALID; absent fields produce FIELD_ABSENT;
empty rows produce FIELD_OBSERVATION_REQUIRED. The inspector separately reports
UNSUPPORTED for source families outside its Ads/GSC/Keyword Planner/İkas/Sitemap/SERP/GA4 implementation. NO_DATA and
LOW_DATA retain their original verdict, coverage decision blocker, and independent
window/field checks. Draft bytes, source validators and v1 export behavior are unchanged.


### `BLOG_WRITING_PACK v2` Keyword Planner compliance (Slice 3B.2B.1)

The existing evaluator checks selected `google-keyword-planner` (OFFICIAL_API)
and `google-keyword-planner-csv` (FILE_IMPORT) artifacts through the same frozen
membership and accepted-byte integrity seam. Provider parsing, source-context
validation and raw field presence live in `keyword-planner-field-inspector.ts`;
the Blog helper owns only downstream aliases and the existing field-count summary.
No source acquisition, parser behavior, loader API or draft format is changed.

Required mappings:

| Blog field | Official API | Manual CSV |
| --- | --- | --- |
| keyword | result.text → returned_keyword | Keyword column → returned_keyword |
| average_monthly_searches | keywordMetrics.avgMonthlySearches → avg_monthly_searches | Avg. monthly searches → avg_monthly_searches |
| competition | keywordMetrics.competition (category) | Competition column (native localized category) |
| top_of_page_bid_low | lowTopOfPageBidMicros / 1,000,000 | Top of page bid (low range), already currency units |
| top_of_page_bid_high | highTopOfPageBidMicros / 1,000,000 | Top of page bid (high range), already currency units |

Competition index remains a separate observation and never supplies competition.
Known API LOW/MEDIUM/HIGH categories remain native; other non-null categories
require `competition_semantics` approval, without translating or inventing values.
CSV native categories are preserved without translation. API requested_keyword,
returned_keyword, explicit close variants and matched-request observations remain
separate through the existing normalizer. Missing/null/blank provider identity
produces FIELD_OBSERVATION_REQUIRED (`observed_keyword`), never a request fallback.
Unproven/ambiguous request mappings or unsupported raw shapes fail normalization
and produce FIELD_REPRESENTATION_INVALID. The CSV parser's requested_keyword alias
comes from the provider Keyword cell; it is not proof of a reviewed request set.

API raw presence proves each required metric property independently of normalized
nulls. Absent properties produce FIELD_ABSENT. Explicit nulls remain null; real
zeros remain zero. Successful fixed-header and complete-row CSV parsing proves
column presence, with blank cells retaining existing null semantics. Missing
headers/partial rows fail the existing parser. Original monthly histories remain
unchanged, including missing/null observations; no months, averages or history
are reconstructed. Duplicate provider rows and Jobs are never merged/deduplicated.

Optional `keyword_planner_scope` in the version-1 requirements profile specifies
`requested_date_start`, `requested_date_end`, `country_code`, `language_code`,
and `keyword_plan_network`, or null. Unknown keys/invalid or reversed dates are
rejected. Dates have no Blog duration default. Missing scope stays
DECISION_REQUIRED even if family decision lists are empty; approved fields are
compared exactly against each verified API Job's requested context, producing
WINDOW_MISMATCH on disagreement. Open decision lists still require explicit
resolution by the caller. The API context's existing 12-complete-month TR/tr/
GOOGLE_SEARCH constraint validates acquisition compatibility only; it does not
approve a Blog historical requirement or imply observed completeness.

Missing/incompatible source request context produces EVIDENCE_INVALID
(`keyword_planner_request_context`). Manual inspection validates sanitized source,
task and FILE_IMPORT mode and reads only accepted bytes, never the original
file_path. The CSV date label/monthly columns do not prove requested geographical,
language or network scope: DECISION_REQUIRED (`manual_csv_scope`) remains. API
artifacts do not capture observed account currency: SOURCE_CHANGE_REQUIRED
(`currency_context`) remains; never infer currency from TR or assume micros
means a particular currency. Manual currency is preserved from each provider row.
No acquisition extension is authorized by this slice.

The required Blog keyword set/completeness policy is unspecified: all selected
KWP evidence retains DECISION_REQUIRED (`keyword_coverage`), including one Job.
Multiple Jobs retain independent selected provenance and field counts plus the
existing `multi_job_coverage` blocker. LOW_DATA/NO_DATA retain their verdict and
coverage decision, with independent scope/field checks; empty rows cannot prove
fields even under VALID. These gaps prevent mandatory KWP coverage from passing
in this slice despite successful field inspection. Delivery stays NOT_EVALUATED;
EXPLICIT_REQUIREMENTS_ONLY and NOT_READY/PARTIAL/COMPLETE remain unchanged.


### `BLOG_WRITING_PACK v2` İkas Products compliance (Slice 3B.2B.2)

The existing evaluator reads selected accepted İkas XLSX bytes through unchanged
Slice 1 identity/integrity and frozen draft checks. İkas-local
`inspectIkasProductsFields` reuses `parseIkasProductsXlsx`. The parser adds
`mapped_fields` metadata identifying actual matched columns, without changing
row normalization, validation, units, header aliases or raw bytes. A null-filled
optional URL is not evidence that a URL column existed. Inspection validates
sanitized source/task/FILE_IMPORT context; it never reopens the original file_path.

| Blog field | Actual supported import/normalization | Compliance and follow-up |
| --- | --- | --- |
| product_id | Product ID / Ürün Grup ID / existing ID aliases → product_id | Actual group identity only; no variant/name/URL fallback. Blank is null and blocked; missing required ID header fails parsing. |
| product_name | Product title / İsim / existing title aliases → product_title | Alias to product_name; blank stays null with observation blocker. No slug/name reconstruction. |
| product_url | Existing URL / Product URL / Ürün URL aliases → url | Alias only when present; no URL construction. Absent header versus blank cell stays distinct. Invalid/non-HTTP(S) URL representations block. Missing source URL requires separate evidence/import support. |
| category | Categories / Kategoriler, Categories / product type / Kategori, Product type / Tip | Native strings remain separate; no category ID/hierarchy interpretation, delimiter splitting, primary-category choice or singular alias. DECISION_REQUIRED. |
| price | Price / Fiyat / Satış Fiyatı → price; Sale price aliases → separate sale_price | Existing numeric parsing and per-variant rows retained, including null/zero; no product-price selection, minimum, aggregation or sale/list equivalence. DECISION_REQUIRED for Blog price meaning. |
| availability | Existing normalized availability derivation from deleted, variant_active, stock and continue_selling | Native derived variant value retained; product-level meaning unresolved. A direct raw availability column is currently replaced by the legacy derivation and cannot be treated as preserved direct product availability. DECISION_REQUIRED. |
| stock_status | Numeric stock is an independent observation; no approved product stock-status mapping | UNSUPPORTED / SOURCE_CHANGE_REQUIRED. Never inferred from availability or fabricated as zero. |
| product_status | Native deleted/variant-active/channel flags remain independent | No approved product lifecycle/publication mapping: UNSUPPORTED / SOURCE_CHANGE_REQUIRED. No fabricated active/draft/archive/publication state. |

Currency is not mapped by the existing import parser. Monetary numbers retain
imported units without scaling, currency conversion or assumed currency.
SOURCE_CHANGE_REQUIRED (`currency_context`) remains. Any supported currency,
stock-status or product-status extension requires a separate source/import-schema
contract; no provider acquisition or import schema extension was made here.

Read-only field reports retain existing observed/null/absent counts and introduce
UNSUPPORTED for known capability gaps. UNRESOLVED distinguishes present native
values from unapproved downstream meaning; no singular category value is emitted.
Native price/availability counts do not claim approved product-level semantics.
Missing required observations use FIELD_OBSERVATION_REQUIRED. Absent supported
columns use FIELD_ABSENT. Invalid workbook, IDs/schema, numeric observations or
URL representations use FIELD_REPRESENTATION_INVALID. Incompatible import context
uses EVIDENCE_INVALID (`ikas_request_context`). Safe messages contain no provider
rows or original import paths. Existing source validator verdicts are not modified.

The artifact's acquired_at remains acquisition provenance. The parser has no
approved provider observation timestamp; created-date-like columns are not a
snapshot timestamp mapping. DECISION_REQUIRED (`freshness`) remains even if a
caller empties decision lists. No maximum age, timezone or reference-date policy
is invented, and acquisition time is never promoted to provider observation time.

Repeated products/variants, duplicate rows and independently selected Jobs stay
separate with exact Run/Job/Attempt/Validation/Artifact references. No merge,
deduplication, newer-Run selection or draft write occurs. Multi-Job coverage stays
explicitly unresolved. Existing LOW_DATA/NO_DATA decisions remain independent;
empty unsupported workbooks fail parsing and cannot prove mandatory fields.

Product coverage remains BLOCKED on these semantic/source gaps. The current
profile records category/price/availability/freshness as open decisions and
stock_status/product_status/currency_context as source changes.
KWP and Ads/GSC behavior is unchanged.
EXPLICIT_REQUIREMENTS_ONLY, NOT_READY/PARTIAL/COMPLETE and delivery
NOT_EVALUATED remain unchanged. No complete Blog v2 readiness is claimed.


### `BLOG_WRITING_PACK v2` Sitemap compliance (Slice 3B.2B.3)

The existing readiness evaluator inspects accepted `bitkimark-sitemap` XML through
unchanged selection/draft/identity/integrity checks. Source-local
`inspectSitemapFields` reuses `createBitkimarkSitemapJobContext` and
`parseBitkimarkSitemap`. The existing parser, request construction, source fetch,
verified host/document allowlist and validator are unchanged. Only selected
accepted bytes are inspected; no discovery, traversal, crawl or page fetch occurs.

| Blog field | Existing raw/normalized evidence | Compliance |
| --- | --- | --- |
| url | Direct loc → url, preserving the parser's raw trimmed loc and existing URL validation | URL_SET/entry_type URL establishes observed webpage URL. Index entry loc identifies a child sitemap, not a webpage. Missing/blank/malformed loc fails parsing; no requested URL substitution. |
| page_type | No normalized classification observation | UNSUPPORTED / SOURCE_CHANGE_REQUIRED; URL patterns, document kind and existing local annotations are not page classification. |
| title | No suitable normalized webpage title observation | UNSUPPORTED / SOURCE_CHANGE_REQUIRED; no slug/product-name reconstruction or promotion of unrelated XML metadata to HTML title. |
| status | Source observes the sitemap document response status only | UNSUPPORTED / SOURCE_CHANGE_REQUIRED for individual-page HTTP status. No copied 200, inferred availability or missing-to-zero conversion. |

A selected URL_SET may pass the url field while the dataset remains BLOCKED.
SITEMAP_INDEX rows retain `entry_type: SITEMAP` and `document_kind: SITEMAP_INDEX`;
url is UNRESOLVED for the Blog webpage requirement, with DECISION_REQUIRED
(`sitemap_document_kind`) plus observation blocker. Index URLs remain visible as
child-document evidence; none are manufactured into pages or fetched automatically.
The existing verified-child allowlist remains enforced.

Per-document duplicate loc rejection is unchanged; no duplicates are silently
removed. Equal URLs in separate Jobs/Runs remain independent rows and field
summaries, with all original Run/Job/Attempt/Validation/Artifact references.
DECISION_REQUIRED (`scope`) remains even with one Job or empty decision lists:
one document or a union of selected documents does not prove complete website
inventory. Existing multi_job_coverage, warning-outcome and real-profile freshness
decisions remain unresolved; no new completeness/freshness policy is invented.

Optional lastmod remains the source-provided validated ISO value or null when
absent/empty. It is not page HTTP status, live update proof or acquisition time.
The existing parser does not normalize changefreq/priority; those XML values
remain only in immutable raw evidence and are not interpreted as observed update
frequency or quality. Existing URL-derived annotations remain local annotations,
not provider page types or titles. XML title-like elements have no approved title
mapping in this source.

Normalized source_url, parent_sitemap_url, document_kind, entry_type and retrieved_at
match the existing accepted loader's representation. The evaluator supplies the
frozen artifact acquired_at as retrieved_at, explicitly acquisition provenance;
no provider page-observation timestamp or current-time fallback is invented.
Frozen requested_context, observed_context and membership remain unchanged.

Existing blocker codes are reused: FIELD_REPRESENTATION_INVALID for unsupported
XML/loc/metadata; EVIDENCE_INVALID (`sitemap_request_context`) for unsupported
source/task/request context; FIELD_OBSERVATION_REQUIRED for empty/unproven URL
observations; SOURCE_CHANGE_REQUIRED for page_type/title/status; DECISION_REQUIRED
for scope/index meaning. Existing integrity/membership/validation-outcome blockers
remain. Empty VALID/NO_DATA/LOW_DATA never prove observed URL or full coverage.
Safe field results contain counts and fixed conditions, without provider rows.

Follow-up needs separately approved page-type evidence/rules, actual page-title
observations and per-page HTTP status acquisition, plus site-scope/completeness
and any required freshness decisions. This slice implements none of those source
extensions. Delivery remains NOT_EVALUATED, with EXPLICIT_REQUIREMENTS_ONLY and
NOT_READY/PARTIAL/COMPLETE unchanged. Full Blog v2 delivery is not established.

### `BLOG_WRITING_PACK v2` SERP snapshot compliance (Slice 3B.2B.4)

Accepted `serpapi` / GOOGLE_SERP bytes pass through unchanged selection, frozen
draft and accepted-artifact integrity checks. SerpApi-local `inspectSerpApiFields`
reuses the existing request validator and `parseSerpApiResponse`; acquisition,
parsing, source validation, loader and v1 export behavior are unchanged.

| Blog field | Actual evidence and existing normalization | Compliance |
| --- | --- | --- |
| query | Requested query is a source request dimension; provider search_parameters.q must equal it before normalization | Checked with origin REQUEST_DIMENSION_VERIFIED_BY_PROVIDER; never an independent result-text observation or a fallback for missing provider q. |
| capture_date | Requested snapshot_date is context; artifact acquired_at is local acquisition provenance. Provider search_metadata, including any generation/processing timestamps, remains in raw bytes; no capture timestamp is normalized | UNRESOLVED / DECISION_REQUIRED even with cleared profile decisions. No date, timezone or timestamp mapping is introduced. |
| position | organic_results[].position → positive integer position | Provider organic position only, never array index or absolute SERP rank. PAA has normalized null position and no supported rank field. Blog ranking/result scope remains DECISION_REQUIRED. |
| url | organic_results[].link or related_questions[].link → existing validated HTTP(S) url | Provider result link only. Missing property versus explicit null/empty remains distinct in field counts. No construction from query/domain. |
| title | organic_results[].title → nullable title | Provider organic title only. PAA has normalized null title; question text or an unnormalized PAA title property cannot fill it. No slug/query/metadata reconstruction. |
| domain | Existing parser derives lower-case URL.hostname from observed HTTP(S) link | Origin DERIVED_FROM_OBSERVED_URL, not direct provider domain observation. Missing link has no domain; invalid links fail, and unrelated raw domain text is ignored. |

Read-only `field_checks` add source-specific `serp_provenance` with fixed query,
capture_date, position and domain origin labels. They expose counts/conditions,
not provider result rows or raw metadata. Frozen requested_context, acquired_at,
Run/Job/Attempt/Validation/Artifact identity and observed_context (currently null)
remain unchanged; parsed provider context is not written into draft membership.

The locked source requires THIRD_PARTY_API, the existing source/task/dataset/Job
context shape, TR/tr, desktop, google, organic_limit=10 and a valid requested date.
Provider q/gl/hl/device/engine/start=0 must match the source's existing rules.
There is no location observation or historical search-date parameter invented by
this inspector. Incompatible request context yields EVIDENCE_INVALID
(`serp_request_context`); provider mismatches, errors and unsupported shapes yield
FIELD_REPRESENTATION_INVALID with safe messages and no field proof.

Only the existing first-ten organic normalization and separate PAA rows are used.
Paid results and other features remain raw provider observations without a new
normalized ranking model. Organic/PAA result_type, null position/title and native
row order are preserved. No provider results or independent Jobs are merged or
deduplicated. Multiple selected Jobs retain complete independent provenance and
the existing multi_job_coverage decision. A newer Run never replaces membership.

Absent supported raw fields produce FIELD_ABSENT. Present null/empty/blank required
URL/title or a domain unavailable from a present link produces
FIELD_OBSERVATION_REQUIRED; existing parser empty-string-to-null behavior is
retained. Real zero is never substituted for missing: organic position zero is
invalid under the unchanged positive-integer source contract. PAA position/title
are not counted as observed merely because normalized properties exist.
capture_date stays UNRESOLVED with zero observed count and an independent semantic
decision; it never receives a fabricated value. Empty VALID/NO_DATA/LOW_DATA
cannot establish fields, while warning verdict/coverage decisions remain separate.

Mandatory SERP coverage always retains DECISION_REQUIRED for capture_date,
position_semantics (organic/absolute and result-type scope), search_context
(including Blog query role), query_coverage and freshness. Empty caller decision
lists cannot approve these unspecified requirements. Source VALID alone cannot
satisfy Blog SERP coverage. Approving the capture basis/timezone, query/result and
search-context scope, required query set/completeness and snapshot-age policy
requires a separate contract decision. Independent provider timestamps/domains,
absolute ranks or additional result categories would require separately approved
source capabilities if demanded; none are acquired or normalized in this slice.

Coverage states and EXPLICIT_REQUIREMENTS_ONLY are
unchanged, delivery remains NOT_EVALUATED, and no full Blog v2 delivery or new
real-provider acceptance is established.

### `BLOG_WRITING_PACK v2` GA4 Content Performance compliance (Slice 3B.2B.5)

The existing GA4 source acquires Content Performance separately from Paid Funnel.
`inspectGoogleAnalytics4ContentFields` inspects accepted bundle bytes through the
same frozen membership and verified-byte seam. It reuses the source's existing
pure context/bundle validation helpers and normalizer. The two validator helpers
are now exported for source-local reuse; their behavior is unchanged. No provider
request, acquisition report, metric list, source validator verdict or parser
normalization is changed.

| Blog field | Existing requested/returned GA4 field | Mapping / type / limits |
| --- | --- | --- |
| landing_page | landingPage dimension; dimensionHeaders and dimensionValues | Existing landing_page string, preserving exact text including `(not set)`. That placeholder is valid provider evidence, not an identified page. It is the first-pageview path dimension, not landingPagePlusQueryString, pagePath, pageLocation or a fabricated absolute URL. |
| sessions | sessions / TYPE_INTEGER | Native nullable number of sessions; no users-to-sessions inference. |
| users | Only activeUsers / TYPE_INTEGER is acquired and normalized as active_users | UNSUPPORTED for Blog users. totalUsers is not requested or normalized; its proposed Blog alias remains unapproved. Never copy/reconstruct from active_users. |
| engaged_sessions | engagedSessions / TYPE_INTEGER | Native nullable number of engaged sessions; not calculated from a rate. |
| engagement_rate | engagementRate / TYPE_FLOAT | Native nullable fraction, with no scaling to percentage and no recomputation from other metrics. |
| average_engagement_time | No engagement-duration metric or approved expression is acquired | UNSUPPORTED with independent DECISION_REQUIRED and SOURCE_CHANGE_REQUIRED. No calculation, zero/null placeholder or averageSessionDuration alias is emitted. |
| key_events | keyEvents / TYPE_FLOAT | Native nullable key-event count, retaining the source's fractional-capable representation. No eventCount/conversions substitute or historical equivalence assumption. |

Provider meanings and units are documented in the
[GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
User engagement duration is total seconds; average session duration is a different
metric. Google's [predefined reports](https://developers.google.com/analytics/devguides/reporting/data/v1/predefined-reports)
illustrate distinct engagement-duration expressions per session and per active
user. Neither denominator nor either expression is approved for this Blog field.
The current source acquires none of those duration metrics/expressions. Approve
the exact Blog meaning first, then separately extend acquisition/normalization/
validation if required. totalUsers support likewise needs an approved users
contract and a separate source change while preserving active_users distinctly.

The existing exact Content header names/types/order, single landingPage granularity,
bundle dataset identity, page offsets and request limit are rechecked. Paid Funnel
bundles, extra date/device/page dimensions, substituted metrics and unapproved
totalUsers/duration columns fail FIELD_REPRESENTATION_INVALID; their original raw
observations remain unchanged. The inspector also requires normalized row count
to equal the bundle's declared total. No duplicate rows or independent Jobs are
removed, and metrics are never merged across windows/properties/populations.

Presence is inspected at each actual provider cell's `value` property. A missing
value is FIELD_ABSENT even if normalization emits null. Present null and empty
strings retain existing null normalization, while actual numeric zero stays zero.
Malformed numeric values, missing/mismatched headers or incompatible representations
fail safely rather than becoming zero. Blank landing-page observations produce
FIELD_OBSERVATION_REQUIRED; no path reconstruction occurs. Empty accepted
VALID/NO_DATA/LOW_DATA cannot prove required observations, with independent original
source verdict/coverage blockers. Source validation itself remains unchanged.

GA4-local inspection marks `(not set)` as an unresolved landing-page observation
without changing its raw or normalized value. The shared helper's source-neutral
per-row unresolved-observation hook excludes marked values from observed_count
without reclassifying them as null/absent. Placeholder-only evidence has zero
identified pages; a placeholder plus one legitimate path has one. Either keeps
landing_page UNRESOLVED and produces FIELD_OBSERVATION_REQUIRED through the
existing evaluator. A legitimate path alone remains OBSERVED. Raw rows, source
validation, blank/null/missing behavior, metadata and independent provenance are
unchanged; another source's identical text receives no GA4 interpretation. This
does not approve page completeness or any other unresolved coverage policy.

Optional `ga4_requested_dates: {start_date, end_date} | null` adds ordered real
calendar endpoints to the existing version-1 explicit requirements profile.
Missing/null endpoints remain DECISION_REQUIRED (`ga4_requested_dates`) even with
empty decision lists; provided endpoints compare exactly with every verified
Content Job's `start_date`/`end_date`, producing WINDOW_MISMATCH on disagreement.
No 28/90-day or Paid Funnel duration is inherited. Existing open profile decisions
still require resolution; supplying dates does not silently clear them.

Bundle dates must match frozen Job context independently of Blog endpoint approval
(`ga4_request_window` / WINDOW_MISMATCH). Request context must be Content Performance
without Paid Funnel filters; supplied property_id must be numeric and match the
bundle's recorded acquisition property (`ga4_request_context` / EVIDENCE_INVALID).
Legacy Jobs without frozen property_id remain usable for inspection but retain
DECISION_REQUIRED (`property_scope`); raw acquisition identity does not retroactively
freeze a reviewed property or establish independent provider identity observation.

Read-only `field_checks.ga4_context` preserves the bundle's recorded property,
requested endpoints, validated response header names and existing normalized
provider currency/timezone metadata per Job. It contains no business row values.
These are requested/acquisition fields and provider metadata, not an invented
observed reporting period. Acquisition time and every original membership/context/
Run/Job/Attempt/Validation/Artifact reference remain unchanged. No current Workspace
connection, newer Run or inferred property timezone repairs historical evidence.

Mandatory GA4 coverage retains users/time semantic and source-capability blockers
and DECISION_REQUIRED (`content_coverage`) for unapproved page/property/population
completeness, even when decision lists are empty. Multiple legitimate Jobs remain
independent with existing multi_job_coverage blockers; there is no one-Job restriction.
All seven families now have inspection, but their documented gaps still prevent
real COMPLETE readiness. NOT_READY/PARTIAL/COMPLETE, EXPLICIT_REQUIREMENTS_ONLY and
delivery NOT_EVALUATED remain unchanged. No live GA4 or delivery acceptance is claimed.

---

## 16. Validation findings

Structured findings include:

```text
check_id
severity
passed
message
expected
actual
```

Severity:

```text
INFO
WARNING
ERROR
```

Prefer source-specific findings/operational codes over unnecessary global validation-status expansion.

---

## 17. Contract-change gate

Any change to persisted IDs, statuses, SQLite schema/constraints, artifact paths, TypeScript interfaces, IPC contracts, or serialization meaning requires:

```text
inspect live implementation and compatibility
→ add deterministic failing coverage
→ design migration/compatibility if needed
→ implement explicitly
→ verify affected boundaries
→ document the adopted contract
```

Documentation alone never performs a migration.

---

## 18. Governing data rule

> **If provider evidence does not prove a value, RoofRoom must not invent it, infer it as source fact, copy it from the request into observation, or replace it with zero.**
