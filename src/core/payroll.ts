// ═══════════════════════════════════════════════════════════════════════════
//  core/payroll.ts — TẦNG 2: tiền của MỘT THÁNG (con số CHÍNH THỨC)
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Mọi màn hình thống kê thu nhập phải đọc từ đây, KHÔNG được tự cộng dồn
//  kết quả của Tầng 1 — vì với chế độ khoán tháng, cộng dồn sẽ ra sai.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  AdjustmentKind,
  Category,
  MonthlyPayroll,
  Occurrence,
  PayrollAdjustment,
  SalaryRule,
} from '../types';
import { calcOccurrenceIncome, resolveSalaryRule, sumHours } from './income';
import { hoursOf, nightMinutes } from './time';

/**
 * Khoản này cộng vào hay trừ ra khỏi lương.
 *
 * `amount` trong DB LUÔN dương; dấu nằm ở `kind`. Quy tắc đó chỉ được viết ở
 * đây, vì trước kia nó có hai bản — một trong bước tính lương, một trong form
 * nhập — và hai bản như vậy chỉ cần lệch nhau một lần là bảng lương hiển thị
 * một đằng, tính một nẻo.
 */
export function signOf(kind: AdjustmentKind): 1 | -1 {
  return kind === 'BONUS' || kind === 'ALLOWANCE' ? 1 : -1;
}

export interface PayrollInput {
  categoryId: string;
  /** "YYYY-MM" */
  month: string;
  category: Category | undefined;
  /** Occurrence thuộc Category này, trong tháng này (đã hợp nhất rule+exception) */
  occurrences: Occurrence[];
  salaryRules: SalaryRule[];
  adjustments: PayrollAdjustment[];
  fallbackCurrency?: string;
}

const EMPTY = (categoryId: string, month: string, currency: string): MonthlyPayroll => ({
  categoryId,
  month,
  mode: 'HOURLY',
  currency,
  hoursActual: 0,
  gross: 0,
  totalBonus: 0,
  totalPenalty: 0,
  net: 0,
  isNegative: false,
  adjustments: [],
});

/**
 * Tính bảng lương một tháng cho một công việc.
 *
 *  BƯỚC 0 — GATING
 *    isIncomeEligible = false → trả về 0 và DỪNG. Bỏ qua cả adjustment:
 *    lịch học không có lương thì cũng không có thưởng, không có phạt.
 *
 *  BƯỚC 1 — LƯƠNG GỐC
 *    HOURLY         → cộng dồn thu nhập từng buổi (Tầng 1)
 *    FIXED_MONTHLY  → baseSalary, có thể trừ thiếu giờ / cộng tăng ca
 *
 *  BƯỚC 2 — PHỤ CẤP CA ĐÊM (nếu có cấu hình)
 *
 *  BƯỚC 3 — ĐIỀU CHỈNH: cộng thưởng/phụ cấp, trừ phạt/khấu trừ
 *
 * Trả về đối tượng có BÓC TÁCH, không chỉ một con số — vì bạn sẽ luôn cần
 * biết "tháng này bị trừ 350k vì cái gì".
 */
export function calcMonthlyPayroll(input: PayrollInput): MonthlyPayroll {
  const {
    categoryId, month, category, occurrences,
    salaryRules, adjustments, fallbackCurrency = 'VND',
  } = input;

  const rule = resolveSalaryRule(salaryRules, categoryId, month);
  const currency = rule?.currency ?? fallbackCurrency;

  // ── BƯỚC 0 — GATING ─────────────────────────────────────────────────────
  if (!category || !category.isIncomeEligible) {
    return EMPTY(categoryId, month, currency);
  }

  const mine = occurrences.filter(
    (o) => o.categoryId === categoryId && o.date.startsWith(month),
  );
  const hoursActual = sumHours(mine);
  const mode = rule?.mode ?? 'HOURLY';

  // ── BƯỚC 1 — LƯƠNG GỐC ──────────────────────────────────────────────────
  let gross = 0;
  let hoursStandard: number | undefined;

  if (mode === 'FIXED_MONTHLY') {
    gross = rule?.baseSalary ?? 0;
    hoursStandard = rule?.standardMonthlyHours;

    // Chia cho 0 sẽ cho Infinity rồi lan NaN ra toàn bộ báo cáo — chặn ở đây.
    const canProRate = hoursStandard != null && hoursStandard > 0;

    if (canProRate) {
      const hourlyEquiv = gross / hoursStandard!;

      if (hoursActual < hoursStandard! && rule?.shortfallPolicy === 'PRO_RATA') {
        gross -= (hoursStandard! - hoursActual) * hourlyEquiv;
      }

      if (hoursActual > hoursStandard! && rule?.overtimeMultiplier != null) {
        gross += (hoursActual - hoursStandard!) * hourlyEquiv * rule.overtimeMultiplier;
      }
    }
  } else {
    for (const o of mine) {
      const v = calcOccurrenceIncome(o, category, rule);
      if (v != null) gross += v;
    }
  }

  // ── BƯỚC 2 — PHỤ CẤP CA ĐÊM ─────────────────────────────────────────────
  if (
    rule?.nightShiftMultiplier != null &&
    rule.nightShiftStart &&
    rule.nightShiftEnd &&
    rule.nightShiftMultiplier !== 1
  ) {
    const baseHourly =
      mode === 'FIXED_MONTHLY'
        ? hoursStandard && hoursStandard > 0
          ? (rule.baseSalary ?? 0) / hoursStandard
          : 0
        : (rule.ratePerHour ?? category.defaultRatePerHour ?? 0);

    let nightHours = 0;
    for (const o of mine) {
      if (o.status === 'CANCELLED' || o.status === 'NO_SHOW') continue;
      nightHours += hoursOf(
        nightMinutes(o.startTime, o.durationMinutes, rule.nightShiftStart, rule.nightShiftEnd),
      );
    }
    gross += nightHours * baseHourly * (rule.nightShiftMultiplier - 1);
  }

  // ── BƯỚC 3 — ĐIỀU CHỈNH ─────────────────────────────────────────────────
  const mineAdj = adjustments.filter(
    (a) => !a.deletedAt && a.categoryId === categoryId && a.month === month,
  );

  let totalBonus = 0;
  let totalPenalty = 0;
  for (const a of mineAdj) {
    // amount LUÔN dương theo hợp đồng của schema; Math.abs là lớp phòng thủ
    // phòng khi dữ liệu cũ hoặc bản import lọt số âm vào.
    const amt = Math.abs(a.amount);
    if (signOf(a.kind) === 1) totalBonus += amt;
    else totalPenalty += amt;
  }

  const net = gross + totalBonus - totalPenalty;

  return {
    categoryId,
    month,
    mode,
    currency,
    hoursActual,
    hoursStandard,
    gross,
    totalBonus,
    totalPenalty,
    net,
    // KHÔNG kẹp về 0. Kẹp là che mất lỗi nhập liệu — mà nhập sai chính là
    // nguyên nhân khả dĩ nhất khi con số ra âm. Để UI cảnh báo đỏ thay vì
    // âm thầm sửa số.
    isNegative: net < 0,
    adjustments: mineAdj,
  };
}

/** Tính bảng lương cho mọi Category trong một tháng */
export function calcAllPayrolls(
  categories: Category[],
  month: string,
  occurrences: Occurrence[],
  salaryRules: SalaryRule[],
  adjustments: PayrollAdjustment[],
  fallbackCurrency = 'VND',
): MonthlyPayroll[] {
  return categories
    .filter((c) => !c.deletedAt && c.isIncomeEligible)
    .map((c) =>
      calcMonthlyPayroll({
        categoryId: c.id,
        month,
        category: c,
        occurrences,
        salaryRules,
        adjustments,
        fallbackCurrency,
      }),
    );
}
