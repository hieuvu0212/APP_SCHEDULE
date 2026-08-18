import { describe, expect, it } from 'vitest';
import type {
  Category, Occurrence, PayrollAdjustment, SalaryRule,
} from '../../types';
import { calcMonthlyPayroll } from '../payroll';
import { calcOccurrenceIncome, resolveSalaryRule } from '../income';
import { toAbsolute } from '../time';

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

const rossi: Category = {
  ...meta, id: 'cat-rossi', name: 'Rossi', color: '#f59e0b', isIncomeEligible: true,
};
const daihoc: Category = {
  ...meta, id: 'cat-dh', name: 'Đại học', color: '#3b82f6', isIncomeEligible: false,
};

/** Sinh N buổi, mỗi buổi `hours` giờ, trong tháng 9/2026 */
function shifts(categoryId: string, count: number, hours: number): Occurrence[] {
  return Array.from({ length: count }, (_, i) => {
    const date = `2026-09-${String(i + 1).padStart(2, '0')}`;
    const startAbs = toAbsolute(date, '18:00');
    return {
      key: `k${i}`, sourceType: 'SINGLE' as const, sourceId: `s${i}`,
      title: 'Ca', categoryId, date, startTime: '18:00',
      durationMinutes: hours * 60, endsNextDay: false,
      startAbs, endAbs: startAbs + hours * 3_600_000,
      status: 'COMPLETED' as const, hasConflict: false, conflictWith: [],
    };
  });
}

const adj = (kind: PayrollAdjustment['kind'], amount: number, label: string): PayrollAdjustment => ({
  ...meta, id: `a-${label}`, categoryId: 'cat-rossi', month: '2026-09', kind, amount, label,
});

// ═══════════════════════════════════════════════════════════════════════════

describe('BƯỚC 0 — GATING isIncomeEligible', () => {
  it('Category không tính thu nhập → 0, kể cả khi buổi có ratePerHour', () => {
    const os = shifts('cat-dh', 10, 3).map((o) => ({ ...o, ratePerHour: 500_000 }));
    const r = calcMonthlyPayroll({
      categoryId: 'cat-dh', month: '2026-09', category: daihoc,
      occurrences: os, salaryRules: [], adjustments: [],
    });
    expect(r.net).toBe(0);
    expect(r.gross).toBe(0);
  });

  it('gating bỏ qua CẢ thưởng lẫn phạt', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-dh', month: '2026-09', category: daihoc,
      occurrences: [], salaryRules: [],
      adjustments: [{ ...adj('BONUS', 1_000_000, 'thưởng'), categoryId: 'cat-dh' }],
    });
    expect(r.net).toBe(0);
  });

  it('gating chặn ngay ở tầng 1 (calcOccurrenceIncome)', () => {
    const o = { ...shifts('cat-dh', 1, 3)[0], ratePerHour: 100_000 };
    expect(calcOccurrenceIncome(o, daihoc)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Ví dụ đối chiếu: 160 giờ thực tế, chuẩn 176, phạt 2×50k, thưởng 300k
//  Cùng một bộ dữ liệu lịch → BA con số khác nhau tùy mode/shortfallPolicy.
// ═══════════════════════════════════════════════════════════════════════════

const occ160 = shifts('cat-rossi', 20, 8); // 20 buổi × 8 giờ = 160 giờ
const adjustments = [
  adj('PENALTY', 50_000, 'đi muộn 1'),
  adj('PENALTY', 50_000, 'đi muộn 2'),
  adj('BONUS', 300_000, 'chuyên cần'),
];

describe('HOURLY — tự nhập đơn giá mỗi giờ (Rossi)', () => {
  const salary: SalaryRule = {
    ...meta, id: 's1', categoryId: 'cat-rossi', mode: 'HOURLY',
    effectiveFrom: '2026-01', ratePerHour: 45_000, currency: 'VND',
  };

  it('160 giờ × 45.000 + 300k − 100k = 7.400.000', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: occ160, salaryRules: [salary], adjustments,
    });
    expect(r.hoursActual).toBe(160);
    expect(r.gross).toBe(7_200_000);
    expect(r.totalBonus).toBe(300_000);
    expect(r.totalPenalty).toBe(100_000);
    expect(r.net).toBe(7_400_000);
    expect(r.mode).toBe('HOURLY');
  });

  it('tầng 1 quy đổi được về từng buổi', () => {
    expect(calcOccurrenceIncome(occ160[0], rossi, salary)).toBe(8 * 45_000);
  });

  it('đơn giá riêng của buổi thắng đơn giá của SalaryRule', () => {
    const o = { ...occ160[0], ratePerHour: 60_000 };
    expect(calcOccurrenceIncome(o, rossi, salary)).toBe(8 * 60_000);
  });

  it('fixedAmount thắng tất cả và KHÔNG nhân với số giờ', () => {
    const o = { ...occ160[0], ratePerHour: 60_000, fixedAmount: 200_000 };
    expect(calcOccurrenceIncome(o, rossi, salary)).toBe(200_000);
  });

  it('Category.defaultRatePerHour được dùng khi không có nguồn nào khác (lỗ hổng B2)', () => {
    const cat = { ...rossi, defaultRatePerHour: 30_000 };
    expect(calcOccurrenceIncome(occ160[0], cat)).toBe(8 * 30_000);
  });

  it('buổi đã hủy không sinh thu nhập', () => {
    const o = { ...occ160[0], status: 'CANCELLED' as const };
    expect(calcOccurrenceIncome(o, rossi, salary)).toBe(0);
  });
});

describe('FIXED_MONTHLY + shortfallPolicy=NONE — nghỉ vẫn nhận đủ', () => {
  const salary: SalaryRule = {
    ...meta, id: 's2', categoryId: 'cat-rossi', mode: 'FIXED_MONTHLY',
    effectiveFrom: '2026-01', baseSalary: 8_000_000,
    standardMonthlyHours: 176, shortfallPolicy: 'NONE', currency: 'VND',
  };

  it('8.000.000 + 300k − 100k = 8.200.000 (thiếu 16 giờ nhưng không bị trừ)', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: occ160, salaryRules: [salary], adjustments,
    });
    expect(r.gross).toBe(8_000_000);
    expect(r.net).toBe(8_200_000);
    expect(r.hoursActual).toBe(160);
    expect(r.hoursStandard).toBe(176);
  });

  it('tầng 1 trả về null — KHÔNG phải 0 (hai thứ khác nghĩa nhau)', () => {
    expect(calcOccurrenceIncome(occ160[0], rossi, salary)).toBeNull();
  });
});

describe('FIXED_MONTHLY + shortfallPolicy=PRO_RATA — thiếu giờ thì trừ', () => {
  const salary: SalaryRule = {
    ...meta, id: 's3', categoryId: 'cat-rossi', mode: 'FIXED_MONTHLY',
    effectiveFrom: '2026-01', baseSalary: 8_000_000,
    standardMonthlyHours: 176, shortfallPolicy: 'PRO_RATA', currency: 'VND',
  };

  it('8.000.000 × (160/176) + 300k − 100k ≈ 7.472.727', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: occ160, salaryRules: [salary], adjustments,
    });
    expect(r.gross).toBeCloseTo(8_000_000 * (160 / 176), 2);
    expect(Math.round(r.net)).toBe(7_472_727);
  });

  it('làm đủ giờ chuẩn thì nhận nguyên lương', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: shifts('cat-rossi', 22, 8), salaryRules: [salary], adjustments: [],
    });
    expect(r.hoursActual).toBe(176);
    expect(r.gross).toBe(8_000_000);
  });

  it('standardMonthlyHours = 0 KHÔNG được tạo ra NaN/Infinity', () => {
    const bad = { ...salary, standardMonthlyHours: 0 };
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: occ160, salaryRules: [bad], adjustments: [],
    });
    expect(Number.isFinite(r.net)).toBe(true);
    expect(r.net).toBe(8_000_000);
  });
});

describe('tăng ca', () => {
  it('giờ vượt chuẩn được nhân hệ số', () => {
    const salary: SalaryRule = {
      ...meta, id: 's4', categoryId: 'cat-rossi', mode: 'FIXED_MONTHLY',
      effectiveFrom: '2026-01', baseSalary: 8_000_000, standardMonthlyHours: 176,
      shortfallPolicy: 'NONE', overtimeMultiplier: 1.5, currency: 'VND',
    };
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: shifts('cat-rossi', 24, 8), // 192 giờ, vượt 16
      salaryRules: [salary], adjustments: [],
    });
    expect(r.gross).toBeCloseTo(8_000_000 + 16 * (8_000_000 / 176) * 1.5, 2);
  });
});

describe('BƯỚC 3 — điều chỉnh lương', () => {
  const salary: SalaryRule = {
    ...meta, id: 's5', categoryId: 'cat-rossi', mode: 'HOURLY',
    effectiveFrom: '2026-01', ratePerHour: 45_000, currency: 'VND',
  };

  it('bốn loại điều chỉnh vào đúng phía cộng/trừ', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: [], salaryRules: [salary],
      adjustments: [
        adj('BONUS', 100_000, 'b'),
        adj('ALLOWANCE', 200_000, 'al'),
        adj('PENALTY', 50_000, 'p'),
        adj('DEDUCTION', 30_000, 'd'),
      ],
    });
    expect(r.totalBonus).toBe(300_000);
    expect(r.totalPenalty).toBe(80_000);
    expect(r.net).toBe(220_000);
  });

  it('số âm lọt vào vẫn được xử lý như số dương (lớp phòng thủ)', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: [], salaryRules: [salary],
      adjustments: [adj('PENALTY', -50_000, 'nhập sai dấu')],
    });
    // Nếu không có Math.abs, đây sẽ thành CỘNG 50k thay vì trừ.
    expect(r.totalPenalty).toBe(50_000);
    expect(r.net).toBe(-50_000);
  });

  it('phạt vượt lương → net âm, có cờ cảnh báo, KHÔNG bị kẹp về 0', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: [], salaryRules: [salary],
      adjustments: [adj('PENALTY', 500_000, 'phạt nặng')],
    });
    expect(r.net).toBe(-500_000);
    expect(r.isNegative).toBe(true);
  });

  it('chỉ lấy điều chỉnh đúng tháng và đúng Category', () => {
    const r = calcMonthlyPayroll({
      categoryId: 'cat-rossi', month: '2026-09', category: rossi,
      occurrences: [], salaryRules: [salary],
      adjustments: [
        { ...adj('BONUS', 100_000, 'tháng khác'), month: '2026-08' },
        { ...adj('BONUS', 999_000, 'cat khác'), categoryId: 'cat-khac' },
        adj('BONUS', 50_000, 'đúng'),
      ],
    });
    expect(r.totalBonus).toBe(50_000);
  });
});

describe('resolveSalaryRule — khoảng hiệu lực thay cho mỗi tháng một bản ghi', () => {
  const older: SalaryRule = {
    ...meta, id: 'old', categoryId: 'cat-rossi', mode: 'HOURLY',
    effectiveFrom: '2026-01', effectiveTo: '2026-08', ratePerHour: 40_000, currency: 'VND',
  };
  const newer: SalaryRule = {
    ...meta, id: 'new', categoryId: 'cat-rossi', mode: 'HOURLY',
    effectiveFrom: '2026-09', ratePerHour: 45_000, currency: 'VND',
  };

  it('chọn đúng bản theo tháng', () => {
    expect(resolveSalaryRule([older, newer], 'cat-rossi', '2026-07')?.id).toBe('old');
    expect(resolveSalaryRule([older, newer], 'cat-rossi', '2026-08')?.id).toBe('old');
    expect(resolveSalaryRule([older, newer], 'cat-rossi', '2026-09')?.id).toBe('new');
    expect(resolveSalaryRule([older, newer], 'cat-rossi', '2027-05')?.id).toBe('new');
  });

  it('tháng trước mọi khoảng hiệu lực → không có bản nào', () => {
    expect(resolveSalaryRule([older, newer], 'cat-rossi', '2025-12')).toBeUndefined();
  });

  it('bỏ qua bản đã xóa mềm', () => {
    const deleted = { ...newer, deletedAt: '2026-09-01T00:00:00Z' };
    expect(resolveSalaryRule([deleted], 'cat-rossi', '2026-09')).toBeUndefined();
  });
});
