export const SERPAPI_SOURCE_ID = 'serpapi';
export const SERPAPI_DATASET_TYPE = 'GOOGLE_SERP';
export const SERPAPI_ACQUISITION_MODE = 'THIRD_PARTY_API';
export const SERPAPI_TIMEOUT_MS = 300_000;

export interface SerpApiResponseAcquisition {
  response_received_at: string;
  response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT';
}

export interface SerpApiAcquisitionProvenance extends SerpApiResponseAcquisition {
  attempt_id: string;
  metadata_relative_path: string;
  metadata_sha256: string;
  metadata_byte_size: number;
}

export interface SerpApiDraftInspectionContext {
  acquisition?: SerpApiAcquisitionProvenance;
  evaluated_at?: string;
  reference_origin?: 'DRAFT_CREATED_AT' | 'EXPLICIT_DRAFT_EVALUATION' | 'PACKAGE_CREATED_AT';
}

export interface SerpApiFreshnessEvaluation {
  evaluated_at: string | null;
  reference_origin: 'DRAFT_CREATED_AT' | 'EXPLICIT_DRAFT_EVALUATION' | 'PACKAGE_CREATED_AT' | null;
  acquisition: SerpApiAcquisitionProvenance | null;
  capture_date: string | null;
  age_ms: number | null;
  maximum_age_ms: number;
  status: 'FRESH' | 'STALE' | 'FUTURE' | 'ACQUISITION_MISSING' | 'INVALID_ACQUISITION' | 'INVALID_REFERENCE';
}

export interface SerpApiRequestContext {
  query: string;
  country_code: 'TR';
  language_code: 'tr';
  device: 'desktop';
  engine: 'google';
  organic_limit: 10;
  snapshot_date: string;
}

export type SerpApiResultType = 'ORGANIC' | 'PAA';

export interface SerpApiNormalizedRow {
  query: string;
  position: number | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  snippet: string | null;
  paa: string | null;
  result_type: SerpApiResultType;
}

export interface SerpApiParsedResponse {
  rows: SerpApiNormalizedRow[];
  organic_count: number;
  paa_count: number;
  observed_context: {
    query: string | null;
    country_code: string | null;
    language_code: string | null;
    device: string | null;
    engine: string | null;
  };
}
