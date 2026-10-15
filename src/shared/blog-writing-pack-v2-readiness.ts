import type { BlogWritingPackV2ResolvedEvidence } from './blog-writing-pack-v2-selection';

export const BLOG_WRITING_PACK_V2_MANDATORY_DATASETS = [
  'SEARCH_TERMS', 'QUERY_PAGE', 'KEYWORD_HISTORICAL_METRICS', 'PRODUCTS',
  'SITEMAP_URLS', 'GOOGLE_SERP', 'GA4_CONTENT_PERFORMANCE',
] as const;

export type BlogWritingPackV2MandatoryDataset = (typeof BLOG_WRITING_PACK_V2_MANDATORY_DATASETS)[number];

export interface BlogWritingPackV2DatasetRequirements {
  readonly open_decisions: readonly string[];
  readonly required_source_changes: readonly string[];
}

// Empty lists declare no additional checks; they do not approve downstream semantics.
export interface BlogWritingPackV2Requirements {
  readonly requirements_version: 1;
  readonly recipe_version: 2;
  readonly datasets: Partial<Record<BlogWritingPackV2MandatoryDataset, BlogWritingPackV2DatasetRequirements>>;
  readonly gsc_requested_dates: { readonly start_date: string; readonly end_date: string } | null;
  readonly ads_requested_dates?: { readonly start_date: string; readonly end_date: string } | null;
}

// Explicit conservative input for the current real contract; no period/metric defaults.
export const BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS: BlogWritingPackV2Requirements = {
  requirements_version: 1,
  recipe_version: 2,
  datasets: {
    SEARCH_TERMS: { open_decisions: ['reporting_window'], required_source_changes: [] },
    QUERY_PAGE: { open_decisions: [], required_source_changes: [] },
    KEYWORD_HISTORICAL_METRICS: { open_decisions: ['keyword_identity', 'historical_scope'], required_source_changes: [] },
    PRODUCTS: { open_decisions: ['category', 'price', 'availability', 'stock_status', 'product_status', 'freshness'], required_source_changes: [] },
    SITEMAP_URLS: { open_decisions: ['scope', 'freshness'], required_source_changes: ['page_type', 'title', 'status'] },
    GOOGLE_SERP: { open_decisions: ['capture_date', 'freshness'], required_source_changes: [] },
    GA4_CONTENT_PERFORMANCE: { open_decisions: ['users', 'average_engagement_time', 'reporting_window'], required_source_changes: ['average_engagement_time'] },
  },
  gsc_requested_dates: null,
  ads_requested_dates: null,
};

export type BlogWritingPackV2BlockerCode =
  | 'DATASET_MISSING' | 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED'
  | 'WINDOW_MISMATCH' | 'EVIDENCE_INVALID' | 'ARTIFACT_INTEGRITY_FAILED' | 'MEMBERSHIP_CHANGED'
  | 'FIELD_ABSENT' | 'FIELD_OBSERVATION_REQUIRED' | 'FIELD_REPRESENTATION_INVALID';

export interface BlogWritingPackV2FieldObservation {
  field: string;
  status: 'OBSERVED' | 'NULL' | 'ABSENT' | 'UNRESOLVED';
  observed_count: number;
  null_count: number;
  absent_count: number;
}

export interface BlogWritingPackV2ReadinessBlocker {
  code: BlogWritingPackV2BlockerCode;
  dataset_type: string;
  mandatory: boolean;
  selections: Array<Pick<BlogWritingPackV2ResolvedEvidence,
    'run_id' | 'job_id' | 'attempt_id' | 'validation_id' | 'artifact_id'>>;
  requirement_id: string;
  expected: string;
  actual: string;
  next_action: string;
}

export interface BlogWritingPackV2ReadinessEvaluation {
  evaluation_version: 1;
  recipe_version: 2;
  draft_package_id: string;
  workspace_id: string;
  coverage_scope: 'EXPLICIT_REQUIREMENTS_ONLY';
  coverage_status: 'NOT_READY' | 'PARTIAL' | 'COMPLETE';
  delivery_readiness: 'NOT_EVALUATED';
  requirements: BlogWritingPackV2Requirements;
  selected_evidence: BlogWritingPackV2ResolvedEvidence[];
  field_checks: Array<{
    run_id: string; job_id: string; artifact_id: string; dataset_type: string;
    row_count: number; fields: BlogWritingPackV2FieldObservation[];
  }>;
  datasets: Array<{
    dataset_type: BlogWritingPackV2MandatoryDataset;
    selected_count: number;
    usable_count: number;
    coverage_status: 'MISSING' | 'BLOCKED' | 'SATISFIED';
  }>;
  blockers: BlogWritingPackV2ReadinessBlocker[];
}
