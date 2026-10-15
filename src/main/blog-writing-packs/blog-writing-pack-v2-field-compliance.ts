import type { BlogWritingPackV2FieldObservation } from '../../shared/blog-writing-pack-v2-readiness';
import { inspectSearchTermsFields } from '../sources/google-ads/search-terms-adapter';
import { inspectGscQueryPageFields } from '../sources/google-search-console/query-page-adapter';

// Source adapters own provider shapes; only Blog downstream aliases and requirements live here.
export const inspectBlogWritingPackV2Fields = (source_id: string, body: unknown): {
  status: 'SUPPORTED' | 'UNSUPPORTED'; rows: Array<Record<string, unknown>>; fields: BlogWritingPackV2FieldObservation[];
} => {
  let rows: Array<Record<string, unknown>>;
  let presence: Array<Record<string, boolean>>;
  let fields: string[];
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
  } else {
    return { status: 'UNSUPPORTED', rows: [], fields: [] };
  }
  return { status: 'SUPPORTED', rows, fields: fields.map((field) => {
    let observed_count = 0; let null_count = 0; let absent_count = 0;
    rows.forEach((row, index) => {
      if (!presence[index][field]) absent_count += 1;
      else if (row[field] === null) null_count += 1;
      else observed_count += 1;
    });
    return { field, status: rows.length === 0 ? 'UNRESOLVED' : absent_count > 0 ? 'ABSENT'
      : observed_count > 0 ? 'OBSERVED' : 'NULL', observed_count, null_count, absent_count };
  }) };
};
