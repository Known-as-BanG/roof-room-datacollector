import { inspectSitemapFields } from '../sources/bitkimark/bitkimark-sitemap-field-inspector';
import { inspectSerpApiFields } from '../sources/serpapi/serpapi-field-inspector';
import { inspectGoogleAnalytics4ContentFields } from '../sources/google-analytics-4/google-analytics-4-field-inspector';
import { inspectIkasProductsFields } from '../sources/ikas/ikas-products-field-inspector';
import type { BlogWritingPackV2FieldObservation, BlogWritingPackV2BlockerCode } from '../../shared/blog-writing-pack-v2-readiness';
import { inspectKeywordPlannerFields } from '../sources/google-ads/keyword-planner-field-inspector';
import { inspectSearchTermsFields } from '../sources/google-ads/search-terms-adapter';
import { inspectGscQueryPageFields } from '../sources/google-search-console/query-page-adapter';
import type { SerpApiDraftInspectionContext } from '../../shared/serpapi';
import type { BlogV2Representations } from '../../shared/blog-writing-pack-v2-publication';
import { parseGoogleTrendsInterestOverTimeCsv } from '../sources/google-trends/google-trends-interest-over-time-parser';

// Source adapters own provider shapes; only Blog downstream aliases and requirements live here.
export const inspectBlogWritingPackV2Fields = (source_id: string, body: unknown, requested_context?: unknown, acquired_at?: string, reference_at?: string, serp_context?: SerpApiDraftInspectionContext, publication_at?: string, gsc_date_evidence?: unknown): {
  status: 'SUPPORTED' | 'UNSUPPORTED'; rows: Array<Record<string, unknown>>; fields: BlogWritingPackV2FieldObservation[];
  limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'>;
  sitemap_issues?: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED'; requirement_id: string; actual: string }>;
  product_issues?: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }>;
  serp_provenance?: ReturnType<typeof inspectSerpApiFields>['provenance'];
  serp_missing_observations?: string[];
  serp_freshness?: ReturnType<typeof inspectSerpApiFields>['freshness'];
  serp_issues?: ReturnType<typeof inspectSerpApiFields>['issues'];
  gsc_date_coverage?: ReturnType<typeof inspectGscQueryPageFields>['gsc_date_coverage'];
  ga4_context?: ReturnType<typeof inspectGoogleAnalytics4ContentFields>['context'];
  ga4_issues?: ReturnType<typeof inspectGoogleAnalytics4ContentFields>['issues'];
  publication?: BlogV2Representations;
  publication_issues?: Array<{ code: BlogWritingPackV2BlockerCode; requirement_id: string; actual: string }>;
  publication_time_context?: Record<string, unknown>;
} => {
  let rows: Array<Record<string, unknown>>;
  let presence: Array<Record<string, boolean>>;
  let fields: string[];
  let unresolved_fields: string[] = [];
  let unresolved_observations: Array<Record<string, boolean>> = [];
  let unsupported_fields: string[] = [];
  const sitemap_issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED'; requirement_id: string; actual: string }> = [];
  const product_issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }> = [];
  let limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'> = [];
  let serp_provenance: ReturnType<typeof inspectSerpApiFields>['provenance'] | undefined;
  let serp_missing_observations: string[] = [];
  let serp_freshness: ReturnType<typeof inspectSerpApiFields>['freshness'] | undefined;
  let serp_issues: ReturnType<typeof inspectSerpApiFields>['issues'] = [];
  let ga4_context: ReturnType<typeof inspectGoogleAnalytics4ContentFields>['context'] | undefined;
  let ga4_issues: ReturnType<typeof inspectGoogleAnalytics4ContentFields>['issues'] = [];
  let derivations: Record<string, { expression: string; unit?: string; approved_for_blog: boolean }> = {};
  let publication_issues: Array<{ code: BlogWritingPackV2BlockerCode; requirement_id: string; actual: string }> = [];
  let gsc_date_coverage: ReturnType<typeof inspectGscQueryPageFields>['gsc_date_coverage'] | undefined;
  let publication_time_context: Record<string, unknown> | undefined;
  if (source_id === 'google-ads-search-terms') {
    const inspected = inspectSearchTermsFields(body, requested_context, publication_at);
    derivations = inspected.derivations;
    publication_issues = inspected.publication_issues ?? [];
    publication_time_context = inspected.publication_time_context;
    rows = inspected.rows.map((row) => ({ ...row }));
    presence = inspected.presence;
    fields = ['search_term', 'campaign', 'ad_group', 'impressions', 'clicks', 'ctr', 'cost', 'conversions', 'conversion_value'];
  } else if (source_id === 'google-search-console-query-page') {
    const inspected = inspectGscQueryPageFields(body, publication_at, requested_context, gsc_date_evidence, reference_at);
    gsc_date_coverage = inspected.gsc_date_coverage;
    publication_issues = [...inspected.coverage_issues, ...(inspected.publication_issues ?? [])];
    publication_time_context = inspected.publication_time_context;
    rows = inspected.rows.map(({ query, page, clicks, impressions, ctr, position }) => (
      { query, page_url: page, clicks, impressions, ctr, average_position: position }
    ));
    presence = inspected.presence.map(({ query, page, clicks, impressions, ctr, position }) => (
      { query, page_url: page, clicks, impressions, ctr, average_position: position }
    ));
    fields = ['query', 'page_url', 'clicks', 'impressions', 'ctr', 'average_position'];
  } else if (source_id === 'google-keyword-planner' || source_id === 'google-keyword-planner-csv') {
    if (!(body instanceof Uint8Array)) throw new Error('Keyword Planner inspection requires accepted bytes.');
    const inspected = inspectKeywordPlannerFields(source_id, body, requested_context, publication_at);
    derivations = inspected.derivations ?? {};
    publication_issues = inspected.publication_issues ?? [];
    publication_time_context = inspected.publication_time_context;
    rows = inspected.rows.map((row) => ({ ...row, keyword: row.returned_keyword, average_monthly_searches: row.avg_monthly_searches }));
    presence = inspected.presence.map((row) => ({ ...row, keyword: row.returned_keyword, average_monthly_searches: row.avg_monthly_searches }));
    fields = ['keyword', 'average_monthly_searches', 'competition', 'top_of_page_bid_low', 'top_of_page_bid_high'];
    limitations = inspected.limitations;
  } else if (source_id === 'ikas-products') {
    if (!(body instanceof Uint8Array)) throw new Error('İkas inspection requires accepted workbook bytes.');
    const inspected = inspectIkasProductsFields(body, requested_context);
    derivations = inspected.derivations;
    rows = inspected.rows.map((row) => ({ ...row, product_name: row.product_title, product_url: row.url }));
    presence = inspected.presence.map((row) => ({ ...row, product_name: row.product_title, product_url: row.url }));
    fields = ['product_id', 'product_name', 'product_url', 'category', 'price', 'availability', 'stock_status', 'product_status'];
    unresolved_fields = inspected.unresolved_fields;
    unsupported_fields = inspected.unsupported_fields;
    for (const field of unresolved_fields) product_issues.push({ code: 'DECISION_REQUIRED', requirement_id: field,
      actual: field === 'category' ? 'Native categories/type have no approved singular category rule.'
        : field === 'price' ? 'Per-variant price and sale_price have no approved Blog product-price selection rule.'
          : 'Derived variant availability has no approved Blog product-availability mapping.' });
    for (const field of unsupported_fields) product_issues.push({ code: 'SOURCE_CHANGE_REQUIRED', requirement_id: field,
      actual: 'Current normalized import does not establish this provider-native capability.' });
    for (const field of inspected.missing_observations) {
      const requirement_id = field === 'product_title' ? 'product_name' : field === 'url' ? 'product_url' : field;
      if (presence.some((row) => row[requirement_id])) product_issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id,
        actual: 'A required product observation is blank; no replacement is inferred.' });
    }
  } else if (source_id === 'bitkimark-sitemap') {
    if (!(body instanceof Uint8Array)) throw new Error('Sitemap inspection requires accepted XML bytes.');
    const inspected = inspectSitemapFields(body, requested_context, acquired_at);
    rows = inspected.rows;
    presence = inspected.presence;
    fields = ['url', 'page_type', 'title', 'status'];
    unsupported_fields = inspected.unsupported_fields;
    unresolved_fields = inspected.unresolved_fields;
    for (const field of unsupported_fields) sitemap_issues.push({ code: 'SOURCE_CHANGE_REQUIRED', requirement_id: field,
      actual: field === 'page_type' ? 'Sitemap does not establish page classification.'
        : field === 'title' ? 'Sitemap does not establish an observed webpage title.'
          : 'Sitemap document HTTP status does not establish individual page HTTP status.' });
    if (unresolved_fields.includes('url')) sitemap_issues.push({ code: 'DECISION_REQUIRED', requirement_id: 'sitemap_document_kind',
      actual: 'Selected sitemap index lists child sitemap documents, not webpage observations.' });
  } else if (source_id === 'serpapi') {
    if (!(body instanceof Uint8Array)) throw new Error('SERP inspection requires accepted JSON bytes.');
    const inspected = inspectSerpApiFields(body, requested_context, serp_context);
    derivations = inspected.derivations;
    rows = inspected.rows.map((row) => ({ ...row }));
    presence = inspected.presence;
    fields = ['query', 'capture_date', 'position', 'url', 'title', 'domain'];
    serp_provenance = inspected.provenance;
    serp_missing_observations = inspected.missing_observations;
    serp_freshness = inspected.freshness;
    serp_issues = inspected.issues;
  } else if (source_id === 'google-analytics-4') {
    if (!(body instanceof Uint8Array)) throw new Error('GA4 inspection requires accepted bundle bytes.');
    const inspected = inspectGoogleAnalytics4ContentFields(body, requested_context, reference_at, publication_at === undefined ? 'DRAFT_CREATED_AT' : 'PACKAGE_CREATED_AT');
    derivations = inspected.derivations;
    rows = inspected.rows;
    presence = inspected.presence;
    unresolved_observations = inspected.unresolved_observations;
    fields = ['landing_page', 'sessions', 'users', 'engaged_sessions', 'engagement_rate', 'average_engagement_time', 'key_events'];
    unsupported_fields = inspected.unsupported_fields;
    ga4_context = inspected.context;
    ga4_issues = inspected.issues;
  } else if (source_id === 'google-trends') {
    if (!(body instanceof Uint8Array)) throw new Error('Trends publication requires accepted CSV bytes.');
    const parsed = parseGoogleTrendsInterestOverTimeCsv(body);
    // Preserve the existing accepted-loader mapping without introducing Blog fields.
    rows = parsed.rows.flatMap((row) => row.values.map((value) => ({
      period_start: row.period_start, temporal_dimension: parsed.temporal_dimension,
      category_label: parsed.category_label, query: value.query,
      geography_label: value.geography_label, relative_interest: value.relative_interest,
    })));
    presence = rows.map(() => ({}));
    fields = [];
  } else {
    return { status: 'UNSUPPORTED', rows: [], fields: [], limitations: [] };
  }
  const derivedRows: BlogV2Representations['derived']['rows'] = [];
  const normalizedRows = rows.map((row, row_index) => {
    const normalized = { ...row }; const values: Record<string, unknown> = {};
    for (const field of Object.keys(derivations)) if (Object.hasOwn(normalized, field)) { values[field] = normalized[field]; delete normalized[field]; }
    if (Object.keys(values).length > 0) derivedRows.push({ row_index, values });
    return normalized;
  });
  return { status: 'SUPPORTED', rows, limitations, publication_issues, publication_time_context,
    ...(gsc_date_coverage ? { gsc_date_coverage } : {}),
    publication: { normalized: { implementation: `${source_id}:blog-field-normalization-v1`, rows: normalizedRows },
      derived: { rows: derivedRows, transformations: Object.entries(derivations).map(([field, definition]) => ({ field, ...definition })) } },
    ...(source_id === 'ikas-products' ? { product_issues } : {}),
    ...(source_id === 'serpapi' ? { serp_provenance, serp_missing_observations, serp_freshness, serp_issues } : {}),
    ...(source_id === 'google-analytics-4' ? { ga4_context, ga4_issues } : {}),
    ...(source_id === 'bitkimark-sitemap' ? { sitemap_issues } : {}), fields: fields.map((field) => {
    let observed_count = 0; let null_count = 0; let absent_count = 0; let unresolved_count = 0;
    let derived_count = 0;
    rows.forEach((row, index) => {
      if (!presence[index][field]) absent_count += 1;
      else if (source_id === 'serpapi' && field === 'capture_date') derived_count += 1;
      else if (unresolved_observations[index]?.[field]) unresolved_count += 1;
      else if (unresolved_fields.includes(field) && !Object.hasOwn(row, field)) return;
      else if (row[field] === null) null_count += 1;
      else observed_count += 1;
    });
    return { field, status: source_id === 'serpapi' && field === 'capture_date' ? derived_count > 0 ? 'DERIVED' : 'UNRESOLVED'
      : unsupported_fields.includes(field) ? 'UNSUPPORTED' : rows.length === 0 ? 'UNRESOLVED' : absent_count > 0 ? 'ABSENT'
      : unresolved_count > 0 || unresolved_fields.includes(field) ? 'UNRESOLVED' : observed_count > 0 ? 'OBSERVED' : 'NULL', observed_count, null_count, absent_count,
      ...(source_id === 'serpapi' && field === 'capture_date' ? { derived_count } : {}) };
  }) };
};
