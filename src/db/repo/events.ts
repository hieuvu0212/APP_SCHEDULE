// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/events.ts — CRUD SingleEvent
//
//  Đây là một trong những nơi DUY NHẤT được đụng vào db. Component không
//  bao giờ gọi thẳng `db.events`.
// ═══════════════════════════════════════════════════════════════════════════

import type { SingleEvent } from '../../types';
import { db, newId, nowISO } from '../schema';

export type NewSingleEvent = Omit<SingleEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * Sự kiện đơn lẻ rơi vào cửa sổ [start, end].
 *
 * Chỉ cần lọc theo `date` một chiều — khác hẳn exception. SingleEvent không
 * có khái niệm "dời từ chỗ khác tới": sửa ngày là ghi đè luôn trường `date`,
 * nên nó chỉ tồn tại ở đúng một chỗ.
 *
 * Ca qua đêm vẫn thuộc về ngày bắt đầu, nên không cần nới biên dưới.
 */
export async function listEventsInWindow(
  start: string,
  end: string,
): Promise<SingleEvent[]> {
  const rows = await db.events.where('date').between(start, end, true, true).toArray();
  return rows.filter((e) => !e.deletedAt);
}

/**
 * Mọi sự kiện chưa xóa, không giới hạn cửa sổ thời gian.
 *
 * Dùng cho việc đoán danh mục ở Thêm nhanh: câu hỏi "đối tượng này trước giờ
 * nằm ở danh mục nào" phải nhìn cả quá khứ, chứ không phải tuần đang xem.
 */
export async function listAllEvents(): Promise<SingleEvent[]> {
  const rows = await db.events.toArray();
  return rows.filter((e) => !e.deletedAt);
}

export async function createEvent(input: NewSingleEvent): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.events.add({ ...input, id, createdAt: t, updatedAt: t });
  return id;
}

/**
 * Tạo nhiều sự kiện trong MỘT giao dịch, trả về id đã tạo.
 *
 * Chạy trong transaction để nhân bản tuần không thể dừng giữa chừng: tạo được
 * bốn buổi rồi lỗi sẽ để lại một tuần chép dở mà nút Hoàn tác không biết gì về
 * bốn buổi đó.
 */
export async function bulkCreateEvents(inputs: NewSingleEvent[]): Promise<string[]> {
  if (inputs.length === 0) return [];

  const t = nowISO();
  const rows: SingleEvent[] = inputs.map((input) => ({
    ...input,
    id: newId(),
    createdAt: t,
    updatedAt: t,
  }));

  await db.transaction('rw', db.events, async () => {
    await db.events.bulkAdd(rows);
  });

  return rows.map((r) => r.id);
}

export async function updateEvent(
  id: string,
  patch: Partial<NewSingleEvent>,
): Promise<void> {
  await db.events.update(id, { ...patch, updatedAt: nowISO() });
}

/** Xóa mềm — giữ tombstone cho Phase 7 và cho nút Hoàn tác */
export async function softDeleteEvent(id: string): Promise<void> {
  const t = nowISO();
  await db.events.update(id, { deletedAt: t, updatedAt: t });
}

export async function restoreEvent(id: string): Promise<void> {
  await db.events.update(id, { deletedAt: undefined, updatedAt: nowISO() });
}

export async function getEvent(id: string): Promise<SingleEvent | undefined> {
  return db.events.get(id);
}
