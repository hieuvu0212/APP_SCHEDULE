// ═══════════════════════════════════════════════════════════════════════════
//  hooks/usePayroll.ts — số liệu cho màn hình Thu nhập
//
//  ⚠️ CON SỐ CHÍNH THỨC ĐẾN TỪ calcAllPayrolls (TẦNG 2), KHÔNG BAO GIỜ TỪ
//     VIỆC CỘNG DỒN calcOccurrenceIncome (TẦNG 1).
//
//  Với lương khoán tháng, cộng dồn Tầng 1 sai cả hai chiều: tháng nghỉ vài
//  buổi ra thấp hơn lương thật, tháng làm thêm ra cao hơn. Mà Tầng 1 còn trả
//  về `null` cho chế độ đó, nên phép cộng sẽ âm thầm bỏ qua và cho ra 0.
//
//  Cửa sổ mở rộng lịch phải là TRỌN THÁNG, không phải tuần đang xem.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import type {
  AdjustmentTemplate,
  Category,
  MonthlyPayroll,
  Occurrence,
  PayrollAdjustment,
  SalaryRule,
} from '../types';
import { expandSchedule } from '../core/expand';
import { splitHours } from '../core/income';
import { calcAllPayrolls } from '../core/payroll';
import { monthBounds } from '../core/time';
import { listCategories } from '../db/repo/categories';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listRules } from '../db/repo/rules';
import {
  listAdjustmentTemplates,
  listAdjustments,
  listSalaryRules,
} from '../db/repo/salary';
import { useSettings } from './useSettings';

export interface PayrollRow {
  payroll: MonthlyPayroll;
  category: Category;
  /** Giờ đã đánh dấu hoàn thành */
  hoursCompleted: number;
  /** Giờ mới nằm trên lịch, chưa xảy ra hoặc chưa đánh dấu */
  hoursScheduled: number;
  salaryRule: SalaryRule | undefined;
}

export interface PayrollData {
  rows: PayrollRow[];
  occurrences: Occurrence[];
  categories: Category[];
  salaryRules: SalaryRule[];
  adjustments: PayrollAdjustment[];
  templates: AdjustmentTemplate[];
  totalNet: number;
  /**
   * Các công việc đang dùng nhiều loại tiền tệ khác nhau.
   * Khi đó `totalNet` VÔ NGHĨA — cộng đồng với đô không ra con số nào cả —
   * và màn hình phải giấu dòng tổng đi thay vì hiện một số sai.
   */
  mixedCurrency: boolean;
  /** Có ít nhất một danh mục chưa cấu hình lương */
  hasUnconfigured: boolean;
}

export function usePayroll(month: string): PayrollData | undefined {
  const settings = useSettings();
  const currency = settings.currency;
  const autoComplete = settings.autoCompletePastOccurrences;

  return useLiveQuery(async () => {
    const { start, end } = monthBounds(month);

    const [categories, rules, exceptions, events, salaryRules, adjustments, templates] =
      await Promise.all([
        listCategories(),
        listRules(),
        getExceptionsInWindow(start, end),
        listEventsInWindow(start, end),
        listSalaryRules(),
        listAdjustments(month),
        listAdjustmentTemplates(),
      ]);

    // Không gọi detectConflicts ở đây: trùng lịch là chuyện hiển thị, không
    // ảnh hưởng một đồng nào trong bảng lương.
    const occurrences = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: start,
      windowEnd: end,
      now: new Date(),
      autoCompletePast: autoComplete,
    });

    const payrolls = calcAllPayrolls(
      categories,
      month,
      occurrences,
      salaryRules,
      adjustments,
      currency,
    );

    const byId = new Map(categories.map((c) => [c.id, c]));
    const rows: PayrollRow[] = [];

    for (const payroll of payrolls) {
      const category = byId.get(payroll.categoryId);
      if (!category) continue;
      const mine = occurrences.filter((o) => o.categoryId === payroll.categoryId);
      const { completed, scheduled } = splitHours(mine);
      rows.push({
        payroll,
        category,
        hoursCompleted: completed,
        hoursScheduled: scheduled,
        salaryRule: salaryRules.find(
          (r) =>
            r.categoryId === payroll.categoryId &&
            r.effectiveFrom <= month &&
            (!r.effectiveTo || r.effectiveTo >= month),
        ),
      });
    }

    return {
      rows,
      occurrences,
      categories,
      salaryRules,
      adjustments,
      templates,
      totalNet: rows.reduce((sum, r) => sum + r.payroll.net, 0),
      mixedCurrency: new Set(rows.map((r) => r.payroll.currency)).size > 1,
      hasUnconfigured: rows.some((r) => !r.salaryRule),
    };
  }, [month, currency, autoComplete]);
}
