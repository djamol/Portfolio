const { parse } = require('csv-parse/sync');
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
  if (/^page\s+\d+\s+of\s+\d+$/i.test(joined)) return true;
  if (joined.includes('generation date')) return true;
  if (joined.includes('closing balance includes funds')) return true;
  if (joined.includes('contents of this statement')) return true;
  if (joined.includes('registered office address')) return true;
  if (joined.includes('hdfc bank gstin')) return true;
  if (joined.includes('state account branch gstin')) return true;
  if (joined.includes('hdfc bank limited') && cells.filter(Boolean).length <= 3) return true;
  if (joined.includes('account branch')) return true;
  if (joined.startsWith('joint holders')) return true;
  if (joined.includes('statement from')) return true;
  if (joined.startsWith('nomination')) return true;
  if (/^address$/i.test(cells[2] || '') || /^city$/i.test(cells[2] || '')) return true;
  if (/^mr\.?$|^mrs\.?$|^ms\.?$/i.test(cells[0] || '') && cells[1]) return true;
  // Account meta rows scattered through pages
  if (cells.includes('Account number') || cells.includes('A/C Open Date') || cells.includes('Account Status')) return true;
  if (cells.includes('Cust ID') || cells.includes('RTGS/NEFT IFSC') || cells.includes('Phone No.')) return true;
  if (cells.includes('Email') && cells.includes('Limit')) return true;
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
    for (let i = 0; i < row.length; i++) {
      const cell = normalizeWhitespace(row[i]);
      const next = normalizeWhitespace(row[i + 1]);
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
        const m = `${cell} ${next} ${normalizeWhitespace(row[i + 2])} ${normalizeWhitespace(row[i + 3])}`.match(
          /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).{0,20}?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
        );
        if (m) {
          meta.statementFrom = parseBankDate(m[1]);
          meta.statementTo = parseBankDate(m[2]);
        }
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

function parseHdfcCsv(bufferOrString, accountId) {
  const text = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('utf8')
    : String(bufferOrString);

  const rows = parse(text, {
    relax_column_count: true,
    skip_empty_lines: false,
    trim: true
  });

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
        // Prefer row narration; keep pending only if it clearly belongs ahead — usually consume into row
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

function detectHdfc(text) {
  const sample = String(text || '').slice(0, 8000).toLowerCase();
  return (
    sample.includes('withdrawal amount') &&
    sample.includes('deposit amount') &&
    (sample.includes('closing balance') || sample.includes('hdfc') || sample.includes('narration'))
  );
}

module.exports = {
  parseHdfcCsv,
  detectHdfc,
  extractAccountMeta
};
