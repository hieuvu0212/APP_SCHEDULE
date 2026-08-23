import type { OccurrenceStatus, ScheduleException } from '../../types';
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

/**
 * Như upsertException, nhưng trả kèm cách HOÀN NGUYÊN chính xác.
 *
 * Cần thiết vì upsert là phá hủy: index unique [recurringRuleId+originalDate]
 * chỉ cho một exception mỗi buổi, nên ghi CANCEL đè lên một MOVE có sẵn là
 * mất luôn thông tin đã dời. "Hoàn tác" mà chỉ xóa bản ghi vừa ghi thì buổi
 * đó về lại ngày gốc chứ không về ngày đã dời — đúng kiểu hoàn tác sai còn
 * tệ hơn không có hoàn tác.
 *
 * Nên ở đây chụp lại nguyên trạng thái cũ trước khi ghi đè.
 */
export async function upsertExceptionUndoable(
  input: Omit<ScheduleException, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ id: string; revert: () => Promise<void> }> {
  const snapshot =
    input.recurringRuleId && input.originalDate && input.type !== 'ADD'
      ? await db.exceptions
          .where('[recurringRuleId+originalDate]')
          .equals([input.recurringRuleId, input.originalDate])
          .first()
      : undefined;

  const id = await upsertException(input);

  return {
    id,
    revert: async () => {
      if (snapshot) await db.exceptions.put({ ...snapshot, updatedAt: nowISO() });
      // Chưa từng có exception nào ở buổi này → xóa mềm chứ không xóa cứng,
      // để tombstone vẫn tồn tại cho Phase 7 đồng bộ.
      else await softDeleteException(id);
    },
  };
}

/**
 * Đổi TRẠNG THÁI của một buổi lặp mà KHÔNG đụng tới các thay đổi khác.
 *
 * Không gọi thẳng upsertException với type='STATUS': nếu buổi này đang mang
 * exception loại MOVE, ghi đè `type` sẽ khiến expandSchedule bỏ qua `newDate`
 * và buổi nhảy ngược về ngày gốc. Đánh dấu "đã đi làm" mà làm ca dời chỗ là
 * hỏng theo cách rất khó lần ra.
 */
export async function setOccurrenceStatus(
  recurringRuleId: string,
  originalDate: string,
  status: OccurrenceStatus,
): Promise<string> {
  const existing = await db.exceptions
    .where('[recurringRuleId+originalDate]')
    .equals([recurringRuleId, originalDate])
    .first();

  if (existing && !existing.deletedAt) {
    await db.exceptions.update(existing.id, { status, updatedAt: nowISO() });
    return existing.id;
  }
  return upsertException({ type: 'STATUS', recurringRuleId, originalDate, status });
}

/** Xóa mềm — giữ tombstone để Phase 7 đồng bộ được thao tác xóa */
export async function softDeleteException(id: string): Promise<void> {
  const t = nowISO();
  await db.exceptions.update(id, { deletedAt: t, updatedAt: t });
}

/** Gỡ tombstone — nền của nút "Hoàn tác" */
export async function restoreException(id: string): Promise<void> {
  await db.exceptions.update(id, { deletedAt: undefined, updatedAt: nowISO() });
}

/** Đổi trạng thái của một exception đã biết id (dùng cho buổi loại ADD) */
export async function setExceptionStatus(
  id: string,
  status: OccurrenceStatus,
): Promise<void> {
  await db.exceptions.update(id, { status, updatedAt: nowISO() });
}

/** Sửa nội dung một buổi loại ADD — nó không neo vào rule nào để ghi đè */
export async function updateException(
  id: string,
  patch: Partial<Omit<ScheduleException, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db.exceptions.update(id, { ...patch, updatedAt: nowISO() });
}

/**
 * Dọn exception khi xóa một RecurringRule (yêu cầu ở mục 8.1).
 * Bỏ sót bước này sẽ để lại exception mồ côi, không bao giờ hiển thị và
 * cũng không xóa được qua giao diện.
 *
 * `at` cho phép người gọi ĐÓNG DẤU CÙNG MỘT MỐC cho rule và toàn bộ exception
 * của nó. Nhờ vậy lúc hoàn tác chỉ cần khôi phục đúng những bản ghi mang dấu
 * đó — không đụng tới exception vốn đã bị xóa từ trước, thứ mà người dùng
 * không hề muốn thấy quay lại.
 */
export async function softDeleteExceptionsOfRule(
  ruleId: string,
  at: string = nowISO(),
): Promise<number> {
  return db.exceptions
    .where('recurringRuleId')
    .equals(ruleId)
    .filter((e) => !e.deletedAt)
    .modify({ deletedAt: at, updatedAt: at });
}

/** Khôi phục đúng những exception bị xóa cùng lúc với rule */
export async function restoreExceptionsOfRule(
  ruleId: string,
  deletedAt: string,
): Promise<number> {
  return db.exceptions
    .where('recurringRuleId')
    .equals(ruleId)
    .filter((e) => e.deletedAt === deletedAt)
    .modify({ deletedAt: undefined, updatedAt: nowISO() });
}
