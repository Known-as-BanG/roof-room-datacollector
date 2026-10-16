const { zipSync, strToU8 } = require('fflate');
const context = () => ({ source_id: 'ikas-products', task_id: 'ikas-products-import', source_mode: 'FILE_IMPORT' });
const headers = ['Product ID', 'Variant ID', 'Product title', 'Product URL', 'Categories', 'Product type', 'Price', 'Sale price', 'Stock', 'Deleted', 'Variant active', 'Continue selling', 'Slug'];
const product = (changes = {}) => ({ 'Product ID': 'synthetic-product', 'Variant ID': 'synthetic-variant', 'Product title': 'Synthetic product', 'Product URL': 'https://example.test/product', Categories: 'Category A;Category B', 'Product type': 'Synthetic type', Price: '12.5', 'Sale price': '', Stock: '0', Deleted: 'false', 'Variant active': 'true', 'Continue selling': 'false', Slug: 'synthetic-slug', ...changes });
const column = (index) => { let n = index + 1; let out = ''; while (n > 0) { out = String.fromCharCode(65 + (n - 1) % 26) + out; n = Math.floor((n - 1) / 26); } return out; };
const escapeXml = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const workbook = (records = [product()], columns = headers) => {
  const rows = [columns, ...records.map((row) => columns.map((key) => row[key] ?? ''))];
  const sheet = `<worksheet><sheetData>${rows.map((row, r) => `<row r="${r+1}">${row.map((value, c) => `<c r="${column(c)}${r+1}" t="str"><v>${escapeXml(value)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return Buffer.from(zipSync({ 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Synthetic"/></sheets></workbook>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) }));
};
module.exports = { context, headers, product, workbook };
