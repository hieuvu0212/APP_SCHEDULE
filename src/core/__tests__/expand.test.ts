import { describe, expect, it } from 'vitest';
import type { RecurringRule, ScheduleException, SingleEvent } from '../../types';
import {
  expandSchedule,
  nextOccurrenceDate,
  occurrenceDates,
  ruleMatchesDate,
  ruleStatus,
} from '../expand';
import { detectConflicts } from '../conflict';

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

function rule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    ...meta,
    id: 'r1',
    title: 'Ca Rossi',
    categoryId: 'cat-rossi',
    freq: 'WEEKLY',
    interval: 1,
    daysOfWeek: [1], // Thứ hai
    startDate: '2026-08-03',
    startTime: '18:00',
    durationMinutes: 240,
    ...over,
  };
}

function exc(over: Partial<ScheduleException> = {}): ScheduleException {
  return { ...meta, id: `e-${Math.random()}`, type: 'CANCEL', ...over };
}

const NO_AUTO = { autoCompletePast: false };

// ───────────────────────────────────────────────────────────────────────────

describe('ruleMatchesDate', () => {
  it('lặp hàng tuần đúng thứ', () => {
    const r = rule();
    expect(ruleMatchesDate(r, '2026-08-17')).toBe(true);  // T2
    expect(ruleMatchesDate(r, '2026-08-18')).toBe(false); // T3
  });

  it('endDate BAO GỒM ngày cuối — lỗi lệch một ngày kinh điển (B7b)', () => {
    const r = rule({ endDate: '2026-08-17' });
    expect(ruleMatchesDate(r, '2026-08-17')).toBe(true);
    expect(ruleMatchesDate(r, '2026-08-24')).toBe(false);
  });

  it('không sinh occurrence trước startDate', () => {
    expect(ruleMatchesDate(rule(), '2026-07-27')).toBe(false);
  });

  it('interval=2 → tuần chẵn/lẻ (lỗ hổng A4)', () => {
    const r = rule({ interval: 2 }); // mốc: tuần chứa 03/08
    expect(ruleMatchesDate(r, '2026-08-03')).toBe(true);
    expect(ruleMatchesDate(r, '2026-08-10')).toBe(false);
    expect(ruleMatchesDate(r, '2026-08-17')).toBe(true);
    expect(ruleMatchesDate(r, '2026-08-24')).toBe(false);
  });

  it('lặp theo tháng (lỗ hổng A4)', () => {
    const r = rule({ freq: 'MONTHLY', dayOfMonth: 15, daysOfWeek: undefined, startDate: '2026-08-15' });
    expect(ruleMatchesDate(r, '2026-08-15')).toBe(true);
    expect(ruleMatchesDate(r, '2026-09-15')).toBe(true);
    expect(ruleMatchesDate(r, '2026-09-16')).toBe(false);
  });

  it('lặp hàng ngày với interval=3', () => {
    const r = rule({ freq: 'DAILY', interval: 3, daysOfWeek: undefined, startDate: '2026-08-01' });
    expect(ruleMatchesDate(r, '2026-08-01')).toBe(true);
    expect(ruleMatchesDate(r, '2026-08-04')).toBe(true);
    expect(ruleMatchesDate(r, '2026-08-05')).toBe(false);
  });
});

describe('occurrenceDates', () => {
  it('giới hạn theo count', () => {
    const dates = occurrenceDates(rule({ count: 3 }), '2026-08-01', '2026-12-31');
    expect(dates).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('cắt đúng theo cửa sổ', () => {
    const dates = occurrenceDates(rule(), '2026-08-10', '2026-08-24');
    expect(dates).toEqual(['2026-08-10', '2026-08-17', '2026-08-24']);
  });

  it('tháng có 5 thứ Hai', () => {
    // Tháng 8/2026: T2 rơi vào 03, 10, 17, 24, 31
    const dates = occurrenceDates(rule(), '2026-08-01', '2026-08-31');
    expect(dates).toHaveLength(5);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('nextOccurrenceDate / ruleStatus', () => {
  it('tìm được buổi kế tiếp, tính cả chính ngày hôm nay', () => {
    const r = rule({ startDate: '2026-08-03', daysOfWeek: [1] }); // Thứ hai
    expect(nextOccurrenceDate(r, '2026-08-17')).toBe('2026-08-17');
    expect(nextOccurrenceDate(r, '2026-08-18')).toBe('2026-08-24');
  });

  it('hỏi từ trước startDate thì trả về buổi đầu tiên', () => {
    const r = rule({ startDate: '2026-09-07', daysOfWeek: [1] });
    expect(nextOccurrenceDate(r, '2026-01-01')).toBe('2026-09-07');
  });

  it('rule đã hết hạn thì không còn buổi nào', () => {
    const r = rule({ startDate: '2026-08-03', endDate: '2026-08-10', daysOfWeek: [1] });
    expect(nextOccurrenceDate(r, '2026-09-01')).toBeNull();
  });

  it('chưa bắt đầu / đang chạy / đã kết thúc', () => {
    const r = rule({ startDate: '2026-08-03', endDate: '2026-08-31', daysOfWeek: [1] });
    expect(ruleStatus(r, '2026-07-01')).toBe('upcoming');
    expect(ruleStatus(r, '2026-08-17')).toBe('active');
    expect(ruleStatus(r, '2026-09-01')).toBe('ended');
  });

  it('rule giới hạn bằng COUNT vẫn báo đã kết thúc dù không có endDate', () => {
    // Chỉ so endDate sẽ báo một chuỗi "2 buổi" dùng hết từ lâu là vẫn đang
    // chạy — và người dùng không bao giờ hiểu vì sao nó không sinh buổi nào.
    const r = rule({ startDate: '2026-08-03', count: 2, daysOfWeek: [1] });
    expect(ruleStatus(r, '2026-08-03')).toBe('active');
    expect(ruleStatus(r, '2026-09-01')).toBe('ended');
  });

  it('rule không có ngày kết thúc thì luôn đang chạy', () => {
    const r = rule({ startDate: '2020-01-06', daysOfWeek: [1] });
    expect(ruleStatus(r, '2026-08-21')).toBe('active');
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('giới hạn bằng COUNT — chuỗi phải tắt sau đúng số buổi', () => {
  // Hàng tuần Thứ Sáu, bắt đầu 31/07/2026, giới hạn 3 buổi.
  // Ba buổi hợp lệ: 31/07 · 07/08 · 14/08. Ngày 21/08 rơi đúng Thứ Sáu và
  // nằm trong mọi cửa sổ hiển thị, nên nếu chỗ nào quên xét `count` thì buổi
  // thứ tư sẽ lọt ra — và lọt ra ở nơi rất khó nhận biết là sai.
  const counted = () =>
    rule({ id: 'r-count', title: 'TEST COUNT', startDate: '2026-07-31', daysOfWeek: [5], count: 3 });

  it('sinh đúng ba ngày, không có ngày thứ tư', () => {
    const dates = occurrenceDates(counted(), '2026-07-01', '2026-12-31');
    expect(dates).toEqual(['2026-07-31', '2026-08-07', '2026-08-14']);
    expect(dates).not.toContain('2026-08-21');
  });

  it('cửa sổ bắt đầu SAU buổi thứ ba trả về rỗng', () => {
    // `count` đếm từ startDate chứ không đếm trong cửa sổ, nên hàm vẫn phải
    // đi bộ qua ba buổi đã dùng rồi mới biết là đã hết.
    expect(occurrenceDates(counted(), '2026-08-15', '2027-08-15')).toEqual([]);
  });

  it('nextOccurrenceDate trả null sau buổi thứ ba', () => {
    expect(nextOccurrenceDate(counted(), '2026-08-15')).toBeNull();
    expect(nextOccurrenceDate(counted(), '2026-08-21')).toBeNull();
  });

  it('ruleStatus: đang chạy tới hết buổi thứ ba, sau đó là đã kết thúc', () => {
    const r = counted();
    expect(ruleStatus(r, '2026-07-30')).toBe('upcoming');
    expect(ruleStatus(r, '2026-07-31')).toBe('active');
    expect(ruleStatus(r, '2026-08-14')).toBe('active'); // buổi cuối là hôm nay
    expect(ruleStatus(r, '2026-08-15')).toBe('ended');
    expect(ruleStatus(r, '2026-08-21')).toBe('ended');
  });

  it('expandSchedule KHÔNG vẽ buổi thứ tư lên tuần 17–23/08', () => {
    // Cùng một nguồn sự thật với màn hình Quản lý. Nếu lịch tuần vẽ ra buổi
    // 21/08 thì lỗi nằm ở occurrenceDates, không phải ở tầng hiển thị.
    const out = expandSchedule({
      rules: [counted()],
      exceptions: [],
      events: [],
      windowStart: '2026-08-17',
      windowEnd: '2026-08-23',
      ...NO_AUTO,
    });
    expect(out).toEqual([]);
  });

  it('expandSchedule vẽ đúng ba buổi khi cửa sổ phủ cả chuỗi', () => {
    const out = expandSchedule({
      rules: [counted()],
      exceptions: [],
      events: [],
      windowStart: '2026-07-01',
      windowEnd: '2026-09-30',
      ...NO_AUTO,
    });
    expect(out.map((o) => o.date)).toEqual(['2026-07-31', '2026-08-07', '2026-08-14']);
  });

  it('count = 1 chỉ sinh đúng buổi đầu tiên', () => {
    const r = rule({ startDate: '2026-07-31', daysOfWeek: [5], count: 1 });
    expect(occurrenceDates(r, '2026-07-01', '2026-12-31')).toEqual(['2026-07-31']);
    expect(ruleStatus(r, '2026-08-01')).toBe('ended');
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('expandSchedule — ngoại lệ', () => {
  it('CANCEL loại bỏ đúng một buổi', () => {
    const out = expandSchedule({
      rules: [rule()],
      exceptions: [exc({ type: 'CANCEL', recurringRuleId: 'r1', originalDate: '2026-08-17' })],
      events: [],
      windowStart: '2026-08-10',
      windowEnd: '2026-08-24',
      ...NO_AUTO,
    });
    expect(out.map((o) => o.date)).toEqual(['2026-08-10', '2026-08-24']);
  });

  it('RESIZE đổi thời lượng, không đổi ngày', () => {
    const out = expandSchedule({
      rules: [rule()],
      exceptions: [exc({
        type: 'RESIZE', recurringRuleId: 'r1',
        originalDate: '2026-08-17', newDurationMinutes: 120,
      })],
      events: [],
      windowStart: '2026-08-17',
      windowEnd: '2026-08-17',
      ...NO_AUTO,
    });
    expect(out).toHaveLength(1);
    expect(out[0].durationMinutes).toBe(120);
  });

  it('STATUS đánh dấu hoàn thành mà không đổi giờ giấc (lỗ hổng B1)', () => {
    const out = expandSchedule({
      rules: [rule()],
      exceptions: [exc({
        type: 'STATUS', recurringRuleId: 'r1',
        originalDate: '2026-08-17', status: 'COMPLETED',
      })],
      events: [],
      windowStart: '2026-08-17',
      windowEnd: '2026-08-17',
      ...NO_AUTO,
    });
    expect(out[0].status).toBe('COMPLETED');
    expect(out[0].startTime).toBe('18:00');
  });

  it('ADD chèn buổi mới không gắn rule gốc', () => {
    const out = expandSchedule({
      rules: [rule()],
      exceptions: [exc({
        type: 'ADD', newDate: '2026-08-19', newTitle: 'Rossi T4 sáng',
        newStartTime: '08:00', newDurationMinutes: 180, newCategoryId: 'cat-rossi',
      })],
      events: [],
      windowStart: '2026-08-17',
      windowEnd: '2026-08-23',
      ...NO_AUTO,
    });
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.date === '2026-08-19')?.title).toBe('Rossi T4 sáng');
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('MOVE xuyên cửa sổ hiển thị — LỖI A2, nghiêm trọng nhất', () => {
  const moved = exc({
    type: 'MOVE', recurringRuleId: 'r1',
    originalDate: '2026-08-31', newDate: '2026-09-02',
  });

  it('nhìn từ tuần CHỨA ngày gốc: buổi biến mất khỏi ngày gốc', () => {
    const out = expandSchedule({
      rules: [rule()], exceptions: [moved], events: [],
      windowStart: '2026-08-24', windowEnd: '2026-08-30', ...NO_AUTO,
    });
    expect(out.map((o) => o.date)).toEqual(['2026-08-24']);
  });

  it('nhìn từ tuần CHỨA ngày đích: buổi PHẢI xuất hiện ở ngày mới', () => {
    // Đây chính là ca mà bản kế hoạch gốc làm mất dữ liệu: mở rộng rule
    // không sinh ra ngày 31/08 (ngoài cửa sổ), và truy vấn exception theo
    // originalDate cũng không bắt được → ca dời BIẾN MẤT hoàn toàn.
    const out = expandSchedule({
      rules: [rule()], exceptions: [moved], events: [],
      windowStart: '2026-08-31', windowEnd: '2026-09-06', ...NO_AUTO,
    });
    const dates = out.map((o) => o.date);
    expect(dates).toContain('2026-09-02');
    expect(dates).not.toContain('2026-08-31');
  });

  it('không nhân đôi khi cả ngày gốc lẫn ngày đích cùng nằm trong cửa sổ', () => {
    const out = expandSchedule({
      rules: [rule()], exceptions: [moved], events: [],
      windowStart: '2026-08-24', windowEnd: '2026-09-30', ...NO_AUTO,
    });
    const onTarget = out.filter((o) => o.date === '2026-09-02');
    expect(onTarget).toHaveLength(1);
  });

  it('MOVE xuyên năm vẫn hiển thị đúng', () => {
    const crossYear = exc({
      type: 'MOVE', recurringRuleId: 'r1',
      originalDate: '2026-12-28', newDate: '2027-01-04',
    });
    const out = expandSchedule({
      rules: [rule()], exceptions: [crossYear], events: [],
      windowStart: '2027-01-01', windowEnd: '2027-01-07', ...NO_AUTO,
    });
    expect(out.map((o) => o.date)).toContain('2027-01-04');
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('bản ghi đã xóa mềm', () => {
  it('rule có deletedAt không sinh occurrence nào', () => {
    const out = expandSchedule({
      rules: [rule({ deletedAt: '2026-08-01T00:00:00Z' })],
      exceptions: [], events: [],
      windowStart: '2026-08-01', windowEnd: '2026-08-31', ...NO_AUTO,
    });
    expect(out).toHaveLength(0);
  });

  it('exception mồ côi (rule đã bị xóa) không làm vỡ thuật toán — mục 8.1', () => {
    const out = expandSchedule({
      rules: [],
      exceptions: [exc({ type: 'MOVE', recurringRuleId: 'đã-xóa', originalDate: '2026-08-31', newDate: '2026-09-02' })],
      events: [],
      windowStart: '2026-09-01', windowEnd: '2026-09-07', ...NO_AUTO,
    });
    expect(out).toHaveLength(0);
  });
});

describe('ca qua đêm khi mở rộng', () => {
  it('gắn cờ endsNextDay và tính endAbs sang ngày hôm sau', () => {
    const out = expandSchedule({
      rules: [rule({ startTime: '22:00', durationMinutes: 240 })],
      exceptions: [], events: [],
      windowStart: '2026-08-17', windowEnd: '2026-08-17', ...NO_AUTO,
    });
    expect(out[0].endsNextDay).toBe(true);
    expect(out[0].endAbs - out[0].startAbs).toBe(240 * 60_000);
    // Sự kiện thuộc về NGÀY BẮT ĐẦU
    expect(out[0].date).toBe('2026-08-17');
  });

  it('ca đêm trùng với sự kiện sáng sớm hôm sau bị phát hiện', () => {
    const ev: SingleEvent = {
      ...meta, id: 'ev1', title: 'Học sáng', categoryId: 'cat-dh',
      date: '2026-08-18', startTime: '01:00', durationMinutes: 120,
      status: 'SCHEDULED',
    };
    const out = detectConflicts(expandSchedule({
      rules: [rule({ startTime: '22:00', durationMinutes: 240 })],
      exceptions: [], events: [ev],
      windowStart: '2026-08-17', windowEnd: '2026-08-18', ...NO_AUTO,
    }));
    expect(out.every((o) => o.hasConflict)).toBe(true);
  });
});

describe('detectConflicts', () => {
  const mk = (id: string, date: string, startTime: string, dur: number): SingleEvent => ({
    ...meta, id, title: id, categoryId: 'c', date, startTime,
    durationMinutes: dur, status: 'SCHEDULED',
  });

  it('hai sự kiện liền kề (chạm điểm cuối) KHÔNG bị báo trùng', () => {
    const out = detectConflicts(expandSchedule({
      rules: [], exceptions: [],
      events: [mk('a', '2026-08-17', '10:00', 120), mk('b', '2026-08-17', '12:00', 120)],
      windowStart: '2026-08-17', windowEnd: '2026-08-17', ...NO_AUTO,
    }));
    expect(out.every((o) => !o.hasConflict)).toBe(true);
  });

  it('chồng lấn một phần thì cả hai bên cùng bị gắn cờ', () => {
    const out = detectConflicts(expandSchedule({
      rules: [], exceptions: [],
      events: [mk('a', '2026-08-17', '10:00', 120), mk('b', '2026-08-17', '11:00', 120)],
      windowStart: '2026-08-17', windowEnd: '2026-08-17', ...NO_AUTO,
    }));
    expect(out.every((o) => o.hasConflict)).toBe(true);
    expect(out[0].conflictWith).toHaveLength(1);
  });
});

describe('expandSchedule — override rate (Phát sinh từ Việc 3)', () => {
  const r = rule({ ratePerHour: 100_000 });
  const wStart = '2026-08-01';
  const wEnd = '2026-08-31';
  const now = new Date('2026-08-15T12:00:00Z');

  it('buổi được gán cứng rate thì giữ nguyên, kể cả rate 0', () => {
    const eZero = exc({
      type: 'REPLACE',
      recurringRuleId: r.id,
      originalDate: '2026-08-03',
      newRatePerHour: 0,
    });
    const eOverride = exc({
      type: 'REPLACE',
      recurringRuleId: r.id,
      originalDate: '2026-08-10',
      newRatePerHour: 150_000,
    });

    const occs = expandSchedule({
      rules: [r],
      exceptions: [eZero, eOverride],
      events: [],
      windowStart: wStart,
      windowEnd: wEnd,
      now,
      autoCompletePast: false,
    });
    
    const o03 = occs.find((o) => o.date === '2026-08-03')!;
    const o10 = occs.find((o) => o.date === '2026-08-10')!;
    const o17 = occs.find((o) => o.date === '2026-08-17')!;

    expect(o03.ratePerHour).toBe(0);
    expect(o10.ratePerHour).toBe(150_000);
    // Không có exception -> thừa kế từ rule
    expect(o17.ratePerHour).toBe(100_000);
  });

  it('buổi bị xóa rate override (newRatePerHour = undefined) thì thừa kế rate của rule', () => {
    // newRatePerHour bị undefined, có nghĩa là user chọn "Theo danh mục"
    const eUndefined = exc({
      type: 'REPLACE',
      recurringRuleId: r.id,
      originalDate: '2026-08-03',
      newRatePerHour: undefined,
    });

    const occs = expandSchedule({
      rules: [r],
      exceptions: [eUndefined],
      events: [],
      windowStart: wStart,
      windowEnd: wEnd,
      now,
      autoCompletePast: false,
    });
    const o03 = occs.find((o) => o.date === '2026-08-03')!;

    expect(o03.ratePerHour).toBe(100_000); // Thừa kế rate của rule
  });
});
