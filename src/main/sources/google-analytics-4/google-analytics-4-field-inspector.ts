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

export const getGoogleAnalytics4ContentWindow = (reference_at: string, time_zone: string) => {
  if (
    typeof reference_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(reference_at)
    || !Number.isFinite(Date.parse(reference_at))
    || new Date(`${reference_at.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) !== reference_at.slice(0, 10)
  ) throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_reference_time');
  if (typeof time_zone !== 'string' || time_zone.trim().length === 0) {
    throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_timezone');
  }
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en', {
      timeZone: time_zone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(reference_at));
  } catch { throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_timezone'); }
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  // UTC arithmetic on the property's local calendar date avoids DST-length assumptions.
  const today = Date.UTC(value('year'), value('month') - 1, value('day'));
  return {
    start_date: new Date(today - 28 * 86_400_000).toISOString().slice(0, 10),
    end_date: new Date(today - 86_400_000).toISOString().slice(0, 10),
  };
};

export const inspectGoogleAnalytics4ContentFields = (bytes: Uint8Array, requested_context: unknown, reference_at?: string,
  reference_origin: 'DRAFT_CREATED_AT' | 'PACKAGE_CREATED_AT' = 'DRAFT_CREATED_AT') => {
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
  const pages = bundle.pages.map((page) => JSON.parse(page.raw_body_text) as {
    dimensionHeaders: Array<{ name: string }>; metricHeaders: Array<{ name: string }>; metadata?: unknown;
    rows: Array<{ dimensionValues: Array<Record<string, unknown>>; metricValues: Array<Record<string, unknown>> }>;
  });
  let timeZone: string | undefined;
  for (const response of pages) {
    const observed = isRecord(response.metadata) ? response.metadata.timeZone : undefined;
    if (observed === undefined || observed === null || (typeof observed === 'string' && observed.trim().length === 0)) continue;
    let canonical: string;
    try {
      if (typeof observed !== 'string') throw new Error('Invalid timezone.');
      canonical = new Intl.DateTimeFormat('en', { timeZone: observed }).resolvedOptions().timeZone;
    } catch { throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_timezone'); }
    if (timeZone !== undefined && canonical !== timeZone) {
      throw new GoogleAnalytics4EvidenceError('EVIDENCE_INVALID', 'ga4_timezone');
    }
    timeZone = canonical;
  }
  const reportingWindow = reference_at !== undefined && timeZone !== undefined ? {
    reference_at, reference_origin,
    time_zone: timeZone, time_zone_origin: 'PROVIDER_RESPONSE_METADATA' as const,
    ...getGoogleAnalytics4ContentWindow(reference_at, timeZone),
  } : undefined;
  const normalized = normalizeGoogleAnalytics4Rows('GA4_CONTENT_PERFORMANCE', bundle);
  if (normalized.rows.length !== row_count) throw new Error('GA4 report row coverage is incomplete.');
  const rows = normalized.rows.map((row) => {
    const duration = 'user_engagement_duration' in row ? row.user_engagement_duration ?? null : null;
    const reason = duration === null ? 'MISSING_USER_ENGAGEMENT_DURATION'
      : row.sessions === null ? 'MISSING_SESSIONS'
        : row.sessions <= 0 ? 'NON_POSITIVE_SESSIONS'
          : !Number.isInteger(row.sessions) ? 'INVALID_SESSIONS'
            : duration < 0 ? 'INVALID_USER_ENGAGEMENT_DURATION' : null;
    return {
      ...row, users: 'total_users' in row ? row.total_users ?? null : null,
      average_engagement_time: reason === null ? duration! / row.sessions! : null,
      average_engagement_time_reason: reason,
    };
  });
  const metricFields = { users: 'totalUsers', sessions: 'sessions', engaged_sessions: 'engagedSessions', engagement_rate: 'engagementRate', key_events: 'keyEvents' };
  const presence = pages.flatMap((page) => page.rows.map((row) => {
    const hasMetric = (name: string) => {
      const index = page.metricHeaders.findIndex((header) => header.name === name);
      return index >= 0 && Object.hasOwn(row.metricValues[index], 'value');
    };
    return {
      landing_page: Object.hasOwn(row.dimensionValues[0], 'value'),
      average_engagement_time: hasMetric('userEngagementDuration') && hasMetric('sessions'),
      ...Object.fromEntries(Object.entries(metricFields).map(([field, provider]) => [field, hasMetric(provider)])),
    };
  }));
  const issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED' | 'WINDOW_MISMATCH'; requirement_id: string; actual: string }> = [
    { code: 'DECISION_REQUIRED', requirement_id: 'content_coverage', actual: 'Compatible multi-report populations and warning-outcome coverage remain unresolved; returned rows do not establish unreturned pages.' },
  ];
  if (timeZone === undefined) issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'ga4_timezone',
    actual: 'Accepted response metadata does not establish the property timezone; no default is supplied.' });
  if (reportingWindow && (context.start_date !== reportingWindow.start_date || context.end_date !== reportingWindow.end_date)) {
    issues.push({ code: 'WINDOW_MISMATCH', requirement_id: 'ga4_completed_days',
      actual: `Requested dates are not the last 28 completed property-calendar days at ${reference_origin === 'PACKAGE_CREATED_AT' ? 'package' : 'draft'} creation.` });
  }
  if (bundle.bundle_schema_version === 1) {
    issues.push(
      { code: 'SOURCE_CHANGE_REQUIRED', requirement_id: 'users', actual: 'Legacy Content evidence does not acquire totalUsers; activeUsers cannot substitute.' },
      { code: 'SOURCE_CHANGE_REQUIRED', requirement_id: 'average_engagement_time', actual: 'Legacy Content evidence does not acquire userEngagementDuration.' },
    );
  }
  if (rows.some((row) => row.average_engagement_time_reason?.startsWith('INVALID_') || (row.sessions !== null && row.sessions < 0))) {
    issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'average_engagement_time',
      actual: 'An invalid duration or session count cannot establish engagement seconds per session; the derived value is null.' });
  }
  if (propertyId === undefined) issues.push({ code: 'DECISION_REQUIRED', requirement_id: 'property_scope',
    actual: 'The raw bundle records an acquisition property but the frozen Job context does not bind a property ID.' });
  if (normalized.rows.some((row) => row.landing_page.trim().length === 0)) issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'landing_page',
    actual: 'A required landing-page observation is blank; no path or URL is constructed.' });
  return {
    rows, presence, issues,
    derivations: {
      average_engagement_time: { expression: 'userEngagementDuration / sessions, only with valid observed inputs and sessions > 0', unit: 'seconds', approved_for_blog: true },
      average_engagement_time_reason: { expression: 'Observed input availability and denominator validation', approved_for_blog: true },
    },
    // A provider placeholder is valid evidence, but it does not identify a page.
    unresolved_observations: normalized.rows.map((row) => ({ landing_page: row.landing_page === '(not set)' })),
    unsupported_fields: bundle.bundle_schema_version === 1 ? ['users', 'average_engagement_time'] : [],
    context: {
      property_id: bundle.request.property_id, requested_start_date: bundle.request.start_date, requested_end_date: bundle.request.end_date,
      dimension_headers: pages[0].dimensionHeaders.map((header) => header.name), metric_headers: pages[0].metricHeaders.map((header) => header.name),
      provider_metadata: normalized.provider_metadata,
      ...(reportingWindow === undefined ? {} : { reporting_window: reportingWindow }),
      metric_provenance: {
        users: { origin: 'PROVIDER_METRIC_ALIAS', metric: 'totalUsers' },
        user_engagement_duration: { origin: 'PROVIDER_METRIC', metric: 'userEngagementDuration', unit: 'seconds' },
        average_engagement_time: { origin: 'DERIVED', expression: 'userEngagementDuration / sessions', unit: 'seconds' },
      } as const,
    },
  };
};
