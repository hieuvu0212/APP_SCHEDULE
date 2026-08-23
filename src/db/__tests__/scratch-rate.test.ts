// Scratch reproduction — sẽ xóa sau khi chẩn đoán xong.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { createRule } from '../repo/rules';
import { expandSchedule } from '../../core/expand';
import { applySubmit } from '../../actions/schedule';
import { upsertException } from '../repo/exceptions';
import type { Occurrence } from '../../types';

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(ALL_TABLES.map((t) => t.clear()));
});

const rule0 = {
  title: 'Gia sư',
  categoryId: 'cat-a',
  freq: 'WEEKLY' as const,
  interval: 1,
  daysOfWeek: [1],
  startDate: '2026-08-03',
  startTime: '18:00',
  durationMinutes: 120,
  ratePerHour: 50000,
};

const expand = (): Occurrence[] =>
  expandSchedule({
    rules: [],
    exceptions: [],
    events: [],
    windowStart: '2026-08-01',
    windowEnd: '2026-08-31',
    now: new Date('2026-01-01T00:00:00Z'),
    autoCompletePast: false,
  });

describe('SCRATCH rate override', () => {
  it('OCCURRENCE: xóa override phải quay về rate của rule', async () => {
    const ruleId = await createRule(rule0);
    const reload = () =>
      Promise.all([db.rules.toArray(), db.exceptions.toArray(), db.events.toArray()]).then(
        ([rules, exceptions, events]) =>
          expandSchedule({
            rules,
            exceptions,
            events,
            windowStart: '2026-08-01',
            windowEnd: '2026-08-31',
            now: new Date('2026-01-01T00:00:00Z'),
            autoCompletePast: false,
          }),
      );

    let occ = (await reload()).find((o) => o.ruleOriginalDate === '2026-08-03')!;
    expect(occ.ratePerHour).toBe(50000);

    // 1. Đặt override 60000
    await applySubmit(
      {
        title: 'Gia sư',
        categoryId: 'cat-a',
        date: '2026-08-03',
        startTime: '18:00',
        durationMinutes: 120,
        ratePerHour: 60000,
        fixedAmount: undefined,
        status: 'SCHEDULED',
        recurrence: null,
        scope: 'OCCURRENCE',
      },
      { kind: 'rule', rule: (await db.rules.get(ruleId))!, occurrence: occ },
    );
    occ = (await reload()).find((o) => o.ruleOriginalDate === '2026-08-03')!;
    expect(occ.ratePerHour).toBe(60000);

    // 2. Xóa override (moneyMode none → undefined)
    await applySubmit(
      {
        title: 'Gia sư',
        categoryId: 'cat-a',
        date: '2026-08-03',
        startTime: '18:00',
        durationMinutes: 120,
        ratePerHour: undefined,
        fixedAmount: undefined,
        status: 'SCHEDULED',
        recurrence: null,
        scope: 'OCCURRENCE',
      },
      { kind: 'rule', rule: (await db.rules.get(ruleId))!, occurrence: occ },
    );
    occ = (await reload()).find((o) => o.ruleOriginalDate === '2026-08-03')!;
    expect(occ.ratePerHour).toBe(50000); // ← kỳ vọng quay về rate rule

    const exc = await db.exceptions.toArray();
    console.log('EXCEPTION SAU KHI XÓA:', JSON.stringify(exc, null, 2));
  });

  it('rate = 0 phải được giữ nguyên (không rơi về rule)', async () => {
    const ruleId = await createRule(rule0);
    await upsertException({
      type: 'REPLACE',
      recurringRuleId: ruleId,
      originalDate: '2026-08-03',
      newRatePerHour: 0,
    });
    const [rules, exceptions] = await Promise.all([db.rules.toArray(), db.exceptions.toArray()]);
    const occ = expandSchedule({
      rules,
      exceptions,
      events: [],
      windowStart: '2026-08-01',
      windowEnd: '2026-08-31',
      now: new Date('2026-01-01T00:00:00Z'),
      autoCompletePast: false,
    }).find((o) => o.ruleOriginalDate === '2026-08-03')!;
    expect(occ.ratePerHour).toBe(0);
    console.log('RATE 0:', occ.ratePerHour);
  });

  it('ADD: xóa override phải quay về rate của rule gốc', async () => {
    const ruleId = await createRule(rule0);
    await upsertException({
      type: 'ADD',
      recurringRuleId: ruleId,
      newDate: '2026-08-05',
      newStartTime: '09:00',
      newDurationMinutes: 90,
      newTitle: 'Buổi thêm',
      newRatePerHour: 60000,
    });
    const reload = async () => {
      const [rules, exceptions] = await Promise.all([db.rules.toArray(), db.exceptions.toArray()]);
      return expandSchedule({
        rules,
        exceptions,
        events: [],
        windowStart: '2026-08-01',
        windowEnd: '2026-08-31',
        now: new Date('2026-01-01T00:00:00Z'),
        autoCompletePast: false,
      }).find((o) => o.date === '2026-08-05')!;
    };

    let occ = await reload();
    expect(occ.ratePerHour).toBe(60000);

    // Xóa override trên buổi ADD
    await applySubmit(
      {
        title: 'Buổi thêm',
        categoryId: 'cat-a',
        date: '2026-08-05',
        startTime: '09:00',
        durationMinutes: 90,
        ratePerHour: undefined,
        status: 'SCHEDULED',
        recurrence: null,
        scope: 'OCCURRENCE',
      },
      { kind: 'rule', rule: (await db.rules.get(ruleId))!, occurrence: occ },
    );
    occ = await reload();
    expect(occ.ratePerHour).toBe(50000);
    console.log('ADD SAU KHI XÓA:', occ.ratePerHour);
  });
});
