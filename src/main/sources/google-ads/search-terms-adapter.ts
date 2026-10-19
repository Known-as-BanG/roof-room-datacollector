import type {
  AdsSearchTermRow,
  GoogleAdsSearchTermPerformanceRow,
} from '../../../shared/google-api';
import {
  requireApiObject,
  requireArray,
  requireNumberOrNull,
  type ApiRequester,
} from '../google-api/api-helpers';
import {
  normalizeCommonPerformanceMetrics,
  optionalReportingRecord,
  reportingNumberOrNull,
  requirePerformanceDate,
  requireReportingRecord,
  requireReportingText,
} from './reporting-row-helpers';
import { flattenGoogleAdsSearchStream } from './search-stream-response';
import { createGoogleAdsApiResponseError } from './google-ads-api-error';

const reportingTextOrNull = (value: unknown, field: string): string | null => (
  value === null || value === undefined
    ? null
    : requireReportingText(value, field)
);

export const normalizeSearchTermPerformanceRows = (
  value: unknown,
): GoogleAdsSearchTermPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads search term rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `search term rows[${String(index)}]`);
    const searchTermView = requireReportingRecord(row.searchTermView, 'searchTermView');
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
    const segments = requireReportingRecord(row.segments, 'segments');
    const keyword = optionalReportingRecord(segments.keyword, 'segments.keyword');
    const keywordInfo = optionalReportingRecord(keyword.info, 'segments.keyword.info');
    const metrics = optionalReportingRecord(row.metrics, 'metrics');
    return {
      search_term: requireReportingText(searchTermView.searchTerm, 'searchTermView.searchTerm'),
      campaign_id: requireReportingText(campaign.id, 'campaign.id'),
      campaign_name: requireReportingText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireReportingText(
        campaign.advertisingChannelType,
        'campaign.advertisingChannelType',
      ),
      ad_group_id: requireReportingText(adGroup.id, 'adGroup.id'),
      ad_group_name: requireReportingText(adGroup.name, 'adGroup.name'),
      keyword_resource_name: reportingTextOrNull(
        keyword.adGroupCriterion,
        'segments.keyword.adGroupCriterion',
      ),
      keyword_text: reportingTextOrNull(keywordInfo.text, 'segments.keyword.info.text'),
      keyword_match_type: reportingTextOrNull(
        keywordInfo.matchType,
        'segments.keyword.info.matchType',
      ),
      search_term_match_type: requireReportingText(
        segments.searchTermMatchType,
        'segments.searchTermMatchType',
      ),
      search_term_targeting_status: requireReportingText(
        searchTermView.status ?? segments.searchTermTargetingStatus,
        'searchTermView.status',
      ),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
      top_impression_percentage: reportingNumberOrNull(
        metrics.topImpressionPercentage,
        'metrics.topImpressionPercentage',
      ),
      absolute_top_impression_percentage: reportingNumberOrNull(
        metrics.absoluteTopImpressionPercentage,
        'metrics.absoluteTopImpressionPercentage',
      ),
    };
  });
};

const normalizeLegacySearchTerms = (body: unknown[]): AdsSearchTermRow[] => (
  body.map((entry, index) => {
    const row = requireApiObject(entry, `Search Terms rows[${index}]`);
    const observedDate = row.performance_date ?? row.date;
    let performanceDate: string | null = null;
    if (observedDate !== null && observedDate !== undefined) {
      try {
        performanceDate = requirePerformanceDate(observedDate, 'performance_date');
      } catch {
        // Historical rows with an invalid optional date remain readable without an invented date.
      }
    }
    const averageCpcMicros = requireNumberOrNull(
      row.average_cpc_micros,
      'average_cpc_micros',
    );
    const costMicros = requireNumberOrNull(row.cost_micros, 'cost_micros');
    return {
      search_term: String(row.search_term ?? ''),
      keyword: row.keyword == null ? null : String(row.keyword),
      match_type: row.match_type == null ? null : String(row.match_type),
      campaign: row.campaign == null ? null : String(row.campaign),
      ad_group: row.ad_group == null ? null : String(row.ad_group),
      performance_date: performanceDate,
      impressions: requireNumberOrNull(row.impressions, 'impressions'),
      clicks: requireNumberOrNull(row.clicks, 'clicks'),
      ctr: requireNumberOrNull(row.ctr, 'ctr'),
      average_cpc: averageCpcMicros === null ? null : averageCpcMicros / 1_000_000,
      cost: costMicros === null ? null : costMicros / 1_000_000,
      conversions: requireNumberOrNull(row.conversions, 'conversions'),
      conversion_value: requireNumberOrNull(row.conversion_value, 'conversion_value'),
    };
  })
);

export const normalizeSearchTerms = (body: unknown): AdsSearchTermRow[] => {
  const topLevel = requireArray(body, 'Search Terms response');
  if (topLevel.length === 0) return [];
  const first = requireApiObject(topLevel[0], 'Search Terms response[0]');
  if (Object.hasOwn(first, 'search_term')) {
    return normalizeLegacySearchTerms(topLevel);
  }
  return normalizeSearchTermPerformanceRows(flattenGoogleAdsSearchStream(topLevel)).map((row) => ({
    search_term: row.search_term,
    keyword: row.keyword_text,
    match_type: row.search_term_match_type,
    campaign: row.campaign_name,
    ad_group: row.ad_group_name,
    performance_date: row.performance_date,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    average_cpc: row.average_cpc_micros === null
      ? null
      : row.average_cpc_micros / 1_000_000,
    cost: row.cost_micros === null ? null : row.cost_micros / 1_000_000,
    conversions: row.conversions,
    conversion_value: row.conversions_value,
  }));
};

export const inspectSearchTermsAccountEvidence = (body: unknown, selectedCustomer: unknown) => {
  const topLevel = requireArray(body, 'Search Terms response');
  const legacy = topLevel.length > 0 && Object.hasOwn(requireApiObject(topLevel[0], 'Search Terms response[0]'), 'search_term');
  const rawRows = legacy ? topLevel.map((row) => requireApiObject(row, 'Search Terms row')) : flattenGoogleAdsSearchStream(body);
  const issues: Array<{ code: 'EVIDENCE_INVALID' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }> = [];
  const zones = new Set<string>();
  const observedZones = new Set<string>();
  const customers = new Set<string>();
  let invalidZone = false;
  // Legacy flat rows have no established provider-native customer metadata contract.
  for (const row of legacy ? [] : rawRows) {
    const customer = row.customer !== null && typeof row.customer === 'object' ? row.customer as Record<string, unknown> : {};
    if (typeof customer.id === 'string' && /^\d+$/u.test(customer.id)) customers.add(customer.id);
    const zone = customer.timeZone;
    if (zone === undefined || zone === null || zone === '') continue;
    try {
      if (typeof zone !== 'string') throw new Error('Invalid timezone.');
      observedZones.add(zone);
      zones.add(new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone);
    } catch { invalidZone = true; }
  }
  if (typeof selectedCustomer !== 'string' || !/^\d+$/u.test(selectedCustomer) || customers.size !== 1 || !customers.has(selectedCustomer)
    || rawRows.some((row) => !row.customer || (row.customer as Record<string, unknown>).id !== selectedCustomer)) {
    issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'ads_account_scope', actual: 'Provider account identity must be observed and agree with the explicitly selected account; request identity alone cannot establish timezone ownership.' });
  }
  if (invalidZone || zones.size > 1) issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'ads_account_timezone', actual: 'Account timezone observations are invalid or conflicting.' });
  else if (zones.size === 0) issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'ads_account_timezone', actual: 'No provider-observed Ads account timezone is available; lifecycle/request context is not a substitute.' });
  return { observed_customer_ids: [...customers], observed_time_zones: [...observedZones],
    time_zone: !invalidZone && zones.size === 1 ? [...zones][0] : undefined, issues };
};

// Presence is inspected before normalization can turn absent provider fields into null.
export const inspectSearchTermsFields = (body: unknown, requested_context?: unknown, publication_at?: string) => {
  const rows = normalizeSearchTerms(body);
  const topLevel = requireArray(body, 'Search Terms response');
  const legacy = topLevel.length > 0 && Object.hasOwn(requireApiObject(topLevel[0], 'Search Terms response[0]'), 'search_term');
  const rawRows = legacy ? topLevel.map((row) => requireApiObject(row, 'Search Terms row'))
    : flattenGoogleAdsSearchStream(body);
  const paths: Record<string, string[]> = legacy ? {
    search_term: ['search_term'], campaign: ['campaign'], ad_group: ['ad_group'],
    impressions: ['impressions'], clicks: ['clicks'], ctr: ['ctr'], cost: ['cost_micros'],
    conversions: ['conversions'], conversion_value: ['conversion_value'],
  } : {
    search_term: ['searchTermView', 'searchTerm'], campaign: ['campaign', 'name'], ad_group: ['adGroup', 'name'],
    impressions: ['metrics', 'impressions'], clicks: ['metrics', 'clicks'], ctr: ['metrics', 'ctr'],
    cost: ['metrics', 'costMicros'], conversions: ['metrics', 'conversions'], conversion_value: ['metrics', 'conversionsValue'],
  };
  const presence = rawRows.map((row) => Object.fromEntries(Object.entries(paths).map(([field, path]) => {
    let value: unknown = row;
    for (const key of path) {
      if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return [field, false];
      value = (value as Record<string, unknown>)[key];
    }
    if (field === 'search_term' && value === null || ['search_term', 'campaign', 'ad_group'].includes(field)
      && value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
      throw new Error('Search Terms text field is not compatible with its source meaning.');
    }
    if (!['search_term', 'campaign', 'ad_group'].includes(field)
      && value !== null && value !== '' && (typeof value !== 'number' && typeof value !== 'string' || String(value).trim() === '')) {
      throw new Error('Search Terms metric field is not compatible with its source meaning.');
    }
    return [field, value !== undefined];
  })));
  const publication_issues: Array<{ code: 'EVIDENCE_INVALID' | 'FIELD_OBSERVATION_REQUIRED' | 'WINDOW_MISMATCH'; requirement_id: string; actual: string }> = [];
  let publication_time_context: Record<string, unknown> | undefined;
  if (publication_at !== undefined) {
    const requested = requested_context as Record<string, unknown> | null;
    const selectedCustomer = requested?.customer_id;
    const account = inspectSearchTermsAccountEvidence(body, selectedCustomer);
    publication_issues.push(...account.issues);
    publication_time_context = { reference_at: publication_at, reference_origin: 'PACKAGE_CREATED_AT',
      selected_customer_id: selectedCustomer ?? null, requested_context_origin: 'FROZEN_JOB_CONTEXT',
      requested_date_start: requested?.requested_date_start ?? null, requested_date_end: requested?.requested_date_end ?? null,
      observed_customer_ids: account.observed_customer_ids, customer_identity_origin: 'PROVIDER_RESPONSE_CUSTOMER_ID',
      observed_time_zones: account.observed_time_zones, timezone_origin: 'PROVIDER_RESPONSE_CUSTOMER',
      observed_performance_dates: [...new Set(rows.flatMap((row) => row.performance_date === null ? [] : [row.performance_date]))] };
    if (account.time_zone !== undefined) {
      const time_zone = account.time_zone;
      const parts = new Intl.DateTimeFormat('en', { timeZone: time_zone, year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'iso8601', numberingSystem: 'latn' }).formatToParts(new Date(publication_at));
      const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
      const today = Date.UTC(value('year'), value('month') - 1, value('day'));
      const start_date = new Date(today - 30 * 86_400_000).toISOString().slice(0, 10);
      const end_date = new Date(today - 86_400_000).toISOString().slice(0, 10);
      publication_time_context = { ...publication_time_context, time_zone, start_date, end_date };
      if (requested?.requested_date_start !== start_date || requested?.requested_date_end !== end_date) publication_issues.push({ code: 'WINDOW_MISMATCH', requirement_id: 'ads_completed_days', actual: 'Requested dates are not the last 30 completed account-calendar days at package creation.' });
      if (rows.some((row) => row.performance_date === null)) publication_issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'ads_performance_dates', actual: 'Missing observed performance dates cannot establish dated coverage or zero activity.' });
      if (rows.some((row) => row.performance_date !== null && (row.performance_date < start_date || row.performance_date > end_date))) publication_issues.push({ code: 'WINDOW_MISMATCH', requirement_id: 'ads_observed_dates', actual: 'Observed performance dates are outside the publication window.' });
    }
  }
  return { rows, presence, derivations: {
    cost: { expression: 'observed cost_micros / 1000000', approved_for_blog: true },
    average_cpc: { expression: 'observed average_cpc_micros / 1000000', approved_for_blog: true },
  }, ...(publication_at === undefined ? {} : { publication_issues, publication_time_context }) };
};

export const fetchSearchTerms = async (
  request: { customer_id: string; query: string },
  requester: ApiRequester,
): Promise<{ raw: unknown; rows: AdsSearchTermRow[] }> => {
  const response = await requester({
    url: `https://googleads.googleapis.com/v25/customers/${request.customer_id}/googleAds:searchStream`,
    method: 'POST',
    body: { query: request.query },
    return_non_success_response: true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw createGoogleAdsApiResponseError(response);
  }
  return { raw: response.body, rows: normalizeSearchTerms(response.body) };
};
