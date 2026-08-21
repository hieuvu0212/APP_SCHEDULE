// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/rules.ts — CRUD RecurringRule
//
//  ⚠️ KHÔNG lọc rule theo cửa sổ hiển thị.
//
//  Một rule bắt đầu từ 09/2024 và chưa có endDate vẫn sinh buổi cho tuần này.
//  Lọc theo `startDate ∈ [tuần này]` sẽ làm mọi lịch cũ biến mất — đúng kiểu
//  lỗi A2, chỉ khác chỗ xảy ra. Nạp toàn bộ rule còn sống rồi để
//  `occurrenceDates()` cắt theo cửa sổ; với quy mô cá nhân số rule chỉ vài
//  chục nên chi phí không đáng kể.
// ═══════════════════════════════════════════════════════════════════════════

import type { RecurringRule } from '../../types';
import { db, newId, nowISO } from '../schema';
import { restoreExceptionsOfRule, softDeleteExceptionsOfRule } from './exceptions';

export type NewRecurringRule = Omit<
  RecurringRule,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** Toàn bộ rule còn sống. Xem chú thích đầu file về việc không lọc cửa sổ. */
export async function listRules(): Promise<RecurringRule[]> {
  const rows = await db.rules.toArray();
  return rows.filter((r) => !r.deletedAt);
}

export async function getRule(id: string): Promise<RecurringRule | undefined> {
  return db.rules.get(id);
}

export async function createRule(input: NewRecurringRule): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.rules.add({ ...input, id, createdAt: t, updatedAt: t });
  return id;
}

export async function updateRule(
  id: string,
  patch: Partial<NewRecurringRule>,
): Promise<void> {
  await db.rules.update(id, { ...patch, updatedAt: nowISO() });
}

/**
 * Xóa mềm rule KÈM toàn bộ exception của nó (mục 8.1).
 *
 * Trả về mốc thời gian đã đóng dấu, để `restoreRule` khôi phục lại đúng
 * những bản ghi này chứ không kéo theo exception đã xóa từ trước.
 */
export async function softDeleteRule(id: string): Promise<string> {
  const t = nowISO();
  await db.transaction('rw', [db.rules, db.exceptions], async () => {
    await softDeleteExceptionsOfRule(id, t);
    await db.rules.update(id, { deletedAt: t, updatedAt: t });
  });
  return t;
}

export async function restoreRule(id: string, deletedAt: string): Promise<void> {
  await db.transaction('rw', [db.rules, db.exceptions], async () => {
    await db.rules.update(id, { deletedAt: undefined, updatedAt: nowISO() });
    await restoreExceptionsOfRule(id, deletedAt);
  });
}

/**
 * "Sửa từ buổi này trở đi" — TÁCH CHUỖI.
 *
 * Không sửa thẳng rule cũ, vì như vậy sẽ viết lại cả quá khứ: buổi tháng
 * trước cũng đổi theo, và bảng lương các tháng đã chốt sẽ nhảy số.
 *
 * Cách làm: đặt `endDate` cho rule cũ tới ngày liền TRƯỚC mốc cắt, rồi tạo
 * rule mới bắt đầu từ mốc cắt. Exception của rule cũ neo theo `originalDate`
 * nên phần nằm sau mốc cắt trở thành mồ côi — dọn luôn ở đây.
 */
export async function splitRuleFrom(
  id: string,
  fromDate: string,
  patch: Partial<NewRecurringRule>,
): Promise<string> {
  const original = await db.rules.get(id);
  if (!original) throw new Error(`Không tìm thấy lịch lặp: ${id}`);
  if (fromDate <= original.startDate) {
    // Mốc cắt nằm ở hoặc trước buổi đầu tiên → không có gì để giữ lại.
    await updateRule(id, patch);
    return id;
  }

  const t = nowISO();
  const newRuleId = newId();

  await db.transaction('rw', [db.rules, db.exceptions], async () => {
    // 1. Đóng rule cũ lại. endDate BAO GỒM, nên lùi một ngày.
    const previousDay = shiftDay(fromDate, -1);
    await db.rules.update(id, { endDate: previousDay, count: undefined, updatedAt: t });

    // 2. Dọn exception của rule cũ nằm sau mốc cắt — chúng không còn buổi nào
    //    để neo vào nữa.
    await db.exceptions
      .where('recurringRuleId')
      .equals(id)
      .filter((e) => !e.deletedAt && !!e.originalDate && e.originalDate >= fromDate)
      .modify({ deletedAt: t, updatedAt: t });

    // 3. Tạo rule mới cho phần từ mốc cắt trở đi.
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = original;
    await db.rules.add({
      ...rest,
      ...patch,
      startDate: fromDate,
      endDate: original.endDate,
      count: undefined,
      id: newRuleId,
      createdAt: t,
      updatedAt: t,
    });
  });

  return newRuleId;
}

/** Cộng/trừ ngày cho khóa "YYYY-MM-DD" mà không kéo core/time vào tầng db */
function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
