import { D } from '@wind-acc/shared';
import { pctChange } from './common';
import type { BSSection, BSRow, BSResult } from './balance-sheet';

/**
 * Merge two BSSection objects so each row carries comparative_amount / pct_change.
 * Rows present in only one period get a zero counterpart in the other.
 */
export function withComparativeBSSection(cur: BSSection, prev: BSSection): BSSection {
  const curMap = new Map(cur.rows.map(r => [r.account_code, r]));
  const prevMap = new Map(prev.rows.map(r => [r.account_code, r]));
  const codes = Array.from(new Set([...curMap.keys(), ...prevMap.keys()])).sort();

  const rows: BSRow[] = codes.map(code => {
    const c = curMap.get(code);
    const p = prevMap.get(code);
    const base = (c ?? p)!;
    const curAmt = D(c?.amount ?? '0');
    const prevAmt = D(p?.amount ?? '0');
    const pc = pctChange(prevAmt, curAmt);
    const row: BSRow = {
      account_code: base.account_code,
      name_th: base.name_th,
      name_en: base.name_en,
      amount: curAmt.toFixed(2),
      comparative_amount: prevAmt.toFixed(2),
    };
    if (pc !== null) row.pct_change = pc.toFixed(2);
    return row;
  });

  const totalPc = pctChange(D(prev.total), D(cur.total));
  const out: BSSection = { rows, total: cur.total, comparative_total: prev.total };
  if (totalPc !== null) out.pct_change = totalPc.toFixed(2);
  return out;
}

/**
 * Overlay prior-period numbers onto all sections of a Balance Sheet result.
 * Returns a new BSResult with comparative_amount / pct_change on every row
 * and comparative_as_of / prior set at the top level.
 */
export function buildComparativeBS(cur: BSResult, prior: BSResult): BSResult {
  return {
    ...cur,
    assets: {
      current: withComparativeBSSection(cur.assets.current, prior.assets.current),
      non_current: withComparativeBSSection(cur.assets.non_current, prior.assets.non_current),
      total: cur.assets.total,
    },
    liabilities: {
      current: withComparativeBSSection(cur.liabilities.current, prior.liabilities.current),
      non_current: withComparativeBSSection(
        cur.liabilities.non_current,
        prior.liabilities.non_current,
      ),
      total: cur.liabilities.total,
    },
    equity: {
      items: withComparativeBSSection(cur.equity.items, prior.equity.items),
      total: cur.equity.total,
    },
    comparative_as_of: prior.as_of,
    prior,
  };
}
