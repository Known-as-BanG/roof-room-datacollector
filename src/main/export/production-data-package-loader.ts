import type { GscDateCoverageProvenance } from '../../shared/blog-writing-pack-v2-selection';
import { parseGscDateCoverage } from '../sources/google-search-console/gsc-date-coverage';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { ArtifactRecord } from '../../shared/artifact';
import type { JobRecord, RunRecord } from '../../shared/run-job';
import { safeDataPackageContext, type DataPackageInputDataset, type DataPackageRawEvidence } from './data-package-exporter';
import type { AttemptRecord } from '../../shared/attempt';
import type { ValidationSummaryRecord } from '../../shared/validation-summary';
import { canExportRunEvidence } from '../core/run-export-eligibility';
import type { StorageManager } from '../storage/storage-manager';
import { createAttemptDocumentFilename } from '../storage/storage-manager';
import type { SerpApiAcquisitionProvenance } from '../../shared/serpapi';
import { parseGoogleTrendsInterestOverTimeCsv } from '../sources/google-trends/google-trends-interest-over-time-parser';
import { normalizeGscQueryRows, normalizeGscRows } from '../sources/google-search-console/query-page-adapter';
import {
  normalizeSearchTermPerformanceRows,
  normalizeSearchTerms,
} from '../sources/google-ads/search-terms-adapter';
import { normalizeKeywordPlanner } from '../sources/google-ads/keyword-planner-adapter';
import { createKeywordPlannerJobContext } from '../sources/google-ads/keyword-planner-request';
import { parseKeywordPlannerManualCsv } from '../sources/google-ads/keyword-planner-csv-parser';
import { parseIkasProductsXlsx } from '../sources/ikas/ikas-products-parser';
import { parseBitkimarkSitemap } from '../sources/bitkimark/bitkimark-sitemap-parser';
import { parseSerpApiResponse, parseSerpApiResponseAcquisition } from '../sources/serpapi/serpapi-parser';
import { requireSerpApiJobContext } from '../sources/serpapi/serpapi-request';
import { GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID } from '../../shared/google-ads-search-reporting';
import { GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID } from '../../shared/google-ads-change-history';
import { normalizeCampaignPerformanceRows } from '../sources/google-ads/campaigns-adapter';
import { normalizeAdGroupPerformanceRows } from '../sources/google-ads/ad-groups-adapter';
import { normalizeKeywordPerformanceRows } from '../sources/google-ads/keywords-adapter';
import { normalizeAdPerformanceRows } from '../sources/google-ads/ads-adapter';
import { normalizeRsaAssetPerformanceRows } from '../sources/google-ads/rsa-assets-adapter';
import { requireGoogleAdsReportingJobContext } from '../sources/google-ads/search-reporting-request';
import { flattenGoogleAdsSearchStream } from '../sources/google-ads/search-stream-response';
import { normalizeGoogleAdsChangeHistoryRows } from '../sources/google-ads/google-ads-change-history-adapter';

const ACCEPTED_VALIDATION = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);

export interface ProductionDataPackageRepository {
  getRun(run_id: string): RunRecord | null;
  listJobs(run_id: string): JobRecord[];
  getArtifact(artifact_id: string): ArtifactRecord | null;
  listAttempts?(job_id: string): AttemptRecord[];
  getValidationSummary?(validation_id: string): ValidationSummaryRecord | null;
}

export interface RunExportSnapshot {
  run: RunRecord;
  jobs: JobRecord[];
  snapshot_id: string;
}

const asObject = (value: unknown, context: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const decodeJson = (bytes: Uint8Array, context: string): unknown => {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${context} is not valid UTF-8 JSON.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} is not valid JSON.`);
  }
};

const safeContext = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(safeContext);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(credential|secret|token|api[_-]?key|password|file[_-]?path)/iu.test(key))
      .map(([key, nested]) => [key, safeContext(nested)]),
  );
};

const jsonRows = (rows: readonly unknown[]): Array<Record<string, unknown>> =>
  JSON.parse(JSON.stringify(rows)) as Array<Record<string, unknown>>;

const requireString = (value: unknown, context: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
};

export class ProductionDataPackageLoader {
  constructor(
    private readonly repository: ProductionDataPackageRepository,
    private readonly storage: Pick<StorageManager, 'resolveRunRelativePath'>,
  ) {}

  private readExportState(run_id: string) {
    const run = this.repository.getRun(run_id);
    if (!run) throw new Error('General export requires a known Run.');
    if (!this.repository.listAttempts || !this.repository.getValidationSummary) throw new Error('Raw export requires persisted Attempt and Validation provenance.');
    const jobs = this.repository.listJobs(run_id);
    const attempts = jobs.map((job) => this.repository.listAttempts!(job.job_id));
    const artifactIds = new Set([...jobs.map((job) => job.accepted_artifact_id), ...attempts.flat().map((attempt) => attempt.candidate_artifact_id)]);
    return structuredClone({ run, jobs, attempts,
      artifacts: [...artifactIds].filter((id): id is string => id !== null).map((id) => this.repository.getArtifact(id)),
      validations: attempts.flat().filter((attempt) => attempt.validation_id !== null)
        .map((attempt) => this.repository.getValidationSummary!(attempt.validation_id!)),
    });
  }

  async loadRunExport(run_id: string): Promise<{ datasets: DataPackageInputDataset[]; raw: DataPackageRawEvidence; snapshot: RunExportSnapshot }> {
    const state = this.readExportState(run_id);
    const { run, jobs } = state;
    if (!canExportRunEvidence(run.run_status, jobs, state.attempts.flat())) {
      throw new Error('General export requires a terminal or stable RETRY_REQUIRED Run with accepted evidence.');
    }
    const datasets: DataPackageInputDataset[] = [];
    const raw: DataPackageRawEvidence = { files: [], jobs: [] };
    for (const [index, job] of jobs.entries()) {
      if (job.run_id !== run_id || !run.selected_sources.includes(job.source_id)) throw new Error('Raw export Job ownership is inconsistent.');
      const attempts = state.attempts[index];
      raw.jobs.push({ job_id: job.job_id, source_id: job.source_id, job_key: job.job_key,
        execution_status: job.execution_status, validation_status: job.validation_status, accepted_artifact_id: job.accepted_artifact_id,
        attempts: attempts.map(({ attempt_id, attempt_number, execution_status, candidate_artifact_id, validation_id, error_code }) => ({
          attempt_id, attempt_number, execution_status, candidate_artifact_id, validation_id, error_code,
        })) });
      if (job.execution_status !== 'COMPLETED' || !ACCEPTED_VALIDATION.has(job.validation_status)) continue;
      if (!job.accepted_artifact_id) throw new Error('Completed accepted Job is missing its raw artifact.');
      await this.assertSafeExportArtifactPath(this.requireAcceptedArtifact(run, job));
      const loaded = await this.readAcceptedJobArtifact(run_id, job.job_id);
      const { artifact, bytes } = loaded;
      const matching = attempts.filter((item) => item.attempt_number === artifact.attempt_number);
      const attempt = matching[0];
      const validation = state.validations.find((item) => item?.validation_id === attempt?.validation_id);
      if (matching.length !== 1 || !attempt || attempt.job_id !== job.job_id || attempt.execution_status !== 'COMPLETED'
        || attempt.candidate_artifact_id !== artifact.artifact_id || !validation
        || validation.validation_id !== attempt.validation_id || validation.run_id !== run_id || validation.job_id !== job.job_id || validation.artifact_id !== artifact.artifact_id
        || validation.validation_status !== job.validation_status) throw new Error('Raw export Attempt/Validation identity is inconsistent.');
      const metadata = await this.readExportAcquisition(job, artifact, attempt);
      let parsed: ReturnType<ProductionDataPackageLoader['parseDataset']> | undefined;
      try { parsed = this.parseDataset(job, artifact, bytes); } catch {
        // Raw acceptance and byte integrity do not depend on an optional row adapter.
      }
      const declaredType = job.source_context?.dataset_type;
      if (parsed && typeof declaredType === 'string' && parsed.dataset_type !== declaredType) throw new Error('Raw export dataset identity is inconsistent.');
      if (parsed) datasets.push({ source_id: job.source_id, dataset_type: parsed.dataset_type,
        job_id: job.job_id, job_key: job.job_key, rows: parsed.rows,
        provenance: { run_id, workspace_id: run.workspace_id, job_id: job.job_id, job_key: job.job_key, source_id: job.source_id,
          attempt_id: attempt.attempt_id, attempt_number: artifact.attempt_number, validation_id: validation.validation_id,
          validation_status: validation.validation_status, raw_artifact_id: artifact.artifact_id,
          raw_artifact_filename: artifact.filename, raw_artifact_media_type: artifact.media_type,
          raw_artifact_byte_size: artifact.byte_size, raw_artifact_sha256: artifact.sha256,
          acquired_at: artifact.created_at, requested_context: safeDataPackageContext(job.source_context),
          ...(job.source_id === GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID ? { snapshot_observed_at: artifact.created_at } : {}),
        } });
      raw.files.push({ bytes, run_id, workspace_id: run.workspace_id, source_id: job.source_id,
        dataset_type: typeof declaredType === 'string' ? declaredType : parsed?.dataset_type ?? null,
        job_id: job.job_id, job_key: job.job_key, attempt_id: attempt.attempt_id, attempt_number: artifact.attempt_number,
        artifact_id: artifact.artifact_id, validation_id: validation.validation_id, validation_status: validation.validation_status,
        filename: artifact.filename, media_type: artifact.media_type, byte_size: artifact.byte_size, sha256: artifact.sha256!,
        acquired_at: artifact.created_at, requested_context: safeDataPackageContext(job.source_context),
        acquisition_context: metadata.context, acquisition_metadata_sha256: metadata.sha256,
        normalization_status: parsed ? 'AVAILABLE' : 'UNAVAILABLE',
      });
    }
    if (!isDeepStrictEqual(state, this.readExportState(run_id))) throw new Error('Run evidence changed during export; a stable snapshot is required.');
    return { datasets, raw, snapshot: { run, jobs, snapshot_id: createHash('sha256').update(JSON.stringify(state)).digest('hex') } };
  }

  private async assertSafeExportArtifactPath(artifact: ArtifactRecord): Promise<void> {
    const root = this.storage.resolveRunRelativePath(artifact.run_id, '.');
    const filename = this.storage.resolveRunRelativePath(artifact.run_id, artifact.relative_path);
    const relative = path.relative(root, filename);
    let current = root;
    for (const segment of ['', ...relative.split(path.sep)]) {
      current = path.join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Raw export path contains a symbolic link.');
    }
  }

  private async readExportAcquisition(job: JobRecord, artifact: ArtifactRecord, attempt: AttemptRecord): Promise<{ context: unknown; sha256: string | null }> {
    const relative = `${job.source_id}/metadata/${createAttemptDocumentFilename(job.job_key, artifact.attempt_number, 'metadata')}`;
    const filename = this.storage.resolveRunRelativePath(job.run_id, relative);
    let bytes: Uint8Array;
    try {
      await this.assertSafeExportArtifactPath({ ...artifact, relative_path: relative });
      if (!(await lstat(filename)).isFile()) throw new Error('Export acquisition metadata is not a regular file.');
      bytes = new Uint8Array(await readFile(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { context: null, sha256: null };
      throw error;
    }
    const metadata = asObject(decodeJson(bytes, 'Export acquisition metadata'), 'Export acquisition metadata');
    if (![1, 2].includes(metadata.schema_version as number) || metadata.run_id !== job.run_id || metadata.job_id !== job.job_id
      || metadata.source_id !== job.source_id || metadata.attempt_number !== attempt.attempt_number
      || metadata.raw_artifact_id !== artifact.artifact_id || metadata.raw_relative_path !== artifact.relative_path
      || metadata.validation_status !== job.validation_status
      || metadata.schema_version === 2 && (metadata.attempt_id !== attempt.attempt_id || metadata.job_key !== job.job_key
        || !isDeepStrictEqual(metadata.source_context, job.source_context))) throw new Error('Export acquisition metadata identity is inconsistent.');
    return { context: safeDataPackageContext(metadata.acquisition_metadata ?? null), sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async loadRunDatasets(run_id: string): Promise<DataPackageInputDataset[]> {
    const run = this.repository.getRun(run_id);
    if (run === null) throw new Error(`Unknown Run: ${run_id}`);

    const datasets: DataPackageInputDataset[] = [];
    for (const job of this.repository.listJobs(run_id)) {
      if (
        job.execution_status !== 'COMPLETED'
        || !ACCEPTED_VALIDATION.has(job.validation_status)
        || job.accepted_artifact_id === null
      ) {
        continue;
      }
      datasets.push(await this.loadEligibleJobDataset(run, job));
    }
    return datasets;
  }

  async loadAcceptedJobDataset(
    run_id: string,
    job_id: string,
  ): Promise<DataPackageInputDataset> {
    const run = this.repository.getRun(run_id);
    if (run === null) throw new Error(`Unknown Run: ${run_id}`);
    const job = this.repository.listJobs(run_id).find((candidate) => (
      candidate.job_id === job_id
    ));
    if (job === undefined || job.run_id !== run.run_id) {
      throw new Error(`Unknown Job ${job_id} for Run ${run_id}.`);
    }
    if (
      job.execution_status !== 'COMPLETED'
      || !ACCEPTED_VALIDATION.has(job.validation_status)
      || job.accepted_artifact_id === null
    ) {
      throw new Error(`Job ${job_id} is not eligible accepted evidence.`);
    }
    return this.loadEligibleJobDataset(run, job);
  }

  async verifyAcceptedJobArtifact(
    run_id: string,
    job_id: string,
  ): Promise<{ artifact: ArtifactRecord; requested_context: unknown; serp_acquisition?: SerpApiAcquisitionProvenance; gsc_date_coverage?: GscDateCoverageProvenance }> {
    const { artifact, requested_context, serp_acquisition, gsc_date_coverage } = await this.readAcceptedJobArtifact(run_id, job_id);
    return { artifact, requested_context, ...(serp_acquisition ? { serp_acquisition } : {}), ...(gsc_date_coverage ? { gsc_date_coverage } : {}) };
  }

  async readAcceptedJobArtifact(
    run_id: string,
    job_id: string,
  ): Promise<{ artifact: ArtifactRecord; requested_context: unknown; bytes: Uint8Array; serp_acquisition?: SerpApiAcquisitionProvenance; acquisition_metadata_bytes?: Uint8Array; gsc_date_coverage?: GscDateCoverageProvenance; gsc_date_coverage_evidence?: unknown }> {
    const run = this.repository.getRun(run_id);
    if (run === null) throw new Error(`Unknown Run: ${run_id}`);
    const job = this.repository.listJobs(run_id).find((candidate) => candidate.job_id === job_id);
    if (
      job === undefined || job.run_id !== run_id
      || job.execution_status !== 'COMPLETED'
      || !ACCEPTED_VALIDATION.has(job.validation_status)
      || job.accepted_artifact_id === null
    ) throw new Error(`Job ${job_id} is not eligible accepted evidence.`);
    const artifact = this.requireAcceptedArtifact(run, job);
    const bytes = await this.readVerifiedArtifact(artifact);
    const acquisition = job.source_id === 'serpapi'
      ? await this.readSerpAcquisition(job, artifact) : undefined;
    const gsc = job.source_id === 'google-search-console-query-page' ? await this.readGscDateCoverage(job, artifact) : undefined;
    const { metadata_bytes, ...serp_acquisition } = acquisition ?? {};
    return { artifact, requested_context: safeContext(job.source_context), bytes,
      ...(acquisition ? { serp_acquisition: serp_acquisition as SerpApiAcquisitionProvenance, acquisition_metadata_bytes: metadata_bytes } : {}),
      ...(gsc ? { gsc_date_coverage: gsc.provenance, gsc_date_coverage_evidence: gsc.evidence, acquisition_metadata_bytes: gsc.bytes } : {}) };
  }

  private async readGscDateCoverage(job: JobRecord, artifact: ArtifactRecord) {
    const relativePath = `${job.source_id}/metadata/${createAttemptDocumentFilename(job.job_key, artifact.attempt_number, 'metadata')}`;
    const absolutePath = this.storage.resolveRunRelativePath(job.run_id, relativePath);
    let bytes: Uint8Array;
    try {
      if (!(await lstat(absolutePath)).isFile()) throw new Error('GSC date metadata is not a regular file.');
      bytes = new Uint8Array(await readFile(absolutePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const metadata = asObject(decodeJson(bytes, 'GSC date metadata'), 'GSC date metadata');
    if (!Object.hasOwn(metadata, 'acquisition_metadata')) return undefined;
    const acquisition = asObject(metadata.acquisition_metadata, 'GSC acquisition metadata');
    if (!Object.hasOwn(acquisition, 'gsc_date_coverage')) return undefined;
    if (metadata.schema_version !== 2 || metadata.run_id !== job.run_id || metadata.job_id !== job.job_id
      || metadata.source_id !== job.source_id || metadata.source_mode !== 'OFFICIAL_API'
      || metadata.job_key !== job.job_key || metadata.attempt_number !== artifact.attempt_number
      || typeof metadata.attempt_id !== 'string' || !metadata.attempt_id.trim()
      || metadata.raw_artifact_id !== artifact.artifact_id || metadata.raw_relative_path !== artifact.relative_path
      || !isDeepStrictEqual(metadata.source_context, job.source_context)) throw new Error('GSC date metadata does not match the accepted evidence.');
    parseGscDateCoverage(acquisition.gsc_date_coverage);
    return { evidence: acquisition.gsc_date_coverage, bytes, provenance: {
      attempt_id: metadata.attempt_id, metadata_relative_path: relativePath,
      metadata_sha256: createHash('sha256').update(bytes).digest('hex'), metadata_byte_size: bytes.byteLength,
    } };
  }

  private async readSerpAcquisition(job: JobRecord, artifact: ArtifactRecord): Promise<(SerpApiAcquisitionProvenance & { metadata_bytes: Uint8Array }) | undefined> {
    const relativePath = `serpapi/metadata/${createAttemptDocumentFilename(job.job_key, artifact.attempt_number, 'metadata')}`;
    const absolutePath = this.storage.resolveRunRelativePath(job.run_id, relativePath);
    let bytes: Uint8Array;
    try {
      if (!(await lstat(absolutePath)).isFile()) throw new Error('SERP acquisition metadata is not a regular file.');
      bytes = new Uint8Array(await readFile(absolutePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const metadata = asObject(decodeJson(bytes, 'SERP acquisition metadata'), 'SERP acquisition metadata');
    // Legacy metadata may exist without any collector receipt observation.
    if (!Object.hasOwn(metadata, 'acquisition_metadata')) return undefined;
    if (metadata.schema_version !== 2 || metadata.run_id !== job.run_id || metadata.job_id !== job.job_id
      || metadata.source_id !== job.source_id || metadata.source_mode !== 'THIRD_PARTY_API'
      || metadata.job_key !== job.job_key || metadata.attempt_number !== artifact.attempt_number
      || typeof metadata.attempt_id !== 'string' || metadata.attempt_id.trim().length === 0
      || metadata.raw_artifact_id !== artifact.artifact_id || metadata.raw_relative_path !== artifact.relative_path
      || !isDeepStrictEqual(metadata.source_context, job.source_context)) {
      throw new Error('SERP acquisition metadata does not match the accepted evidence.');
    }
    return { ...parseSerpApiResponseAcquisition(metadata.acquisition_metadata),
      attempt_id: metadata.attempt_id, metadata_relative_path: relativePath,
      metadata_sha256: createHash('sha256').update(bytes).digest('hex'), metadata_byte_size: bytes.byteLength, metadata_bytes: bytes };
  }

  private async loadEligibleJobDataset(
    run: RunRecord,
    job: JobRecord,
  ): Promise<DataPackageInputDataset> {
    const artifact = this.requireAcceptedArtifact(run, job);
    const bytes = await this.readVerifiedArtifact(artifact);
    const parsed = this.parseDataset(job, artifact, bytes);
    return {
      source_id: job.source_id,
      dataset_type: parsed.dataset_type,
      job_id: job.job_id,
      job_key: job.job_key,
      rows: parsed.rows,
      provenance: {
        run_id: run.run_id,
        workspace_id: run.workspace_id,
        job_id: job.job_id,
        job_key: job.job_key,
        source_id: job.source_id,
        attempt_number: artifact.attempt_number,
        validation_status: job.validation_status,
        raw_artifact_id: artifact.artifact_id,
        raw_artifact_filename: artifact.filename,
        raw_artifact_media_type: artifact.media_type,
        raw_artifact_byte_size: artifact.byte_size,
        raw_artifact_sha256: artifact.sha256,
        acquired_at: artifact.created_at,
        ...(job.source_id === GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID
          ? { snapshot_observed_at: artifact.created_at }
          : {}),
        requested_context: safeContext(job.source_context),
      },
    };
  }

  private requireAcceptedArtifact(run: RunRecord, job: JobRecord): ArtifactRecord {
    const artifact = this.repository.getArtifact(job.accepted_artifact_id as string);
    if (
      artifact === null
      || artifact.run_id !== run.run_id
      || artifact.job_id !== job.job_id
      || artifact.source_id !== job.source_id
      || artifact.artifact_kind !== 'RAW_SOURCE_FILE'
      || (artifact.artifact_state !== 'ACCEPTED' && artifact.artifact_state !== 'ACCEPTED_WITH_WARNING')
      || artifact.sha256 === null
    ) {
      throw new Error(`Job ${job.job_id} has no valid accepted raw artifact for export.`);
    }
    return artifact;
  }

  private async readVerifiedArtifact(artifact: ArtifactRecord): Promise<Uint8Array> {
    const absolutePath = this.storage.resolveRunRelativePath(artifact.run_id, artifact.relative_path);
    const fileStat = await lstat(absolutePath);
    if (!fileStat.isFile()) throw new Error(`Accepted artifact ${artifact.artifact_id} is not a regular file.`);
    const bytes = new Uint8Array(await readFile(absolutePath));
    if (bytes.byteLength !== artifact.byte_size) {
      throw new Error(`Accepted artifact ${artifact.artifact_id} byte size failed integrity verification.`);
    }
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== artifact.sha256) {
      throw new Error(`Accepted artifact ${artifact.artifact_id} checksum failed integrity verification.`);
    }
    return bytes;
  }

  private parseDataset(
    job: JobRecord,
    artifact: ArtifactRecord,
    bytes: Uint8Array,
  ): { dataset_type: string; rows: Array<Record<string, unknown>> } {
    switch (job.source_id) {
      case 'google-trends': {
        const parsed = parseGoogleTrendsInterestOverTimeCsv(bytes);
        return {
          dataset_type: 'INTEREST_OVER_TIME',
          rows: parsed.rows.flatMap((row) => row.values.map((value) => ({
            period_start: row.period_start,
            temporal_dimension: parsed.temporal_dimension,
            category_label: parsed.category_label,
            query: value.query,
            geography_label: value.geography_label,
            relative_interest: value.relative_interest,
          }))),
        };
      }
      case 'google-search-console-query-page': {
        const pages = decodeJson(bytes, 'GSC accepted artifact');
        if (!Array.isArray(pages)) throw new Error('GSC accepted artifact must contain a pages array.');
        return { dataset_type: 'QUERY_PAGE', rows: jsonRows(pages.flatMap(normalizeGscRows)) };
      }
      case 'google-search-console-query': {
        const pages = decodeJson(bytes, 'GSC Query accepted artifact');
        if (!Array.isArray(pages)) throw new Error('GSC Query accepted artifact must contain a pages array.');
        return { dataset_type: 'QUERY', rows: jsonRows(pages.flatMap(normalizeGscQueryRows)) };
      }
      case 'google-ads-search-terms':
        return { dataset_type: 'SEARCH_TERMS', rows: jsonRows(normalizeSearchTerms(decodeJson(bytes, 'Google Ads Search Terms accepted artifact'))) };
      case GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID: {
        const providerRows =
          flattenGoogleAdsSearchStream(
            decodeJson(
              bytes,
              'Google Ads Change History accepted artifact',
            ),
          );

        return {
          dataset_type: 'CHANGE_HISTORY',
          rows: jsonRows(
            normalizeGoogleAdsChangeHistoryRows(
              providerRows,
            ),
          ),
        };
      }
      case GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID: {
        const context = requireGoogleAdsReportingJobContext(job.source_context);
        if (job.job_key !== context.dataset_type) {
          throw new Error('Google Ads reporting Job key does not match the dataset.');
        }
        const providerRows = flattenGoogleAdsSearchStream(
          decodeJson(bytes, 'Google Ads SEARCH reporting accepted artifact'),
        );
        const normalized = (() => {
          switch (context.dataset_type) {
            case 'CAMPAIGN_PERFORMANCE':
              return normalizeCampaignPerformanceRows(providerRows, context.dataset_schema_version);
            case 'AD_GROUP_PERFORMANCE':
              return normalizeAdGroupPerformanceRows(providerRows, context.dataset_schema_version);
            case 'KEYWORD_PERFORMANCE':
              return normalizeKeywordPerformanceRows(providerRows, context.dataset_schema_version);
            case 'SEARCH_TERMS':
              return normalizeSearchTermPerformanceRows(providerRows);
            case 'AD_PERFORMANCE':
              return normalizeAdPerformanceRows(providerRows);
            case 'RSA_ASSET_PERFORMANCE':
              return normalizeRsaAssetPerformanceRows(providerRows);
          }
        })();
        return {
          dataset_type: context.dataset_type,
          rows: jsonRows(normalized.map((row) => ({
            ...row,
            snapshot_observed_at: artifact.created_at,
          }))),
        };
      }
      case 'google-keyword-planner': {
        const context = createKeywordPlannerJobContext(job.source_context);
        return {
          dataset_type: 'KEYWORD_HISTORICAL_METRICS',
          rows: jsonRows(normalizeKeywordPlanner(decodeJson(bytes, 'Keyword Planner accepted artifact'), context.group_id, context.keywords)),
        };
      }
      case 'google-keyword-planner-csv':
        return { dataset_type: 'KEYWORD_HISTORICAL_METRICS', rows: jsonRows(parseKeywordPlannerManualCsv(bytes).rows) };
      case 'ikas-products':
        return { dataset_type: 'PRODUCTS', rows: jsonRows(parseIkasProductsXlsx(bytes).rows) };
      case 'bitkimark-sitemap': {
        const context = asObject(job.source_context, 'Bitkimark source context');
        const document = parseBitkimarkSitemap(bytes, {
          source_url: requireString(context.requested_url, 'Bitkimark requested_url'),
          expected_host: requireString(context.expected_host, 'Bitkimark expected_host'),
          parent_sitemap_url: context.parent_sitemap_url === null ? null : requireString(context.parent_sitemap_url, 'Bitkimark parent_sitemap_url'),
          retrieved_at: artifact.created_at,
        });
        return {
          dataset_type: 'SITEMAP_URLS',
          rows: jsonRows(document.entries.map((entry) => ({
            ...entry,
            document_kind: document.document_kind,
            source_url: document.source_url,
            parent_sitemap_url: document.parent_sitemap_url,
            retrieved_at: document.retrieved_at,
          }))),
        };
      }
      case 'serpapi': {
        const context = requireSerpApiJobContext(job.source_context, job.job_key);
        const parsed = parseSerpApiResponse(decodeJson(bytes, 'SerpApi accepted artifact'), context);
        return { dataset_type: 'GOOGLE_SERP', rows: jsonRows(parsed.rows) };
      }
      default:
        throw new Error(`No production Data Package loader is registered for source ${job.source_id}.`);
    }
  }
}
