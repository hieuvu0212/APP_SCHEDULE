import type { ScheduleException } from '../../types';
import { db, newId, nowISO } from '../schema';

/**
 * Nạp exception cho cửa sổ [start, end] — TRUY VẤN HAI CHIỀU.
 *
 * ⚠️ Đây là chỗ sửa lỗi nghiêm trọng nhất của bản kế hoạch gốc.
 *
 * Thuật toán ở mục 4.1 mở rộng rule trên cửa sổ RỒI mới áp exception theo
 * `originalDate`. Nhưng khi một buổi ngày 30/08 được dời sang 02/09, lúc xem
 * tuần đầu tháng 9 thì:
 *   · mở rộng rule không sinh ra ngày 30/08 (nằm ngoài cửa sổ)
 *   · truy vấn exception theo originalDate ∈ [01/09, 07/09] cũng không bắt được
 *   → ca đã dời BIẾN MẤT hoàn toàn.
 *
 * Vế `newDate` bên dưới chính là thứ khắc phục điều đó. Nó cũng là điều kiện
 * duy nhất để exception loại ADD (chỉ có newDate, không có originalDate)
 * được nhìn thấy.
 */
export async function getExceptionsInWindow(
  start: string,
  end: string,
): Promise<ScheduleException[]> {
  const [byOriginal, byNew] = await Promise.all([
    // buổi bị hủy / sửa TRONG cửa sổ
    db.exceptions.where('originalDate').between(start, end, true, true).toArray(),
    // buổi từ nơi khác dời VÀO cửa sổ, và toàn bộ loại ADD
    db.exceptions.where('newDate').between(start, end, true, true).toArray(),
  ]);

  const seen = new Map<string, ScheduleException>();
  for (const e of [...byOriginal, ...byNew]) {
    if (!e.deletedAt) seen.set(e.id, e);
  }
  return [...seen.values()];
}

/**
 * Ghi exception cho một buổi lặp — ngữ nghĩa UPSERT.
 *
 * Index unique [recurringRuleId+originalDate] chặn hai exception chọi nhau
 * trên cùng một buổi, nên ở đây phải ghi đè bản cũ thay vì thêm bản mới.
 */
export async function upsertException(
  input: Omit<ScheduleException, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const t = nowISO();

  if (input.recurringRuleId && input.originalDate && input.type !== 'ADD') {
    const existing = await db.exceptions
      .where('[recurringRuleId+originalDate]')
      .equals([input.recurringRuleId, input.originalDate])
      .first();

    if (existing) {
      await db.exceptions.update(existing.id, {
        ...input,
        updatedAt: t,
        deletedAt: undefined,
      });
      return existing.id;
    }
  }

  const id = newId();
  await db.exceptions.add({ ...input, id, createdAt: t, updatedAt: t });
  return id;
}

/** Xóa mềm — giữ tombstone để Phase 7 đồng bộ được thao tác xóa */
export async function softDeleteException(id: string): Promise<void> {
  await db.exceptions.update(id, { deletedAt: nowISO(), updatedAt: nowISO() });
}

/**
 * Dọn exception khi xóa một RecurringRule (yêu cầu ở mục 8.1).
 * Bỏ sót bước này sẽ để lại exception mồ côi, không bao giờ hiển thị và
 * cũng không xóa được qua giao diện.
 */
export async function softDeleteExceptionsOfRule(ruleId: string): Promise<number> {
  const t = nowISO();
  return db.exceptions
    .where('recurringRuleId')
    .equals(ruleId)
    .modify({ deletedAt: t, updatedAt: t });
}
