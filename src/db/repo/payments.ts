// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/payments.ts — các khoản đã thu
//
//  ⚠️ `amount` LUÔN DƯƠNG, chuẩn hóa ngay ở đây.
//
//  Cùng lý do với PayrollAdjustment: một khoản −50.000 lọt vào sẽ bị cộng dồn
//  thành số âm, làm "đã thu" giảm đi, và dòng đó hiện "còn thiếu" nhiều hơn
//  thực tế. Con số vẫn trông hợp lý nên gần như không phát hiện được bằng mắt.
//
//  ⚠️ `clientKey` do TẦNG GỌI chuẩn hóa qua `normalizeText`, không phải ở đây.
//  Nếu repo tự chuẩn hóa thì nó phải import core/filter, và tầng db kéo theo
//  logic so khớp văn bản là bắt đầu lẫn lộn trách nhiệm.
// ═══════════════════════════════════════════════════════════════════════════

import type { Payment } from '../../types';
import { db, newId, nowISO } from '../schema';

export type NewPayment = Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function listPayments(month?: string): Promise<Payment[]> {
  const rows = month
    ? await db.payments.where('month').equals(month).toArray()
    : await db.payments.toArray();
  return rows
    .filter((p) => !p.deletedAt)
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));
}

function normalizeAmount(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('Số tiền không hợp lệ.');
  return Math.abs(Math.round(amount));
}

export async function createPayment(input: NewPayment): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.payments.add({
    ...input,
    amount: normalizeAmount(input.amount),
    id,
    createdAt: t,
    updatedAt: t,
  });
  return id;
}

export async function updatePayment(
  id: string,
  patch: Partial<NewPayment>,
): Promise<void> {
  await db.payments.update(id, {
    ...patch,
    ...(patch.amount != null ? { amount: normalizeAmount(patch.amount) } : {}),
    updatedAt: nowISO(),
  });
}

export async function softDeletePayment(id: string): Promise<() => Promise<void>> {
  const t = nowISO();
  await db.payments.update(id, { deletedAt: t, updatedAt: t });
  return async () => {
    await db.payments.update(id, { deletedAt: undefined, updatedAt: nowISO() });
  };
}
