import { Decimal } from '@wind-acc/shared';
import { BusinessRuleError } from '../errors';
import type { BankTransactionRaw } from './provider';

type BankFormat = 'KBANK' | 'SCB' | 'BBL' | 'GENERIC';

interface ColumnLayout {
  format: BankFormat;
  date: number;
  time?: number;
  description: number;
  debit: number;
  credit: number;
  balance?: number;
  bankRef?: number;
}

const DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

export function parseBankCSV(csvText: string): BankTransactionRaw[] {
  const rawLines = csvText.split(/\r?\n/);
  const lines: { lineNo: number; text: string }[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t.length > 0) lines.push({ lineNo: i + 1, text: rawLines[i] });
  }
  if (lines.length === 0) {
    throw new BusinessRuleError('INVALID_CSV', { reason: 'empty CSV' });
  }

  const layout = detectLayout(lines);

  const out: BankTransactionRaw[] = [];
  for (const { lineNo, text } of lines) {
    const fields = splitCsvLine(text);
    const dateField = (fields[layout.date] ?? '').trim();
    if (!DATE_RE.test(dateField)) {
      // header / opening row / blank — skip
      continue;
    }
    out.push(parseRow(fields, layout, lineNo));
  }

  return out;
}

function detectLayout(lines: { lineNo: number; text: string }[]): ColumnLayout {
  // Scan for the first non-data row whose fields look like recognizable headers.
  // Anything before that (e.g., bank statement preamble) is ignored.
  for (const { lineNo, text } of lines) {
    const fields = splitCsvLine(text);
    if (DATE_RE.test((fields[0] ?? '').trim())) continue;
    const headers = fields.map((h) => h.trim().toLowerCase());
    const layout = tryLayoutFromHeaders(headers);
    if (layout) return layout;
  }
  throw new BusinessRuleError('INVALID_CSV', {
    line: lines[0]?.lineNo ?? 1,
    reason: 'no recognizable header row (need date/description/debit/credit columns)',
  });
}

function tryLayoutFromHeaders(headers: string[]): ColumnLayout | null {
  try {
    return layoutFromHeaders(headers, 0);
  } catch {
    return null;
  }
}

function layoutFromHeaders(headers: string[], lineNo: number): ColumnLayout {
  const find = (...keywords: string[]): number => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      for (const kw of keywords) {
        if (h.includes(kw)) return i;
      }
    }
    return -1;
  };

  const dateIdx = find('transaction date', 'date', 'วันที่');
  const descIdx = find('description', 'detail', 'remark', 'narration', 'รายการ');
  const debitIdx = find('debit', 'withdrawal', 'withdraw', 'ถอน');
  const creditIdx = find('credit', 'deposit', 'ฝาก');
  const balanceIdx = find('balance', 'ยอดคงเหลือ');
  const timeIdx = find('time', 'เวลา');
  const refIdx = find('ref', 'reference', 'เลขที่อ้างอิง');

  if (dateIdx < 0 || descIdx < 0 || debitIdx < 0 || creditIdx < 0) {
    throw new BusinessRuleError('INVALID_CSV', {
      line: lineNo,
      reason: 'unrecognized header — missing date/description/debit/credit columns',
    });
  }

  let format: BankFormat = 'GENERIC';
  const joined = headers.join(' ');
  if (joined.includes('time') && joined.includes('debit') && joined.includes('credit')) format = 'KBANK';
  else if (joined.includes('transaction date') || (joined.includes('withdrawal') && joined.includes('deposit'))) {
    format = headers[0] === 'date' ? 'BBL' : 'SCB';
  }

  return {
    format,
    date: dateIdx,
    time: timeIdx >= 0 ? timeIdx : undefined,
    description: descIdx,
    debit: debitIdx,
    credit: creditIdx,
    balance: balanceIdx >= 0 ? balanceIdx : undefined,
    bankRef: refIdx >= 0 ? refIdx : undefined,
  };
}

function parseRow(fields: string[], layout: ColumnLayout, lineNo: number): BankTransactionRaw {
  const dateField = (fields[layout.date] ?? '').trim();
  const m = dateField.match(DATE_RE);
  if (!m) {
    throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid date "${dateField}"` });
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid date "${dateField}"` });
  }

  const timeStr = layout.time !== undefined ? (fields[layout.time] ?? '').trim() : '';
  const txnDate = buildDate(year, month, day, timeStr, lineNo);

  const description = (fields[layout.description] ?? '').trim();
  const debit = parseAmount(fields[layout.debit], lineNo, 'debit');
  const credit = parseAmount(fields[layout.credit], lineNo, 'credit');
  const balance =
    layout.balance !== undefined ? parseAmountOrUndefined(fields[layout.balance], lineNo, 'balance') : undefined;
  const bankRef = layout.bankRef !== undefined ? (fields[layout.bankRef] ?? '').trim() : '';

  return {
    txnDate,
    description,
    debit,
    credit,
    ...(balance !== undefined ? { balance } : {}),
    bankRef,
  };
}

function buildDate(year: number, month: number, day: number, timeStr: string, lineNo: number): Date {
  let hh = 0;
  let mm = 0;
  if (timeStr.length > 0) {
    const tm = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm) {
      throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid time "${timeStr}"` });
    }
    hh = Number(tm[1]);
    mm = Number(tm[2]);
    if (hh > 23 || mm > 59) {
      throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid time "${timeStr}"` });
    }
  }
  // Asia/Bangkok is UTC+7 with no DST → subtract 7h to store UTC.
  return new Date(Date.UTC(year, month - 1, day, hh - 7, mm, 0, 0));
}

function parseAmount(raw: string | undefined, lineNo: number, field: string): Decimal {
  const v = parseAmountOrUndefined(raw, lineNo, field);
  return v ?? new Decimal(0);
}

function parseAmountOrUndefined(raw: string | undefined, lineNo: number, field: string): Decimal | undefined {
  const s = (raw ?? '').trim().replace(/,/g, '').replace(/^"|"$/g, '');
  if (s.length === 0 || s === '-') return undefined;
  const cleaned = s.replace(/[฿\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid ${field} amount "${raw}"` });
  }
  try {
    return new Decimal(cleaned);
  } catch {
    throw new BusinessRuleError('INVALID_CSV', { line: lineNo, reason: `invalid ${field} amount "${raw}"` });
  }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}
