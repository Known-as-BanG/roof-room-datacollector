import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { DataPackage, DataPackageDataset, DataPackageMode } from '../../shared/data-package';
import { writeKeywordPlannerUserExport } from './keyword-planner-user-export';
import { isSensitiveLogKey, sanitizeLogContext } from '../logging/log-redaction';

export interface DataPackageRawFile {
  bytes: Uint8Array;
  workspace_id: string; run_id: string; source_id: string; dataset_type: string | null;
  job_id: string; job_key: string; attempt_id: string; attempt_number: number;
  artifact_id: string; validation_id: string; validation_status: string;
  filename: string; media_type: string; byte_size: number; sha256: string; acquired_at: string;
  requested_context: unknown; acquisition_context: unknown;
  acquisition_metadata_sha256: string | null;
  normalization_status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface DataPackageRawEvidence {
  files: DataPackageRawFile[];
  jobs: Array<{
    job_id: string; source_id: string; job_key: string; execution_status: string; validation_status: string;
    accepted_artifact_id: string | null;
    attempts: Array<{ attempt_id: string; attempt_number: number; execution_status: string;
      candidate_artifact_id: string | null; validation_id: string | null; error_code: string | null }>;
  }>;
}

export const safeDataPackageContext = (value: unknown): unknown => {
  const strip = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(strip);
    if (typeof item !== 'object' || item === null) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => !isSensitiveLogKey(key)
      && !/(credential|secret|token|api[_-]?key|password|file[_-]?path|authorization|cookie)/iu.test(key))
      .map(([key, nested]) => [key, strip(nested)]));
  };
  return strip(sanitizeLogContext({ value }).value);
};

interface PackageRun {
  run_id: string;
  workspace_id: string;
  run_status: string;
  selected_sources: string[];
}

interface PackageJob {
  job_id: string;
  source_id: string;
  job_key: string;
  execution_status: string;
  validation_status: string;
  accepted_artifact_id: string | null;
}

export interface DataPackageInputDataset {
  source_id: string;
  dataset_type: string;
  job_id: string;
  job_key: string;
  rows: Array<Record<string, unknown>> | null;
  provenance?: Record<string, unknown>;
  failure?: { code: string };
}

export const buildDataPackage = (input: {
  run: PackageRun;
  jobs: readonly PackageJob[];
  datasets: readonly DataPackageInputDataset[];
  mode: DataPackageMode;
}): DataPackage => {
  const acceptedValidationStatuses = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);
  const successfulJobs = input.jobs.filter((job) => (
    job.execution_status === 'COMPLETED'
    && job.accepted_artifact_id !== null
    && acceptedValidationStatuses.has(job.validation_status)
  ));
  const failedJobs = input.jobs.filter((job) => (
    !successfulJobs.includes(job)
    && (
      job.execution_status === 'FAILED'
      || job.execution_status === 'CANCELLED'
      || (
        job.validation_status !== 'NOT_RUN'
        && !acceptedValidationStatuses.has(job.validation_status)
      )
    )
  ));
  const successfulSourceKeys = new Set(successfulJobs.map((job) => `${job.source_id}`));
  const successfulJobIds = new Set(successfulJobs.map((job) => job.job_id));
  const jobsById = new Map(input.jobs.map((job) => [job.job_id, job]));
  for (const dataset of input.datasets) {
    const job = jobsById.get(dataset.job_id);
    if (
      job === undefined
      || job.source_id !== dataset.source_id
      || job.job_key !== dataset.job_key
    ) {
      throw new Error(`Data Package dataset identity does not match Job ${dataset.job_id}.`);
    }
  }
  const datasets = input.datasets
    .filter((dataset) => Array.isArray(dataset.rows) && successfulJobIds.has(dataset.job_id) && successfulSourceKeys.has(dataset.source_id))
    .map((dataset): DataPackageDataset => ({
      source_id: dataset.source_id,
      dataset_type: dataset.dataset_type,
      job_id: dataset.job_id,
      job_key: dataset.job_key,
      rows: JSON.parse(JSON.stringify(dataset.rows)) as Array<Record<string, unknown>>,
      provenance: dataset.provenance ? JSON.parse(JSON.stringify(dataset.provenance)) as Record<string, unknown> : undefined,
    }));
  const failures = input.mode === 'ALL'
    ? failedJobs.map((job) => ({
        source_id: job.source_id,
        job_key: job.job_key,
        code: job.validation_status === 'NOT_RUN'
          ? job.execution_status
          : job.validation_status,
      }))
    : [];
  return {
    manifest: {
      package_version: 1,
      run_id: input.run.run_id,
      workspace_id: input.run.workspace_id,
      run_status: input.run.run_status,
      selected_sources: [...input.run.selected_sources],
      successful_jobs: successfulJobs.length,
      failed_jobs: failedJobs.length,
      mode: input.mode,
    },
    datasets,
    failures,
  };
};

const safeName = (value: string): string => value.replace(/[^a-z0-9_-]+/giu, '_').toLowerCase();

export const writeDataPackageEvidence = async (
  directory: string,
  dataPackage: DataPackage,
): Promise<string> => {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'MANIFEST.json'), `${JSON.stringify(dataPackage.manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'FAILURES.json'), `${JSON.stringify(dataPackage.failures, null, 2)}\n`, 'utf8');
  const datasetIndex: Array<Record<string, unknown>> = [];
  const filenames = new Set<string>();
  for (const dataset of dataPackage.datasets) {
    const identity = `_${safeName(dataset.job_key)}_${safeName(dataset.job_id)}`;
    const filename = `${safeName(dataset.source_id)}_${safeName(dataset.dataset_type)}${identity}.json`;
    if (filenames.has(filename)) throw new Error(`Data Package dataset filename collision: ${filename}`);
    filenames.add(filename);
    await writeFile(path.join(directory, filename), `${JSON.stringify(dataset.rows, null, 2)}\n`, 'utf8');
    datasetIndex.push({
      filename,
      source_id: dataset.source_id,
      dataset_type: dataset.dataset_type,
      job_id: dataset.job_id,
      job_key: dataset.job_key,
      row_count: dataset.rows.length,
      provenance: dataset.provenance ?? {},
    });
  }
  await writeFile(path.join(directory, 'DATASETS.json'), `${JSON.stringify(datasetIndex, null, 2)}\n`, 'utf8');

  return directory;
};

export const writeDataPackage = async (
  directory: string,
  dataPackage: DataPackage,
  rawEvidence?: DataPackageRawEvidence,
): Promise<string> => {
  if (rawEvidence !== undefined) return writeRawDataPackage(directory, dataPackage, rawEvidence);
  await writeDataPackageEvidence(directory, dataPackage);
  await writeKeywordPlannerUserExport(directory, dataPackage);

  return directory;
};

const assertNoSymlinkParents = async (directory: string): Promise<void> => {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe symbolic or non-directory export parent.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
};

const assertAbsent = async (filename: string): Promise<void> => {
  try { await lstat(filename); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Data Package export exists; refusing overwrite.');
};

const writeRawDataPackage = async (directory: string, dataPackage: DataPackage, raw: DataPackageRawEvidence): Promise<string> => {
  const destination = path.resolve(directory);
  const parent = path.dirname(destination);
  await assertNoSymlinkParents(parent);
  await assertAbsent(destination);
  await mkdir(parent, { recursive: true });
  const reservation = `${destination}.publishing`;
  await mkdir(reservation);
  let staging: string | undefined;
  try {
    await assertAbsent(destination);
    staging = await mkdtemp(path.join(parent, `.${path.basename(destination)}.tmp-`));
    const files = [];
    const seen = new Set<string>();
    for (const [index, file] of raw.files.entries()) {
      const { bytes, ...metadata } = file;
      const job = raw.jobs.find((item) => item.job_id === file.job_id);
      const attempt = job?.attempts.find((item) => item.attempt_id === file.attempt_id);
      if (file.run_id !== dataPackage.manifest.run_id || file.workspace_id !== dataPackage.manifest.workspace_id
        || !job || job.source_id !== file.source_id || job.job_key !== file.job_key || job.execution_status !== 'COMPLETED'
        || job.accepted_artifact_id !== file.artifact_id || job.validation_status !== file.validation_status
        || !['VALID', 'LOW_DATA', 'NO_DATA'].includes(file.validation_status)
        || !attempt || attempt.execution_status !== 'COMPLETED' || attempt.attempt_number !== file.attempt_number
        || attempt.candidate_artifact_id !== file.artifact_id || attempt.validation_id !== file.validation_id
        || seen.has(file.job_id)) throw new Error('Raw export accepted evidence identity is inconsistent.');
      seen.add(file.job_id);
      if (!file.filename || file.filename === '.' || file.filename === '..' || /[/\\\0]/u.test(file.filename)) {
        throw new Error('Unsafe raw export filename.');
      }
      if (bytes.byteLength !== file.byte_size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new Error('Raw export bytes failed integrity verification.');
      }
      const relative_path = `raw/${String(index).padStart(6, '0')}/${file.filename}`;
      const filename = path.join(staging, relative_path);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, bytes, { flag: 'wx' });
      const copied = await readFile(filename);
      if (copied.byteLength !== file.byte_size || createHash('sha256').update(copied).digest('hex') !== file.sha256) throw new Error('Raw export readback integrity failed.');
      files.push({ ...metadata, relative_path, requested_context: safeDataPackageContext(file.requested_context),
        acquisition_context: safeDataPackageContext(file.acquisition_context) });
    }
    if (raw.jobs.some((job) => job.accepted_artifact_id !== null && job.execution_status === 'COMPLETED'
      && ['VALID', 'LOW_DATA', 'NO_DATA'].includes(job.validation_status) && !seen.has(job.job_id))) {
      throw new Error('Accepted raw evidence is missing from the export.');
    }
    await writeDataPackageEvidence(staging, dataPackage);
    await writeKeywordPlannerUserExport(staging, dataPackage);
    await writeFile(path.join(staging, 'RAW_EVIDENCE.json'), `${JSON.stringify({ schema_version: 1,
      run_id: dataPackage.manifest.run_id, workspace_id: dataPackage.manifest.workspace_id,
      context_representation: 'SANITIZED_COLLECTOR_METADATA', files, jobs: raw.jobs }, null, 2)}\n`, { flag: 'wx' });
    await assertAbsent(destination);
    await rename(staging, destination);
    staging = undefined;
    return directory;
  } finally {
    if (staging) {
      try { await rm(staging, { recursive: true, force: true }); }
      finally { await rm(reservation, { recursive: true, force: true }); }
    } else {
      // A verified publication stays successful if reservation cleanup fails after rename.
      await rm(reservation, { recursive: true, force: true }).catch((): void => {});
    }
  }
};
