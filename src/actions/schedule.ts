// ═══════════════════════════════════════════════════════════════════════════
//  actions/schedule.ts — dịch thao tác của người dùng thành lệnh ghi DB
//
//  Tầng mỏng giữa component và db/repo. Có mặt ở đây vì một câu bấm nút như
//  "Lưu" ứng với tới bảy đường đi khác nhau tùy loại buổi và phạm vi sửa.
//  Nhét chỗ đó vào component là chôn logic khó nhất của Phase 1 vào giữa JSX.
//
//  Mọi hàm xóa đều trả về `undo` — nút "Hoàn tác" của UndoProvider chạy đúng
//  hàm này.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence, OccurrenceStatus } from '../types';
import type { DialogTarget, SubmitPayload } from '../components/EventDialog';
import {
  createEvent,
  restoreEvent,
  softDeleteEvent,
  updateEvent,
} from '../db/repo/events';
import {
  createRule,
  restoreRule,
  softDeleteRule,
  splitRuleFrom,
  updateRule,
} from '../db/repo/rules';
import {
  restoreException,
  setExceptionStatus,
  setOccurrenceStatus,
  softDeleteException,
  updateException,
  upsertException,
  upsertExceptionUndoable,
} from '../db/repo/exceptions';

// ─── Nhận dạng buổi ────────────────────────────────────────────────────────

/**
 * Ba loại buổi cần ba cách ghi khác hẳn nhau.
 *
 * Buổi loại ADD là chỗ dễ nhầm nhất: nó mang sourceType='RULE' nhưng KHÔNG
 * do rule nào sinh ra. Ghi exception cho nó sẽ tạo ra một exception trỏ tới
 * một buổi không tồn tại.
 */
export type OccurrenceRef =
  | { kind: 'SINGLE'; eventId: string }
  | { kind: 'ADD'; exceptionId: string }
  | { kind: 'RULE'; ruleId: string; originalDate: string };

export function refOf(o: Occurrence): OccurrenceRef {
  if (o.sourceType === 'SINGLE') return { kind: 'SINGLE', eventId: o.sourceId };
  if (o.exceptionId) return { kind: 'ADD', exceptionId: o.exceptionId };
  return { kind: 'RULE', ruleId: o.sourceId, originalDate: o.ruleOriginalDate ?? o.date };
}

/** Thao tác xóa: kèm sẵn cách hoàn tác */
export interface Undoable {
  /** Khóa i18n cho câu thông báo trên toast */
  messageKey: string;
  undo: () => Promise<void>;
}

// ─── Lưu form ──────────────────────────────────────────────────────────────

/**
 * Áp dụng nội dung form.
 *
 * ⚠️ Với phạm vi SERIES và FOLLOWING, `payload.date` bị BỎ QUA CÓ CHỦ Ý.
 * Đổi ngày ở mức cả chuỗi nghĩa là dời `startDate` của rule, tức là viết lại
 * cả những buổi đã diễn ra tháng trước — và bảng lương các tháng đã chốt sẽ
 * nhảy số. Muốn dời một buổi thì dùng phạm vi "chỉ buổi này".
 */
export async function applySubmit(
  payload: SubmitPayload,
  target: DialogTarget,
): Promise<void> {
  const common = {
    title: payload.title,
    categoryId: payload.categoryId,
    location: payload.location,
    clientName: payload.clientName,
    notes: payload.notes,
    ratePerHour: payload.ratePerHour,
    fixedAmount: payload.fixedAmount,
  };

  // ── Tạo mới ─────────────────────────────────────────────────────────────
  if (target.kind === 'create') {
    if (payload.recurrence) {
      await createRule({
        ...common,
        ...payload.recurrence,
        startDate: payload.date,
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
      });
    } else {
      await createEvent({
        ...common,
        date: payload.date,
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
        status: payload.status,
      });
    }
    return;
  }

  // ── Sửa sự kiện đơn ─────────────────────────────────────────────────────
  if (target.kind === 'event') {
    if (payload.recurrence) {
      // Bật lặp cho một sự kiện đơn = chuyển nó thành lịch lặp. Hai loại này
      // nằm ở hai bảng khác nhau nên phải tạo mới rồi xóa cũ, không sửa tại chỗ.
      await createRule({
        ...common,
        ...payload.recurrence,
        startDate: payload.date,
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
      });
      await softDeleteEvent(target.event.id);
      return;
    }
    await updateEvent(target.event.id, {
      ...common,
      date: payload.date,
      startTime: payload.startTime,
      durationMinutes: payload.durationMinutes,
      status: payload.status,
    });
    return;
  }

  // ── Sửa buổi của lịch lặp ───────────────────────────────────────────────
  const { rule, occurrence } = target;
  const originalDate = occurrence.ruleOriginalDate ?? occurrence.date;

  // Buổi loại ADD không thuộc rule nào — sửa thẳng chính exception đó.
  if (occurrence.exceptionId) {
    await updateException(occurrence.exceptionId, {
      newDate: payload.date,
      newStartTime: payload.startTime,
      newDurationMinutes: payload.durationMinutes,
      newTitle: payload.title,
      newCategoryId: payload.categoryId,
      newRatePerHour: payload.ratePerHour,
      newFixedAmount: payload.fixedAmount,
      status: payload.status,
    });
    return;
  }

  if (payload.scope === 'OCCURRENCE') {
    // Dời ngày thì phải là MOVE — chỉ MOVE mới khiến expandSchedule đọc
    // `newDate`. Các thay đổi khác dùng REPLACE.
    //
    // `newDate` vẫn được ghi cả khi không dời, để truy vấn hai chiều
    // (originalDate ∪ newDate) bắt được exception này từ cả hai phía.
    await upsertException({
      type: payload.date !== originalDate ? 'MOVE' : 'REPLACE',
      recurringRuleId: rule.id,
      originalDate,
      newDate: payload.date,
      newStartTime: payload.startTime,
      newDurationMinutes: payload.durationMinutes,
      newTitle: payload.title,
      newCategoryId: payload.categoryId,
      newRatePerHour: payload.ratePerHour,
      newFixedAmount: payload.fixedAmount,
      status: payload.status,
    });
    return;
  }

  const rulePatch = {
    ...common,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
    ...(payload.recurrence ?? {}),
  };

  if (payload.scope === 'FOLLOWING') {
    await splitRuleFrom(rule.id, originalDate, rulePatch);
    return;
  }

  // SERIES — startDate giữ nguyên, xem chú thích đầu hàm.
  if (!payload.recurrence) {
    // Tắt lặp ở mức cả chuỗi = chuỗi này không còn lý do tồn tại. Chuyển
    // thành một sự kiện đơn tại đúng ngày đang xem.
    await createEvent({
      ...common,
      date: payload.date,
      startTime: payload.startTime,
      durationMinutes: payload.durationMinutes,
      status: payload.status,
    });
    await softDeleteRule(rule.id);
    return;
  }
  await updateRule(rule.id, rulePatch);
}

// ─── Thao tác nhanh ────────────────────────────────────────────────────────

export async function setStatus(
  occurrence: Occurrence,
  status: OccurrenceStatus,
): Promise<void> {
  const ref = refOf(occurrence);
  switch (ref.kind) {
    case 'SINGLE':
      await updateEvent(ref.eventId, { status });
      return;
    case 'ADD':
      await setExceptionStatus(ref.exceptionId, status);
      return;
    case 'RULE':
      await setOccurrenceStatus(ref.ruleId, ref.originalDate, status);
      return;
  }
}

/**
 * Gỡ MỘT buổi khỏi lịch.
 *
 * Khác với "đánh dấu đã hủy": đánh dấu thì buổi vẫn nằm đó, gạch ngang, không
 * sinh thu nhập, và vẫn đếm được vào thống kê "kế hoạch vs thực tế". Gỡ thì
 * buổi biến mất hẳn khỏi lịch. Hai việc khác nhau nên có hai nút.
 */
export async function removeOccurrence(occurrence: Occurrence): Promise<Undoable> {
  const ref = refOf(occurrence);

  switch (ref.kind) {
    case 'SINGLE':
      await softDeleteEvent(ref.eventId);
      return {
        messageKey: 'toast.eventDeleted',
        undo: () => restoreEvent(ref.eventId),
      };

    case 'ADD':
      await softDeleteException(ref.exceptionId);
      return {
        messageKey: 'toast.occurrenceRemoved',
        undo: () => restoreException(ref.exceptionId),
      };

    case 'RULE': {
      const { revert } = await upsertExceptionUndoable({
        type: 'CANCEL',
        recurringRuleId: ref.ruleId,
        originalDate: ref.originalDate,
      });
      return { messageKey: 'toast.occurrenceRemoved', undo: revert };
    }
  }
}

/** Xóa CẢ CHUỖI lịch lặp, kèm toàn bộ ngoại lệ của nó */
export async function deleteSeries(ruleId: string): Promise<Undoable> {
  const deletedAt = await softDeleteRule(ruleId);
  return {
    messageKey: 'toast.seriesDeleted',
    undo: () => restoreRule(ruleId, deletedAt),
  };
}
