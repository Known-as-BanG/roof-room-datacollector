import { normalizeGoogleAnalytics4Rows } from './google-analytics-4-parser';
import { requireJobContext, requireRawBundle } from './google-analytics-4-validator';

export class GoogleAnalytics4EvidenceError extends Error {
  constructor(readonly code: 'EVIDENCE_INVALID' | 'WINDOW_MISMATCH', readonly requirement_id: string) {
    super('GA4 evidence is incompatible with its requested Content Performance context.');
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const inspectGoogleAnalytics4ContentFields = (bytes: Uint8Array, requested_context: unknown) => {
  let context;
  let propertyId: unknown;
  try {
    if (!isRecord(requested_context)) throw new Error('Missing context.');
    const { property_id, ...sourceContext } = requested_context;
    propertyId = property_id;
    if (propertyId !== undefined && (typeof propertyId !== 'string' || !/^\d+$/u.test(propertyId))) throw new Error('Invalid property.');
    context = requireJobContext(sourceContext);
    if (context.dataset_type !== 'GA4_CONTENT_PERFORMANCE') throw new Error('Wrong report.');
  } catch { throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_request_context'); }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (isRecord(body) && isRecord(body.request)) {
    if (propertyId !== undefined && propertyId !== body.request.property_id) {
      throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_request_context');
    }
    if (body.request.start_date !== context.start_date || body.request.end_date !== context.end_date) {
      throw new GoogleAnalytics4EvidenceError('WINDOW_MISMATCH', 'ga4_request_window');
    }
  }
  const { bundle, row_count } = requireRawBundle(body, context);
  const normalized = normalizeGoogleAnalytics4Rows('GA4_CONTENT_PERFORMANCE', bundle);
  if (normalized.rows.length !== row_count) throw new Error('GA4 report row coverage is incomplete.');
  const metricFields = { sessions: 'sessions', engaged_sessions: 'engagedSessions', engagement_rate: 'engagementRate', key_events: 'keyEvents' };
  const pages = bundle.pages.map((page) => JSON.parse(page.raw_body_text) as {
    dimensionHeaders: Array<{ name: string }>; metricHeaders: Array<{ name: string }>;
    rows: Array<{ dimensionValues: Array<Record<string, unknown>>; metricValues: Array<Record<string, unknown>> }>;
  });
  const presence = pages.flatMap((page) => page.rows.map((row) => ({
    landing_page: Object.hasOwn(row.dimensionValues[0], 'value'), users: false, average_engagement_time: false,
    ...Object.fromEntries(Object.entries(metricFields).map(([field, provider]) => [field,
      Object.hasOwn(row.metricValues[page.metricHeaders.findIndex((header) => header.name === provider)], 'value'),
    ])),
  })));
  const issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }> = [
    { code: 'DECISION_REQUIRED', requirement_id: 'users', actual: 'Blog users meaning is unapproved; activeUsers is not totalUsers.' },
    { code: 'SOURCE_CHANGE_REQUIRED', requirement_id: 'users', actual: 'The locked Content report acquires activeUsers only; totalUsers is neither requested nor normalized.' },
    { code: 'DECISION_REQUIRED', requirement_id: 'average_engagement_time', actual: 'Total engagement duration, time per session, time per active user and average session duration have different meanings; no Blog mapping or denominator is approved.' },
    { code: 'SOURCE_CHANGE_REQUIRED', requirement_id: 'average_engagement_time', actual: 'The current report acquires no engagement-duration metric or approved average-time expression.' },
    { code: 'DECISION_REQUIRED', requirement_id: 'content_coverage', actual: 'Required landing-page/property coverage and compatible multi-report population rules are unspecified.' },
  ];
  if (propertyId === undefined) issues.push({ code: 'DECISION_REQUIRED', requirement_id: 'property_scope',
    actual: 'The raw bundle records an acquisition property but the frozen Job context does not bind a property ID.' });
  if (normalized.rows.some((row) => row.landing_page.trim().length === 0)) issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'landing_page',
    actual: 'A required landing-page observation is blank; no path or URL is constructed.' });
  return {
    rows: normalized.rows.map((row) => ({ ...row })), presence, issues,
    // A provider placeholder is valid evidence, but it does not identify a page.
    unresolved_observations: normalized.rows.map((row) => ({ landing_page: row.landing_page === '(not set)' })),
    unsupported_fields: ['users', 'average_engagement_time'],
    context: {
      property_id: bundle.request.property_id, requested_start_date: bundle.request.start_date, requested_end_date: bundle.request.end_date,
      dimension_headers: pages[0].dimensionHeaders.map((header) => header.name), metric_headers: pages[0].metricHeaders.map((header) => header.name),
      provider_metadata: normalized.provider_metadata,
    },
  };
};
