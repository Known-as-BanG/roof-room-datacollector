import type { SerpApiDraftInspectionContext, SerpApiFreshnessEvaluation } from '../../../shared/serpapi';
import { parseSerpApiResponse, parseSerpApiResponseAcquisition } from './serpapi-parser';
import { requireSerpApiJobContext } from './serpapi-request';

export class SerpApiContextError extends Error {
  constructor() { super('SERP evidence requires its accepted THIRD_PARTY_API context.'); }
}

// Preserve the remaining scope blockers; capture/freshness use evidence checks.
export const SERP_SNAPSHOT_OPEN_REQUIREMENTS = {
  position_semantics: 'Provider organic position is not absolute SERP rank; PAA has no normalized rank or title and paid/other features remain raw only.',
  search_context: 'Query is a request dimension verified against provider q; Blog query meaning and required TR/tr/desktop/google/first-ten context are unapproved.',
  query_coverage: 'The required Blog query set and per-Job coverage policy are unspecified.',
} as const;

export const inspectSerpApiFields = (bytes: Uint8Array, requested_context: unknown, draft_context?: SerpApiDraftInspectionContext) => {
  let context;
  try { context = requireSerpApiJobContext(requested_context); } catch { throw new SerpApiContextError(); }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const parsed = parseSerpApiResponse(body, context);
  const issues: Array<{ code: 'EVIDENCE_INVALID' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }> = [];
  let acquisition: SerpApiFreshnessEvaluation['acquisition'] = null;
  let status: SerpApiFreshnessEvaluation['status'] = 'ACQUISITION_MISSING';
  if (draft_context?.acquisition === undefined) {
    issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'serp_acquisition',
      actual: 'Collector-observed response receipt provenance is missing; lifecycle, request and provider dates cannot replace it.' });
  } else {
    try {
      acquisition = { ...draft_context.acquisition, ...parseSerpApiResponseAcquisition(draft_context.acquisition) };
    } catch {
      status = 'INVALID_ACQUISITION';
      issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'serp_acquisition', actual: 'Collector response acquisition provenance is malformed or incompatible.' });
    }
  }
  const evaluatedAt = draft_context?.evaluated_at;
  const utcReference = typeof evaluatedAt === 'string'
    ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/u.exec(evaluatedAt) : null;
  const canonicalReference = utcReference ? `${utcReference[1]}.${(utcReference[2] ?? '').padEnd(3, '0')}Z` : null;
  const reference = canonicalReference === null ? NaN : Date.parse(canonicalReference);
  const validReference = typeof evaluatedAt === 'string' && Number.isFinite(reference)
    && new Date(reference).toISOString() === canonicalReference;
  let age: number | null = null;
  const maximumAge = 7 * 86_400_000;
  if (!validReference) {
    status = 'INVALID_REFERENCE';
    issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'serp_reference_time', actual: 'An explicit complete UTC draft evaluation instant is required.' });
  } else if (acquisition) {
    age = reference - Date.parse(acquisition.response_received_at);
    status = age < 0 ? 'FUTURE' : age > maximumAge ? 'STALE' : 'FRESH';
    if (status !== 'FRESH') issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'serp_freshness',
      actual: status === 'FUTURE' ? 'Collector response receipt is later than the draft evaluation instant.'
        : 'SERP acquisition is older than 604800000 milliseconds at draft evaluation.' });
  }
  const captureDate = acquisition ? acquisition.response_received_at.slice(0, 10) : null;
  const freshness: SerpApiFreshnessEvaluation = {
    evaluated_at: validReference ? evaluatedAt : null, reference_origin: draft_context?.reference_origin ?? null,
    acquisition, capture_date: captureDate, age_ms: age, maximum_age_ms: maximumAge, status,
  };
  // The existing parser validates these shapes and retains organic/PAA row order.
  const raw = body as { organic_results?: Array<Record<string, unknown>>; related_questions?: Array<Record<string, unknown>> };
  const presence = [
    ...(raw.organic_results ?? []).slice(0, context.organic_limit).map((row) => ({
      query: true, capture_date: captureDate !== null, position: Object.hasOwn(row, 'position'),
      url: Object.hasOwn(row, 'link'), title: Object.hasOwn(row, 'title'), domain: Object.hasOwn(row, 'link'),
    })),
    ...(raw.related_questions ?? []).map((row) => ({
      query: true, capture_date: captureDate !== null, position: false,
      url: Object.hasOwn(row, 'link'), title: false, domain: Object.hasOwn(row, 'link'),
    })),
  ];
  return {
    rows: parsed.rows.map((row) => ({ ...row, ...(captureDate === null ? {} : { capture_date: captureDate }) })), presence, freshness, issues,
    derivations: {
      domain: { expression: 'lowercase URL.hostname from observed HTTP(S) result URL', approved_for_blog: true },
      capture_date: { expression: 'UTC date component of verified response_received_at', approved_for_blog: true },
    },
    missing_observations: (['url', 'title', 'domain'] as const).filter((field) => parsed.rows.some((row, index) => (
      presence[index][field] && (row[field] === null || row[field]?.trim().length === 0)
    ))),
    provenance: {
      query: 'REQUEST_DIMENSION_VERIFIED_BY_PROVIDER',
      capture_date: acquisition ? 'DERIVED_FROM_COLLECTOR_RESPONSE_RECEIPT' : 'ACQUISITION_UNAVAILABLE',
      position: 'PROVIDER_ORGANIC_POSITION_ONLY', domain: 'DERIVED_FROM_OBSERVED_URL',
    } as const,
  };
};
