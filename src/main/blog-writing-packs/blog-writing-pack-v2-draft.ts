import type { BlogWritingPackV2Draft } from '../../shared/blog-writing-pack-v2-draft';
import { parseSerpApiResponseAcquisition } from '../sources/serpapi/serpapi-parser';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean => (
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
);

const nonemptyText = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

// Validate the stored snapshot's shape, without resolving it against newer source state.
export const parseBlogWritingPackV2Draft = (value: unknown): BlogWritingPackV2Draft => {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      'draft_version', 'recipe_id', 'recipe_version', 'package_id', 'workspace_id',
      'created_at', 'application_version', 'state', 'readiness_status', 'selected_evidence',
    ])
    || value.draft_version !== 1 || value.recipe_id !== 'BLOG_WRITING_PACK'
    || value.recipe_version !== 2 || value.state !== 'DRAFT'
    || value.readiness_status !== 'NOT_EVALUATED'
    || !nonemptyText(value.package_id) || !nonemptyText(value.workspace_id)
    || !nonemptyText(value.application_version)
    || !nonemptyText(value.created_at) || !Number.isFinite(Date.parse(value.created_at))
    || !Array.isArray(value.selected_evidence) || value.selected_evidence.length === 0
  ) throw new Error('Blog v2 draft identity or unevaluated state is invalid.');

  const seen = new Set<string>();
  for (const evidence of value.selected_evidence) {
    if (
      !isRecord(evidence)
      || !exactKeys(evidence, [
        'workspace_id', 'source_id', 'dataset_type', 'run_id', 'job_id', 'attempt_id',
        'validation_id', 'artifact_id', 'artifact_sha256', 'artifact_byte_size',
        'validation_status', 'requested_context', 'observed_context', 'acquired_at',
        ...(Object.hasOwn(evidence, 'serp_acquisition') ? ['serp_acquisition'] : []),
        ...(Object.hasOwn(evidence, 'gsc_date_coverage') ? ['gsc_date_coverage'] : []),
      ])
      || !['workspace_id', 'source_id', 'dataset_type', 'run_id', 'job_id', 'attempt_id',
        'validation_id', 'artifact_id'].every((key) => nonemptyText(evidence[key]))
      || evidence.workspace_id !== value.workspace_id
      || typeof evidence.artifact_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(evidence.artifact_sha256)
      || !Number.isSafeInteger(evidence.artifact_byte_size) || (evidence.artifact_byte_size as number) < 0
      || !['VALID', 'LOW_DATA', 'NO_DATA'].includes(evidence.validation_status as string)
      || !isRecord(evidence.requested_context) || evidence.observed_context !== null
      || !nonemptyText(evidence.acquired_at) || !Number.isFinite(Date.parse(evidence.acquired_at))
    ) throw new Error('Blog v2 draft evidence identity or Workspace is invalid.');

    if (Object.hasOwn(evidence, 'serp_acquisition')) {
      const acquisition = evidence.serp_acquisition;
      if (evidence.source_id !== 'serpapi' || evidence.dataset_type !== 'GOOGLE_SERP'
        || !isRecord(acquisition) || !exactKeys(acquisition, ['response_received_at', 'response_received_at_origin',
          'attempt_id', 'metadata_relative_path', 'metadata_sha256', 'metadata_byte_size'])
        || acquisition.attempt_id !== evidence.attempt_id
        || typeof acquisition.metadata_relative_path !== 'string'
        || !/^serpapi\/metadata\/[A-Za-z0-9][A-Za-z0-9._-]*\.metadata\.json$/u.test(acquisition.metadata_relative_path)
        || typeof acquisition.metadata_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(acquisition.metadata_sha256)
        || !Number.isSafeInteger(acquisition.metadata_byte_size) || (acquisition.metadata_byte_size as number) <= 0) {
        throw new Error('Blog v2 SERP acquisition provenance is invalid.');
      }
      parseSerpApiResponseAcquisition(acquisition);
    }

    if (Object.hasOwn(evidence, 'gsc_date_coverage')) {
      const coverage = evidence.gsc_date_coverage;
      if (evidence.source_id !== 'google-search-console-query-page' || evidence.dataset_type !== 'QUERY_PAGE'
        || !isRecord(coverage) || !exactKeys(coverage, ['attempt_id', 'metadata_relative_path', 'metadata_sha256', 'metadata_byte_size'])
        || coverage.attempt_id !== evidence.attempt_id
        || typeof coverage.metadata_relative_path !== 'string'
        || !/^google-search-console-query-page\/metadata\/[A-Za-z0-9][A-Za-z0-9._-]*\.metadata\.json$/u.test(coverage.metadata_relative_path)
        || typeof coverage.metadata_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(coverage.metadata_sha256)
        || !Number.isSafeInteger(coverage.metadata_byte_size) || (coverage.metadata_byte_size as number) <= 0) {
        throw new Error('Blog v2 GSC date coverage provenance is invalid.');
      }
    }

    const key = JSON.stringify([evidence.run_id, evidence.job_id, evidence.artifact_id]);
    if (seen.has(key)) throw new Error('Blog v2 draft has duplicate evidence membership.');
    seen.add(key);
  }
  return JSON.parse(JSON.stringify(value)) as BlogWritingPackV2Draft;
};
