const XLSX = require('xlsx');
const {
  normalizeWhitespace,
  parseIndianAmount,
  parseBankDate,
  finalizeParsedTxn
} = require('./common');

function sheetToRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return {
    sheetName,
    rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  };
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map((c) => normalizeWhitespace(c).toLowerCase());
    const joined = cells.join('|');
    if (
      (joined.includes('transaction date') || joined.includes('value date')) &&
      (joined.includes('withdrawal') || joined.includes('deposit')) &&
      (joined.includes('remarks') || joined.includes('narration') || joined.includes('description'))
    ) {
      return i;
    }
  }
  return -1;
}

function mapHeaderIndexes(headerRow) {
  const idx = {
    sNo: -1,
    valueDate: -1,
    txnDate: -1,
    cheque: -1,
    remarks: -1,
    withdrawal: -1,
    deposit: -1,
    balance: -1
  };

  headerRow.forEach((cell, i) => {
    const c = normalizeWhitespace(cell).toLowerCase();
    if (c.includes('s no') || c === 's.no.' || c === 'sno') idx.sNo = i;
    else if (c.includes('value date')) idx.valueDate = i;
    else if (c.includes('transaction date') || c === 'date') idx.txnDate = i;
    else if (c.includes('cheque')) idx.cheque = i;
    else if (c.includes('remark') || c.includes('narration') || c.includes('description')) idx.remarks = i;
    else if (c.includes('withdrawal')) idx.withdrawal = i;
    else if (c.includes('deposit')) idx.deposit = i;
    else if (c.includes('balance')) idx.balance = i;
  });
  return idx;
}

function extractIciciMeta(rows) {
  const meta = { accountNumber: null, customerName: null, statementFrom: null, statementTo: null };
  for (const row of rows.slice(0, 20)) {
    const cells = row.map((c) => normalizeWhitespace(c));
    for (let i = 0; i < cells.length; i++) {
      if (/account number/i.test(cells[i])) {
        const value = cells.slice(i + 1).find((c) => c) || '';
        const m = value.match(/(\d{9,18})/);
        if (m) meta.accountNumber = m[1];
        const nameMatch = value.match(/-\s*(.+)$/);
        if (nameMatch) meta.customerName = nameMatch[1].trim();
      }
      if (/transaction date from/i.test(cells[i])) {
        const dates = cells.slice(i + 1).filter((c) => parseBankDate(c));
        if (dates[0]) meta.statementFrom = parseBankDate(dates[0]);
        if (dates[1]) meta.statementTo = parseBankDate(dates[1]);
      }
    }
  }
  return meta;
}

function parseIciciXls(buffer, accountId) {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
  const { rows } = sheetToRows(workbook);
  const meta = extractIciciMeta(rows);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error('Could not find ICICI transaction header row');
  }

  const idx = mapHeaderIndexes(rows[headerIdx]);
  const transactions = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const firstMeaningful = normalizeWhitespace(row.find((c) => normalizeWhitespace(c)) || '');
    if (!firstMeaningful) continue;
    if (/legends used/i.test(firstMeaningful)) break;
    if (/^\d+\.\s/.test(firstMeaningful) && /inft|bpay|neft|imps/i.test(firstMeaningful)) break;

    const txnDate = parseBankDate(idx.txnDate >= 0 ? row[idx.txnDate] : '');
    const valueDate = parseBankDate(idx.valueDate >= 0 ? row[idx.valueDate] : '') || txnDate;
    if (!txnDate && !valueDate) continue;

    const narration = normalizeWhitespace(idx.remarks >= 0 ? row[idx.remarks] : '');
    const refNo = normalizeWhitespace(idx.cheque >= 0 ? row[idx.cheque] : '');
    const withdrawal = parseIndianAmount(idx.withdrawal >= 0 ? row[idx.withdrawal] : 0);
    const deposit = parseIndianAmount(idx.deposit >= 0 ? row[idx.deposit] : 0);
    const balance = idx.balance >= 0 ? parseIndianAmount(row[idx.balance]) : null;

    if (!narration && withdrawal === 0 && deposit === 0) continue;

    transactions.push(
      finalizeParsedTxn(
        {
          txnDate: txnDate || valueDate,
          valueDate: valueDate || txnDate,
          narration,
          refNo: refNo === '-' ? '' : refNo,
          withdrawal,
          deposit,
          balance,
          rawBank: 'ICICI'
        },
        accountId
      )
    );
  }

  return { bank: 'ICICI', meta, transactions };
}

function detectIcici(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
    const { rows } = sheetToRows(workbook);
    const sample = rows
      .slice(0, 20)
      .map((r) => r.join(' '))
      .join(' ')
      .toLowerCase();
    return (
      sample.includes('icici') ||
      sample.includes('optransactionhistory') ||
      (sample.includes('transaction remarks') && sample.includes('withdrawal amount'))
    );
  } catch {
    return false;
  }
}

module.exports = {
  parseIciciXls,
  detectIcici
};
