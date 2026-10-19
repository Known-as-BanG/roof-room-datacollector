import { parseIkasProductsXlsx } from './ikas-products-parser';
import { IKAS_PRODUCTS_SOURCE_MODE, IKAS_PRODUCTS_TASK_ID } from './ikas-products-request';

export class IkasProductsContextError extends Error {
  constructor() { super('İkas evidence requires its accepted FILE_IMPORT context.'); }
}

export const inspectIkasProductsFields = (bytes: Uint8Array, requested_context: unknown) => {
  const context = typeof requested_context === 'object' && requested_context !== null
    ? requested_context as Record<string, unknown> : {};
  // file_path is sanitized from accepted provenance; never reopen the original import.
  if (context.source_id !== 'ikas-products' || context.task_id !== IKAS_PRODUCTS_TASK_ID
    || context.source_mode !== IKAS_PRODUCTS_SOURCE_MODE) throw new IkasProductsContextError();
  const parsed = parseIkasProductsXlsx(bytes);
  if (parsed.issues.length > 0 || parsed.rows.some((row) => typeof row.variant_id !== 'string' || row.variant_id.trim().length === 0)) {
    throw new Error('İkas evidence contains invalid source values.');
  }
  for (const row of parsed.rows) {
    if (row.url !== null) {
      const url = new URL(String(row.url));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('İkas product URL is not a storefront URL.');
    }
  }
  const mapped = new Set(parsed.mapped_fields);
  return {
    rows: parsed.rows,
    derivations: { availability: { expression: 'legacy variant availability derivation; no approved Blog availability mapping', approved_for_blog: false } },
    presence: parsed.rows.map(() => ({
      product_id: mapped.has('product_id'), product_title: mapped.has('product_title'), url: mapped.has('url'),
      category: mapped.has('categories') || mapped.has('categories_product_type') || mapped.has('product_type'),
      price: mapped.has('price'),
      availability: (['availability', 'stock', 'deleted', 'variant_active', 'continue_selling'] as const).some((field) => mapped.has(field)),
      stock_status: false, product_status: false,
    })),
    unresolved_fields: ['category', 'price', 'availability'],
    unsupported_fields: ['stock_status', 'product_status', 'currency_context'],
    missing_observations: ['product_id', 'product_title', 'url'].filter((field) => parsed.rows.some((row) => row[field] === null)),
  };
};
