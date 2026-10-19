import type { ValidationStatus } from './run-job';
import type { SerpApiAcquisitionProvenance } from './serpapi';

export interface BlogWritingPackV2Selection {
  run_id: string;
  job_id: string;
  artifact_id: string;
}

export interface BlogWritingPackV2SelectionIntent {
  recipe_version: 2;
  workspace_id: string;
  selections: BlogWritingPackV2Selection[];
}

export interface GscDateCoverageProvenance {
  attempt_id: string;
  metadata_relative_path: string;
  metadata_sha256: string;
  metadata_byte_size: number;
}

export interface BlogWritingPackV2ResolvedEvidence {
  workspace_id: string;
  source_id: string;
  dataset_type: string;
  run_id: string;
  job_id: string;
  attempt_id: string;
  validation_id: string;
  artifact_id: string;
  artifact_sha256: string;
  artifact_byte_size: number;
  validation_status: Extract<ValidationStatus, 'VALID' | 'LOW_DATA' | 'NO_DATA'>;
  requested_context: unknown;
  observed_context: null;
  acquired_at: string;
  serp_acquisition?: SerpApiAcquisitionProvenance;
  gsc_date_coverage?: GscDateCoverageProvenance;
}
