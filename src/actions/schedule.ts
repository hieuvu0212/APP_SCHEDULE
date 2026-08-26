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
import type { EventDraft } from '../core/copyWeek';
import type { DialogTarget, SubmitPayload } from '../components/EventDialog';
import {
  bulkCreateEvents,
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
 * ⚠️ `payload.date` mang nghĩa KHÁC NHAU theo từng phạm vi:
 *
 *   OCCURRENCE  ngày mới của RIÊNG buổi này (ghi exception MOVE)
 *   FOLLOWING   bị bỏ qua — mốc cắt là ngày gốc của buổi, không phải ô Ngày
 *   SERIES      NGÀY BẮT ĐẦU MỚI của cả chuỗi (đổi `startDate` của rule)
 *
 * Trước đây SERIES cũng bỏ qua ô Ngày, với lý do dời `startDate` sẽ viết lại
 * cả buổi đã diễn ra. Lý do đó đúng, nhưng cách xử lý thì sai: người dùng gõ
 * một ngày mới, bấm Lưu, và không có gì xảy ra — cũng không có gì báo. Im
 * lặng nuốt thao tác còn tệ hơn làm một việc gây tranh cãi.
 *
 * Giờ nó có tác dụng thật, và form đổi nhãn ô Ngày thành "Ngày bắt đầu chuỗi"
 * khi ở phạm vi này. Ai không muốn đụng vào quá khứ thì đã có sẵn phạm vi
 * FOLLOWING, vốn sinh ra đúng để làm việc đó.
 */
export async function applySubmit(
  payload: SubmitPayload,
  target: DialogTarget,
): Promise<Undoable> {
  const { db, newId, nowISO } = await import('../db/schema');
  let clientId: string | undefined;
  if (payload.clientName) {
    const name = payload.clientName.trim();
    const existing = (await db.clients.toArray()).find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      clientId = existing.id;
    } else {
      clientId = newId();
      const t = nowISO();
      await db.clients.add({ id: clientId, name, createdAt: t, updatedAt: t });
    }
  }

  const common = {
    title: payload.title,
    categoryId: payload.categoryId,
    location: payload.location,
    clientName: payload.clientName,
    clientId: clientId,
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
    const { db } = await import('../db/schema');
    const exc = await db.exceptions.get(exceptionId);
    if (!exc) throw new Error('Exception not found');

    const before = {
      newDate: exc.newDate,
      newStartTime: exc.newStartTime,
      newDurationMinutes: exc.newDurationMinutes,
      newTitle: exc.newTitle,
      newCategoryId: exc.newCategoryId,
      newClientId: exc.newClientId,
      newRatePerHour: exc.newRatePerHour,
      newFixedAmount: exc.newFixedAmount,
      status: exc.status,
    };
    await updateException(exceptionId, {
      newDate: payload.date,
      newStartTime: payload.startTime,
      newDurationMinutes: payload.durationMinutes,
      newTitle: payload.title,
      newCategoryId: payload.categoryId,
      newClientId: clientId,
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
      newClientId: clientId,
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

  // `startDate` chỉ đi kèm ở nhánh này. FOLLOWING không dùng tới vì mốc cắt
  // của nó là ngày gốc của buổi; OCCURRENCE thì ghi exception chứ không đụng
  // vào rule.
  const seriesPatch = { ...rulePatch, startDate: payload.date };
  const beforeRule = pick(rule, seriesPatch);
  await updateRule(rule.id, seriesPatch);
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

/**
 * Ghi các buổi của một kế hoạch nhân bản tuần.
 *
 * Nhận `EventDraft[]` đã dựng sẵn chứ không tự tính lại: hộp thoại xác nhận
 * hiển thị con số lấy từ đúng mảng này, nên không có đường nào để "đếm một
 * đằng ghi một nẻo".
 *
 * Hoàn tác xóa mềm toàn bộ buổi vừa tạo — kể cả khi người dùng đã sửa vài
 * buổi trong lúc toast còn hiện. Đó là hành vi đúng: họ đang rút lại nguyên
 * thao tác chép, không phải rút lại từng buổi.
 */
export async function copyWeek(drafts: EventDraft[]): Promise<Undoable> {
  const ids = await bulkCreateEvents(drafts);
  return {
    messageKey: 'toast.weekCopied',
    undo: async () => {
      await Promise.all(ids.map((id) => softDeleteEvent(id)));
    },
  };
}

/** Xóa CẢ CHUỖI lịch lặp, kèm toàn bộ ngoại lệ của nó */
export async function deleteSeries(ruleId: string): Promise<Undoable> {
  const deletedAt = await softDeleteRule(ruleId);
  return {
    messageKey: 'toast.seriesDeleted',
    undo: () => restoreRule(ruleId, deletedAt),
  };
}
