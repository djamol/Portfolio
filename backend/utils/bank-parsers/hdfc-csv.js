const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const {
  normalizeWhitespace,
  parseIndianAmount,
  parseBankDate,
  finalizeParsedTxn
} = require('./common');

function looksLikeHdfcHeader(row) {
  const cells = row.map((c) => normalizeWhitespace(c).toLowerCase());
  const joined = cells.join('|');
  return (
    cells[0] === 'date' &&
    joined.includes('narration') &&
    joined.includes('withdrawal') &&
    joined.includes('deposit')
  );
}

function isPageNoise(row) {
  const cells = row.map((c) => normalizeWhitespace(c));
  const joined = cells.join(' ').toLowerCase();
  if (!joined) return true;
  if (/^\*+$/.test(cells[0] || '') || /^\*{5,}/.test(joined.replace(/\s+/g, ''))) return true;
  if (/^page\s+\d+\s+of\s+\d+$/i.test(joined)) return true;
  if (joined.includes('generation date')) return true;
  if (joined.includes('closing balance includes funds')) return true;
  if (joined.includes('contents of this statement')) return true;
  if (joined.includes('registered office address')) return true;
  if (joined.includes('hdfc bank gstin')) return true;
  if (joined.includes('state account branch gstin')) return true;
  if (joined.includes('hdfc bank limited') && cells.filter(Boolean).length <= 3) return true;
  if (joined.includes('statement of accounts') && joined.includes('page no')) return true;
  if (joined.includes('account branch')) return true;
  if (joined.startsWith('joint holders')) return true;
  if (joined.includes('statement from')) return true;
  if (joined.startsWith('nomination')) return true;
  if (/^address$/i.test(cells[2] || '') || /^city$/i.test(cells[2] || '')) return true;
  if (/^mr\.?$|^mrs\.?$|^ms\.?$/i.test(cells[0] || '') && cells[1]) return true;
  // Account meta rows scattered through pages
  if (cells.includes('Account number') || cells.includes('A/C Open Date') || cells.includes('Account Status')) {
    return true;
  }
  if (cells.includes('Cust ID') || cells.includes('RTGS/NEFT IFSC') || cells.includes('Phone No.')) return true;
  if (cells.includes('Email') && cells.includes('Limit')) return true;
  if (/account no\s*:/i.test(joined) && /virtual|preferred|savings|current/i.test(joined)) return true;
  if (/a\/c open date/i.test(joined) || /account status\s*:/i.test(joined)) return true;
  if (/rtgs\/neft ifsc/i.test(joined)) return true;
  return false;
}

function extractAccountMeta(rows) {
  const meta = {
    accountNumber: null,
    ifsc: null,
    customerName: null,
    statementFrom: null,
    statementTo: null
  };

  for (const row of rows.slice(0, 100)) {
    const cells = row.map((c) => normalizeWhitespace(c));
    const joined = cells.filter(Boolean).join(' ');

    for (let i = 0; i < row.length; i++) {
      const cell = cells[i];
      const next = cells[i + 1];
      if (/^account number$/i.test(cell) && next) {
        meta.accountNumber = next.replace(/^:\s*/, '');
      }
      if (/RTGS\/NEFT IFSC/i.test(cell) && next) {
        meta.ifsc = next.replace(/^:\s*/, '');
      }
      if (/^Mr\.?$|^Mrs\.?$|^Ms\.?$/i.test(cell) && next) {
        meta.customerName = next;
      }
      if (/Statement From/i.test(cell)) {
        const m = `${cell} ${next} ${cells[i + 2] || ''} ${cells[i + 3] || ''}`.match(
          /(\d{1,2}[\/\-,\.]\d{1,2}[\/\-,\.]\d{2,4}).{0,40}?(\d{1,2}[\/\-,\.]\d{1,2}[\/\-,\.]\d{2,4})/i
        );
        if (m) {
          meta.statementFrom = parseBankDate(m[1]);
          meta.statementTo = parseBankDate(m[2]);
        }
      }
    }

    // Excel often packs labels into one cell: "Account No :5010… VIRTUAL PREFERRED"
    if (!meta.accountNumber) {
      const acct = joined.match(/Account\s*(?:No|Number)\s*:?\s*(\d{9,18})/i);
      if (acct) meta.accountNumber = acct[1];
    }
    if (!meta.ifsc) {
      const ifsc = joined.match(/RTGS\/NEFT\s*IFSC\s*:?\s*([A-Z]{4}0[A-Z0-9]{6})/i);
      if (ifsc) meta.ifsc = ifsc[1].toUpperCase();
    }
    if (!meta.customerName) {
      const first = cells[0] || '';
      const name = first.match(/^(?:MR\.?|MRS\.?|MS\.?)\s+(.+)$/i);
      if (name && name[1].trim().length > 2 && !/address|nomination|joint/i.test(name[1])) {
        meta.customerName = name[1].trim();
      }
    }
    if (!meta.statementFrom) {
      const period = joined.match(
        /Statement\s+From\s*:?\s*(\d{1,2}[\/\-,\.]\d{1,2}[\/\-,\.]\d{2,4}).{0,40}?To\s*:?\s*(\d{1,2}[\/\-,\.]\d{1,2}[\/\-,\.]\d{2,4})/i
      );
      if (period) {
        meta.statementFrom = parseBankDate(period[1]);
        meta.statementTo = parseBankDate(period[2]);
      }
    }
  }
  return meta;
}

function hasAmountColumns(row) {
  const w = normalizeWhitespace(row[4]);
  const d = normalizeWhitespace(row[5]);
  const b = normalizeWhitespace(row[6]);
  return w !== '' || d !== '' || b !== '';
}

function looksLikeNewNarration(text) {
  return /^(NEFT|IMPS|UPI|POS |ATW-|EAW-|NWD-|ATM|FD |CHQ |INF\/|IIN\/|VIN\/|BIL\/|IB FUNDS|CASH |CREDIT INTEREST|INTEREST CREDIT|TAX RECOVERED|MONTHLY |SRS\/|UNINOR|PAYPAL)/i.test(
    normalizeWhitespace(text)
  );
}

function parseHdfcRows(rows, accountId) {
  const meta = extractAccountMeta(rows);
  const transactions = [];
  let started = false;
  let current = null;
  let pendingNarration = '';

  const flushCurrent = () => {
    if (!current) return;
    if (current.narration || current.withdrawal > 0 || current.deposit > 0) {
      transactions.push(current);
    }
    current = null;
  };

  for (const row of rows) {
    if (!row || !row.length) continue;

    if (looksLikeHdfcHeader(row)) {
      started = true;
      continue;
    }

    if (!started) continue;
    if (isPageNoise(row)) continue;

    const dateRaw = normalizeWhitespace(row[0]);
    const narrationPart = normalizeWhitespace(row[1]);
    const refNo = normalizeWhitespace(row[2]);
    const valueDateRaw = normalizeWhitespace(row[3]);
    const txnDate = parseBankDate(dateRaw);
    const amountsPresent = hasAmountColumns(row);

    if (!txnDate) {
      if (!narrationPart) continue;

      if (current && current._needsContinuation && !looksLikeNewNarration(narrationPart)) {
        current.narration = normalizeWhitespace(`${current.narration} ${narrationPart}`);
        continue;
      }

      if (current && current._narrationFromRow) {
        pendingNarration = normalizeWhitespace(`${pendingNarration} ${narrationPart}`);
        continue;
      }

      if (current && current._needsContinuation && looksLikeNewNarration(narrationPart)) {
        current._needsContinuation = false;
        pendingNarration = normalizeWhitespace(`${pendingNarration} ${narrationPart}`);
        continue;
      }

      pendingNarration = normalizeWhitespace(`${pendingNarration} ${narrationPart}`);
      continue;
    }

    if (amountsPresent) {
      flushCurrent();
      const withdrawal = parseIndianAmount(row[4]);
      const deposit = parseIndianAmount(row[5]);
      const balanceRaw = normalizeWhitespace(row[6]);
      const balance = balanceRaw === '' ? null : parseIndianAmount(row[6]);
      const narrationFromRow = Boolean(narrationPart);
      let narration = narrationPart;
      if (!narration && pendingNarration) {
        narration = pendingNarration;
        pendingNarration = '';
      } else if (pendingNarration && !narrationFromRow) {
        narration = pendingNarration;
        pendingNarration = '';
      } else if (pendingNarration && narrationFromRow) {
        narration = normalizeWhitespace(`${pendingNarration} ${narration}`);
        pendingNarration = '';
      }

      current = {
        txnDate,
        valueDate: parseBankDate(valueDateRaw) || txnDate,
        narration,
        refNo,
        withdrawal,
        deposit,
        balance,
        rawBank: 'HDFC',
        _narrationFromRow: narrationFromRow,
        _needsContinuation: !narrationFromRow
      };
      continue;
    }

    if (narrationPart) {
      pendingNarration = normalizeWhitespace(`${pendingNarration} ${narrationPart}`);
    }
  }

  flushCurrent();

  return {
    bank: 'HDFC',
    meta,
    transactions: transactions.map((t) => {
      const { _narrationFromRow, _needsContinuation, ...rest } = t;
      return finalizeParsedTxn(rest, accountId);
    })
  };
}

function parseHdfcCsv(bufferOrString, accountId) {
  const text = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('utf8')
    : String(bufferOrString);

  const rows = parse(text, {
    relax_column_count: true,
    skip_empty_lines: false,
    trim: true
  });
  return parseHdfcRows(rows, accountId);
}

function sheetToRows(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function parseHdfcXls(buffer, accountId) {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'binary' });
  const rows = sheetToRows(workbook);
  return parseHdfcRows(rows, accountId);
}

function parseHdfcStatement(buffer, accountId, ext = '.csv') {
  const e = String(ext || '').toLowerCase();
  if (e === '.xls' || e === '.xlsx') return parseHdfcXls(buffer, accountId);
  return parseHdfcCsv(buffer, accountId);
}

function detectHdfc(textOrBuffer) {
  let sample = '';
  if (Buffer.isBuffer(textOrBuffer)) {
    try {
      const workbook = XLSX.read(textOrBuffer, { type: 'buffer' });
      const rows = sheetToRows(workbook).slice(0, 40);
      sample = rows
        .map((r) => r.join('|'))
        .join('\n')
        .toLowerCase();
    } catch {
      sample = textOrBuffer.toString('utf8', 0, Math.min(textOrBuffer.length, 8000)).toLowerCase();
    }
  } else {
    sample = String(textOrBuffer || '')
      .slice(0, 8000)
      .toLowerCase();
  }

  const hasCols =
    sample.includes('withdrawal') &&
    sample.includes('deposit') &&
    (sample.includes('closing balance') || sample.includes('narration'));
  const hasHdfc =
    sample.includes('hdfc') ||
    sample.includes('acct_statement') ||
    /account\s*(?:no|number)\s*:?\s*\d{9,}/i.test(sample);
  return hasCols && (hasHdfc || (sample.includes('date') && sample.includes('narration')));
}

module.exports = {
  parseHdfcCsv,
  parseHdfcXls,
  parseHdfcStatement,
  detectHdfc,
  extractAccountMeta,
  parseHdfcRows
};
