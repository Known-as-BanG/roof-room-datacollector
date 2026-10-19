import { SitemapContextError } from '../sources/bitkimark/bitkimark-sitemap-field-inspector';
import { SerpApiContextError, SERP_SNAPSHOT_OPEN_REQUIREMENTS } from '../sources/serpapi/serpapi-field-inspector';
import { GoogleAnalytics4EvidenceError } from '../sources/google-analytics-4/google-analytics-4-field-inspector';
import { IkasProductsContextError } from '../sources/ikas/ikas-products-field-inspector';
import { KeywordPlannerEvidenceError } from '../sources/google-ads/keyword-planner-field-inspector';
import { isDeepStrictEqual } from 'node:util';
import type { ProductionDataPackageLoader } from '../export/production-data-package-loader';
import { inspectBlogWritingPackV2Fields } from './blog-writing-pack-v2-field-compliance';
import {
  BLOG_WRITING_PACK_V2_MANDATORY_DATASETS,
  type BlogWritingPackV2ReadinessBlocker,
  type BlogWritingPackV2ReadinessEvaluation,
  type BlogWritingPackV2Requirements,
} from '../../shared/blog-writing-pack-v2-readiness';
import type { BlogWritingPackV2ResolvedEvidence } from '../../shared/blog-writing-pack-v2-selection';
import type { BlogWritingPackStore } from './blog-writing-pack-store';
import { resolveBlogWritingPackV2Selections } from './blog-writing-pack-v2-selection-resolver';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean => (
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
);
const requirementIds = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0)
  && new Set(value).size === value.length
);
const dateValue = (value: unknown): number => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return NaN;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
};

const snapshotRequirements = (input: BlogWritingPackV2Requirements): BlogWritingPackV2Requirements => {
  const value: unknown = JSON.parse(JSON.stringify(input));
  if (
    !isRecord(value) || !exactKeys(value, ['requirements_version', 'recipe_version', 'datasets', 'gsc_requested_dates', ...['ads_requested_dates', 'keyword_planner_scope', 'ga4_requested_dates'].filter((key) => Object.hasOwn(value, key))])
    || value.requirements_version !== 1 || value.recipe_version !== 2 || !isRecord(value.datasets)
  ) throw new Error('Blog v2 requirements profile is invalid.');
  for (const [dataset, requirements] of Object.entries(value.datasets)) {
    if (
      !(BLOG_WRITING_PACK_V2_MANDATORY_DATASETS as readonly string[]).includes(dataset)
      || !isRecord(requirements) || !exactKeys(requirements, ['open_decisions', 'required_source_changes'])
      || !requirementIds(requirements.open_decisions) || !requirementIds(requirements.required_source_changes)
    ) throw new Error('Blog v2 dataset requirements are unsupported or invalid.');
  }
  const dates = value.gsc_requested_dates;
  if (dates !== null && (
    !isRecord(dates) || !exactKeys(dates, ['start_date', 'end_date'])
    || !Number.isFinite(dateValue(dates.start_date)) || !Number.isFinite(dateValue(dates.end_date))
    || dateValue(dates.end_date) - dateValue(dates.start_date) !== 27 * 86_400_000
  )) throw new Error('Blog v2 GSC requirements must specify exactly 28 inclusive calendar dates.');
  const adsDates = value.ads_requested_dates;
  if (adsDates !== null && adsDates !== undefined && (
    !isRecord(adsDates) || !exactKeys(adsDates, ['start_date', 'end_date'])
    || !Number.isFinite(dateValue(adsDates.start_date)) || !Number.isFinite(dateValue(adsDates.end_date))
    || dateValue(adsDates.end_date) < dateValue(adsDates.start_date)
  )) throw new Error('Blog v2 Ads requirements must specify valid ordered calendar endpoints.');
  const scope = value.keyword_planner_scope;
  if (scope !== null && scope !== undefined && (
    !isRecord(scope) || !exactKeys(scope, ['requested_date_start', 'requested_date_end', 'country_code', 'language_code', 'keyword_plan_network'])
    || !Number.isFinite(dateValue(scope.requested_date_start)) || !Number.isFinite(dateValue(scope.requested_date_end))
    || dateValue(scope.requested_date_end) < dateValue(scope.requested_date_start)
    || !['country_code', 'language_code', 'keyword_plan_network'].every((key) => typeof scope[key] === 'string' && (scope[key] as string).trim().length > 0)
  )) throw new Error('Blog v2 Keyword Planner requirements scope is invalid.');
  const ga4Dates = value.ga4_requested_dates;
  if (ga4Dates !== null && ga4Dates !== undefined && (
    !isRecord(ga4Dates) || !exactKeys(ga4Dates, ['start_date', 'end_date'])
    || !Number.isFinite(dateValue(ga4Dates.start_date)) || !Number.isFinite(dateValue(ga4Dates.end_date))
    || dateValue(ga4Dates.end_date) < dateValue(ga4Dates.start_date)
  )) throw new Error('Blog v2 GA4 requirements must specify valid ordered calendar endpoints.');
  return value as unknown as BlogWritingPackV2Requirements;
};

export const evaluateBlogWritingPackV2Readiness = async (
  input: { package_id: string; workspace_id: string; requirements: BlogWritingPackV2Requirements; evaluated_at?: string; evaluation_phase?: 'PUBLICATION' },
  dependencies: Parameters<typeof resolveBlogWritingPackV2Selections>[1] & {
    store: Pick<BlogWritingPackStore, 'readDraft'>;
    loader: Pick<ProductionDataPackageLoader, 'verifyAcceptedJobArtifact' | 'readAcceptedJobArtifact'>;
  },
): Promise<BlogWritingPackV2ReadinessEvaluation> => {
  const requirements = snapshotRequirements(input.requirements);
  const evaluatedAt = input.evaluated_at;
  const publicationAt = input.evaluation_phase === 'PUBLICATION' ? evaluatedAt : undefined;
  if (input.evaluation_phase === 'PUBLICATION' && (typeof publicationAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(publicationAt)
    || !Number.isFinite(Date.parse(publicationAt)) || new Date(publicationAt).toISOString() !== publicationAt)) {
    throw new Error('Publication readiness requires an explicit UTC creation timestamp.');
  }
  const draft = await dependencies.store.readDraft(input.package_id);
  if (draft.workspace_id !== input.workspace_id) throw new Error('Blog v2 draft is outside the selected Workspace.');
  const blockers: BlogWritingPackV2ReadinessBlocker[] = [];
  const field_checks: BlogWritingPackV2ReadinessEvaluation['field_checks'] = [];
  const verified = new Set<BlogWritingPackV2ResolvedEvidence>();
  const usable = new Set<BlogWritingPackV2ResolvedEvidence>();
  const add = (
    dataset_type: string, evidence: BlogWritingPackV2ResolvedEvidence[],
    code: BlogWritingPackV2ReadinessBlocker['code'], requirement_id: string,
    expected: string, actual: string, next_action: string,
  ): void => {
    blockers.push({ code, dataset_type, mandatory: dataset_type !== 'INTEREST_OVER_TIME',
      selections: evidence.map(({ run_id, job_id, attempt_id, validation_id, artifact_id }) => (
        { run_id, job_id, attempt_id, validation_id, artifact_id }
      )), requirement_id, expected, actual, next_action });
  };

  for (const evidence of draft.selected_evidence) {
    try {
      const [current] = await resolveBlogWritingPackV2Selections({
        recipe_version: 2, workspace_id: draft.workspace_id,
        selections: [{ run_id: evidence.run_id, job_id: evidence.job_id, artifact_id: evidence.artifact_id }],
      }, dependencies);
      if (!isDeepStrictEqual(current, evidence)) {
        add(evidence.dataset_type, [evidence], 'MEMBERSHIP_CHANGED', 'frozen_provenance',
          'Exact persisted evidence identities, integrity references, and context',
          'Current accepted provenance differs from frozen draft membership.',
          'Review the changed evidence and explicitly assemble a new draft if appropriate.');
      } else {
        verified.add(evidence);
        if (evidence.validation_status !== 'VALID') {
          add(evidence.dataset_type, [evidence], 'DECISION_REQUIRED', 'validation_outcome_coverage',
            'An established source-specific coverage rule for this accepted outcome', evidence.validation_status,
            'Define source-specific LOW_DATA/NO_DATA coverage without fabricating rows or zeros.');
        } else {
          usable.add(evidence);
        }
      }
    } catch (error: unknown) {
      const integrity = error instanceof Error && /checksum|byte size|regular file/iu.test(error.message);
      add(evidence.dataset_type, [evidence], integrity ? 'ARTIFACT_INTEGRITY_FAILED' : 'EVIDENCE_INVALID',
        integrity ? 'artifact_integrity' : 'accepted_evidence_identity',
        'The frozen selection must pass the existing Slice 1 identity and integrity checks',
        integrity ? 'Selected raw artifact failed integrity verification.' : 'Selected evidence failed accepted-evidence revalidation.',
        'Inspect the exact referenced evidence; do not repair it or substitute a newer Run.');
    }
  }

  for (const evidence of verified) {
    if (!['SEARCH_TERMS', 'QUERY_PAGE', 'KEYWORD_HISTORICAL_METRICS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP', 'GA4_CONTENT_PERFORMANCE'].includes(evidence.dataset_type)) continue;
    try {
      const loaded = await dependencies.loader.readAcceptedJobArtifact(evidence.run_id, evidence.job_id);
      if (loaded.artifact.artifact_id !== evidence.artifact_id || loaded.artifact.sha256 !== evidence.artifact_sha256
        || loaded.artifact.byte_size !== evidence.artifact_byte_size || !isDeepStrictEqual(loaded.requested_context, evidence.requested_context)
        || !isDeepStrictEqual(loaded.serp_acquisition, evidence.serp_acquisition)
        || !isDeepStrictEqual(loaded.gsc_date_coverage, evidence.gsc_date_coverage)) {
        add(evidence.dataset_type, [evidence], 'MEMBERSHIP_CHANGED', 'frozen_provenance',
          'Exact frozen accepted artifact and context', 'Evidence changed during field inspection.', 'Review evidence without changing this draft.');
        continue;
      }
      const inspected = inspectBlogWritingPackV2Fields(evidence.source_id,
        ['KEYWORD_HISTORICAL_METRICS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP', 'GA4_CONTENT_PERFORMANCE'].includes(evidence.dataset_type) ? loaded.bytes
          : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes)), loaded.requested_context, evidence.acquired_at, publicationAt ?? draft.created_at,
        { acquisition: loaded.serp_acquisition, evaluated_at: evaluatedAt === undefined ? draft.created_at : evaluatedAt,
          reference_origin: publicationAt !== undefined ? 'PACKAGE_CREATED_AT' : evaluatedAt === undefined ? 'DRAFT_CREATED_AT' : 'EXPLICIT_DRAFT_EVALUATION' }, publicationAt, loaded.gsc_date_coverage_evidence);
      field_checks.push({ run_id: evidence.run_id, job_id: evidence.job_id, artifact_id: evidence.artifact_id,
        dataset_type: evidence.dataset_type, row_count: inspected.rows.length, fields: inspected.fields,
        ...(inspected.serp_provenance ? { serp_provenance: inspected.serp_provenance } : {}),
        ...(inspected.serp_freshness ? { serp_freshness: inspected.serp_freshness } : {}),
        ...(inspected.publication_time_context ? { publication_time_context: inspected.publication_time_context } : {}),
        ...(inspected.gsc_date_coverage ? { gsc_date_coverage: inspected.gsc_date_coverage } : {}),
        ...(inspected.ga4_context ? { ga4_context: inspected.ga4_context } : {}) });
      for (const issue of inspected.publication_issues ?? []) {
        add(evidence.dataset_type, [evidence], issue.code, issue.requirement_id, 'Approved provider-backed publication-time requirement', issue.actual,
          'Resolve the exact source evidence or calendar/finality contract gap; do not reuse a draft-time pass or invent observations.');
      }
      for (const issue of inspected.serp_issues ?? []) {
        add(evidence.dataset_type, [evidence], issue.code, issue.requirement_id,
          'Verified collector receipt and an explicit UTC draft reference with 0 <= age <= 604800000 milliseconds', issue.actual,
          'Inspect the exact acquisition provenance and evaluation time; explicitly select different evidence in a new draft if necessary.');
      }
      for (const issue of inspected.ga4_issues ?? []) {
        add(evidence.dataset_type, [evidence], issue.code, issue.requirement_id, 'Approved provider-backed Content Performance meaning and scope',
          issue.actual, 'Resolve the exact GA4 source or semantic gap without substituting metrics or reconstructing observations.');
      }
      for (const field of inspected.serp_missing_observations ?? []) {
        add(evidence.dataset_type, [evidence], 'FIELD_OBSERVATION_REQUIRED', field,
          'An actual nonblank provider result observation or existing observed-link domain mapping',
          'A required result observation is null or blank.', 'Select compatible evidence without constructing missing titles, URLs or domains.');
      }
      for (const limitation of inspected.limitations) {
        add(evidence.dataset_type, [evidence], limitation === 'currency_context' ? 'SOURCE_CHANGE_REQUIRED' : 'DECISION_REQUIRED',
          limitation, 'Established provider-native meaning and context',
          limitation === 'currency_context' ? 'API evidence does not capture observed account currency.'
            : limitation === 'manual_csv_scope' ? 'Manual import context does not establish requested historical/geographic/language/network scope.'
              : 'Observed competition category is outside currently established API category semantics.',
          'Resolve the source-specific gap explicitly; do not infer values or change acquisition in this slice.');
      }
      for (const issue of inspected.product_issues ?? []) {
        add(evidence.dataset_type, [evidence], issue.code, issue.requirement_id, 'Provider-backed product field meaning',
          issue.actual, 'Resolve the exact product semantic/source gap without inventing provider values.');
      }
      for (const issue of inspected.sitemap_issues ?? []) {
        add(evidence.dataset_type, [evidence], issue.code, issue.requirement_id, 'Observed webpage field with established source meaning',
          issue.actual, 'Resolve this Sitemap evidence/source gap in a separately approved follow-up.');
      }
      for (const field of inspected.fields) {
        if (evidence.dataset_type === 'GOOGLE_SERP' && field.field === 'capture_date') continue;
        if (evidence.dataset_type === 'SITEMAP_URLS' && field.status === 'UNSUPPORTED') continue;
        if (evidence.dataset_type === 'PRODUCTS' && ['UNRESOLVED', 'UNSUPPORTED'].includes(field.status)) continue;
        if (field.status === 'ABSENT' || field.status === 'UNRESOLVED') {
          add(evidence.dataset_type, [evidence], field.status === 'ABSENT' ? 'FIELD_ABSENT' : 'FIELD_OBSERVATION_REQUIRED',
            field.field, 'Supported field actually present in source rows, including legitimate explicit null',
            field.status === 'ABSENT' ? `Absent in ${field.absent_count} source rows.` : 'Source observations do not establish complete field compliance.',
            'Select compatible evidence; do not fill absent fields with zeros or reconstructed values.');
        }
      }
    } catch (error: unknown) {
      if (error instanceof GoogleAnalytics4EvidenceError) {
        add(evidence.dataset_type, [evidence], error.code, error.requirement_id, 'Compatible frozen GA4 property/request and provider-timezone/reference context',
          error.requirement_id === 'ga4_timezone' ? 'Provider timezone observations are invalid or conflicting.'
            : error.requirement_id === 'ga4_reference_time' ? 'Draft creation time is not a valid explicit reference instant.'
              : 'Selected property, report or requested window is incompatible.',
          'Inspect the exact selected evidence without changing its context or raw bytes.');
        continue;
      }
      if (error instanceof SerpApiContextError) {
        add(evidence.dataset_type, [evidence], 'EVIDENCE_INVALID', 'serp_request_context', 'Valid accepted SERP THIRD_PARTY_API context',
          'Source/task/request scope is incompatible.', 'Inspect the selected context without substituting query or search scope.');
        continue;
      }
      if (error instanceof SitemapContextError) {
        add(evidence.dataset_type, [evidence], 'EVIDENCE_INVALID', 'sitemap_request_context', 'Valid accepted Sitemap HTTP_XML context',
          'Source/task/request scope is incompatible.', 'Inspect the exact selected context; do not substitute requested scope or a newer Run.');
        continue;
      }
      if (error instanceof IkasProductsContextError) {
        add(evidence.dataset_type, [evidence], 'EVIDENCE_INVALID', 'ikas_request_context', 'Valid accepted İkas FILE_IMPORT context',
          'Source/task/import context is incompatible.', 'Inspect the exact selected source context without reopening an import path.');
        continue;
      }
      if (error instanceof KeywordPlannerEvidenceError) {
        add(evidence.dataset_type, [evidence], error.requirement_id === 'observed_keyword' ? 'FIELD_OBSERVATION_REQUIRED' : 'EVIDENCE_INVALID',
          error.requirement_id, 'Valid source request context and an actual provider-observed keyword',
          'Selected evidence cannot establish the required source identity or context.',
          'Inspect the exact accepted evidence without substituting requested keywords or scope.');
        continue;
      }
      const integrity = error instanceof Error && /checksum|byte size|regular file/iu.test(error.message);
      add(evidence.dataset_type, [evidence], integrity ? 'ARTIFACT_INTEGRITY_FAILED' : 'FIELD_REPRESENTATION_INVALID',
        'field_compliance', 'Supported source representation with provider-faithful normalization',
        integrity ? 'Selected raw artifact failed integrity verification.' : 'Selected artifact cannot establish compatible normalized fields.',
        'Inspect the exact source representation; do not mutate accepted evidence.');
    }
  }

  const datasets: BlogWritingPackV2ReadinessEvaluation['datasets'] = BLOG_WRITING_PACK_V2_MANDATORY_DATASETS.map((dataset_type) => {
    const evidence = draft.selected_evidence.filter((item) => item.dataset_type === dataset_type);
    if (dataset_type === 'GA4_CONTENT_PERFORMANCE') {
      const contexts = field_checks.filter((check) => check.dataset_type === dataset_type).flatMap((check) => check.ga4_context ? [check.ga4_context] : []);
      if (new Set(contexts.map((context) => context.property_id)).size > 1) {
        add(dataset_type, evidence, 'EVIDENCE_INVALID', 'ga4_property_scope', 'One explicitly bound GA4 property',
          'Selected Content reports refer to different acquisition properties.', 'Select compatible evidence without rewriting frozen property identities.');
      }
      if (new Set(contexts.flatMap((context) => context.reporting_window ? [context.reporting_window.time_zone] : [])).size > 1) {
        add(dataset_type, evidence, 'EVIDENCE_INVALID', 'ga4_timezone', 'Consistent provider-observed property timezone',
          'Selected Content reports provide conflicting property timezones.', 'Select compatible evidence without inventing a timezone or merging reports.');
      }
    }
    if (evidence.length === 0) {
      add(dataset_type, [], 'DATASET_MISSING', 'mandatory_presence', 'Selected accepted evidence for this mandatory family',
        'No evidence selected.', 'Explicitly select compatible accepted evidence and assemble a new draft.');
    }
    const familyRequirements = requirements.datasets[dataset_type];
    if (familyRequirements === undefined) {
      add(dataset_type, evidence, 'DECISION_REQUIRED', 'dataset_requirements', 'Explicit requirements for this family',
        'No requirements supplied.', 'Supply an explicit approved family requirements profile.');
    } else {
      for (const decision of familyRequirements.open_decisions) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', decision, 'Approved requirement semantics',
          'Requirement remains unresolved.', 'Resolve this requirement before mandatory coverage can pass.');
      }
      for (const change of familyRequirements.required_source_changes) {
        add(dataset_type, evidence, 'SOURCE_CHANGE_REQUIRED', change, 'Required source capability',
          'Current source capability is insufficient.', 'Implement and verify a separately approved source extension.');
      }
    }
    if (dataset_type === 'GOOGLE_SERP' && evidence.length > 0) {
      for (const [requirement_id, actual] of Object.entries(SERP_SNAPSHOT_OPEN_REQUIREMENTS)) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', requirement_id, 'Explicit approved Blog SERP semantics and scope', actual,
          'Approve the exact unresolved requirement before coverage can pass; preserve all source observations and provenance.');
      }
    }
    if (dataset_type === 'SITEMAP_URLS' && evidence.length > 0) {
      add(dataset_type, evidence, 'DECISION_REQUIRED', 'scope', 'An approved Sitemap selection and website inventory coverage rule',
        'Selected documents do not establish complete website inventory.',
        'Approve the required document scope; do not infer completeness or traverse unselected sitemaps.');
    }
    if (dataset_type === 'PRODUCTS' && evidence.length > 0) {
      add(dataset_type, evidence, 'DECISION_REQUIRED', 'freshness', 'An approved product snapshot-age and observation-time policy',
        'Artifact acquisition time does not establish provider observation time or an approved age limit.',
        'Approve product freshness semantics; do not reinterpret acquisition time as provider observation time.');
    }
    if (dataset_type === 'KEYWORD_HISTORICAL_METRICS') {
      if (evidence.length > 0) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', 'keyword_coverage', 'An approved Blog keyword set and per-Job coverage policy',
          'Blog keyword completeness rules are unspecified.',
          'Define required keyword coverage explicitly; do not assume one Job or a union of Jobs is complete.');
      }
      const scope = requirements.keyword_planner_scope;
      if (scope === null || scope === undefined) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', 'keyword_planner_scope', 'Explicit approved Blog historical and request scope',
          'No approved scope supplied.', 'Supply approved endpoints, country, language and network; do not inherit Ads Growth policy.');
      } else {
        for (const item of evidence.filter((candidate) => verified.has(candidate) && candidate.source_id === 'google-keyword-planner')) {
          const context = isRecord(item.requested_context) ? item.requested_context : {};
          if (Object.entries(scope).some(([key, value]) => context[key] !== value)) {
            add(dataset_type, [item], 'WINDOW_MISMATCH', 'keyword_planner_scope', 'Exact approved historical and request scope',
              'Selected requested context differs from the approved Blog scope.',
              'Select evidence with the approved context; do not filter or reconstruct historical aggregates.');
          }
        }
      }
    }
    if (evidence.length > 1) {
      add(dataset_type, evidence, 'DECISION_REQUIRED', 'multi_job_coverage', 'Source-specific explicit multi-Job coverage rules',
        'Multiple selected Jobs; overlap and completeness are not evaluated in this slice.',
        'Define the required source-specific scopes; retain each selected identity separately.');
    }
    if (dataset_type === 'GA4_CONTENT_PERFORMANCE') {
      const dates = requirements.ga4_requested_dates;
      if (dates === null || dates === undefined) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', 'ga4_requested_dates', 'Explicit approved Content Performance endpoints',
          'No approved endpoints supplied.', 'Approve exact dates without inheriting Paid Funnel or a default duration.');
      } else {
        for (const item of evidence.filter((candidate) => verified.has(candidate))) {
          const context = isRecord(item.requested_context) ? item.requested_context : {};
          if (context.start_date !== dates.start_date || context.end_date !== dates.end_date) {
            add(dataset_type, [item], 'WINDOW_MISMATCH', 'ga4_requested_dates', 'Exact approved requested calendar endpoints',
              'Selected Content Performance requested dates differ from the approved window.',
              'Select compatible evidence; do not combine windows or reconstruct aggregate metrics.');
          }
        }
      }
    }
    if (dataset_type === 'QUERY_PAGE' || dataset_type === 'SEARCH_TERMS') {
      const gsc = dataset_type === 'QUERY_PAGE';
      const requirement = gsc ? 'gsc_requested_dates' : 'ads_requested_dates';
      const dates = gsc ? requirements.gsc_requested_dates : requirements.ads_requested_dates ?? null;
      if (dates === null) {
        add(dataset_type, evidence, 'DECISION_REQUIRED', requirement, 'Explicit approved start and end dates',
          'No approved endpoints supplied.', gsc ? 'Supply exact 28-day endpoints; do not infer a reference date or timezone.' : 'Supply approved Ads endpoints; no reporting duration is assumed.');
      } else {
        for (const item of evidence.filter((candidate) => verified.has(candidate))) {
          const context = isRecord(item.requested_context) ? item.requested_context : {};
          if (context.requested_date_start !== dates.start_date || context.requested_date_end !== dates.end_date) {
            add(dataset_type, [item], 'WINDOW_MISMATCH', requirement, JSON.stringify(dates),
              JSON.stringify({ start_date: context.requested_date_start ?? null, end_date: context.requested_date_end ?? null }),
              'Select evidence requested for the exact approved endpoints; do not reconstruct aggregate daily data.');
          }
        }
      }
    }
    return {
      dataset_type, selected_count: evidence.length, usable_count: evidence.filter((item) => usable.has(item)).length,
      coverage_status: evidence.length === 0 ? 'MISSING'
        : blockers.some((blocker) => blocker.dataset_type === dataset_type) ? 'BLOCKED' : 'SATISFIED',
    };
  });

  return {
    evaluation_version: 1, recipe_version: 2, draft_package_id: draft.package_id, workspace_id: draft.workspace_id,
    ...(publicationAt === undefined ? {} : { evaluation_phase: 'PUBLICATION' as const, evaluated_at: publicationAt }),
    coverage_scope: 'EXPLICIT_REQUIREMENTS_ONLY',
    coverage_status: datasets.every((item) => item.coverage_status === 'SATISFIED') && !blockers.some((item) => item.mandatory)
      ? 'COMPLETE' : datasets.some((item) => item.usable_count > 0) ? 'PARTIAL' : 'NOT_READY',
    delivery_readiness: 'NOT_EVALUATED', requirements, selected_evidence: draft.selected_evidence, datasets, blockers, field_checks,
  };
};
