const { parseGenericCsv, parseGenericXls } = require('./generic');

function detectAxis(textOrBuffer) {
  const text = Buffer.isBuffer(textOrBuffer)
    ? textOrBuffer.toString('utf8', 0, Math.min(textOrBuffer.length, 12000))
    : String(textOrBuffer || '');
  return /Axis Bank|AXIS\b|Tran Date|Transaction Particulars/i.test(text);
}

function parseAxisStatement(buffer, accountId, ext = '.csv') {
  const result =
    ext === '.csv' || ext === '.txt'
      ? parseGenericCsv(buffer, accountId)
      : parseGenericXls(buffer, accountId);
  return {
    ...result,
    bank: 'AXIS',
    transactions: result.transactions.map((t) => ({ ...t, raw_bank: 'AXIS' })),
    meta: { ...(result.meta || {}), bank: 'AXIS' }
  };
}

module.exports = { detectAxis, parseAxisStatement };
