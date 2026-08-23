import { describe, expect, it } from 'vitest';
import type { Occurrence, OccurrenceStatus } from '../../types';
import {
  completionRate,
  hoursByMonth,
  hoursByWeekday,
  monthRange,
  statsByCategory,
  totalStat,
} from '../stats';
import { toAbsolute } from '../time';

function occ(
  over: Partial<Occurrence> & { status?: OccurrenceStatus } = {},
): Occurrence {
  const date = over.date ?? '2026-08-20';
  const startTime = over.startTime ?? '08:00';
  const durationMinutes = over.durationMinutes ?? 120;
  const startAbs = toAbsolute(date, startTime);
  return {
    key: `k-${Math.random()}`,
    sourceType: 'RULE',
    sourceId: 'r1',
    title: 'Ca',
    categoryId: 'a',
    date,
    startTime,
    durationMinutes,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + durationMinutes * 60_000,
    status: 'SCHEDULED',
    hasConflict: false,
    conflictWith: [],
    ...over,
  };
}

describe('statsByCategory', () => {
  const list = [
    occ({ categoryId: 'a', durationMinutes: 120, status: 'COMPLETED' }),
    occ({ categoryId: 'a', durationMinutes: 60, status: 'CANCELLED' }),
    occ({ categoryId: 'a', durationMinutes: 60, status: 'NO_SHOW' }),
    occ({ categoryId: 'a', durationMinutes: 180, status: 'SCHEDULED' }),
    occ({ categoryId: 'b', durationMinutes: 60, status: 'COMPLETED' }),
  ];

  it('tách đúng bốn trạng thái', () => {
    const a = statsByCategory(list).find((s) => s.categoryId === 'a')!;
    expect(a.completedHours).toBe(2);
    expect(a.cancelledHours).toBe(1);
    expect(a.noShowHours).toBe(1);
    expect(a.scheduledHours).toBe(3);
  });

  it('BẤT BIẾN: completed + cancelled + noShow + scheduled === planned', () => {
    // Thêm trạng thái mới mà quên cập nhật statsByCategory sẽ làm test này đỏ,
    // thay vì để số liệu lệch âm thầm.
    for (const s of statsByCategory(list)) {
      expect(s.completedHours + s.cancelledHours + s.noShowHours + s.scheduledHours)
        .toBeCloseTo(s.plannedHours, 10);
    }
  });

  it('planned đếm MỌI buổi, kể cả buổi đã hủy', () => {
    // 120 + 60 + 60 + 180 phút = 420 phút = 7 giờ.
    // Buổi bị hủy và buổi vắng mặt VẪN nằm trong kế hoạch — đó chính là điều
    // làm cho tỷ lệ thực hiện có nghĩa.
    const a = statsByCategory(list).find((s) => s.categoryId === 'a')!;
    expect(a.plannedHours).toBe(7);
    expect(a.plannedCount).toBe(4);
  });

  it('sắp xếp theo giờ kế hoạch giảm dần', () => {
    expect(statsByCategory(list).map((s) => s.categoryId)).toEqual(['a', 'b']);
  });

  it('danh sách rỗng trả về mảng rỗng, không ném lỗi', () => {
    expect(statsByCategory([])).toEqual([]);
  });
});

describe('completionRate', () => {
  it('tính đúng tỷ lệ', () => {
    const [a] = statsByCategory([
      occ({ durationMinutes: 60, status: 'COMPLETED' }),
      occ({ durationMinutes: 180, status: 'SCHEDULED' }),
    ]);
    expect(completionRate(a)).toBe(0.25);
  });

  it('chưa có buổi nào thì trả về null, KHÔNG phải 0', () => {
    // 0/0 ra NaN, và "chưa lên lịch gì" khác hẳn "lên lịch rồi mà chưa làm".
    const [a] = statsByCategory([occ({ durationMinutes: 0 })]);
    expect(completionRate(a)).toBeNull();
  });

  it('làm hết thì bằng 1', () => {
    const [a] = statsByCategory([occ({ durationMinutes: 120, status: 'COMPLETED' })]);
    expect(completionRate(a)).toBe(1);
  });
});

describe('totalStat', () => {
  it('cộng dồn qua mọi danh mục', () => {
    const total = totalStat(
      statsByCategory([
        occ({ categoryId: 'a', durationMinutes: 60, status: 'COMPLETED' }),
        occ({ categoryId: 'b', durationMinutes: 120, status: 'COMPLETED' }),
      ]),
    );
    expect(total.completedHours).toBe(3);
    expect(total.plannedCount).toBe(2);
  });
});

describe('hoursByWeekday', () => {
  it('chỉ số theo Date.getDay(), 0 = Chủ nhật', () => {
    // 2026-08-20 là Thứ Năm → getDay() = 4
    const out = hoursByWeekday([occ({ date: '2026-08-20', durationMinutes: 120 })]);
    expect(out[4]).toBe(2);
    expect(out.filter((h) => h > 0)).toHaveLength(1);
  });

  it('bỏ qua buổi đã hủy và vắng mặt', () => {
    const out = hoursByWeekday([
      occ({ date: '2026-08-20', durationMinutes: 120, status: 'CANCELLED' }),
      occ({ date: '2026-08-20', durationMinutes: 60, status: 'NO_SHOW' }),
    ]);
    expect(out.every((h) => h === 0)).toBe(true);
  });

  it('luôn trả về đúng 7 phần tử', () => {
    expect(hoursByWeekday([])).toHaveLength(7);
  });
});

describe('hoursByMonth', () => {
  it('gom theo tháng của ngày bắt đầu', () => {
    const out = hoursByMonth([
      occ({ date: '2026-08-31', durationMinutes: 120 }),
      occ({ date: '2026-09-01', durationMinutes: 60 }),
    ]);
    expect(out.get('2026-08')).toBe(2);
    expect(out.get('2026-09')).toBe(1);
  });

  it('ca qua đêm vẫn thuộc tháng của ngày BẮT ĐẦU', () => {
    // 31/08 22:00 kéo sang 01/09 — quy ước "ngày sở hữu sự kiện" của hệ thống
    const out = hoursByMonth([
      occ({ date: '2026-08-31', startTime: '22:00', durationMinutes: 240 }),
    ]);
    expect(out.get('2026-08')).toBe(4);
    expect(out.has('2026-09')).toBe(false);
  });
});

describe('monthRange', () => {
  it('bao gồm cả hai đầu', () => {
    expect(monthRange('2026-06', '2026-08')).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('vượt ranh giới năm', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('cùng một tháng thì trả về đúng một phần tử', () => {
    expect(monthRange('2026-08', '2026-08')).toEqual(['2026-08']);
  });

  it('khoảng ngược thì trả về rỗng, không lặp vô hạn', () => {
    expect(monthRange('2026-08', '2026-01')).toEqual([]);
  });

  it('sinh ra CẢ tháng không có dữ liệu', () => {
    // Bỏ tháng trống đi thì hai tháng cách nhau nửa năm sẽ đứng cạnh nhau
    // trên trục và người xem đọc ra một xu hướng không tồn tại.
    expect(monthRange('2026-01', '2026-12')).toHaveLength(12);
  });
});
