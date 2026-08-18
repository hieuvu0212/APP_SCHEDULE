// ═══════════════════════════════════════════════════════════════════════════
//  core/income.ts — TẦNG 1: tiền của MỘT buổi
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  QUAN TRỌNG: tầng này CHỈ có nghĩa với chế độ lương HOURLY.
//  Với FIXED_MONTHLY, câu hỏi "buổi thứ Ba kiếm được bao nhiêu?" không có
//  đáp án — lương 8 triệu/tháng không phải tổng của 22 buổi chia đều, vì
//  nghỉ một buổi có phép vẫn nhận đủ 8 triệu.
//
//  Con số thu nhập CHÍNH THỨC luôn đến từ core/payroll.ts (Tầng 2).
// ═══════════════════════════════════════════════════════════════════════════

import type { Category, Occurrence, SalaryRule } from '../types';
import { hoursOf } from './time';

/**
 * Chọn SalaryRule có hiệu lực cho tháng `month`.
 * Nếu có nhiều bản chồng lấn, ưu tiên bản có effectiveFrom muộn nhất.
 */
export function resolveSalaryRule(
  rules: SalaryRule[],
  categoryId: string,
  month: string,
): SalaryRule | undefined {
  return rules
    .filter(
      (r) =>
        !r.deletedAt &&
        r.categoryId === categoryId &&
        r.effectiveFrom <= month &&
        (!r.effectiveTo || r.effectiveTo >= month),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/**
 * Thu nhập của MỘT buổi.
 *
 * Trả về `null` khi không quy đổi được (chế độ khoán tháng) — KHÁC với 0.
 * UI phải hiển thị "—" cho null và "0đ" cho 0. Hai thứ này mang nghĩa khác
 * nhau và gộp lại là gây hiểu lầm.
 *
 * Chuỗi ưu tiên:
 *   0. Category.isIncomeEligible === false  → 0   (GATING, dừng luôn)
 *   0b. SalaryRule.mode === 'FIXED_MONTHLY' → null (không quy đổi được)
 *   1. occurrence.fixedAmount               → dùng thẳng, không nhân giờ
 *   2. occurrence.ratePerHour               → × số giờ
 *   3. SalaryRule.ratePerHour               → × số giờ
 *   4. Category.defaultRatePerHour          → × số giờ
 *   5. không có gì                          → 0
 *
 * Lưu ý: `occurrence` phải là bản ĐÃ HỢP NHẤT rule + exception, tức là
 * newRatePerHour / newFixedAmount của exception đã ghi đè lên giá trị gốc
 * TRƯỚC KHI gọi hàm này.
 */
export function calcOccurrenceIncome(
  occurrence: Occurrence,
  category: Category | undefined,
  salaryRule?: SalaryRule,
): number | null {
  // Bước 0 — GATING. Chạy trước mọi phép tính khác.
  if (!category || !category.isIncomeEligible) return 0;

  // Buổi bị hủy hoặc vắng mặt không sinh thu nhập.
  if (occurrence.status === 'CANCELLED' || occurrence.status === 'NO_SHOW') return 0;

  // Khoán tháng: không quy đổi được về từng buổi.
  // Khoản phát sinh thêm cho một buổi cụ thể nên ghi thành PayrollAdjustment.
  if (salaryRule?.mode === 'FIXED_MONTHLY') return null;

  const hours = hoursOf(occurrence.durationMinutes);

  if (occurrence.fixedAmount != null) return occurrence.fixedAmount;
  if (occurrence.ratePerHour != null) return occurrence.ratePerHour * hours;
  if (salaryRule?.mode === 'HOURLY' && salaryRule.ratePerHour != null) {
    return salaryRule.ratePerHour * hours;
  }
  if (category.defaultRatePerHour != null) return category.defaultRatePerHour * hours;

  return 0;
}

/**
 * Tổng số giờ của một tập occurrence.
 * Buổi bị hủy / vắng mặt không được tính.
 */
export function sumHours(occurrences: Occurrence[]): number {
  return occurrences
    .filter((o) => o.status !== 'CANCELLED' && o.status !== 'NO_SHOW')
    .reduce((acc, o) => acc + hoursOf(o.durationMinutes), 0);
}

/** Tổng giờ nhóm theo categoryId */
export function sumHoursByCategory(occurrences: Occurrence[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of occurrences) {
    if (o.status === 'CANCELLED' || o.status === 'NO_SHOW') continue;
    out[o.categoryId] = (out[o.categoryId] ?? 0) + hoursOf(o.durationMinutes);
  }
  return out;
}
