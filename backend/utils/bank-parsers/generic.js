const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const {
  normalizeWhitespace,
  parseIndianAmount,
  parseBankDate,
  finalizeParsedTxn
} = require('./common');

const DATE_KEYS = ['date', 'txn date', 'transaction date', 'value date', 'tran date'];
const NARRATION_KEYS = ['narration', 'description', 'remarks', 'particulars', 'transaction remarks', 'details'];
const REF_KEYS = ['ref', 'chq', 'cheque', 'reference', 'chq. / ref no.', 'cheque number'];
const WITHDRAWAL_KEYS = ['withdrawal', 'debit', 'dr amount', 'withdrawal amt', 'withdrawal amount'];
const DEPOSIT_KEYS = ['deposit', 'credit', 'cr amount', 'deposit amt', 'deposit amount'];
const BALANCE_KEYS = ['balance', 'closing balance'];
const AMOUNT_KEYS = ['amount'];

function normalizeKey(key) {
  return normalizeWhitespace(key).toLowerCase();
}

function findKey(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeKey(headers[i]);
    if (candidates.some((c) => h === c || h.includes(c))) return i;
  }
  return -1;
}

function rowsFromCsv(text) {
  return parse(text, { relax_column_count: true, skip_empty_lines: true, trim: true });
}

function rowsFromXls(buffer) {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const headers = rows[i].map((c) => normalizeKey(c));
    const hasDate = headers.some((h) => DATE_KEYS.some((k) => h.includes(k)));
    const hasNarration = headers.some((h) => NARRATION_KEYS.some((k) => h.includes(k)));
    const hasMoney =
      headers.some((h) => WITHDRAWAL_KEYS.some((k) => h.includes(k))) ||
      headers.some((h) => DEPOSIT_KEYS.some((k) => h.includes(k))) ||
      headers.some((h) => AMOUNT_KEYS.some((k) => h === k || h.includes('amount')));
    if (hasDate && (hasNarration || hasMoney)) return i;
  }
  return -1;
}

function parseGenericRows(rows, accountId, rawBank = 'GENERIC') {
  const headerIdx = findHeader(rows);
  if (headerIdx < 0) throw new Error('Could not detect transaction header row in file');

  const headers = rows[headerIdx];
  const dateIdx = findKey(headers, DATE_KEYS);
  const valueDateIdx = findKey(headers, ['value date']);
  const narrationIdx = findKey(headers, NARRATION_KEYS);
  const refIdx = findKey(headers, REF_KEYS);
  const withdrawalIdx = findKey(headers, WITHDRAWAL_KEYS);
  const depositIdx = findKey(headers, DEPOSIT_KEYS);
  const balanceIdx = findKey(headers, BALANCE_KEYS);
  const amountIdx = findKey(headers, AMOUNT_KEYS);
  const typeIdx = findKey(headers, ['type', 'dr/cr', 'credit/debit']);

  const transactions = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some((c) => normalizeWhitespace(c))) continue;

    const txnDate = parseBankDate(dateIdx >= 0 ? row[dateIdx] : '');
    if (!txnDate) continue;

    let withdrawal = withdrawalIdx >= 0 ? parseIndianAmount(row[withdrawalIdx]) : 0;
    let deposit = depositIdx >= 0 ? parseIndianAmount(row[depositIdx]) : 0;

    if (withdrawal === 0 && deposit === 0 && amountIdx >= 0) {
      const amount = parseIndianAmount(row[amountIdx]);
      const type = normalizeWhitespace(typeIdx >= 0 ? row[typeIdx] : '').toLowerCase();
      if (type.startsWith('cr') || type.includes('credit')) deposit = Math.abs(amount);
      else if (type.startsWith('dr') || type.includes('debit')) withdrawal = Math.abs(amount);
      else if (amount < 0) withdrawal = Math.abs(amount);
      else deposit = Math.abs(amount);
    }

    const narration = normalizeWhitespace(narrationIdx >= 0 ? row[narrationIdx] : '');
    const refNo = normalizeWhitespace(refIdx >= 0 ? row[refIdx] : '');
    const balance = balanceIdx >= 0 ? parseIndianAmount(row[balanceIdx]) : null;
    const valueDate = parseBankDate(valueDateIdx >= 0 ? row[valueDateIdx] : '') || txnDate;

    if (!narration && withdrawal === 0 && deposit === 0) continue;

    transactions.push(
      finalizeParsedTxn(
        {
          txnDate,
          valueDate,
          narration,
          refNo,
          withdrawal,
          deposit,
          balance,
          rawBank
        },
        accountId
      )
    );
  }

  return { bank: rawBank, meta: {}, transactions };
}

function parseGenericCsv(bufferOrString, accountId) {
  const text = Buffer.isBuffer(bufferOrString) ? bufferOrString.toString('utf8') : String(bufferOrString);
  return parseGenericRows(rowsFromCsv(text), accountId, 'GENERIC');
}

function parseGenericXls(buffer, accountId) {
  return parseGenericRows(rowsFromXls(buffer), accountId, 'GENERIC');
}

module.exports = {
  parseGenericCsv,
  parseGenericXls,
  parseGenericRows
};
