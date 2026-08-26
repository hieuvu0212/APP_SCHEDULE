// ═══════════════════════════════════════════════════════════════════════════
//  core/ics.ts — xuất lịch ra định dạng iCalendar (RFC 5545)
//
//  HÀM THUẦN. Không import React, không import Dexie, không đọc đồng hồ.
//
//  Đưa lịch sang Google Calendar, Apple Calendar, Outlook, hay ứng dụng lịch
//  mặc định của điện thoại. Khác với PDF/PNG ở chỗ căn bản: PDF là ảnh chụp
//  để đọc, .ics là DỮ LIỆU SỐNG — buổi học vào thẳng lịch, có nhắc nhở của
//  hệ điều hành, và lịch lặp vẫn là một chuỗi sửa được chứ không phải 52 mục
//  rời rạc.
//
//  ─── QUYẾT ĐỊNH LỚN NHẤT: GIỜ TRÔI NỔI (FLOATING TIME) ────────────────────
//
//  RFC 5545 cho ba cách ghi thời điểm:
//
//      DTSTART:20260824T180000Z              ← UTC
//      DTSTART;TZID=Asia/Ho_Chi_Minh:2026…   ← có múi giờ
//      DTSTART:20260824T180000               ← TRÔI NỔI, ta dùng cái này
//
//  Giờ trôi nổi nghĩa là "18:00 ở bất cứ đâu bạn đang đứng". Đó CHÍNH XÁC là
//  mô hình của ứng dụng này: `types/index.ts` nói rõ ca học 8h sáng phải là 8h
//  sáng ở mọi múi giờ, và tuyệt đối không lưu lịch dưới dạng UTC timestamp.
//
//  Chọn UTC thì bay sang Nhật là toàn bộ lịch lệch hai tiếng. Chọn TZID thì
//  phải nhúng cả khối VTIMEZONE với luật giờ mùa hè — hàng chục dòng, và sai
//  một luật là lệch một tiếng trong nửa năm. Giờ trôi nổi vừa đúng mô hình
//  vừa là thứ ít mã nhất. Hiếm khi cả hai điều đó trùng nhau.
//
//  ─── BỐN LOẠI DỮ LIỆU, BỐN CÁCH ÁNH XẠ ────────────────────────────────────
//
//      SingleEvent           → một VEVENT
//      RecurringRule         → một VEVENT + RRULE
//      exception CANCEL      → EXDATE trên VEVENT của rule
//      exception MOVE/REPLACE/RESIZE/STATUS
//                            → VEVENT riêng mang RECURRENCE-ID trỏ về buổi gốc
//      exception ADD         → một VEVENT độc lập
//
//  Cách này giữ lịch lặp là MỘT mục trong ứng dụng lịch. Cách dễ hơn — mở
//  rộng hết thành từng buổi rời — cho ra file đúng nhưng người dùng nhận về
//  52 mục không sửa hàng loạt được, và đó là mất mát thật.
// ═══════════════════════════════════════════════════════════════════════════

import type { RecurringRule, ScheduleException, SingleEvent } from '../types';
import { addDays, endTimeOf, endsNextDay } from './time';

export interface IcsInput {
  rules: RecurringRule[];
  exceptions: ScheduleException[];
  events: SingleEvent[];
  /** Tra tên danh mục để đưa vào CATEGORIES */
  categoryName: (id: string) => string | undefined;
  /** Dấu thời gian sinh file, ISO UTC. Truyền vào để hàm thuần. */
  now: string;
  /** Tên hiển thị của lịch trong ứng dụng nhận */
  calendarName: string;
}

// ─── Escape và gấp dòng ────────────────────────────────────────────────────

/**
 * Escape theo RFC 5545 §3.3.11.
 *
 * ⚠️ DẤU GẠCH CHÉO NGƯỢC PHẢI ĐỔI TRƯỚC. Đổi sau thì chính những dấu vừa
 * thêm vào cho `;` và `,` lại bị escape lần nữa, và ghi chú có dấu phẩy sẽ ra
 * `\\,` — ứng dụng lịch hiển thị đúng chuỗi đó, kèm dấu gạch chéo thừa.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Gấp dòng dài theo RFC 5545 §3.1: tối đa 75 OCTET, dòng tiếp theo bắt đầu
 * bằng một khoảng trắng.
 *
 * ⚠️ ĐẾM THEO BYTE UTF-8, KHÔNG PHẢI THEO KÝ TỰ.
 *
 * "Học Toán" chỉ 8 ký tự nhưng 11 byte; chữ Hán mỗi chữ 3 byte. Đếm theo ký
 * tự sẽ cho ra dòng vượt giới hạn với tiếng Việt và tiếng Trung — tức là với
 * gần như mọi dữ liệu thật của ứng dụng này. Trình phân tích nghiêm ngặt sẽ
 * từ chối cả file.
 *
 * Và không được cắt GIỮA một ký tự nhiều byte: nửa ký tự là byte rác.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  // Dòng nối tiếp mất 1 octet cho khoảng trắng đầu dòng.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current) parts.push(current);

  return parts.join('\r\n ');
}

// ─── Định dạng ngày giờ ────────────────────────────────────────────────────

/** "2026-08-24" + "18:00" → "20260824T180000" (giờ trôi nổi) */
export function icsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

/** "2026-08-24" → "20260824" */
export function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

/** ISO UTC → "20260824T103000Z" — chỉ dùng cho DTSTAMP, không phải giờ lịch */
export function icsStamp(iso: string): string {
  return `${iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(/Z$/, '')}Z`;
}

// ─── RRULE ─────────────────────────────────────────────────────────────────

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * `RecurringRule` → chuỗi RRULE.
 *
 * `endDate` của ứng dụng BAO GỒM ngày đó, và `UNTIL` của RFC 5545 cũng bao
 * gồm — nhưng chỉ khi so cùng dạng. `UNTIL` dạng chỉ-ngày so với DTSTART dạng
 * ngày-giờ là trường hợp mà các thư viện xử lý khác nhau, nên ở đây `UNTIL`
 * luôn viết đủ ngày-giờ, lấy cuối ngày đó.
 */
export function buildRrule(rule: RecurringRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];

  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);

  if (rule.freq === 'WEEKLY' && rule.daysOfWeek?.length) {
    // Sắp xếp để file ổn định giữa các lần xuất — hai file cùng dữ liệu phải
    // giống hệt nhau, nếu không thì không so được bằng diff.
    const days = [...rule.daysOfWeek].sort((a, b) => a - b).map((d) => BYDAY[d]);
    parts.push(`BYDAY=${days.join(',')}`);
  }

  if (rule.freq === 'MONTHLY' && rule.dayOfMonth) {
    parts.push(`BYMONTHDAY=${rule.dayOfMonth}`);
  }

  // COUNT và UNTIL loại trừ nhau theo đặc tả. `count` ưu tiên vì nó là giới
  // hạn chặt hơn và người dùng đặt nó tường minh.
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  else if (rule.endDate) parts.push(`UNTIL=${icsDate(rule.endDate)}T235959`);

  return parts.join(';');
}

// ─── Dựng VEVENT ───────────────────────────────────────────────────────────

interface EventFields {
  uid: string;
  stamp: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  title: string;
  location?: string;
  description?: string;
  category?: string;
  cancelled?: boolean;
  rrule?: string;
  exdates?: string[];
  recurrenceId?: string;
}

function veventLines(f: EventFields): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];

  lines.push(`UID:${f.uid}`);
  lines.push(`DTSTAMP:${f.stamp}`);
  if (f.recurrenceId) lines.push(`RECURRENCE-ID:${f.recurrenceId}`);

  lines.push(`DTSTART:${icsDateTime(f.date, f.startTime)}`);

  // Giờ kết thúc phải tính qua `endTimeOf` + `endsNextDay`, không được cộng
  // chuỗi giờ. Ca 22:00–02:00 kết thúc NGÀY HÔM SAU, và một DTEND nhỏ hơn
  // DTSTART là file hỏng — ứng dụng lịch sẽ bỏ qua cả mục đó.
  const endDate = endsNextDay(f.startTime, f.durationMinutes) ? addDays(f.date, 1) : f.date;
  lines.push(`DTEND:${icsDateTime(endDate, endTimeOf(f.startTime, f.durationMinutes))}`);

  if (f.rrule) lines.push(`RRULE:${f.rrule}`);
  for (const ex of f.exdates ?? []) lines.push(`EXDATE:${ex}`);

  lines.push(`SUMMARY:${escapeText(f.title)}`);
  if (f.location) lines.push(`LOCATION:${escapeText(f.location)}`);
  if (f.description) lines.push(`DESCRIPTION:${escapeText(f.description)}`);
  if (f.category) lines.push(`CATEGORIES:${escapeText(f.category)}`);
  lines.push(`STATUS:${f.cancelled ? 'CANCELLED' : 'CONFIRMED'}`);

  lines.push('END:VEVENT');
  return lines;
}

/** Ghép ghi chú và tên đối tượng thành phần mô tả */
function describe(clientName?: string, notes?: string): string | undefined {
  const parts = [clientName, notes].filter((s): s is string => Boolean(s?.trim()));
  return parts.length > 0 ? parts.join('\n') : undefined;
}

// ─── Điểm vào ──────────────────────────────────────────────────────────────

/**
 * Dựng nội dung file .ics từ dữ liệu thô — rule, exception, event.
 *
 * Nhận dữ liệu THÔ chứ không nhận `Occurrence[]` đã mở rộng, vì chỉ ở dạng
 * thô mới còn thông tin "đây là một chuỗi lặp". Occurrence đã mở rộng thì
 * chuỗi đã bị san phẳng và không dựng lại RRULE được nữa.
 */
export function buildIcs(input: IcsInput): string {
  const stamp = icsStamp(input.now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Schedule System//VI//EN',
    'CALSCALE:GREGORIAN',
    // Cả hai khóa cùng nghĩa: X-WR-CALNAME là của Apple/Google, NAME là của
    // RFC 7986. Ứng dụng lịch hiểu cái nào thì dùng cái đó.
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    `NAME:${escapeText(input.calendarName)}`,
  ];

  const live = <T extends { deletedAt?: string }>(rows: T[]) =>
    rows.filter((r) => !r.deletedAt);

  const rules = live(input.rules);
  const exceptions = live(input.exceptions);
  const events = live(input.events);

  // ── Sự kiện đơn lẻ ──
  for (const e of events) {
    lines.push(
      ...veventLines({
        uid: `event-${e.id}@personal-schedule`,
        stamp,
        date: e.date,
        startTime: e.startTime,
        durationMinutes: e.durationMinutes,
        title: e.title,
        location: e.location,
        description: describe(undefined, e.notes),
        category: input.categoryName(e.categoryId),
        cancelled: e.status === 'CANCELLED',
      }),
    );
  }

  // ── Lịch lặp, kèm EXDATE cho buổi bị hủy ──
  const byRule = new Map<string, ScheduleException[]>();
  for (const x of exceptions) {
    if (!x.recurringRuleId) continue;
    const list = byRule.get(x.recurringRuleId) ?? [];
    list.push(x);
    byRule.set(x.recurringRuleId, list);
  }

  for (const rule of rules) {
    const own = byRule.get(rule.id) ?? [];

    // CANCEL và STATUS='CANCELLED' đều nghĩa là buổi đó không diễn ra.
    const exdates = own
      .filter((x) => x.type === 'CANCEL' || x.status === 'CANCELLED')
      .map((x) => x.originalDate)
      .filter((d): d is string => Boolean(d))
      .sort()
      .map((d) => icsDateTime(d, rule.startTime));

    lines.push(
      ...veventLines({
        uid: `rule-${rule.id}@personal-schedule`,
        stamp,
        date: rule.startDate,
        startTime: rule.startTime,
        durationMinutes: rule.durationMinutes,
        title: rule.title,
        location: rule.location,
        description: describe(undefined, rule.notes),
        category: input.categoryName(rule.categoryId),
        rrule: buildRrule(rule),
        exdates,
      }),
    );

    // Buổi bị dời hoặc sửa riêng → VEVENT ghi đè, cùng UID với chuỗi và mang
    // RECURRENCE-ID trỏ về NGÀY GỐC. Đó là cách RFC 5545 diễn đạt "riêng buổi
    // này thì khác", và ứng dụng lịch sẽ thay thế đúng một buổi trong chuỗi.
    for (const x of own) {
      if (x.type === 'CANCEL' || x.status === 'CANCELLED') continue;
      if (!x.originalDate) continue;
      if (x.type !== 'MOVE' && x.type !== 'REPLACE' && x.type !== 'RESIZE') continue;

      lines.push(
        ...veventLines({
          uid: `rule-${rule.id}@personal-schedule`,
          stamp,
          recurrenceId: icsDateTime(x.originalDate, rule.startTime),
          date: x.newDate ?? x.originalDate,
          startTime: x.newStartTime ?? rule.startTime,
          durationMinutes: x.newDurationMinutes ?? rule.durationMinutes,
          title: x.newTitle ?? rule.title,
          location: rule.location,
          description: describe(undefined, x.reason ?? rule.notes),
          category: input.categoryName(x.newCategoryId ?? rule.categoryId),
        }),
      );
    }
  }

  // ── Buổi thêm tay (ADD): không thuộc chuỗi nào, đứng riêng ──
  for (const x of exceptions) {
    if (x.type !== 'ADD' || !x.newDate) continue;
    lines.push(
      ...veventLines({
        uid: `add-${x.id}@personal-schedule`,
        stamp,
        date: x.newDate,
        startTime: x.newStartTime ?? '00:00',
        durationMinutes: x.newDurationMinutes ?? 60,
        title: x.newTitle ?? '',
        description: x.reason,
        category: x.newCategoryId ? input.categoryName(x.newCategoryId) : undefined,
        cancelled: x.status === 'CANCELLED',
      }),
    );
  }

  lines.push('END:VCALENDAR');

  // CRLF là bắt buộc theo RFC 5545 §3.1, không phải tùy chọn thẩm mỹ. Một số
  // trình phân tích nghiêm ngặt từ chối file dùng LF trần.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** personal-schedule-2026-08-24.ics */
export function icsFileName(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `personal-schedule-${y}-${m}-${d}.ics`;
}

/**
 * Số buổi mà file sẽ chứa — để hộp thoại nói trước con số.
 *
 * Đếm VEVENT chứ không đếm buổi: một chuỗi lặp là MỘT mục, dù nó sinh ra 52
 * buổi trong năm. Nói "3 mục" rồi ứng dụng lịch hiện 160 buổi thì con số đó
 * vô nghĩa, nên nhãn phải nói rõ đang đếm cái gì.
 */
export function countIcsEntries(input: Pick<IcsInput, 'rules' | 'exceptions' | 'events'>): {
  rules: number;
  events: number;
  overrides: number;
} {
  const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
  const exceptions = live(input.exceptions);

  return {
    rules: live(input.rules).length,
    events: live(input.events).length,
    overrides: exceptions.filter(
      (x) => x.type === 'ADD' || x.type === 'MOVE' || x.type === 'REPLACE' || x.type === 'RESIZE',
    ).length,
  };
}
