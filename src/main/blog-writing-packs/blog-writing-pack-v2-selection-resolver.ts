import type { ArtifactRecord } from '../../shared/artifact';
import type { AttemptRecord } from '../../shared/attempt';
import type {
  BlogWritingPackV2ResolvedEvidence,
  BlogWritingPackV2SelectionIntent,
} from '../../shared/blog-writing-pack-v2-selection';
import type { JobRecord, RunRecord } from '../../shared/run-job';
import type { ValidationSummaryRecord } from '../../shared/validation-summary';
import type { ProductionDataPackageLoader } from '../export/production-data-package-loader';

const DATASET_BY_SOURCE: Readonly<Record<string, string>> = {
  'google-ads-search-terms': 'SEARCH_TERMS',
  'google-search-console-query-page': 'QUERY_PAGE',
  'google-keyword-planner': 'KEYWORD_HISTORICAL_METRICS',
  'google-keyword-planner-csv': 'KEYWORD_HISTORICAL_METRICS',
  'ikas-products': 'PRODUCTS',
  'bitkimark-sitemap': 'SITEMAP_URLS',
  serpapi: 'GOOGLE_SERP',
  'google-analytics-4': 'GA4_CONTENT_PERFORMANCE',
  'google-trends': 'INTEREST_OVER_TIME',
};

type Repository = {
  getRun(run_id: string): RunRecord | null;
  listJobs(run_id: string): JobRecord[];
  getArtifact(artifact_id: string): ArtifactRecord | null;
  listAttempts(job_id: string): AttemptRecord[];
  getValidationSummary(validation_id: string): ValidationSummaryRecord | null;
};

const acceptedState = (status: JobRecord['validation_status']): ArtifactRecord['artifact_state'] | null => {
  if (status === 'VALID') return 'ACCEPTED';
  if (status === 'LOW_DATA' || status === 'NO_DATA') return 'ACCEPTED_WITH_WARNING';
  return null;
};

export const resolveBlogWritingPackV2Selections = async (
  intent: BlogWritingPackV2SelectionIntent,
  dependencies: {
    repository: Repository;
    loader: Pick<ProductionDataPackageLoader, 'verifyAcceptedJobArtifact'>;
  },
): Promise<BlogWritingPackV2ResolvedEvidence[]> => {
  if (
    intent.recipe_version !== 2
    || typeof intent.workspace_id !== 'string'
    || intent.workspace_id.length === 0
    || !Array.isArray(intent.selections)
    || intent.selections.length === 0
  ) throw new Error('Blog v2 selection intent is invalid.');

  const seen = new Set<string>();
  const resolved: BlogWritingPackV2ResolvedEvidence[] = [];
  for (const selection of intent.selections) {
    if (
      typeof selection?.run_id !== 'string' || selection.run_id.length === 0
      || typeof selection.job_id !== 'string' || selection.job_id.length === 0
      || typeof selection.artifact_id !== 'string' || selection.artifact_id.length === 0
    ) throw new Error('Blog v2 evidence selection is invalid.');

    const key = `${selection.run_id}\0${selection.job_id}\0${selection.artifact_id}`;
    if (seen.has(key)) throw new Error('Duplicate Blog v2 evidence selection.');
    seen.add(key);

    const run = dependencies.repository.getRun(selection.run_id);
    if (
      run === null || run.workspace_id !== intent.workspace_id
      || (run.run_status !== 'COMPLETED' && run.run_status !== 'COMPLETED_WITH_WARNINGS')
    ) throw new Error('Blog v2 Run is unavailable, incomplete, or outside the Workspace.');

    const job = dependencies.repository.listJobs(run.run_id).find((candidate) => candidate.job_id === selection.job_id);
    if (
      job === undefined || job.run_id !== run.run_id
      || job.execution_status !== 'COMPLETED'
      || job.accepted_artifact_id !== selection.artifact_id
    ) throw new Error('Blog v2 Job is not accepted for the selected Run and artifact.');

    const datasetType = DATASET_BY_SOURCE[job.source_id];
    if (
      datasetType === undefined
      || (job.source_context.source_id !== undefined && job.source_context.source_id !== job.source_id)
      || (job.source_context.dataset_type !== undefined && job.source_context.dataset_type !== datasetType)
      || (job.source_id === 'google-analytics-4' && job.source_context.dataset_type !== datasetType)
    ) throw new Error('Blog v2 source or dataset identity is invalid.');

    const expectedState = acceptedState(job.validation_status);
    const artifact = dependencies.repository.getArtifact(selection.artifact_id);
    if (
      expectedState === null || artifact === null
      || artifact.artifact_id !== job.accepted_artifact_id
      || artifact.run_id !== run.run_id || artifact.job_id !== job.job_id
      || artifact.source_id !== job.source_id || artifact.artifact_kind !== 'RAW_SOURCE_FILE'
      || artifact.artifact_state !== expectedState || artifact.sha256 === null
    ) throw new Error('Blog v2 raw artifact is not accepted for the selected Job.');

    const matchingAttempts = dependencies.repository.listAttempts(job.job_id).filter((attempt) => (
      attempt.job_id === job.job_id
      && attempt.attempt_number === artifact.attempt_number
      && attempt.candidate_artifact_id === artifact.artifact_id
      && attempt.execution_status === 'COMPLETED'
    ));
    if (matchingAttempts.length !== 1 || matchingAttempts[0].validation_id === null) {
      throw new Error('Blog v2 accepted Attempt identity is unavailable.');
    }
    const attempt = matchingAttempts[0];
    const validation = dependencies.repository.getValidationSummary(attempt.validation_id as string);
    if (
      validation === null || validation.validation_id !== attempt.validation_id
      || validation.run_id !== run.run_id || validation.job_id !== job.job_id
      || validation.artifact_id !== artifact.artifact_id
      || validation.validation_status !== job.validation_status
    ) throw new Error('Blog v2 accepted Validation identity is unavailable.');

    const verified = await dependencies.loader.verifyAcceptedJobArtifact(run.run_id, job.job_id);
    if (
      verified.artifact.artifact_id !== artifact.artifact_id
      || verified.artifact.sha256 !== artifact.sha256
      || verified.artifact.byte_size !== artifact.byte_size
    ) throw new Error('Blog v2 verified artifact identity changed.');

    resolved.push({
      workspace_id: run.workspace_id,
      source_id: job.source_id,
      dataset_type: datasetType,
      run_id: run.run_id,
      job_id: job.job_id,
      attempt_id: attempt.attempt_id,
      validation_id: validation.validation_id,
      artifact_id: artifact.artifact_id,
      artifact_sha256: artifact.sha256,
      artifact_byte_size: artifact.byte_size,
      validation_status: job.validation_status as BlogWritingPackV2ResolvedEvidence['validation_status'],
      requested_context: verified.requested_context,
      observed_context: null,
      acquired_at: artifact.created_at,
    });
  }
  return resolved;
};
