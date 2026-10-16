import { inspectSitemapFields } from '../sources/bitkimark/bitkimark-sitemap-field-inspector';
import { inspectIkasProductsFields } from '../sources/ikas/ikas-products-field-inspector';
import type { BlogWritingPackV2FieldObservation } from '../../shared/blog-writing-pack-v2-readiness';
import { inspectKeywordPlannerFields } from '../sources/google-ads/keyword-planner-field-inspector';
import { inspectSearchTermsFields } from '../sources/google-ads/search-terms-adapter';
import { inspectGscQueryPageFields } from '../sources/google-search-console/query-page-adapter';

// Source adapters own provider shapes; only Blog downstream aliases and requirements live here.
export const inspectBlogWritingPackV2Fields = (source_id: string, body: unknown, requested_context?: unknown, acquired_at?: string): {
  status: 'SUPPORTED' | 'UNSUPPORTED'; rows: Array<Record<string, unknown>>; fields: BlogWritingPackV2FieldObservation[];
  limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'>;
  sitemap_issues?: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED'; requirement_id: string; actual: string }>;
  product_issues?: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }>;
} => {
  let rows: Array<Record<string, unknown>>;
  let presence: Array<Record<string, boolean>>;
  let fields: string[];
  let unresolved_fields: string[] = [];
  let unsupported_fields: string[] = [];
  const sitemap_issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED'; requirement_id: string; actual: string }> = [];
  const product_issues: Array<{ code: 'DECISION_REQUIRED' | 'SOURCE_CHANGE_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED'; requirement_id: string; actual: string }> = [];
  let limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'> = [];
  if (source_id === 'google-ads-search-terms') {
    const inspected = inspectSearchTermsFields(body);
    rows = inspected.rows.map((row) => ({ ...row }));
    presence = inspected.presence;
    fields = ['search_term', 'campaign', 'ad_group', 'impressions', 'clicks', 'ctr', 'cost', 'conversions', 'conversion_value'];
  } else if (source_id === 'google-search-console-query-page') {
    const inspected = inspectGscQueryPageFields(body);
    rows = inspected.rows.map(({ query, page, clicks, impressions, ctr, position }) => (
      { query, page_url: page, clicks, impressions, ctr, average_position: position }
    ));
    presence = inspected.presence.map(({ query, page, clicks, impressions, ctr, position }) => (
      { query, page_url: page, clicks, impressions, ctr, average_position: position }
    ));
    fields = ['query', 'page_url', 'clicks', 'impressions', 'ctr', 'average_position'];
  } else if (source_id === 'google-keyword-planner' || source_id === 'google-keyword-planner-csv') {
    if (!(body instanceof Uint8Array)) throw new Error('Keyword Planner inspection requires accepted bytes.');
    const inspected = inspectKeywordPlannerFields(source_id, body, requested_context);
    rows = inspected.rows.map((row) => ({ ...row, keyword: row.returned_keyword, average_monthly_searches: row.avg_monthly_searches }));
    presence = inspected.presence.map((row) => ({ ...row, keyword: row.returned_keyword, average_monthly_searches: row.avg_monthly_searches }));
    fields = ['keyword', 'average_monthly_searches', 'competition', 'top_of_page_bid_low', 'top_of_page_bid_high'];
    limitations = inspected.limitations;
  } else if (source_id === 'ikas-products') {
    if (!(body instanceof Uint8Array)) throw new Error('İkas inspection requires accepted workbook bytes.');
    const inspected = inspectIkasProductsFields(body, requested_context);
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
  } else {
    return { status: 'UNSUPPORTED', rows: [], fields: [], limitations: [] };
  }
  return { status: 'SUPPORTED', rows, limitations, ...(source_id === 'ikas-products' ? { product_issues } : {}),
    ...(source_id === 'bitkimark-sitemap' ? { sitemap_issues } : {}), fields: fields.map((field) => {
    let observed_count = 0; let null_count = 0; let absent_count = 0;
    rows.forEach((row, index) => {
      if (!presence[index][field]) absent_count += 1;
      else if (unresolved_fields.includes(field) && !Object.hasOwn(row, field)) return;
      else if (row[field] === null) null_count += 1;
      else observed_count += 1;
    });
    return { field, status: unsupported_fields.includes(field) ? 'UNSUPPORTED' : rows.length === 0 ? 'UNRESOLVED' : absent_count > 0 ? 'ABSENT'
      : unresolved_fields.includes(field) ? 'UNRESOLVED' : observed_count > 0 ? 'OBSERVED' : 'NULL', observed_count, null_count, absent_count };
  }) };
};
