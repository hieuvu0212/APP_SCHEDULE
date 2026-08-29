import { describe, it, expect } from 'vitest';
import { planReminderQueue } from '../pushQueue';
import type { Occurrence } from '../../types';

function makeOccurrence(patch: Partial<Occurrence>): Occurrence {
  return {
    key: 'rule-1:2026-08-30',
    sourceType: 'RULE',
    sourceId: 'rule-1',
    title: 'Học Toán',
    categoryId: 'cat-study',
    date: '2026-08-30',
    startTime: '18:00',
    durationMinutes: 90,
    endsNextDay: false,
    startAbs: new Date(2026, 7, 30, 18, 0).getTime(),
    endAbs: new Date(2026, 7, 30, 19, 30).getTime(),
    status: 'SCHEDULED',
    hasConflict: false,
    conflictWith: [],
    ...patch,
  };
}

describe('planReminderQueue', () => {
  // Test 1: fireAt luôn khớp /Z$/
  it('fireAt luôn kết thúc bằng Z (ISO 8601 UTC)', () => {
    const now = new Date(2026, 7, 30, 10, 0);
    const occ = makeOccurrence({
      startAbs: new Date(2026, 7, 30, 18, 0).getTime(),
    });

    const queue = planReminderQueue([occ], 30, now);
    expect(queue).toHaveLength(1);
    expect(queue[0].fireAt).toMatch(/Z$/);
    expect(queue[0].fireAt).toBe(new Date(2026, 7, 30, 17, 30).toISOString());
  });

  // Test 2: Buổi cách 5 phút với lead = 30 cho fireAt === now (Math.max bảo vệ không bị mốc quá khứ)
  it('buổi cách 5 phút với lead = 30 cho fireAt === now.toISOString()', () => {
    const now = new Date(2026, 7, 30, 17, 55);
    const occ = makeOccurrence({
      startAbs: new Date(2026, 7, 30, 18, 0).getTime(),
    });

    const queue = planReminderQueue([occ], 30, now);
    expect(queue).toHaveLength(1);
    expect(queue[0].fireAt).toBe(now.toISOString());
    expect(queue[0].minutesUntilStart).toBe(5);
  });

  // Test 3: Buổi đã qua / ngoài horizon không vào hàng đợi
  it('buổi đã qua hoặc ngoài horizonDays bị loại bỏ', () => {
    const now = new Date(2026, 7, 30, 10, 0);
    const pastOcc = makeOccurrence({
      key: 'occ-past',
      startAbs: new Date(2026, 7, 30, 9, 0).getTime(),
    });
    const validOcc = makeOccurrence({
      key: 'occ-valid',
      startAbs: new Date(2026, 7, 31, 10, 0).getTime(),
    });
    const beyondHorizonOcc = makeOccurrence({
      key: 'occ-beyond',
      startAbs: new Date(2026, 8, 15, 10, 0).getTime(), // 16 ngày sau (> 7 ngày)
    });

    const queue = planReminderQueue([pastOcc, validOcc, beyondHorizonOcc], 30, now, 7);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('occ-valid');
  });

  // Test 4: Ba trạng thái không phải SCHEDULED đều bị loại
  it('loại bỏ buổi có trạng thái CANCELLED, COMPLETED, NO_SHOW', () => {
    const now = new Date(2026, 7, 30, 10, 0);
    const scheduled = makeOccurrence({ key: 's1', status: 'SCHEDULED' });
    const cancelled = makeOccurrence({ key: 's2', status: 'CANCELLED' });
    const completed = makeOccurrence({ key: 's3', status: 'COMPLETED' });
    const noShow = makeOccurrence({ key: 's4', status: 'NO_SHOW' });

    const queue = planReminderQueue([scheduled, cancelled, completed, noShow], 30, now);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('s1');
  });

  // Test 5: Gọi hai lần cho ra cùng bộ id tất định
  it('gọi hai lần cho ra cùng bộ id tất định', () => {
    const now = new Date(2026, 7, 30, 10, 0);
    const occs = [
      makeOccurrence({ key: 'rule-1:2026-08-30', startAbs: new Date(2026, 7, 30, 14, 0).getTime(), startTime: '14:00' }),
      makeOccurrence({ key: 'rule-2:2026-08-30', startAbs: new Date(2026, 7, 30, 18, 0).getTime(), startTime: '18:00' }),
    ];

    const queue1 = planReminderQueue(occs, 30, now);
    const queue2 = planReminderQueue(occs, 30, now);

    expect(queue1.map((r) => r.id)).toEqual(['rule-1:2026-08-30', 'rule-2:2026-08-30']);
    expect(queue1).toEqual(queue2);
  });
});
