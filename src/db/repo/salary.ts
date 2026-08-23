// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/salary.ts — SalaryRule và PayrollAdjustment
//
//  ⚠️ HAI RÀNG BUỘC SỐNG CÒN, ÉP NGAY Ở TẦNG NÀY:
//
//  1. `amount` của adjustment LUÔN DƯƠNG. Dấu cộng/trừ do `kind` quyết định.
//     Cho phép số âm nghĩa là có ngày ai đó nhập −50.000 cho một khoản PENALTY,
//     hệ thống trừ đi số âm và thành CỘNG THÊM 50 nghìn. Con số vẫn trông hợp
//     lý nên gần như không thể phát hiện bằng mắt.
//
//  2. `standardMonthlyHours` phải DƯƠNG khi dùng PRO_RATA hoặc overtime.
//     Bằng 0 thì đơn giá quy đổi ra Infinity và NaN lan khắp báo cáo.
//
//  Tầng UI cũng chặn, nhưng chặn ở đây mới là chặn thật: bản import dữ liệu
//  hay đoạn script chạy tay không đi qua form.
// ═══════════════════════════════════════════════════════════════════════════

import type { AdjustmentTemplate, PayrollAdjustment, SalaryRule } from '../../types';
import { db, newId, nowISO } from '../schema';

export type NewSalaryRule = Omit<SalaryRule, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type NewAdjustment = Omit<
  PayrollAdjustment,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

// ─── SalaryRule ────────────────────────────────────────────────────────────

export async function listSalaryRules(): Promise<SalaryRule[]> {
  const rows = await db.salaryRules.toArray();
  return rows
    .filter((r) => !r.deletedAt)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/** Ném lỗi nếu cấu hình sẽ sinh ra NaN hoặc số vô nghĩa lúc tính lương */
function assertSalaryRuleSane(input: Partial<NewSalaryRule>): void {
  const needsHours =
    input.shortfallPolicy === 'PRO_RATA' || input.overtimeMultiplier != null;

  if (input.mode === 'FIXED_MONTHLY' && needsHours) {
    const h = input.standardMonthlyHours;
    if (h == null || !(h > 0)) {
      throw new Error(
        'Giờ công chuẩn phải lớn hơn 0 khi dùng trừ theo giờ thiếu hoặc hệ số tăng ca — ' +
          'nếu không, phép chia sẽ ra Infinity và làm hỏng toàn bộ bảng lương.',
      );
    }
  }
  if (input.effectiveTo && input.effectiveFrom && input.effectiveTo < input.effectiveFrom) {
    throw new Error('Tháng kết thúc hiệu lực không được trước tháng bắt đầu.');
  }
}

export async function createSalaryRule(input: NewSalaryRule): Promise<string> {
  assertSalaryRuleSane(input);
  const t = nowISO();
  const id = newId();
  await db.salaryRules.add({ ...input, id, createdAt: t, updatedAt: t });
  return id;
}

export async function updateSalaryRule(
  id: string,
  patch: Partial<NewSalaryRule>,
): Promise<void> {
  const current = await db.salaryRules.get(id);
  // Kiểm tra trên bản ĐÃ TRỘN, không phải trên riêng patch: đổi mỗi
  // shortfallPolicy sang PRO_RATA mà bản ghi cũ không có giờ chuẩn thì vẫn hỏng.
  assertSalaryRuleSane({ ...current, ...patch } as NewSalaryRule);
  await db.salaryRules.update(id, { ...patch, updatedAt: nowISO() });
}

export async function softDeleteSalaryRule(id: string): Promise<() => Promise<void>> {
  const t = nowISO();
  await db.salaryRules.update(id, { deletedAt: t, updatedAt: t });
  return async () => {
    await db.salaryRules.update(id, { deletedAt: undefined, updatedAt: nowISO() });
  };
}

// ─── PayrollAdjustment ─────────────────────────────────────────────────────

export async function listAdjustments(month?: string): Promise<PayrollAdjustment[]> {
  const rows = month
    ? await db.adjustments.where('month').equals(month).toArray()
    : await db.adjustments.toArray();
  return rows
    .filter((a) => !a.deletedAt)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.label.localeCompare(b.label));
}

/**
 * Chuẩn hóa amount về số dương.
 *
 * Dùng Math.abs chứ không ném lỗi: người dùng gõ "-100000" cho một khoản phạt
 * là đang diễn đạt đúng ý — họ nghĩ theo hướng "bị trừ". Ném lỗi vào mặt họ
 * thì vô ích, còn lưu nguyên số âm thì sai. Chuẩn hóa rồi để `kind` lo phần dấu.
 */
function normalizeAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Số tiền không hợp lệ.');
  }
  return Math.abs(amount);
}

export async function createAdjustment(input: NewAdjustment): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.adjustments.add({
    ...input,
    amount: normalizeAmount(input.amount),
    id,
    createdAt: t,
    updatedAt: t,
  });
  return id;
}

export async function updateAdjustment(
  id: string,
  patch: Partial<NewAdjustment>,
): Promise<void> {
  await db.adjustments.update(id, {
    ...patch,
    ...(patch.amount != null ? { amount: normalizeAmount(patch.amount) } : {}),
    updatedAt: nowISO(),
  });
}

export async function softDeleteAdjustment(id: string): Promise<() => Promise<void>> {
  const t = nowISO();
  await db.adjustments.update(id, { deletedAt: t, updatedAt: t });
  return async () => {
    await db.adjustments.update(id, { deletedAt: undefined, updatedAt: nowISO() });
  };
}

// ─── AdjustmentTemplate ────────────────────────────────────────────────────
//
//  Biểu phạt/thưởng lặp lại. "Đi muộn − 50.000" là thứ xảy ra hàng tháng; gõ
//  lại từ đầu mỗi lần vừa mất công vừa dễ nhập lệch số tiền giữa các tháng,
//  mà lệch kiểu đó thì nhìn bảng lương không tài nào phát hiện ra.

export type NewAdjustmentTemplate = Omit<
  AdjustmentTemplate,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export async function listAdjustmentTemplates(): Promise<AdjustmentTemplate[]> {
  const rows = await db.adjustmentTemplates.toArray();
  return rows.filter((x) => !x.deletedAt).sort((a, b) => a.label.localeCompare(b.label));
}

export async function createAdjustmentTemplate(
  input: NewAdjustmentTemplate,
): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.adjustmentTemplates.add({
    ...input,
    defaultAmount: normalizeAmount(input.defaultAmount),
    id,
    createdAt: t,
    updatedAt: t,
  });
  return id;
}

export async function softDeleteAdjustmentTemplate(
  id: string,
): Promise<() => Promise<void>> {
  const t = nowISO();
  await db.adjustmentTemplates.update(id, { deletedAt: t, updatedAt: t });
  return async () => {
    await db.adjustmentTemplates.update(id, { deletedAt: undefined, updatedAt: nowISO() });
  };
}
