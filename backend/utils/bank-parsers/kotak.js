const { parseGenericCsv, parseGenericXls } = require('./generic');

function detectKotak(textOrBuffer) {
  const text = Buffer.isBuffer(textOrBuffer)
    ? textOrBuffer.toString('utf8', 0, Math.min(textOrBuffer.length, 12000))
    : String(textOrBuffer || '');
  return /Kotak Mahindra|KOTAK\b|Transaction Date.*Debit.*Credit/i.test(text);
}

function parseKotakStatement(buffer, accountId, ext = '.csv') {
  const result =
    ext === '.csv' || ext === '.txt'
      ? parseGenericCsv(buffer, accountId)
      : parseGenericXls(buffer, accountId);
  return {
    ...result,
    bank: 'KOTAK',
    transactions: result.transactions.map((t) => ({ ...t, raw_bank: 'KOTAK' })),
    meta: { ...(result.meta || {}), bank: 'KOTAK' }
  };
}

module.exports = { detectKotak, parseKotakStatement };
