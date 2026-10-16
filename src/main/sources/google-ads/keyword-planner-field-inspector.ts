import type { KeywordPlannerRow } from '../../../shared/google-api';
import { requireApiObject, requireArray } from '../google-api/api-helpers';
import { normalizeKeywordPlanner } from './keyword-planner-adapter';
import { createKeywordPlannerJobContext } from './keyword-planner-request';
import { parseKeywordPlannerManualCsv } from './keyword-planner-csv-parser';
import { KEYWORD_PLANNER_CSV_SOURCE_MODE, KEYWORD_PLANNER_CSV_TASK_ID } from './keyword-planner-csv-request';

export class KeywordPlannerEvidenceError extends Error {
  constructor(readonly requirement_id: 'keyword_planner_request_context' | 'observed_keyword') {
    super('Keyword Planner evidence cannot establish the required source meaning.');
  }
}

// Inspect accepted bytes only; acquisition and import normalization remain unchanged.
export const inspectKeywordPlannerFields = (source_id: string, bytes: Uint8Array, requested_context: unknown): {
  rows: KeywordPlannerRow[];
  presence: Array<Record<string, boolean>>;
  limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'>;
} => {
  if (source_id === 'google-keyword-planner-csv') {
    const context = requireApiObject(requested_context, 'Keyword Planner import context');
    // Accepted provenance sanitizes file_path; never reopen the original import path.
    if (context.source_id !== source_id || context.source_mode !== KEYWORD_PLANNER_CSV_SOURCE_MODE
      || context.task_id !== KEYWORD_PLANNER_CSV_TASK_ID) {
      throw new KeywordPlannerEvidenceError('keyword_planner_request_context');
    }
    const parsed = parseKeywordPlannerManualCsv(bytes);
    return { rows: parsed.rows, presence: parsed.rows.map(() => ({
      returned_keyword: true, avg_monthly_searches: true, competition: true,
      top_of_page_bid_low: true, top_of_page_bid_high: true,
    })), limitations: ['manual_csv_scope'] };
  }
  if (source_id !== 'google-keyword-planner') throw new Error('Unsupported Keyword Planner representation.');
  let context;
  try {
    context = createKeywordPlannerJobContext(requested_context);
  } catch {
    throw new KeywordPlannerEvidenceError('keyword_planner_request_context');
  }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const rawRows = requireArray(requireApiObject(body, 'Keyword Planner response').results, 'Keyword Planner results')
    .map((row) => requireApiObject(row, 'Keyword Planner result'));
  if (rawRows.some((row) => typeof row.text !== 'string' || row.text.trim().length === 0)) {
    throw new KeywordPlannerEvidenceError('observed_keyword');
  }
  const rows = normalizeKeywordPlanner(body, context.group_id, context.keywords);
  const presence = rawRows.map((row) => {
    const metrics = row.keywordMetrics == null ? {} : requireApiObject(row.keywordMetrics, 'Keyword Planner metrics');
    return Object.fromEntries(Object.entries({ returned_keyword: 'text', avg_monthly_searches: 'avgMonthlySearches',
      competition: 'competition', top_of_page_bid_low: 'lowTopOfPageBidMicros', top_of_page_bid_high: 'highTopOfPageBidMicros',
    }).map(([field, provider]) => [field, Object.hasOwn(field === 'returned_keyword' ? row : metrics, provider)]));
  });
  return { rows, presence, limitations: ['currency_context',
    ...(rows.some((row) => row.competition !== null && !['LOW', 'MEDIUM', 'HIGH'].includes(row.competition))
      ? ['competition_semantics' as const] : []),
  ] };
};
