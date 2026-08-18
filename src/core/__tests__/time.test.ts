import { describe, expect, it } from 'vitest';
import {
  addDays, dayOfWeek, durationFrom, endsNextDay, endTimeOf,
  monthBounds, nightMinutes, overlaps, startOfWeek, toAbsolute, toHHMM, toMinutes,
} from '../time';

describe('chuyển đổi giờ', () => {
  it('toMinutes / toHHMM đi được cả hai chiều', () => {
    expect(toMinutes('22:00')).toBe(1320);
    expect(toMinutes('00:00')).toBe(0);
    expect(toHHMM(1320)).toBe('22:00');
    expect(toHHMM(0)).toBe('00:00');
  });

  it('toHHMM cuộn vòng qua nửa đêm và xử lý được số âm', () => {
    expect(toHHMM(1440)).toBe('00:00');
    expect(toHHMM(1560)).toBe('02:00');
    expect(toHHMM(-60)).toBe('23:00');
  });
});

describe('ca qua đêm — lỗi A1 của bản kế hoạch gốc', () => {
  it('22:00 + 4 giờ ra 02:00, KHÔNG ra giờ âm', () => {
    expect(endTimeOf('22:00', 240)).toBe('02:00');
    expect(endsNextDay('22:00', 240)).toBe(true);
  });

  it('ca ban ngày không bị đánh dấu qua đêm', () => {
    expect(endTimeOf('08:00', 120)).toBe('10:00');
    expect(endsNextDay('08:00', 120)).toBe(false);
  });

  it('ca kết thúc đúng nửa đêm vẫn tính là sang ngày hôm sau', () => {
    expect(endTimeOf('22:00', 120)).toBe('00:00');
    expect(endsNextDay('22:00', 120)).toBe(true);
  });

  it('durationFrom suy ra thời lượng dương cho ca vắt qua nửa đêm', () => {
    expect(durationFrom('22:00', '02:00')).toBe(240);
    expect(durationFrom('08:00', '10:00')).toBe(120);
    // Cùng giờ = trọn 24 tiếng, không phải 0
    expect(durationFrom('09:00', '09:00')).toBe(1440);
  });
});

describe('phát hiện trùng lịch', () => {
  it('hai ca chạm nhau đúng điểm cuối KHÔNG phải trùng', () => {
    const a1 = toAbsolute('2026-09-01', '10:00');
    const a2 = toAbsolute('2026-09-01', '12:00');
    const b1 = toAbsolute('2026-09-01', '12:00');
    const b2 = toAbsolute('2026-09-01', '14:00');
    expect(overlaps(a1, a2, b1, b2)).toBe(false);
  });

  it('hai ca chồng lấn một phần là trùng', () => {
    const a1 = toAbsolute('2026-09-01', '10:00');
    const a2 = toAbsolute('2026-09-01', '12:00');
    const b1 = toAbsolute('2026-09-01', '11:00');
    const b2 = toAbsolute('2026-09-01', '13:00');
    expect(overlaps(a1, a2, b1, b2)).toBe(true);
  });

  it('ca qua đêm trùng với sự kiện sáng sớm HÔM SAU — lỗi B7d', () => {
    const nightStart = toAbsolute('2026-09-01', '22:00');
    const nightEnd = nightStart + 240 * 60_000; // 02:00 ngày 02/09
    const earlyStart = toAbsolute('2026-09-02', '01:00');
    const earlyEnd = toAbsolute('2026-09-02', '03:00');
    expect(overlaps(nightStart, nightEnd, earlyStart, earlyEnd)).toBe(true);
  });
});

describe('ngày tháng', () => {
  it('addDays vượt qua ranh giới tháng và năm', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('năm nhuận', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(monthBounds('2028-02').end).toBe('2028-02-29');
    expect(monthBounds('2026-02').end).toBe('2026-02-28');
  });

  it('dayOfWeek theo Date.getDay(): 0=CN', () => {
    expect(dayOfWeek('2026-08-16')).toBe(0); // Chủ nhật
    expect(dayOfWeek('2026-08-17')).toBe(1); // Thứ hai
  });

  it('startOfWeek tôn trọng weekStartsOn', () => {
    expect(startOfWeek('2026-08-19', 1)).toBe('2026-08-17'); // T2
    expect(startOfWeek('2026-08-19', 0)).toBe('2026-08-16'); // CN
  });
});

describe('giờ ca đêm', () => {
  it('ca 22:00–02:00 nằm trọn trong khung đêm 22:00–06:00', () => {
    expect(nightMinutes('22:00', 240, '22:00', '06:00')).toBe(240);
  });

  it('ca 20:00–24:00 chỉ có 2 tiếng cuối rơi vào khung đêm', () => {
    expect(nightMinutes('20:00', 240, '22:00', '06:00')).toBe(120);
  });

  it('ca ban ngày không có giờ đêm nào', () => {
    expect(nightMinutes('09:00', 480, '22:00', '06:00')).toBe(0);
  });
});
