import { describe, expect, it } from 'vitest';

import { planWeekCopy } from '../copyWeek';
import { toAbsolute } from '../time';
import type { Occurrence } from '../../types';

function occ(over: Partial<Occurrence> = {}): Occurrence {
  const date = over.date ?? '2026-08-17';
  const startTime = over.startTime ?? '08:00';
  const durationMinutes = over.durationMinutes ?? 60;
  const startAbs = toAbsolute(date, startTime);
  return {
    key: over.key ?? `k-${Math.random()}`,
    sourceType: 'SINGLE',
    sourceId: 'e1',
    title: 'Ca sáng',
    categoryId: 'cat-a',
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

// Tuần nguồn 17/08 (T2) → tuần đích 24/08 (T2)
const FROM = '2026-08-17';
const TO = '2026-08-24';

function plan(source: Occurrence[], target: Occurrence[] = []) {
  return planWeekCopy({ source, target, fromWeekStart: FROM, toWeekStart: TO });
}

describe('planWeekCopy — dời ngày', () => {
  it('cộng đúng khoảng lệch giữa hai tuần, giữ nguyên thứ trong tuần', () => {
    const r = plan([
      occ({ date: '2026-08-17' }), // T2
      occ({ date: '2026-08-20' }), // T5
      occ({ date: '2026-08-23' }), // CN
    ]);

    expect(r.drafts.map((d) => d.date)).toEqual([
      '2026-08-24',
      '2026-08-27',
      '2026-08-30',
    ]);
  });

  it('chép ngược về tuần trước cũng đúng', () => {
    const r = planWeekCopy({
      source: [occ({ date: '2026-08-20' })],
      target: [],
      fromWeekStart: '2026-08-17',
      toWeekStart: '2026-08-10',
    });
    expect(r.drafts[0].date).toBe('2026-08-13');
  });

  it('chép qua ranh giới tháng', () => {
    const r = planWeekCopy({
      source: [occ({ date: '2026-08-31' })],
      target: [],
      fromWeekStart: '2026-08-31',
      toWeekStart: '2026-09-07',
    });
    expect(r.drafts[0].date).toBe('2026-09-07');
  });

  it('giữ nguyên giờ, thời lượng và mọi trường nội dung', () => {
    const r = plan([
      occ({
        title: 'Ca đêm',
        categoryId: 'cat-work',
        startTime: '22:00',
        durationMinutes: 240,
        location: 'Rossi',
        clientName: 'Rossi',
        notes: 'nhớ mang thẻ',
        ratePerHour: 37_037,
      }),
    ]);

    expect(r.drafts[0]).toMatchObject({
      title: 'Ca đêm',
      categoryId: 'cat-work',
      startTime: '22:00',
      durationMinutes: 240,
      location: 'Rossi',
      clientName: 'Rossi',
      notes: 'nhớ mang thẻ',
      ratePerHour: 37_037,
    });
  });
});

describe('planWeekCopy — cái gì được chép', () => {
  it('bỏ buổi do lịch lặp sinh ra', () => {
    const r = plan([
      occ({ sourceType: 'RULE', sourceId: 'r1', ruleOriginalDate: '2026-08-17' }),
      occ({ date: '2026-08-18' }),
    ]);

    expect(r.drafts).toHaveLength(1);
    expect(r.skippedRecurring).toBe(1);
  });

  it('bỏ cả buổi của chuỗi đã bị DỜI — nó vẫn là buổi của chuỗi', () => {
    // Buổi gốc 17/08 dời sang 19/08: date đổi nhưng ruleOriginalDate còn nguyên.
    const r = plan([
      occ({
        sourceType: 'RULE',
        sourceId: 'r1',
        date: '2026-08-19',
        ruleOriginalDate: '2026-08-17',
        exceptionId: 'x1',
      }),
    ]);

    expect(r.drafts).toHaveLength(0);
    expect(r.skippedRecurring).toBe(1);
  });

  it('CHÉP ngoại lệ loại ADD, dù sourceType là RULE', () => {
    // ADD là buổi thêm tay đúng một lần — không có ruleOriginalDate, không lặp.
    // Lọc theo sourceType sẽ đánh rơi đúng nhóm này.
    const r = plan([
      occ({ sourceType: 'RULE', sourceId: 'r1', exceptionId: 'x9', title: 'Dạy bù' }),
    ]);

    expect(r.skippedRecurring).toBe(0);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].title).toBe('Dạy bù');
  });

  it('bỏ buổi đã hủy và buổi vắng mặt', () => {
    const r = plan([
      occ({ status: 'CANCELLED' }),
      occ({ status: 'NO_SHOW', date: '2026-08-18' }),
      occ({ status: 'COMPLETED', date: '2026-08-19' }),
    ]);

    expect(r.skippedCancelled).toBe(2);
    expect(r.drafts).toHaveLength(1);
  });

  it('bản sao luôn ở trạng thái SCHEDULED, kể cả chép từ buổi đã hoàn thành', () => {
    const r = plan([occ({ status: 'COMPLETED' })]);
    expect(r.drafts[0].status).toBe('SCHEDULED');
  });

  it('tuần nguồn rỗng cho ra kế hoạch rỗng, không nổ', () => {
    const r = plan([]);
    expect(r.drafts).toHaveLength(0);
    expect(r.conflicts).toBe(0);
    expect(r.skippedRecurring).toBe(0);
    expect(r.skippedCancelled).toBe(0);
  });
});

describe('planWeekCopy — đếm trùng giờ', () => {
  it('không có gì ở tuần đích thì không trùng', () => {
    const r = plan([occ()]);
    expect(r.conflicts).toBe(0);
  });

  it('đếm bản nháp đè lên buổi có sẵn', () => {
    const r = plan(
      [occ({ startTime: '08:00', durationMinutes: 120 })],
      [occ({ date: '2026-08-24', startTime: '09:00', durationMinutes: 60 })],
    );
    expect(r.conflicts).toBe(1);
  });

  it('chạm mép không tính là trùng', () => {
    // 08:00–09:00 rồi 09:00–10:00 là hai ca liền nhau, không phải chồng nhau.
    const r = plan(
      [occ({ startTime: '08:00', durationMinutes: 60 })],
      [occ({ date: '2026-08-24', startTime: '09:00', durationMinutes: 60 })],
    );
    expect(r.conflicts).toBe(0);
  });

  it('buổi đã hủy ở tuần đích không tính là trùng', () => {
    const r = plan(
      [occ({ startTime: '08:00', durationMinutes: 120 })],
      [
        occ({
          date: '2026-08-24',
          startTime: '09:00',
          durationMinutes: 60,
          status: 'CANCELLED',
        }),
      ],
    );
    expect(r.conflicts).toBe(0);
  });

  it('một bản nháp đè lên ba buổi vẫn chỉ tính là một', () => {
    const r = plan(
      [occ({ startTime: '08:00', durationMinutes: 480 })],
      [
        occ({ date: '2026-08-24', startTime: '09:00' }),
        occ({ date: '2026-08-24', startTime: '11:00' }),
        occ({ date: '2026-08-24', startTime: '13:00' }),
      ],
    );
    expect(r.conflicts).toBe(1);
  });

  it('trùng ngày khác thì không tính', () => {
    const r = plan(
      [occ({ date: '2026-08-17', startTime: '08:00' })],
      [occ({ date: '2026-08-25', startTime: '08:00' })],
    );
    expect(r.conflicts).toBe(0);
  });
});
