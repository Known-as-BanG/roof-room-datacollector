import type { JsonObject } from '../../../shared/run-job';
import { requireApiObject, requireArray, type ApiRequester } from '../google-api/api-helpers';

const day = 86400000;
const calendarDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new Error('GSC coverage date is invalid.');
  return value;
};
export const isGsc28DayWindow = (start: string, end: string): boolean => (
  Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`) === 27 * day
);

export const parseGscDateCoverage = (value: unknown) => {
  const evidence = requireApiObject(value, 'GSC date coverage');
  const request = requireApiObject(evidence.request, 'GSC date coverage request');
  const dimensions = requireArray(request.dimensions, 'GSC date coverage dimensions');
  if (evidence.schema_version !== 1 || typeof request.site_url !== 'string' || !request.site_url.trim()
    || !['web', 'image', 'video', 'news', 'discover', 'googleNews'].includes(request.search_type as string)
    || request.data_state !== 'final' || dimensions.length !== 1 || dimensions[0] !== 'date'
    || request.country_filter !== undefined && request.country_filter !== 'TUR') throw new Error('GSC date coverage requires an explicit final date request.');
  const start = calendarDate(request.start_date); const end = calendarDate(request.end_date);
  if (start > end) throw new Error('GSC date coverage endpoints are reversed.');
  const received = evidence.response_received_at;
  if (evidence.response_received_at_origin !== 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT'
    || typeof received !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(received)
    || !Number.isFinite(Date.parse(received)) || new Date(received).toISOString() !== received) throw new Error('GSC coverage receipt must be an observed UTC timestamp.');
  const response = requireApiObject(evidence.raw_response, 'GSC date coverage response');
  if (response.metadata !== undefined) {
    const metadata = requireApiObject(response.metadata, 'GSC date coverage response metadata');
    if (Object.hasOwn(metadata, 'first_incomplete_date') || Object.hasOwn(metadata, 'first_incomplete_hour')) {
      throw new Error('GSC final date evidence contains inconsistent incomplete metadata.');
    }
  }
  const rows = response.rows === undefined ? [] : requireArray(response.rows, 'GSC date rows');
  const observed_dates = rows.map((entry) => {
    const keys = requireArray(requireApiObject(entry, 'GSC date row').keys, 'GSC date keys');
    if (keys.length !== 1) throw new Error('GSC coverage rows must contain only a date key.');
    const date = calendarDate(keys[0]);
    if (date < start || date > end) throw new Error('GSC observed date lies outside the supporting request.');
    return date;
  });
  if (new Set(observed_dates).size !== observed_dates.length) throw new Error('GSC date evidence contains duplicate date observations.');
  return { request, response_received_at: received, observed_dates };
};

export const acquireGscDateCoverage = async (
  request: { site_url: string; start_date: string; end_date: string; country_filter?: 'TUR' },
  requester: ApiRequester,
  now: () => Date,
): Promise<JsonObject> => {
  const response = await requester({
    url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(request.site_url)}/searchAnalytics/query`,
    method: 'POST',
    body: { startDate: request.start_date, endDate: request.end_date, type: 'web', dimensions: ['date'], dataState: 'final', rowLimit: 25000, startRow: 0,
      ...(request.country_filter ? { dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'country', operator: 'equals', expression: request.country_filter }] }] } : {}) },
  });
  const response_received_at = now().toISOString();
  if (response.status < 200 || response.status >= 300) throw new Error(`GSC date coverage provider error HTTP ${response.status}.`);
  const evidence: JsonObject = { schema_version: 1,
    request: { site_url: request.site_url, start_date: request.start_date, end_date: request.end_date,
      search_type: 'web', data_state: 'final', dimensions: ['date'], ...(request.country_filter ? { country_filter: request.country_filter } : {}) },
    response_received_at, response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT',
    raw_response: requireApiObject(response.body, 'GSC date coverage response') as JsonObject,
  };
  parseGscDateCoverage(evidence);
  return evidence;
};

export const inspectGscDateCoverage = (value: unknown, requested_context: unknown, reference_at?: string) => {
  if (value === undefined) return { status: 'MISSING_EVIDENCE', observed_dates: [] as string[], missing_dates: [] as string[] };
  const evidence = parseGscDateCoverage(value);
  const context = requireApiObject(requested_context, 'GSC requested context');
  const request = evidence.request;
  if (request.site_url !== context.site_url || request.search_type !== (context.search_type ?? 'web')
    || request.start_date !== context.requested_date_start || request.end_date !== context.requested_date_end
    || request.country_filter !== context.country_filter
    || !isGsc28DayWindow(request.start_date as string, request.end_date as string)) {
    return { status: 'CONTEXT_MISMATCH', observed_dates: evidence.observed_dates, missing_dates: [] as string[], response_received_at: evidence.response_received_at };
  }
  if (reference_at !== undefined && Date.parse(evidence.response_received_at) > Date.parse(reference_at)) {
    return { status: 'FUTURE_EVIDENCE', observed_dates: evidence.observed_dates, missing_dates: [] as string[], response_received_at: evidence.response_received_at };
  }
  const start = Date.parse(`${request.start_date}T00:00:00.000Z`);
  const dates = Array.from({ length: 28 }, (_, index) => new Date(start + index * day).toISOString().slice(0, 10));
  const observed = new Set(evidence.observed_dates);
  const missing_dates = dates.filter((date) => !observed.has(date));
  return { status: missing_dates.length === 0 ? 'OBSERVED_28_DATES' : 'MISSING_DATES',
    observed_dates: evidence.observed_dates, missing_dates, response_received_at: evidence.response_received_at };
};

export const requireGscPropertySelection = (value: unknown, ...ranges: unknown[]): string => {
  if (typeof value !== 'string' || !value || /\s/u.test(value)) throw new Error('GSC Query × Page requires an explicitly selected property.');
  const domain = value.startsWith('sc-domain:') ? value.slice('sc-domain:'.length) : undefined;
  try {
    const url = new URL(domain === undefined ? value : `https://${domain}`);
    if (domain === undefined && !/^https?:\/\//iu.test(value) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
      || url.search || url.hash || domain !== undefined && (!domain || /[/:?#@]/u.test(domain)
        || url.hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label)))) throw new Error('Invalid property');
  } catch {
    throw new Error('GSC property must be an exact URL-prefix or sc-domain: identity.');
  }
  for (const range of ranges) {
    if (range === undefined) continue;
    if (!Array.isArray(range) || range.some((entry: unknown) => typeof entry !== 'object' || entry === null || Array.isArray(entry)
      || Object.hasOwn(entry, 'site_url') && (entry as Record<string, unknown>).site_url !== value)) {
      throw new Error('GSC Job properties must agree with the explicit property selection.');
    }
  }
  return value;
};

export const requireGscPropertyBinding = (selected: unknown, connected: unknown, ...ranges: unknown[]): string => {
  const siteUrl = requireGscPropertySelection(selected, ...ranges);
  if (siteUrl !== connected) throw new Error('Selected GSC property changed or does not match the Workspace connection; Review again.');
  return siteUrl;
};
