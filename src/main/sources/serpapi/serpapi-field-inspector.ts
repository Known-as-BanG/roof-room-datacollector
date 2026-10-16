import { parseSerpApiResponse } from './serpapi-parser';
import { requireSerpApiJobContext } from './serpapi-request';

export class SerpApiContextError extends Error {
  constructor() { super('SERP evidence requires its accepted THIRD_PARTY_API context.'); }
}

// These Blog meanings are unapproved even when a caller empties decision lists.
export const SERP_SNAPSHOT_OPEN_REQUIREMENTS = {
  capture_date: 'Requested snapshot date, local acquisition time and raw provider generation metadata have no approved Blog capture-date mapping.',
  position_semantics: 'Provider organic position is not absolute SERP rank; PAA has no normalized rank or title and paid/other features remain raw only.',
  search_context: 'Query is a request dimension verified against provider q; Blog query meaning and required TR/tr/desktop/google/first-ten context are unapproved.',
  query_coverage: 'The required Blog query set and per-Job coverage policy are unspecified.',
  freshness: 'No approved snapshot age, timestamp basis or reference-time policy is established.',
} as const;

export const inspectSerpApiFields = (bytes: Uint8Array, requested_context: unknown) => {
  let context;
  try { context = requireSerpApiJobContext(requested_context); } catch { throw new SerpApiContextError(); }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const parsed = parseSerpApiResponse(body, context);
  // The existing parser validates these shapes and retains organic/PAA row order.
  const raw = body as { organic_results?: Array<Record<string, unknown>>; related_questions?: Array<Record<string, unknown>> };
  const presence = [
    ...(raw.organic_results ?? []).slice(0, context.organic_limit).map((row) => ({
      query: true, capture_date: false, position: Object.hasOwn(row, 'position'),
      url: Object.hasOwn(row, 'link'), title: Object.hasOwn(row, 'title'), domain: Object.hasOwn(row, 'link'),
    })),
    ...(raw.related_questions ?? []).map((row) => ({
      query: true, capture_date: false, position: false,
      url: Object.hasOwn(row, 'link'), title: false, domain: Object.hasOwn(row, 'link'),
    })),
  ];
  return {
    rows: parsed.rows, presence,
    missing_observations: (['url', 'title', 'domain'] as const).filter((field) => parsed.rows.some((row, index) => (
      presence[index][field] && (row[field] === null || row[field]?.trim().length === 0)
    ))),
    provenance: {
      query: 'REQUEST_DIMENSION_VERIFIED_BY_PROVIDER', capture_date: 'UNAPPROVED',
      position: 'PROVIDER_ORGANIC_POSITION_ONLY', domain: 'DERIVED_FROM_OBSERVED_URL',
    } as const,
  };
};
