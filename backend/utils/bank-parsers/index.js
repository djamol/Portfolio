const path = require('path');
const { parseHdfcCsv, detectHdfc } = require('./hdfc-csv');
const { parseIciciXls, detectIcici } = require('./icici-xls');
const { parseGenericCsv, parseGenericXls } = require('./generic');

function extensionOf(filename = '') {
  return path.extname(filename).toLowerCase();
}

function parseBankStatement({ buffer, filename, accountId, bankHint }) {
  if (!buffer || !buffer.length) {
    throw new Error('Empty file uploaded');
  }
  if (!accountId) {
    throw new Error('accountId is required for import');
  }

  const ext = extensionOf(filename);
  const hint = String(bankHint || '').toUpperCase();
  const textPreview = buffer.toString('utf8', 0, Math.min(buffer.length, 8000));

  if (hint === 'HDFC' || (ext === '.csv' && detectHdfc(textPreview))) {
    return parseHdfcCsv(buffer, accountId);
  }

  if (hint === 'ICICI' || ((ext === '.xls' || ext === '.xlsx') && detectIcici(buffer))) {
    return parseIciciXls(buffer, accountId);
  }

  if (ext === '.csv') {
    if (detectHdfc(textPreview)) return parseHdfcCsv(buffer, accountId);
    return parseGenericCsv(buffer, accountId);
  }

  if (ext === '.xls' || ext === '.xlsx') {
    if (detectIcici(buffer)) return parseIciciXls(buffer, accountId);
    return parseGenericXls(buffer, accountId);
  }

  if (ext === '.pdf') {
    throw new Error(
      'PDF import is not supported yet. Export/unlock the statement as CSV or Excel (HDFC CSV / ICICI XLS) and upload that.'
    );
  }

  // Fallback: try CSV text then XLS
  try {
    if (detectHdfc(textPreview)) return parseHdfcCsv(buffer, accountId);
    return parseGenericCsv(buffer, accountId);
  } catch (csvErr) {
    try {
      return parseIciciXls(buffer, accountId);
    } catch {
      throw new Error(`Unsupported bank statement format: ${csvErr.message}`);
    }
  }
}

module.exports = {
  parseBankStatement,
  parseHdfcCsv,
  parseIciciXls,
  parseGenericCsv,
  parseGenericXls
};
