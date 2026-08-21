// ═══════════════════════════════════════════════════════════════════════════
//  core/expand.ts — mở rộng lịch lặp + hợp nhất ngoại lệ
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Đây là trái tim của hệ thống: (rules, exceptions, events, cửa sổ)
//  → danh sách Occurrence để mọi view render.
//
//  ⚠️  ĐIỂM DỄ SAI NHẤT — đọc kỹ:
//  Exception phải được nạp theo HAI CHIỀU: `originalDate` NẰM TRONG cửa sổ
//  (buổi bị hủy/sửa) VÀ `newDate` NẰM TRONG cửa sổ (buổi từ nơi khác dời
//  VÀO). Thiếu vế thứ hai thì buổi đã dời sang tuần khác sẽ BIẾN MẤT hoàn
//  toàn, và loại ADD cũng không bao giờ hiển thị.
//  Xem db/repo/exceptions.ts → getExceptionsInWindow().
// ═══════════════════════════════════════════════════════════════════════════

import type {
  Occurrence,
  OccurrenceStatus,
  RecurringRule,
  ScheduleException,
  SingleEvent,
} from '../types';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  endsNextDay,
  parseDateKey,
  startOfWeek,
  toAbsolute,
} from './time';

/** Chặn vòng lặp chạy vô hạn nếu dữ liệu hỏng (~55 năm) */
const MAX_WALK_DAYS = 20_000;

export interface ExpandInput {
  rules: RecurringRule[];
  exceptions: ScheduleException[];
  events: SingleEvent[];
  /** "YYYY-MM-DD", bao gồm */
  windowStart: string;
  /** "YYYY-MM-DD", bao gồm */
  windowEnd: string;
  /** Buổi đã qua thời điểm này thì mặc định coi là hoàn thành */
  now?: Date;
  autoCompletePast?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────

/** Rule có sinh occurrence vào đúng ngày `date` không */
export function ruleMatchesDate(rule: RecurringRule, date: string): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false; // endDate BAO GỒM

  switch (rule.freq) {
    case 'DAILY':
      return daysBetween(rule.startDate, date) % Math.max(1, rule.interval) === 0;

    case 'WEEKLY': {
      if (!rule.daysOfWeek?.length) return false;
      if (!rule.daysOfWeek.includes(dayOfWeek(date))) return false;
      // Mốc tính chu kỳ luôn dùng tuần bắt đầu từ Thứ Hai, để kết quả không
      // đổi khi người dùng bật/tắt weekStartsOn ở phần cài đặt hiển thị.
      const w0 = startOfWeek(rule.startDate, 1);
      const w1 = startOfWeek(date, 1);
      const weeks = daysBetween(w0, w1) / 7;
      return weeks >= 0 && weeks % Math.max(1, rule.interval) === 0;
    }

    case 'MONTHLY': {
      if (!rule.dayOfMonth) return false;
      const d = parseDateKey(date);
      if (d.getDate() !== rule.dayOfMonth) return false;
      const s = parseDateKey(rule.startDate);
      const months =
        (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
      return months >= 0 && months % Math.max(1, rule.interval) === 0;
    }
  }
}

/**
 * Sinh các ngày mà rule tạo occurrence, giới hạn trong [from, to].
 * Đi bộ theo ngày từ startDate — đơn giản và khó sai hơn công thức đóng,
 * và với quy mô cá nhân (vài nghìn vòng lặp) chi phí không đáng kể.
 */
export function occurrenceDates(rule: RecurringRule, from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = rule.startDate;
  let index = 0;
  let guard = 0;

  const hardEnd = rule.endDate && rule.endDate < to ? rule.endDate : to;

  while (cursor <= hardEnd && guard++ < MAX_WALK_DAYS) {
    if (ruleMatchesDate(rule, cursor)) {
      if (rule.count != null && index >= rule.count) break;
      index++;
      if (cursor >= from) out.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────

function makeOccurrence(args: {
  key: string;
  sourceType: 'RULE' | 'SINGLE';
  sourceId: string;
  ruleOriginalDate?: string;
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  status: OccurrenceStatus;
  ratePerHour?: number;
  fixedAmount?: number;
  location?: string;
  clientName?: string;
  notes?: string;
}): Occurrence {
  const startAbs = toAbsolute(args.date, args.startTime);
  return {
    ...args,
    endsNextDay: endsNextDay(args.startTime, args.durationMinutes),
    startAbs,
    endAbs: startAbs + args.durationMinutes * 60_000,
    hasConflict: false,
    conflictWith: [],
  };
}

function resolveStatus(
  explicit: OccurrenceStatus | undefined,
  endAbs: number,
  now: Date | undefined,
  autoComplete: boolean,
): OccurrenceStatus {
  if (explicit) return explicit;
  if (autoComplete && now && endAbs <= now.getTime()) return 'COMPLETED';
  return 'SCHEDULED';
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * Mở rộng toàn bộ lịch cho cửa sổ [windowStart, windowEnd].
 *
 * Thứ tự xử lý:
 *   1. SingleEvent rơi vào cửa sổ
 *   2. Mở rộng từng RecurringRule
 *   3. Áp exception theo (ruleId, originalDate)
 *   4. Kéo vào các occurrence bị MOVE TỪ NGOÀI cửa sổ VÀO trong  ← hay bị quên
 *   5. Chèn các exception loại ADD
 */
export function expandSchedule(input: ExpandInput): Occurrence[] {
  const {
    rules, exceptions, events, windowStart, windowEnd,
    now, autoCompletePast = true,
  } = input;

  const live = <T extends { deletedAt?: string }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
  const liveRules = live(rules);
  const liveExc = live(exceptions);
  const liveEvents = live(events);

  const ruleById = new Map(liveRules.map((r) => [r.id, r]));
  const inWindow = (d: string) => d >= windowStart && d <= windowEnd;

  // Chỉ mục exception theo (ruleId, originalDate)
  const excByKey = new Map<string, ScheduleException>();
  for (const e of liveExc) {
    if (e.type !== 'ADD' && e.recurringRuleId && e.originalDate) {
      excByKey.set(`${e.recurringRuleId}|${e.originalDate}`, e);
    }
  }

  const out: Occurrence[] = [];

  // ── 1. Sự kiện đơn lẻ ───────────────────────────────────────────────────
  for (const ev of liveEvents) {
    if (!inWindow(ev.date)) continue;
    const o = makeOccurrence({
      key: `single:${ev.id}`,
      sourceType: 'SINGLE',
      sourceId: ev.id,
      title: ev.title,
      categoryId: ev.categoryId,
      date: ev.date,
      startTime: ev.startTime,
      durationMinutes: ev.durationMinutes,
      status: ev.status,
      ratePerHour: ev.ratePerHour,
      fixedAmount: ev.fixedAmount,
      location: ev.location,
      clientName: ev.clientName,
      notes: ev.notes,
    });
    o.status = resolveStatus(
      ev.status === 'SCHEDULED' ? undefined : ev.status,
      o.endAbs, now, autoCompletePast,
    );
    out.push(o);
  }

  /** Dựng occurrence từ rule + exception (nếu có), trả về null nếu bị hủy */
  const materialize = (
    rule: RecurringRule,
    originalDate: string,
    exc: ScheduleException | undefined,
  ): Occurrence | null => {
    if (exc?.type === 'CANCEL') return null;

    const date = exc?.type === 'MOVE' && exc.newDate ? exc.newDate : originalDate;
    if (!inWindow(date)) return null;

    const o = makeOccurrence({
      key: `rule:${rule.id}:${originalDate}`,
      sourceType: 'RULE',
      sourceId: rule.id,
      ruleOriginalDate: originalDate,
      title: exc?.newTitle ?? rule.title,
      categoryId: exc?.newCategoryId ?? rule.categoryId,
      date,
      startTime: exc?.newStartTime ?? rule.startTime,
      durationMinutes: exc?.newDurationMinutes ?? rule.durationMinutes,
      status: 'SCHEDULED',
      ratePerHour: exc?.newRatePerHour ?? rule.ratePerHour,
      fixedAmount: exc?.newFixedAmount ?? rule.fixedAmount,
      location: rule.location,
      clientName: rule.clientName,
      notes: rule.notes,
    });
    o.status = resolveStatus(exc?.status, o.endAbs, now, autoCompletePast);
    return o;
  };

  // ── 2 + 3. Mở rộng rule rồi áp exception ────────────────────────────────
  const emitted = new Set<string>();
  for (const rule of liveRules) {
    for (const d of occurrenceDates(rule, windowStart, windowEnd)) {
      const exc = excByKey.get(`${rule.id}|${d}`);
      const o = materialize(rule, d, exc);
      if (o) {
        out.push(o);
        emitted.add(o.key);
      }
    }
  }

  // ── 4. Occurrence bị MOVE TỪ NGOÀI cửa sổ VÀO TRONG ─────────────────────
  // Không có bước này, dời một ca sang tuần sau rồi mở tuần sau lên sẽ
  // không thấy nó ở đâu cả.
  for (const e of liveExc) {
    if (e.type !== 'MOVE' || !e.newDate || !e.recurringRuleId || !e.originalDate) continue;
    if (!inWindow(e.newDate)) continue;
    if (inWindow(e.originalDate)) continue; // đã xử lý ở bước 2+3

    const rule = ruleById.get(e.recurringRuleId);
    if (!rule) continue;

    const key = `rule:${rule.id}:${e.originalDate}`;
    if (emitted.has(key)) continue;

    const o = materialize(rule, e.originalDate, e);
    if (o) {
      out.push(o);
      emitted.add(o.key);
    }
  }

  // ── 5. Exception loại ADD ───────────────────────────────────────────────
  for (const e of liveExc) {
    if (e.type !== 'ADD' || !e.newDate || !inWindow(e.newDate)) continue;

    const base = e.recurringRuleId ? ruleById.get(e.recurringRuleId) : undefined;
    const o = makeOccurrence({
      key: `add:${e.id}`,
      sourceType: 'RULE',
      sourceId: e.recurringRuleId ?? e.id,
      title: e.newTitle ?? base?.title ?? '(không tên)',
      categoryId: e.newCategoryId ?? base?.categoryId ?? '',
      date: e.newDate,
      startTime: e.newStartTime ?? base?.startTime ?? '00:00',
      durationMinutes: e.newDurationMinutes ?? base?.durationMinutes ?? 60,
      status: 'SCHEDULED',
      ratePerHour: e.newRatePerHour ?? base?.ratePerHour,
      fixedAmount: e.newFixedAmount ?? base?.fixedAmount,
      location: base?.location,
      clientName: base?.clientName,
      notes: e.reason ?? base?.notes,
    });
    o.status = resolveStatus(e.status, o.endAbs, now, autoCompletePast);
    // Buổi ADD tự nó là một exception — ghi lại id để tầng thao tác sửa/xóa
    // đúng bản ghi, thay vì đi ghi exception cho một rule không sinh ra nó.
    o.exceptionId = e.id;
    out.push(o);
  }

  out.sort((a, b) => a.startAbs - b.startAbs || a.key.localeCompare(b.key));
  return out;
}
