const path = require('path');
const { parseHdfcCsv, detectHdfc } = require('./hdfc-csv');
const { parseIciciXls, detectIcici } = require('./icici-xls');
const { parseDcbXls, detectDcb } = require('./dcb-xls');
const { detectSbi, parseSbiStatement } = require('./sbi');
const { detectAxis, parseAxisStatement } = require('./axis');
const { detectKotak, parseKotakStatement } = require('./kotak');
const { parseGenericCsv, parseGenericXls } = require('./generic');

function extensionOf(filename = '') {
  return path.extname(filename).toLowerCase();
}

function parseBankStatement({ buffer, filename, accountId, bankHint, accountNumber, customRules }) {
  if (!buffer || !buffer.length) {
    throw new Error('Empty file uploaded');
  }
  if (!accountId) {
    throw new Error('accountId is required for import');
  }

  const ext = extensionOf(filename);
  const hint = String(bankHint || '').toUpperCase();
  const textPreview = buffer.toString('utf8', 0, Math.min(buffer.length, 8000));
  const options = { accountNumber };

  if (ext === '.pdf') {
    throw new Error(
      'PDF import is not supported. Export the statement as CSV or Excel (HDFC, ICICI, DCB, SBI, Axis, Kotak) and upload that.'
    );
  }

  let result;
  if (hint === 'HDFC' || (ext === '.csv' && detectHdfc(textPreview))) {
    result = parseHdfcCsv(buffer, accountId);
  } else if (hint === 'DCB' || ((ext === '.xls' || ext === '.xlsx') && detectDcb(buffer))) {
    result = parseDcbXls(buffer, accountId, options);
  } else if (hint === 'ICICI' || ((ext === '.xls' || ext === '.xlsx') && detectIcici(buffer))) {
    result = parseIciciXls(buffer, accountId);
  } else if (hint === 'SBI' || detectSbi(ext === '.csv' ? textPreview : buffer)) {
    result = parseSbiStatement(buffer, accountId, ext);
  } else if (hint === 'AXIS' || detectAxis(ext === '.csv' ? textPreview : buffer)) {
    result = parseAxisStatement(buffer, accountId, ext);
  } else if (hint === 'KOTAK' || detectKotak(ext === '.csv' ? textPreview : buffer)) {
    result = parseKotakStatement(buffer, accountId, ext);
  } else if (ext === '.csv') {
    if (detectHdfc(textPreview)) result = parseHdfcCsv(buffer, accountId);
    else result = parseGenericCsv(buffer, accountId);
  } else if (ext === '.xls' || ext === '.xlsx') {
    if (detectDcb(buffer)) result = parseDcbXls(buffer, accountId, options);
    else if (detectIcici(buffer)) result = parseIciciXls(buffer, accountId);
    else result = parseGenericXls(buffer, accountId);
  } else {
    try {
      if (detectHdfc(textPreview)) result = parseHdfcCsv(buffer, accountId);
      else result = parseGenericCsv(buffer, accountId);
    } catch (csvErr) {
      try {
        if (detectDcb(buffer)) result = parseDcbXls(buffer, accountId, options);
        else result = parseIciciXls(buffer, accountId);
      } catch {
        throw new Error(`Unsupported bank statement format: ${csvErr.message}`);
      }
    }
  }

  // Re-apply categorization with user rules if provided (parsers call finalize without rules)
  if (customRules?.length && result?.transactions?.length) {
    const { finalizeParsedTxn } = require('./common');
    result.transactions = result.transactions.map((t) =>
      finalizeParsedTxn(
        {
          txnDate: t.txn_date,
          valueDate: t.value_date,
          narration: t.narration,
          refNo: t.ref_no,
          withdrawal: t.withdrawal,
          deposit: t.deposit,
          balance: t.balance,
          rawBank: t.raw_bank,
          tags: t.tags,
          notes: t.notes,
          payee: t.payee
        },
        accountId,
        customRules
      )
    );
  }

  return result;
}

module.exports = {
  parseBankStatement,
  parseHdfcCsv,
  parseIciciXls,
  parseDcbXls,
  parseGenericCsv,
  parseGenericXls
};
