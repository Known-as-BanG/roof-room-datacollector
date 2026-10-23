import { resolveDesktopDatePolicy, type DesktopDatePolicy, type DesktopResolvedDateRange } from '../../../shared/desktop-run-resolution';
import { GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID } from '../../../shared/google-api';
import type { JsonObject } from '../../../shared/run-job';
import type { SourceCollectionContext } from '../../../shared/collection';
import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const SEARCH_TERM_FIELDS = [
  'search_term_view.search_term',
  'search_term_view.status',
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'segments.keyword.ad_group_criterion',
  'segments.keyword.info.text',
  'segments.keyword.info.match_type',
  'segments.search_term_match_type',
  'segments.date',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.all_conversions',
  'metrics.all_conversions_value',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
] as const;

// This source owns the supported resource/campaign contract; Core only carries it.
export const requireSearchTermsCustomerId = (value: unknown, jobs?: unknown): string => {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) throw new Error('Search Terms requires an explicitly selected numeric customer ID.');
  if (jobs !== undefined) {
    if (!Array.isArray(jobs) || jobs.some((job: unknown) => typeof job !== 'object' || job === null || Array.isArray(job)
      || (Object.hasOwn(job, 'customer_id') && (job as Record<string, unknown>).customer_id !== value))) {
      throw new Error('Search Terms Job accounts must agree with the explicitly selected account.');
    }
  }
  return value;
};

export const requireSearchTermsAccountBinding = (selected: unknown, connected: unknown, jobs?: unknown): string => {
  const customerId = requireSearchTermsCustomerId(selected, jobs);
  if (typeof connected !== 'string' || connected.replace(/-/gu, '') !== customerId) {
    throw new Error('Selected Google Ads account changed or does not match the Workspace connection; Review again.');
  }
  return customerId;
};

type SearchTermsDateRange = Omit<DesktopResolvedDateRange, 'date_policy'> & {
  date_policy: DesktopDatePolicy | 'EXPLICIT';
};

export const createSearchTermsJobContext = (range: SearchTermsDateRange, customer_id: unknown): JsonObject => ({
  customer_id: requireSearchTermsCustomerId(customer_id),
  task_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  source_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  source_mode: 'search_term_view',
  campaign_type: 'SEARCH',
  ...range,
});

const requireDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Ads Search Terms requires absolute calendar dates.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Ads Search Terms requires valid calendar dates.');
  }
  return value;
};

export const resolveSearchTermsDateRange = (
  config: Record<string, unknown>,
  rollingPolicy: DesktopDatePolicy,
  referenceDate: string,
): SearchTermsDateRange => {
  const mode = config.date_mode === undefined ? 'ROLLING' : config.date_mode;
  if (mode === 'ROLLING') {
    if (config.date_policy !== rollingPolicy
      || config.requested_date_start !== undefined || config.requested_date_end !== undefined) {
      throw new Error('Rolling Search Terms requires its task policy without explicit dates.');
    }
    return resolveDesktopDatePolicy(rollingPolicy, referenceDate);
  }
  if (mode !== 'EXPLICIT' || config.date_policy !== undefined) {
    throw new Error('Search Terms requires rolling mode or explicit dates without a rolling policy.');
  }
  const start = requireDate(config.requested_date_start);
  const end = requireDate(config.requested_date_end);
  if (start > end) throw new Error('Ads Search Terms date range is reversed.');
  return {
    reference_date: requireDate(referenceDate), date_policy: 'EXPLICIT',
    requested_date_start: start, requested_date_end: end,
  };
};

export const buildSearchTermsQuery = (context: SourceCollectionContext): string => {
  const request = context.source_context;
  if (context.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request?.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request.task_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request.source_mode !== 'search_term_view'
    || request.campaign_type !== 'SEARCH') {
    throw new Error('Ads Search Terms supports only the reviewed SEARCH search_term_view contract.');
  }
  const start = requireDate(request.requested_date_start);
  const end = requireDate(request.requested_date_end);
  if (start > end) throw new Error('Ads Search Terms date range is reversed.');

  return buildSearchTermQueryForDates(start, end, ['customer.id', 'customer.time_zone', ...SEARCH_TERM_FIELDS]);
};

const buildSearchTermQueryForDates = (start: string, end: string, fields: readonly string[] = SEARCH_TERM_FIELDS): string => (
  [
    `SELECT ${fields.join(', ')}`,
    'FROM search_term_view',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    `AND segments.date BETWEEN '${start}' AND '${end}'`,
  ].join(' ')
);

export const buildSearchTermPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'SEARCH_TERMS'
    || context.resource_mode !== 'search_term_view'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Search Term reporting requires the SEARCH search_term_view dataset contract.');
  }
  return buildSearchTermQueryForDates(
    context.requested_date_start,
    context.requested_date_end,
  );
};

export const SEARCH_TERMS_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'SEARCH_TERMS',
  resource_mode: 'search_term_view',
  buildQuery: buildSearchTermPerformanceQuery,
};
