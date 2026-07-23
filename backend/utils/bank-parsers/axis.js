const XLSX = require('xlsx');
const {
  normalizeWhitespace,
  parseIndianAmount,
  parseBankDate,
  finalizeParsedTxn
} = require('./common');
const { parseGenericCsv, parseGenericXls } = require('./generic');

function sheetToRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return {
    sheetName,
    rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  };
}

function rowJoined(row) {
  return (row || []).map((c) => normalizeWhitespace(c).toLowerCase()).join('|');
}

function rowText(row) {
  return (row || []).map((c) => normalizeWhitespace(c)).filter(Boolean).join(' ');
}

function isAxisHeader(row) {
  const joined = rowJoined(row);
  return (
    (joined.includes('tran date') || joined.includes('transaction date') || /(^|\|)date(\||$)/.test(joined)) &&
    (joined.includes('particular') || joined.includes('narration') || joined.includes('description')) &&
    (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('credit') || joined.includes('deposit')) &&
    joined.includes('balance')
  );
}

function mapHeaderIndexes(headerRow) {
  const idx = {
    txnDate: -1,
    cheque: -1,
    particulars: -1,
    debit: -1,
    credit: -1,
    balance: -1
  };

  (headerRow || []).forEach((cell, i) => {
    const c = normalizeWhitespace(cell).toLowerCase();
    if (!c) return;
    if (c.includes('tran date') || c.includes('transaction date') || c === 'date') idx.txnDate = i;
    else if (c.includes('chq') || c.includes('cheque') || c.includes('ref')) idx.cheque = i;
    else if (c.includes('particular') || c.includes('narration') || c.includes('description')) {
      idx.particulars = i;
    } else if (c.includes('debit') || c.includes('withdrawal')) idx.debit = i;
    else if (c.includes('credit') || c.includes('deposit')) idx.credit = i;
    else if (c.includes('balance')) idx.balance = i;
  });
  return idx;
}

function extractAxisMeta(rows) {
  const meta = {
    accountNumber: null,
    customerName: null,
    statementFrom: null,
    statementTo: null,
    bank: 'AXIS'
  };

  for (const row of (rows || []).slice(0, 40)) {
    const cells = (row || []).map((c) => normalizeWhitespace(c));
    const joined = cells.filter(Boolean).join(' ');

    if (/Account Holder/i.test(joined) && !meta.customerName) {
      const m = joined.match(/Account Holder\(s\)\s*:?\s*(.+)$/i);
      if (m) meta.customerName = m[1].trim();
    }

    const acct =
      joined.match(/Account Number\s*:?\s*(\d{9,18})/i) ||
      joined.match(/Axis Account No\s*:?\s*(\d{9,18})/i);
    if (acct) meta.accountNumber = acct[1];

    const period = joined.match(
      /period\s*(?:of\s*)?\(?\s*From\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*To\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*\)?/i
    );
    if (period) {
      meta.statementFrom = parseBankDate(period[1]);
      meta.statementTo = parseBankDate(period[2]);
    }
  }

  return meta;
}

function isNoiseRow(text) {
  const t = normalizeWhitespace(text);
  if (!t) return true;
  if (/^OPENING BALANCE$/i.test(t)) return true;
  if (/^CLOSING BALANCE$/i.test(t)) return true;
  if (/End of Statement/i.test(t)) return true;
  if (/Unless the constituent notifies/i.test(t)) return true;
  if (/REGISTERED OFFICE/i.test(t)) return true;
  if (/^Legends/i.test(t)) return true;
  return false;
}

function sampleTextFromBuffer(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
    const { sheetName, rows } = sheetToRows(workbook);
    const sample = rows
      .slice(0, 50)
      .map((r) => rowText(r))
      .join(' ')
      .toLowerCase();
    return { sheetName: (sheetName || '').toLowerCase(), sample, rows };
  } catch {
    const text = Buffer.isBuffer(buffer)
      ? buffer.toString('utf8', 0, Math.min(buffer.length, 12000))
      : String(buffer || '');
    return { sheetName: '', sample: text.toLowerCase(), rows: null };
  }
}

function detectAxis(textOrBuffer) {
  if (Buffer.isBuffer(textOrBuffer) || typeof textOrBuffer === 'object') {
    const { sheetName, sample } = sampleTextFromBuffer(textOrBuffer);
    if (sample.includes('axis bank') || sample.includes('statement of axis account')) return true;
    if (sample.includes('tran date') && sample.includes('particulars') && sample.includes('init. br')) {
      return true;
    }
    // Axis netbanking export uses same sheet name as ICICI; distinguish by Debit/Credit + Tran Date
    if (
      sheetName.includes('optransactionhistory') &&
      sample.includes('tran date') &&
      sample.includes('particulars') &&
      (sample.includes('debit') || sample.includes('credit')) &&
      !sample.includes('icici')
    ) {
      return true;
    }
    return false;
  }

  const text = String(textOrBuffer || '');
  return /Axis Bank|AXIS\b|Statement of Axis Account|Tran Date.*Particulars/i.test(text);
}

function parseAxisXls(buffer, accountId) {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
  const { rows } = sheetToRows(workbook);
  const meta = extractAxisMeta(rows);

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    if (isAxisHeader(rows[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('Could not find Axis transaction header row');
  }

  const idx = mapHeaderIndexes(rows[headerIdx]);
  if (idx.txnDate < 0) {
    throw new Error('Axis header found but Tran Date column missing');
  }

  const transactions = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const joined = rowText(row);
    if (!joined) continue;
    if (/End of Statement/i.test(joined)) break;
    if (/Unless the constituent notifies/i.test(joined)) break;
    if (/REGISTERED OFFICE/i.test(joined)) break;
    if (/^Legends/i.test(joined)) break;

    const particulars = normalizeWhitespace(idx.particulars >= 0 ? row[idx.particulars] : '');
    if (isNoiseRow(particulars) || isNoiseRow(joined)) continue;

    const txnDate = parseBankDate(idx.txnDate >= 0 ? row[idx.txnDate] : '');
    if (!txnDate) continue;

    const refNo = normalizeWhitespace(idx.cheque >= 0 ? row[idx.cheque] : '');
    const withdrawal = parseIndianAmount(idx.debit >= 0 ? row[idx.debit] : 0);
    const deposit = parseIndianAmount(idx.credit >= 0 ? row[idx.credit] : 0);
    const balance = idx.balance >= 0 ? parseIndianAmount(row[idx.balance]) : null;

    if (!particulars && withdrawal === 0 && deposit === 0) continue;

    transactions.push(
      finalizeParsedTxn(
        {
          txnDate,
          valueDate: txnDate,
          narration: particulars,
          refNo: refNo && refNo !== '-' ? refNo : '',
          withdrawal,
          deposit,
          balance,
          rawBank: 'AXIS'
        },
        accountId
      )
    );
  }

  if (!transactions.length) {
    throw new Error('No Axis transactions found in statement');
  }

  return { bank: 'AXIS', meta, transactions };
}

function parseAxisStatement(buffer, accountId, ext = '.csv') {
  if (ext === '.csv' || ext === '.txt') {
    const result = parseGenericCsv(buffer, accountId);
    return {
      ...result,
      bank: 'AXIS',
      transactions: result.transactions.map((t) => ({ ...t, raw_bank: 'AXIS' })),
      meta: { ...(result.meta || {}), bank: 'AXIS' }
    };
  }

  try {
    return parseAxisXls(buffer, accountId);
  } catch (axisErr) {
    // Fallback for atypical Axis Excel layouts
    const result = parseGenericXls(buffer, accountId);
    return {
      ...result,
      bank: 'AXIS',
      transactions: result.transactions.map((t) => ({ ...t, raw_bank: 'AXIS' })),
      meta: { ...(result.meta || {}), bank: 'AXIS' },
      parseNote: axisErr.message
    };
  }
}

module.exports = { detectAxis, parseAxisStatement, parseAxisXls };
