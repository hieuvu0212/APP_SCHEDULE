// ═══════════════════════════════════════════════════════════════════════════
//  core/ics.ts — xuất iCalendar
//
//  Mỗi bài canh một quy tắc của RFC 5545 mà nếu phá thì file vẫn TRÔNG như
//  hợp lệ nhưng ứng dụng lịch sẽ hiểu sai hoặc từ chối. Đó là điều khiến định
//  dạng này nguy hiểm: không có thông báo lỗi nào, chỉ có buổi học không xuất
//  hiện trên điện thoại.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import type { RecurringRule, ScheduleException, SingleEvent } from '../../types';
import {
  buildIcs,
  buildRrule,
  countIcsEntries,
  escapeText,
  foldLine,
  icsDateTime,
} from '../ics';

const NOW = '2026-08-24T10:30:00.000Z';

const base = { createdAt: NOW, updatedAt: NOW };

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  title: 'Dạy Toán',
  categoryId: 'cat-1',
  freq: 'WEEKLY',
  interval: 1,
  daysOfWeek: [1],
  startDate: '2026-08-03',
  startTime: '18:00',
  durationMinutes: 120,
  ...base,
  ...over,
});

const event = (over: Partial<SingleEvent> = {}): SingleEvent => ({
  id: 'e1',
  title: 'Họp',
  categoryId: 'cat-1',
  date: '2026-08-24',
  startTime: '09:00',
  durationMinutes: 60,
  status: 'SCHEDULED',
  ...base,
  ...over,
});

const exception = (over: Partial<ScheduleException> = {}): ScheduleException => ({
  id: 'x1',
  type: 'CANCEL',
  recurringRuleId: 'r1',
  originalDate: '2026-08-10',
  ...base,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildIcs>[0]> = {}) =>
  buildIcs({
    rules: [],
    exceptions: [],
    events: [],
    categoryName: () => 'Gia sư',
    now: NOW,
    calendarName: 'Lịch của tôi',
    ...over,
  });

/** Gỡ phép gấp dòng để so nội dung logic */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const lines = (ics: string) => unfold(ics).split('\r\n');

// ─── Khung VCALENDAR ───────────────────────────────────────────────────────

describe('khung VCALENDAR', () => {
  it('có đủ BEGIN/END và các khóa bắt buộc', () => {
    const out = lines(build());
    expect(out[0]).toBe('BEGIN:VCALENDAR');
    expect(out).toContain('VERSION:2.0');
    expect(out).toContain('CALSCALE:GREGORIAN');
    expect(out.at(-2)).toBe('END:VCALENDAR');
  });

  it('kết thúc dòng bằng CRLF, không phải LF trần', () => {
    // RFC 5545 §3.1 bắt buộc CRLF. Một số trình phân tích nghiêm ngặt từ chối
    // cả file nếu chỉ có LF — và "từ chối cả file" nghĩa là mất trắng, không
    // phải mất một buổi.
    const ics = build({ events: [event()] });
    expect(ics).toContain('\r\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

// ─── Giờ trôi nổi ──────────────────────────────────────────────────────────

describe('giờ trôi nổi — KHÔNG có Z, KHÔNG có TZID', () => {
  it('DTSTART là giờ treo tường trần', () => {
    // ⚠️ Đây là quyết định thiết kế lớn nhất của module.
    //
    // Thêm `Z` vào là biến 18:00 thành 18:00 UTC — tức 01:00 sáng hôm sau ở
    // Việt Nam. Toàn bộ lịch lệch bảy tiếng, và nó lệch ÂM THẦM: file vẫn hợp
    // lệ, ứng dụng lịch vẫn nhận, chỉ là mọi buổi sai giờ.
    const out = lines(build({ events: [event()] }));
    expect(out).toContain('DTSTART:20260824T090000');
    expect(out.some((l) => l.startsWith('DTSTART') && l.includes('Z'))).toBe(false);
    expect(out.some((l) => l.includes('TZID'))).toBe(false);
  });

  it('DTSTAMP thì NGƯỢC LẠI — phải có Z', () => {
    // DTSTAMP là thời điểm sinh file, không phải giờ lịch. Nó là mốc tuyệt
    // đối thật và bắt buộc phải ở UTC.
    //
    // Cần một sự kiện để có DTSTAMP: nó là thuộc tính của VEVENT, không phải
    // của VCALENDAR. Lịch rỗng thì không có dòng nào để kiểm.
    const out = lines(build({ events: [event()] }));
    expect(out).toContain('DTSTAMP:20260824T103000Z');
  });
});

// ─── Ca qua đêm ────────────────────────────────────────────────────────────

describe('ca qua đêm', () => {
  it('DTEND rơi sang NGÀY HÔM SAU', () => {
    // Ca 22:00–02:00. Cộng chuỗi giờ sẽ cho DTEND nhỏ hơn DTSTART, và một
    // VEVENT như thế là hỏng — ứng dụng lịch bỏ qua cả mục.
    const out = lines(build({ events: [event({ startTime: '22:00', durationMinutes: 240 })] }));
    expect(out).toContain('DTSTART:20260824T220000');
    expect(out).toContain('DTEND:20260825T020000');
  });

  it('ca trong ngày thì DTEND cùng ngày', () => {
    const out = lines(build({ events: [event({ startTime: '09:00', durationMinutes: 90 })] }));
    expect(out).toContain('DTEND:20260824T103000');
  });

  it('ca đúng 24 tiếng vẫn cho DTEND lớn hơn DTSTART', () => {
    const out = lines(build({ events: [event({ startTime: '09:00', durationMinutes: 1440 })] }));
    const start = out.find((l) => l.startsWith('DTSTART:'))!;
    const end = out.find((l) => l.startsWith('DTEND:'))!;
    expect(end.slice(6) > start.slice(8)).toBe(true);
  });
});

// ─── RRULE ─────────────────────────────────────────────────────────────────

describe('buildRrule', () => {
  it('hàng tuần với các thứ cụ thể', () => {
    expect(buildRrule(rule({ daysOfWeek: [1, 3, 5] }))).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('thứ được sắp xếp để file ổn định giữa hai lần xuất', () => {
    // Hai file cùng dữ liệu phải giống hệt nhau, nếu không thì không so được
    // bằng diff và không biết lần xuất sau khác gì lần trước.
    expect(buildRrule(rule({ daysOfWeek: [5, 1, 3] }))).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('interval chỉ ghi khi khác 1', () => {
    expect(buildRrule(rule({ interval: 1 }))).not.toContain('INTERVAL');
    expect(buildRrule(rule({ interval: 2 }))).toContain('INTERVAL=2');
  });

  it('hàng tháng dùng BYMONTHDAY', () => {
    const r = rule({ freq: 'MONTHLY', dayOfMonth: 15, daysOfWeek: undefined });
    expect(buildRrule(r)).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
  });

  it('COUNT được ưu tiên hơn UNTIL — đặc tả cấm dùng cả hai', () => {
    const r = rule({ count: 10, endDate: '2026-12-31' });
    const out = buildRrule(r);
    expect(out).toContain('COUNT=10');
    expect(out).not.toContain('UNTIL');
  });

  it('endDate thành UNTIL cuối ngày, vì endDate BAO GỒM ngày đó', () => {
    // `UNTIL=20261231` trần sẽ cắt mất buổi của chính ngày 31.
    expect(buildRrule(rule({ endDate: '2026-12-31' }))).toContain('UNTIL=20261231T235959');
  });

  it('lặp vô hạn thì không có COUNT lẫn UNTIL', () => {
    const out = buildRrule(rule());
    expect(out).not.toContain('COUNT');
    expect(out).not.toContain('UNTIL');
  });
});

// ─── Ngoại lệ ──────────────────────────────────────────────────────────────

describe('ngoại lệ của lịch lặp', () => {
  it('CANCEL thành EXDATE trên chuỗi, không thành VEVENT riêng', () => {
    const out = lines(build({ rules: [rule()], exceptions: [exception()] }));
    expect(out).toContain('EXDATE:20260810T180000');
    expect(out.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('trạng thái CANCELLED cũng thành EXDATE', () => {
    const x = exception({ type: 'STATUS', status: 'CANCELLED' });
    expect(lines(build({ rules: [rule()], exceptions: [x] }))).toContain('EXDATE:20260810T180000');
  });

  it('MOVE thành VEVENT ghi đè mang RECURRENCE-ID trỏ về NGÀY GỐC', () => {
    // ⚠️ RECURRENCE-ID phải là ngày GỐC do rule sinh ra, không phải ngày đã
    // dời tới. Trỏ nhầm thì ứng dụng lịch không tìm thấy buổi để thay thế, và
    // người dùng nhận về CẢ HAI: buổi cũ ở ngày cũ và buổi mới ở ngày mới.
    const x = exception({ type: 'MOVE', originalDate: '2026-08-10', newDate: '2026-08-12' });
    const out = lines(build({ rules: [rule()], exceptions: [x] }));

    expect(out).toContain('RECURRENCE-ID:20260810T180000');
    expect(out).toContain('DTSTART:20260812T180000');
    expect(out.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('VEVENT ghi đè dùng CÙNG UID với chuỗi', () => {
    // Khác UID thì nó là một sự kiện độc lập, không phải bản thay thế.
    const x = exception({ type: 'MOVE', newDate: '2026-08-12' });
    const out = lines(build({ rules: [rule()], exceptions: [x] }));
    expect(out.filter((l) => l === 'UID:rule-r1@personal-schedule')).toHaveLength(2);
  });

  it('ADD thành VEVENT độc lập với UID riêng', () => {
    const x = exception({
      id: 'x9',
      type: 'ADD',
      recurringRuleId: undefined,
      originalDate: undefined,
      newDate: '2026-09-01',
      newStartTime: '08:00',
      newDurationMinutes: 60,
      newTitle: 'Buổi bù',
    });
    const out = lines(build({ exceptions: [x] }));
    expect(out).toContain('UID:add-x9@personal-schedule');
    expect(out).toContain('SUMMARY:Buổi bù');
  });
});

// ─── Escape và gấp dòng ────────────────────────────────────────────────────

describe('escapeText', () => {
  it('escape dấu gạch chéo ngược TRƯỚC dấu phẩy và chấm phẩy', () => {
    // Đổi sau thì chính những dấu vừa thêm cho `,` lại bị escape lần nữa.
    expect(escapeText('a\\b,c')).toBe('a\\\\b\\,c');
  });

  it('escape chấm phẩy, phẩy và xuống dòng', () => {
    expect(escapeText('a;b')).toBe('a\\;b');
    expect(escapeText('a,b')).toBe('a\\,b');
    expect(escapeText('a\nb')).toBe('a\\nb');
  });

  it('tiêu đề có dấu phẩy không làm vỡ file', () => {
    const out = unfold(build({ events: [event({ title: 'Toán, Lý, Hóa' })] }));
    expect(out).toContain('SUMMARY:Toán\\, Lý\\, Hóa');
  });
});

describe('foldLine — đếm theo BYTE, không theo ký tự', () => {
  it('dòng ngắn giữ nguyên', () => {
    expect(foldLine('SUMMARY:ngắn')).toBe('SUMMARY:ngắn');
  });

  it('không đoạn nào vượt 75 octet', () => {
    // ⚠️ "Học Toán" là 8 ký tự nhưng 11 byte. Đếm theo ký tự sẽ cho ra dòng
    // vượt giới hạn với gần như mọi dữ liệu tiếng Việt thật.
    const folded = foldLine('SUMMARY:' + 'Học Toán nâng cao lớp mười hai '.repeat(6));
    const encoder = new TextEncoder();
    for (const part of folded.split('\r\n')) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
  });

  it('không cắt giữa một ký tự nhiều byte', () => {
    // Nửa ký tự UTF-8 là byte rác, và nó làm hỏng cả file chứ không riêng
    // dòng đó.
    const folded = foldLine('DESCRIPTION:' + '中文测试内容'.repeat(12));
    expect(unfold(folded)).toBe('DESCRIPTION:' + '中文测试内容'.repeat(12));
    expect(folded).not.toContain('�');
  });

  it('dòng nối tiếp bắt đầu bằng đúng một khoảng trắng', () => {
    const folded = foldLine('SUMMARY:' + 'x'.repeat(200));
    for (const part of folded.split('\r\n').slice(1)) {
      expect(part.startsWith(' ')).toBe(true);
      expect(part.startsWith('  ')).toBe(false);
    }
  });

  it('gấp rồi gỡ ra phải bằng chuỗi ban đầu', () => {
    const original = 'DESCRIPTION:' + 'Ghi chú rất dài về buổi học hôm nay. '.repeat(8);
    expect(unfold(foldLine(original))).toBe(original);
  });
});

// ─── Linh tinh ─────────────────────────────────────────────────────────────

describe('icsDateTime', () => {
  it('bỏ dấu gạch và dấu hai chấm, thêm giây', () => {
    expect(icsDateTime('2026-08-24', '18:00')).toBe('20260824T180000');
  });
});

describe('bản ghi đã xóa mềm', () => {
  it('không lên file', () => {
    const out = unfold(build({ events: [event({ deletedAt: NOW, title: 'Đã xóa' })] }));
    expect(out).not.toContain('Đã xóa');
  });

  it('rule đã xóa thì không xuất, kể cả khi còn ngoại lệ', () => {
    const out = unfold(
      build({ rules: [rule({ deletedAt: NOW })], exceptions: [exception()] }),
    );
    expect(out).not.toContain('Dạy Toán');
  });
});

describe('trạng thái buổi', () => {
  it('buổi đã hủy mang STATUS:CANCELLED', () => {
    const out = lines(build({ events: [event({ status: 'CANCELLED' })] }));
    expect(out).toContain('STATUS:CANCELLED');
  });

  it('buổi bình thường mang STATUS:CONFIRMED', () => {
    expect(lines(build({ events: [event()] }))).toContain('STATUS:CONFIRMED');
  });
});

describe('countIcsEntries', () => {
  it('đếm theo MỤC, không theo buổi', () => {
    // Một chuỗi lặp là MỘT mục dù nó sinh 52 buổi trong năm.
    const counts = countIcsEntries({
      rules: [rule(), rule({ id: 'r2' })],
      events: [event()],
      exceptions: [exception(), exception({ id: 'x2', type: 'MOVE', newDate: '2026-08-12' })],
    });
    expect(counts).toEqual({ rules: 2, events: 1, overrides: 1 });
  });

  it('bỏ qua bản ghi đã xóa mềm', () => {
    const counts = countIcsEntries({
      rules: [rule({ deletedAt: NOW })],
      events: [],
      exceptions: [],
    });
    expect(counts.rules).toBe(0);
  });
});
