# RoofRoom Data Collector — Project Handoff

**Checkpoint:** 2026-10-23 — documentation-only Collector direction reconciliation.
**Branch:** `codex/docs-collector-direction`.
**Implementation base:** `a1015a489bb6fa1b190ba997eeefb2456f9492dc`, the fetched
`origin/feat/google-analytics-4-source-v1` tip verified before this work began.
This branch changes five Markdown documents only. It adds no application behavior,
source capability, test result, dependency, migration or release acceptance.

## Product direction and next action

RoofRoom is a local-first, modular, multi-source desktop evidence collector:
Collect → Preserve → Validate → Normalize where deterministic → Document → Package
→ Export. Prefer supported, authorized APIs over repetitive provider-site visits;
controlled provider exports and explicit imports retain their actual acquisition modes.
Users manually import exported files into ChatGPT Projects. No in-app LLM analysis,
SEO/Ads recommendations, scoring, content generation, business decisions or automatic uploads.

General accepted-raw Run export is the primary delivery workflow. A Blog collection
Run and an Ads collection Run produce separate folders, each retaining its own
source-specific Jobs and evidence. General export does not automatically combine
unrelated Runs. Existing specialized cross-Run packaging stays explicit and separate.
Blog/Ads package completeness cannot become a prerequisite for otherwise eligible
general raw export; acceptance, identity, integrity and export eligibility still apply.

Development priorities:

1. Start from this branch's actual base and preserve the implementation/verification
   distinctions below. Do not assume local feature WIP is present on GitHub.
2. Implement the approved export-time destination-parent picker through existing
   privileged desktop mechanisms. Every invocation asks; cancellation creates no
   export; an identifiable Run-specific child is created without silent overwrite.
   Keep canonical evidence in protected application storage and report the actual
   destination and truthful collection/export outcome. **The picker is not implemented.**
   Requirements: `PROJECT_SPEC.md`; future focused checks: `TEST_STRATEGY.md`.
3. Obtain separate authorization for bounded real collection → accepted raw evidence
   → Run export acceptance. Prior synthetic/runtime checks do not prove expanded
   source acquisition or current live-provider acceptance.
4. Establish direct acquisition feasibility for remaining manual/unsupported paths,
   including desired İkas API acquisition and future Semrush scope. Add no speculative
   API support or new Release 1.0 commitment.
5. Verify practical completion/status/destination reporting and any implemented
   general-export Open/Reveal behavior at its actual desktop boundary.

## Implemented in the remote base

| Area | Actual implementation boundary |
| --- | --- |
| Shared application | One Electron application; source-neutral Core; Workspace-owned Runs; independent source Jobs and immutable Attempts; privileged credentials/filesystem; source-owned provider semantics |
| General raw Run export | `ProductionDataPackageLoader.loadRunExport` requires a known terminal Run. Export All / Successful Only preserve accepted native files, provenance and integrity with `RAW_EVIDENCE.json`, manifests and available normalized datasets. Collection completeness and export success remain distinct; failed/missing evidence is not fabricated. |
| Current export destination | Application-owned per-Run export storage, with overwrite refusal. No export-time destination-parent picker and no stable non-terminal `RETRY_REQUIRED` export capability in this base. |
| Google Trends | Controlled browser/provider CSV acquisition; relative interest, not an official API or absolute volume. Later Turkish label support and explicit-scope hardening are withheld below. |
| GSC / Google Ads / Keyword Planner | Existing official API paths and source-native dataset contracts; Planner's explicit manual CSV fallback remains a separate mode. Implementation alone grants no source-wide live acceptance. |
| GA4 | Official Data API `runReport` source, Content v1/v2 and distinct Paid Funnel contracts with source-owned normalization. Expanded general normalized GA4/configuration export integration exists only as separate local WIP, not this branch. |
| İkas / Sitemap / SERP | İkas Products XLSX FILE_IMPORT (`supports_api: false`); bounded HTTP/XML sitemap collection; on-demand SerpApi acquisition. Semrush collection is not implemented. |
| Specialized packages | Existing Ads and Blog v1 package paths; Blog v2 multi-Run backend draft/readiness and JSON-only publication mechanics. These do not establish real Blog COMPLETE coverage or full delivery. The later Blog v2 desktop selection/verified JSON Open/Reveal interface is not in this base. |

Raw evidence is authoritative. Preserve requested versus observed context, null or
missing versus actual zero, independent identities, deterministic source-traceable
derivations and original bytes. Optional normalization cannot invent absent fields.
Detailed source/export eligibility remains in `DATA_CONTRACTS.md` and `VALIDATION_SPEC.md`.

## Withheld local commits and WIP — absent from this branch

The existing local feature worktree and its history are preserved separately.
The following commits are not ancestors of this documentation branch and must not
be represented as delivered by its remote implementation:

| Local commit | Withheld implementation |
| --- | --- |
| `84094a8119cff0f8facb94a74db67f1cbde40046` | Observed Turkish Trends weekly CSV label/category compatibility and focused tests |
| `cfd82d68e023ce73b411391aa3db56636397ae7f` | Explicit `node:sqlite` main-bundle external and actual Forge/Vite build regression |
| `6dd1d5f246c31a9706d9d9f50c11999a3946bb44` | Trends trusted group/explicit-date Review/Start scope hardening plus stable partial general exports, snapshot metadata and UI controls |

Local documentation commit `985c92bc107402cd00e569b320a6d8669bd45e2c` is not
included either. Its four compatible document changes were reapplied; this handoff
was reconciled separately against the remote base. Later local implementation WIP
includes expanded general export integration, Blog v2 desktop/JSON access and
selected-window GSC cutoff proof. None is shipped by this documentation branch.
Private reports, raw evidence, receipts and other worktrees remain outside this commit.

## Verification limits and specialized blockers

The base's prior deterministic raw-export record reports 10/10 cases and affected
renderer/loader/exporter checks. Prior isolated packaged QA reports actual UI/IPC
exports of prepared accepted fixtures, byte/hash/provenance checks, truthful status
and overwrite refusal. Fixture acquisition in compiled Node is not packaged-provider
acquisition. These are historical records, not fresh checks for this documentation task.

The owning records already present in the base are:
- `docs/superpowers/plans/2026-10-19-development-checkpoint.md`;
- `docs/superpowers/plans/2026-10-20-desktop-raw-export-completion.md`;
- `docs/superpowers/plans/2026-10-20-isolated-packaged-acceptance.md`.

No new application tests, package build, installation, provider request, production
export, credential change or Keychain experiment is authorized by this documentation
publication. General-export Open/Reveal and expanded source live acceptance remain
unverified. Local historical GT01/KWP01 acceptance records are not acceptance of
this remote branch. The later local Keychain-dependent runtime check stays pending
by user choice; it neither qualifies this base nor authorizes a new experiment.

Specialized Blog v2 requirements remain intact and separate from general export.
In this base, GSC preserves final/date observations but still blocks whole-window/
latest-at-publication eligibility with `gsc_finality`; the later local positive-cutoff
implementation is absent. Planner calendar/currency/coverage, product field/freshness,
sitemap page evidence and other mandatory coverage limitations remain as recorded
in `DATA_CONTRACTS.md`. No COMPLETE package claim or weaker policy follows from
these priorities. Specialized compliance work requires its own approved scope.

## Authority routing

- Product scope and future export destination: `PROJECT_SPEC.md`.
- Source-neutral ownership and privilege boundaries: `ARCHITECTURE.md`, `SOURCE_MODULE_GUIDE.md`.
- Evidence/source/package contracts and unresolved requirements: `DATA_CONTRACTS.md`.
- Validation and verification depth: `VALIDATION_SPEC.md`, `TEST_STRATEGY.md`.
- Approved product-direction decision: ADR-069 in `DECISIONS.md`.
- Approved GA4 extension: `docs/superpowers/specs/2026-10-03-google-analytics-4-source-design.md`.

Implementation history remains in Git and the owning completed plans. Keep this
handoff a current-state router; do not revive older next-action priorities merely
because a completed historical plan contains them.
