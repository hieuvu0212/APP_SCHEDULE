import { describe, expect, it } from 'vitest';
import {
  addMonths,
  isInMonth,
  monthGridDates,
  todayKey,
  weekDates,
  weekdayOrder,
} from '../calendar';

describe('weekDates', () => {
  it('luôn trả về đúng 7 ngày liên tiếp', () => {
    const w = weekDates('2026-08-20', 1);
    expect(w).toHaveLength(7);
    expect(w[0]).toBe('2026-08-17'); // Thứ hai
    expect(w[6]).toBe('2026-08-23'); // Chủ nhật
  });

  it('weekStartsOn=0 dời cả tuần về Chủ nhật', () => {
    const w = weekDates('2026-08-20', 0);
    expect(w[0]).toBe('2026-08-16');
    expect(w[6]).toBe('2026-08-22');
  });

  it('tuần vắt qua ranh giới tháng vẫn liền mạch', () => {
    const w = weekDates('2026-09-01', 1);
    expect(w[0]).toBe('2026-08-31');
    expect(w[1]).toBe('2026-09-01');
  });

  it('tuần vắt qua ranh giới năm', () => {
    const w = weekDates('2027-01-01', 1);
    expect(w[0]).toBe('2026-12-28');
    expect(w[6]).toBe('2027-01-03');
  });
});

describe('monthGridDates', () => {
  it('số ô luôn là bội số của 7', () => {
    for (const m of ['2026-01', '2026-02', '2026-08', '2027-11']) {
      expect(monthGridDates(m, 1).length % 7).toBe(0);
    }
  });

  it('phủ trọn tháng — có đủ ngày đầu và ngày cuối', () => {
    const grid = monthGridDates('2026-08', 1);
    expect(grid).toContain('2026-08-01');
    expect(grid).toContain('2026-08-31');
  });

  it('KHÔNG ép cứng 6 hàng: tháng 2/2026 bắt đầu đúng Chủ nhật chỉ cần 4 hàng', () => {
    // 01/02/2026 rơi vào Chủ nhật và tháng có đúng 28 ngày.
    // Ép 6 hàng sẽ đệm thừa hai tuần trắng.
    expect(monthGridDates('2026-02', 0)).toHaveLength(28);
  });

  it('tháng cần 6 hàng thì vẫn cấp đủ', () => {
    // 01/08/2026 là Thứ bảy, tháng có 31 ngày → tràn sang hàng thứ 6.
    expect(monthGridDates('2026-08', 1)).toHaveLength(42);
  });

  it('đệm bằng ngày của tháng liền kề, không bằng chuỗi rỗng', () => {
    const grid = monthGridDates('2026-08', 1);
    expect(grid[0]).toBe('2026-07-27');
    expect(grid[grid.length - 1]).toBe('2026-09-06');
  });
});

describe('addMonths', () => {
  it('vượt ranh giới năm cả hai chiều', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('nhảy nhiều tháng một lúc', () => {
    expect(addMonths('2026-08', 12)).toBe('2027-08');
    expect(addMonths('2026-08', -20)).toBe('2024-12');
  });
});

describe('weekdayOrder', () => {
  it('bắt đầu từ Thứ hai thì Chủ nhật xuống cuối', () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('bắt đầu từ Chủ nhật thì đúng thứ tự Date.getDay()', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('isInMonth', () => {
  it('phân biệt được ngày trong tháng và ngày đệm', () => {
    expect(isInMonth('2026-08-31', '2026-08')).toBe(true);
    expect(isInMonth('2026-09-01', '2026-08')).toBe(false);
  });
});

describe('todayKey', () => {
  it('dùng giờ ĐỊA PHƯƠNG, không phải UTC', () => {
    // 23:30 ngày 20/08 giờ địa phương. toISOString() ở múi giờ dương sẽ
    // nhảy sang ngày 21 — đúng kiểu lỗi làm lệch cả lịch một ngày.
    const late = new Date(2026, 7, 20, 23, 30);
    expect(todayKey(late)).toBe('2026-08-20');
  });
});
