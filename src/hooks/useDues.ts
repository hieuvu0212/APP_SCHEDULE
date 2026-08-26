// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useDues.ts — số liệu cho màn hình Thu tiền
//
//  Cửa sổ mở rộng lịch là TRỌN THÁNG, giống usePayroll. Tiền phải thu của
//  tháng 8 không thể tính từ tuần đang xem.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import type { Category, Payment } from '../types';
import type { ClientDues, DuesTotals } from '../core/payment';
import { expandSchedule } from '../core/expand';
import { computeDues, duesTotals } from '../core/payment';
import { monthBounds } from '../core/time';
import { listCategories } from '../db/repo/categories';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listPayments } from '../db/repo/payments';
import { listRules } from '../db/repo/rules';
import { listSalaryRules } from '../db/repo/salary';
import { useSettings } from './useSettings';

export interface DuesData {
  rows: ClientDues[];
  totals: DuesTotals;
  payments: Payment[];
  categories: Category[];
  currency: string;
}

export function useDues(month: string): DuesData | undefined {
  const settings = useSettings();
  const currency = settings.currency;
  const autoComplete = settings.autoCompletePastOccurrences;

  return useLiveQuery(async () => {
    const { start, end } = monthBounds(month);

    const [categories, rules, exceptions, events, salaryRules, payments] =
      await Promise.all([
        listCategories(),
        listRules(),
        getExceptionsInWindow(start, end),
        listEventsInWindow(start, end),
        listSalaryRules(),
        listPayments(month),
      ]);

    const occurrences = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: start,
      windowEnd: end,
      now: new Date(),
      autoCompletePast: autoComplete,
    });

    const { fetchClientNames } = await import('./useClientNames');
    const clientMap = await fetchClientNames();
    for (const occ of occurrences) {
      if (occ.clientId) {
        occ.clientName = clientMap.get(occ.clientId);
      }
    }
    for (const p of payments) {
      if (p.clientId) {
        p.clientLabel = clientMap.get(p.clientId) || 'Unknown';
      }
    }

    const rows = computeDues({
      occurrences,
      payments,
      categories: new Map(categories.map((c) => [c.id, c])),
      salaryRules,
      month,
    });

    return { rows, totals: duesTotals(rows), payments, categories, currency };
  }, [month, currency, autoComplete]);
}
