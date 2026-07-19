const { parseGenericCsv, parseGenericXls } = require('./generic');

function detectSbi(textOrBuffer) {
  const text = Buffer.isBuffer(textOrBuffer)
    ? textOrBuffer.toString('utf8', 0, Math.min(textOrBuffer.length, 12000))
    : String(textOrBuffer || '');
  return /State Bank of India|SBI\b|Txn Date|Transaction Date.*Withdrawal Amt/i.test(text);
}

function parseSbiStatement(buffer, accountId, ext = '.csv') {
  const result =
    ext === '.csv' || ext === '.txt'
      ? parseGenericCsv(buffer, accountId)
      : parseGenericXls(buffer, accountId);
  return {
    ...result,
    bank: 'SBI',
    transactions: result.transactions.map((t) => ({ ...t, raw_bank: 'SBI' })),
    meta: { ...(result.meta || {}), bank: 'SBI' }
  };
}

module.exports = { detectSbi, parseSbiStatement };
