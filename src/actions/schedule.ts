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
): Promise<Undoable> {
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
      const ruleId = await createRule({
        ...common,
        ...payload.recurrence,
        startDate: payload.date,
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
      });
      return {
        messageKey: 'toast.created',
        undo: async () => void (await softDeleteRule(ruleId)),
      };
    }

    const eventId = await createEvent({
      ...common,
      date: payload.date,
      startTime: payload.startTime,
      durationMinutes: payload.durationMinutes,
      status: payload.status,
    });
    return { messageKey: 'toast.created', undo: () => softDeleteEvent(eventId) };
  }

  // ── Sửa sự kiện đơn ─────────────────────────────────────────────────────
  if (target.kind === 'event') {
    const event = target.event;

    if (payload.recurrence) {
      // Bật lặp cho một sự kiện đơn = chuyển nó thành lịch lặp. Hai loại này
      // nằm ở hai bảng khác nhau nên phải tạo mới rồi xóa cũ, không sửa tại chỗ.
      const ruleId = await createRule({
        ...common,
        ...payload.recurrence,
        startDate: payload.date,
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
      });
      await softDeleteEvent(event.id);
      return {
        messageKey: 'toast.updated',
        // Hoàn tác phải đảo CẢ HAI nửa. Chỉ xóa rule mới thì sự kiện gốc vẫn
        // nằm trong thùng rác và người dùng mất trắng.
        undo: async () => {
          await softDeleteRule(ruleId);
          await restoreEvent(event.id);
        },
      };
    }

    const eventPatch = {
      ...common,
      date: payload.date,
      startTime: payload.startTime,
      durationMinutes: payload.durationMinutes,
      status: payload.status,
    };
    const before = pick(event, eventPatch);
    await updateEvent(event.id, eventPatch);
    return {
      messageKey: 'toast.updated',
      undo: () => updateEvent(event.id, before),
    };
  }

  // ── Sửa buổi của lịch lặp ───────────────────────────────────────────────
  const { rule, occurrence } = target;
  const originalDate = occurrence.ruleOriginalDate ?? occurrence.date;

  // Buổi loại ADD không thuộc rule nào — sửa thẳng chính exception đó.
  if (occurrence.exceptionId) {
    const exceptionId = occurrence.exceptionId;
    // Buổi ADD được định nghĩa TRỌN VẸN bởi chính exception của nó, nên trạng
    // thái đang hiển thị chính là trạng thái cần khôi phục — không phải đọc DB.
    const before = {
      newDate: occurrence.date,
      newStartTime: occurrence.startTime,
      newDurationMinutes: occurrence.durationMinutes,
      newTitle: occurrence.title,
      newCategoryId: occurrence.categoryId,
      newRatePerHour: occurrence.ratePerHour,
      newFixedAmount: occurrence.fixedAmount,
      status: occurrence.status,
    };
    await updateException(exceptionId, {
      newDate: payload.date,
      newStartTime: payload.startTime,
      newDurationMinutes: payload.durationMinutes,
      newTitle: payload.title,
      newCategoryId: payload.categoryId,
      newRatePerHour: payload.ratePerHour,
      newFixedAmount: payload.fixedAmount,
      status: payload.status,
    });
    return {
      messageKey: 'toast.updated',
      undo: () => updateException(exceptionId, before),
    };
  }

  if (payload.scope === 'OCCURRENCE') {
    // Dời ngày thì phải là MOVE — chỉ MOVE mới khiến expandSchedule đọc
    // `newDate`. Các thay đổi khác dùng REPLACE.
    //
    // `newDate` vẫn được ghi cả khi không dời, để truy vấn hai chiều
    // (originalDate ∪ newDate) bắt được exception này từ cả hai phía.
    const { revert } = await upsertExceptionUndoable({
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
    return { messageKey: 'toast.updated', undo: revert };
  }

  const rulePatch = {
    ...common,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
    ...(payload.recurrence ?? {}),
  };

  if (payload.scope === 'FOLLOWING') {
    const { revert } = await splitRuleFrom(rule.id, originalDate, rulePatch);
    return { messageKey: 'toast.seriesSplit', undo: revert };
  }

  // SERIES — startDate giữ nguyên, xem chú thích đầu hàm.
  if (!payload.recurrence) {
    // Tắt lặp ở mức cả chuỗi = chuỗi này không còn lý do tồn tại. Chuyển
    // thành một sự kiện đơn tại đúng ngày đang xem.
    const eventId = await createEvent({
      ...common,
      date: payload.date,
      startTime: payload.startTime,
      durationMinutes: payload.durationMinutes,
      status: payload.status,
    });
    const deletedAt = await softDeleteRule(rule.id);
    return {
      messageKey: 'toast.updated',
      undo: async () => {
        await softDeleteEvent(eventId);
        await restoreRule(rule.id, deletedAt);
      },
    };
  }

  const beforeRule = pick(rule, rulePatch);
  await updateRule(rule.id, rulePatch);
  return {
    messageKey: 'toast.updated',
    undo: () => updateRule(rule.id, beforeRule),
  };
}

/**
 * Chụp giá trị HIỆN TẠI của đúng những trường sắp bị `patch` ghi đè.
 *
 * Chỉ lấy các khóa có trong patch, không chụp cả bản ghi: chụp cả bản ghi rồi
 * ghi ngược lại sẽ đè luôn `updatedAt` và những thay đổi khác xảy ra trong
 * lúc chờ người dùng bấm Hoàn tác.
 *
 * Trường vốn không tồn tại sẽ được chụp là `undefined`, và Dexie hiểu đó là
 * lệnh xóa thuộc tính — đúng thứ ta cần để quay về trạng thái cũ.
 */
function pick<T extends object, P extends object>(source: T, patch: P): Partial<P> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    out[key] = (source as unknown as Record<string, unknown>)[key];
  }
  return out as Partial<P>;
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

// ─── Kéo–thả ───────────────────────────────────────────────────────────────

/**
 * Dời một buổi sang ngày/giờ khác — dùng cho thao tác kéo trên lưới tuần.
 *
 * Phạm vi luôn là CHỈ BUỔI NÀY. Kéo một khối trên lưới có nghĩa rõ ràng là
 * "dời buổi này", không ai kéo một khối mà mong cả chuỗi sáu tháng dịch theo.
 * Muốn đổi cả chuỗi thì mở form, ở đó phạm vi được hỏi thẳng.
 *
 * Có hoàn tác vì đây là chỗ dễ thả nhầm nhất trong toàn ứng dụng — lệch một
 * cột là buổi sang hẳn ngày khác mà mắt không kịp nhận ra.
 */
export async function moveOccurrence(
  occurrence: Occurrence,
  newDate: string,
  newStartTime: string,
): Promise<Undoable> {
  const ref = refOf(occurrence);

  switch (ref.kind) {
    case 'SINGLE': {
      const before = { date: occurrence.date, startTime: occurrence.startTime };
      await updateEvent(ref.eventId, { date: newDate, startTime: newStartTime });
      return {
        messageKey: 'toast.occurrenceMoved',
        undo: () => updateEvent(ref.eventId, before),
      };
    }

    case 'ADD': {
      const before = { newDate: occurrence.date, newStartTime: occurrence.startTime };
      await updateException(ref.exceptionId, { newDate, newStartTime });
      return {
        messageKey: 'toast.occurrenceMoved',
        undo: () => updateException(ref.exceptionId, before),
      };
    }

    case 'RULE': {
      // Chỉ type='MOVE' mới khiến expandSchedule đọc `newDate`. Nếu kéo mà
      // ngày không đổi (chỉ đổi giờ) thì dùng REPLACE — ghi MOVE với newDate
      // trùng originalDate cũng chạy, nhưng làm sai nghĩa của bản ghi.
      const { revert } = await upsertExceptionUndoable({
        type: newDate !== ref.originalDate ? 'MOVE' : 'REPLACE',
        recurringRuleId: ref.ruleId,
        originalDate: ref.originalDate,
        newDate,
        newStartTime,
        newDurationMinutes: occurrence.durationMinutes,
        status: occurrence.status,
      });
      return { messageKey: 'toast.occurrenceMoved', undo: revert };
    }
  }
}

/** Đổi thời lượng một buổi — dùng cho thao tác kéo mép dưới của khối */
export async function resizeOccurrence(
  occurrence: Occurrence,
  newDurationMinutes: number,
): Promise<Undoable> {
  const ref = refOf(occurrence);

  switch (ref.kind) {
    case 'SINGLE': {
      const before = { durationMinutes: occurrence.durationMinutes };
      await updateEvent(ref.eventId, { durationMinutes: newDurationMinutes });
      return {
        messageKey: 'toast.occurrenceResized',
        undo: () => updateEvent(ref.eventId, before),
      };
    }

    case 'ADD': {
      const before = { newDurationMinutes: occurrence.durationMinutes };
      await updateException(ref.exceptionId, { newDurationMinutes });
      return {
        messageKey: 'toast.occurrenceResized',
        undo: () => updateException(ref.exceptionId, before),
      };
    }

    case 'RULE': {
      // ⚠️ Buổi này có thể ĐANG mang exception loại MOVE. Ghi đè `type` thành
      // 'RESIZE' sẽ khiến expandSchedule bỏ qua `newDate` (chỉ MOVE mới đọc
      // trường đó) và buổi nhảy ngược về ngày gốc — co giãn một cái mà ca
      // chạy sang ngày khác.
      const wasMoved = occurrence.date !== ref.originalDate;

      const { revert } = await upsertExceptionUndoable({
        type: wasMoved ? 'MOVE' : 'RESIZE',
        recurringRuleId: ref.ruleId,
        originalDate: ref.originalDate,
        newDate: occurrence.date,
        newStartTime: occurrence.startTime,
        newDurationMinutes,
        status: occurrence.status,
      });
      return { messageKey: 'toast.occurrenceResized', undo: revert };
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
