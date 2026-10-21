export type DataPackageMode = 'ALL' | 'SUCCESSFUL_ONLY';

export interface DesktopDataPackageExportResult {
  export_directory: string;
  /** Compatibility alias for the optional normalized dataset file count. */
  dataset_count: number;
  failed_count: number;
  /** Absent on legacy exporters that cannot report raw evidence. */
  raw_file_count?: number;
  normalized_file_count?: number;
  unavailable_evidence_count?: number;
  normalization_unavailable_count?: number;
  no_data_file_count?: number;
  low_data_file_count?: number;
  collection_status?: 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'INCOMPLETE';
}

export interface DataPackageDataset {
  source_id: string;
  dataset_type: string;
  job_id: string;
  job_key: string;
  rows: Array<Record<string, unknown>>;
  provenance?: Record<string, unknown>;
}

export interface DataPackageFailure {
  source_id: string;
  job_key: string;
  code: string;
}

export interface DataPackageManifest {
  package_version: 1;
  run_id: string;
  workspace_id: string;
  run_status: string;
  selected_sources: string[];
  successful_jobs: number;
  failed_jobs: number;
  mode: DataPackageMode;
  collection_status?: 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'INCOMPLETE';
  snapshot_id?: string;
}

export interface DataPackage {
  manifest: DataPackageManifest;
  datasets: DataPackageDataset[];
  failures: DataPackageFailure[];
}
