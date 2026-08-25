// ═══════════════════════════════════════════════════════════════════════════
//  Test tích hợp tầng db/ — các đường DỄ MẤT DỮ LIỆU
//
//  Chạy trên IndexedDB thật (bản trong bộ nhớ của fake-indexeddb), không mock.
//  Mock lại `db.rules.update()` chỉ chứng minh ta gọi đúng hàm; nó không
//  chứng minh được Dexie hiểu `deletedAt: undefined` là lệnh XÓA thuộc tính —
//  mà toàn bộ cơ chế hoàn tác dựa vào đúng hành vi đó.
//
//  Mỗi bài ở đây tương ứng với một lỗi ĐÃ TỪNG XẢY RA hoặc suýt xảy ra trong
//  quá trình dựng dự án.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { createCategory, softDeleteCategoryUndoable } from '../repo/categories';
import { bulkCreateEvents, createEvent } from '../repo/events';
import { applySubmit, copyWeek } from '../../actions/schedule';
import {
  createRule,
  restoreRule,
  softDeleteRule,
  splitRuleFrom,
  updateRule,
} from '../repo/rules';
import { occurrenceDates } from '../../core/expand';
import {
  setOccurrenceStatus,
  upsertException,
  upsertExceptionUndoable,
} from '../repo/exceptions';
import { UNCATEGORIZED_ID } from '../../types';

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(ALL_TABLES.map((t) => t.clear()));
  await db.categories.put({
    id: UNCATEGORIZED_ID,
    name: 'Chưa phân loại',
    color: '#94a3b8',
    isIncomeEligible: false,
    isSystem: true,
    sortOrder: 999,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
});

const weeklyRule = (over = {}) => ({
  title: 'Ca',
  categoryId: 'cat-a',
  freq: 'WEEKLY' as const,
  interval: 1,
  daysOfWeek: [1],
  startDate: '2026-08-03',
  startTime: '18:00',
  durationMinutes: 240,
  ...over,
});

// ───────────────────────────────────────────────────────────────────────────

describe('upsertExceptionUndoable — hoàn tác phải trả về ĐÚNG trạng thái cũ', () => {
  it('ghi CANCEL đè lên MOVE rồi hoàn tác thì buổi về NGÀY ĐÃ DỜI, không về ngày gốc', async () => {
    // Đây là lỗi mà cách hoàn tác ngây thơ ("xóa bản vừa ghi") sẽ gây ra.
    // Index unique chỉ cho MỘT exception mỗi buổi, nên ghi CANCEL là đè mất
    // thông tin đã dời. Xóa bản mới đi thì buổi quay về ngày gốc — hoàn tác
    // sai còn tệ hơn không có hoàn tác.
    const ruleId = await createRule(weeklyRule());

    await upsertException({
      type: 'MOVE',
      recurringRuleId: ruleId,
      originalDate: '2026-08-03',
      newDate: '2026-08-05',
      newStartTime: '09:00',
    });

    const { revert } = await upsertExceptionUndoable({
      type: 'CANCEL',
      recurringRuleId: ruleId,
      originalDate: '2026-08-03',
    });

    let current = await db.exceptions
      .where('[recurringRuleId+originalDate]')
      .equals([ruleId, '2026-08-03'])
      .first();
    expect(current?.type).toBe('CANCEL');

    await revert();

    current = await db.exceptions
      .where('[recurringRuleId+originalDate]')
      .equals([ruleId, '2026-08-03'])
      .first();
    expect(current?.type).toBe('MOVE');
    expect(current?.newDate).toBe('2026-08-05');
    expect(current?.newStartTime).toBe('09:00');
    expect(current?.deletedAt).toBeUndefined();
  });

  it('chưa từng có exception thì hoàn tác xóa MỀM, giữ tombstone', async () => {
    const ruleId = await createRule(weeklyRule());
    const { id, revert } = await upsertExceptionUndoable({
      type: 'CANCEL',
      recurringRuleId: ruleId,
      originalDate: '2026-08-03',
    });

    await revert();

    const row = await db.exceptions.get(id);
    // Vẫn còn bản ghi, chỉ mang tombstone — Phase đồng bộ Cloud cần tín hiệu
    // này để biết mà xóa ở máy khác.
    expect(row).toBeDefined();
    expect(typeof row?.deletedAt).toBe('string');
  });
});

describe('setOccurrenceStatus — KHÔNG được ghi đè `type`', () => {
  it('đánh dấu hoàn thành trên buổi đã dời thì vẫn giữ MOVE', async () => {
    // Nếu ghi thẳng type='STATUS', expandSchedule sẽ ngừng đọc `newDate`
    // (chỉ MOVE mới đọc) và ca nhảy ngược về ngày gốc. Lỗi này đã xuất hiện
    // trong dữ liệu thật của người dùng.
    const ruleId = await createRule(weeklyRule());
    await upsertException({
      type: 'MOVE',
      recurringRuleId: ruleId,
      originalDate: '2026-08-03',
      newDate: '2026-08-05',
    });

    await setOccurrenceStatus(ruleId, '2026-08-03', 'COMPLETED');

    const row = await db.exceptions
      .where('[recurringRuleId+originalDate]')
      .equals([ruleId, '2026-08-03'])
      .first();
    expect(row?.type).toBe('MOVE');
    expect(row?.newDate).toBe('2026-08-05');
    expect(row?.status).toBe('COMPLETED');
  });
});

describe('softDeleteRule / restoreRule — ngoại lệ phải đi và về CÙNG rule', () => {
  it('xóa chuỗi kéo theo exception, khôi phục kéo chúng trở lại', async () => {
    const ruleId = await createRule(weeklyRule());
    await upsertException({
      type: 'CANCEL',
      recurringRuleId: ruleId,
      originalDate: '2026-08-10',
    });

    const deletedAt = await softDeleteRule(ruleId);

    expect((await db.rules.get(ruleId))?.deletedAt).toBe(deletedAt);
    expect((await db.exceptions.toArray())[0].deletedAt).toBe(deletedAt);

    await restoreRule(ruleId, deletedAt);

    expect((await db.rules.get(ruleId))?.deletedAt).toBeUndefined();
    expect((await db.exceptions.toArray())[0].deletedAt).toBeUndefined();
  });

  it('KHÔNG khôi phục ngoại lệ vốn đã bị xóa từ TRƯỚC', async () => {
    // Nếu softDeleteRule đóng dấu lên cả bản ghi đã có tombstone, thao tác
    // hoàn tác sẽ kéo về cả những thứ người dùng đã cố ý xóa từ tuần trước.
    const ruleId = await createRule(weeklyRule());
    const oldId = await upsertException({
      type: 'CANCEL',
      recurringRuleId: ruleId,
      originalDate: '2026-08-10',
    });
    await db.exceptions.update(oldId, { deletedAt: '2020-01-01T00:00:00Z' });

    const deletedAt = await softDeleteRule(ruleId);
    await restoreRule(ruleId, deletedAt);

    expect((await db.exceptions.get(oldId))?.deletedAt).toBe('2020-01-01T00:00:00Z');
  });
});

describe('splitRuleFrom — hoàn nguyên phải đảo ĐỦ BA việc', () => {
  it('tách chuỗi rồi hoàn tác thì chuỗi cũ liền lại như chưa từng cắt', async () => {
    // Chỉ xóa rule mới sinh ra là chưa đủ: chuỗi cũ vẫn bị đóng `endDate` ở
    // ngày cắt, và mọi buổi sau đó biến mất vĩnh viễn.
    const ruleId = await createRule(weeklyRule({ endDate: '2026-12-31' }));
    await upsertException({
      type: 'CANCEL',
      recurringRuleId: ruleId,
      originalDate: '2026-09-07',
    });

    const { ruleId: newId, revert } = await splitRuleFrom(ruleId, '2026-08-31', {
      startTime: '19:00',
    });

    // Sau khi tách: rule cũ bị đóng lại, rule mới ra đời, exception nằm sau
    // mốc cắt bị dọn.
    expect((await db.rules.get(ruleId))?.endDate).toBe('2026-08-30');
    expect((await db.rules.get(newId))?.startTime).toBe('19:00');
    expect((await db.exceptions.toArray())[0].deletedAt).toBeDefined();

    await revert();

    expect((await db.rules.get(ruleId))?.endDate).toBe('2026-12-31');
    expect((await db.rules.get(newId))?.deletedAt).toBeDefined();
    expect((await db.exceptions.toArray())[0].deletedAt).toBeUndefined();
  });

  it('mốc cắt ở hoặc trước buổi đầu tiên thì sửa tại chỗ, không đẻ rule mới', async () => {
    const ruleId = await createRule(weeklyRule());
    const { ruleId: sameId, revert } = await splitRuleFrom(ruleId, '2026-08-03', {
      title: 'Đổi tên',
    });

    expect(sameId).toBe(ruleId);
    expect(await db.rules.count()).toBe(1);
    expect((await db.rules.get(ruleId))?.title).toBe('Đổi tên');

    await revert();
    expect((await db.rules.get(ruleId))?.title).toBe('Ca');
  });
});

describe('dời chuỗi lặp — ba phạm vi, ba kết quả khác hẳn nhau', () => {
  // Kịch bản người dùng báo: chuỗi hàng tuần Thứ Hai từ 17/08/2026, muốn
  // chuyển sang bắt đầu 03/08.
  const mondays = () =>
    weeklyRule({ title: 'Lớp', startDate: '2026-08-17', daysOfWeek: [1] });

  const datesIn = async (ruleId: string, from: string, to: string) => {
    const rule = await db.rules.get(ruleId);
    return occurrenceDates(rule!, from, to);
  };

  it('SERIES dời hẳn startDate — sinh đủ CẢ 03/08 lẫn 10/08', () => {
    // Đây là thứ người dùng mong đợi khi chọn "toàn bộ chuỗi".
    expect(
      occurrenceDates(
        { ...mondays(), id: 'x', createdAt: '', updatedAt: '', startDate: '2026-08-03' },
        '2026-08-01',
        '2026-08-31',
      ),
    ).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('OCCURRENCE chỉ dời MỘT buổi — 10/08 KHÔNG xuất hiện', async () => {
    // Đây là thứ đã thực sự xảy ra trong dữ liệu của người dùng. Chuỗi vẫn
    // bắt đầu 17/08 nên 10/08 chưa bao giờ tồn tại; buổi ở 03/08 là một
    // ngoại lệ MOVE. Dấu vết "thiếu 10/08" chính là bằng chứng phân biệt hai
    // trường hợp — nếu chuỗi thật sự dời thì 10/08 phải có.
    const ruleId = await createRule(mondays());
    await upsertException({
      type: 'MOVE',
      recurringRuleId: ruleId,
      originalDate: '2026-08-17',
      newDate: '2026-08-03',
    });

    // Rule vẫn sinh từ 17/08 — không có 03/08 lẫn 10/08 ở tầng rule.
    expect(await datesIn(ruleId, '2026-08-01', '2026-08-31')).toEqual([
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);

    const exception = (await db.exceptions.toArray())[0];
    expect(exception.type).toBe('MOVE');
    expect(exception.newDate).toBe('2026-08-03');
  });

  it('SERIES ghi startDate mới vào rule, hoàn tác trả lại ngày cũ', async () => {
    // Chặn tái phát lỗi "ô Ngày bị nuốt": trước đây nhánh SERIES bỏ qua
    // payload.date, nên người dùng gõ ngày mới rồi bấm Lưu mà không có gì
    // xảy ra — cũng không có gì báo.
    const ruleId = await createRule(mondays());
    await updateRule(ruleId, { startDate: '2026-08-03' });

    expect((await db.rules.get(ruleId))?.startDate).toBe('2026-08-03');
    expect(await datesIn(ruleId, '2026-08-01', '2026-08-31')).toContain('2026-08-10');

    await updateRule(ruleId, { startDate: '2026-08-17' });
    expect(await datesIn(ruleId, '2026-08-01', '2026-08-31')).not.toContain('2026-08-10');
  });
});

describe('softDeleteCategoryUndoable — lịch phải quay về ĐÚNG danh mục cũ', () => {
  it('xóa danh mục dời lịch sang Chưa phân loại, hoàn tác kéo về lại', async () => {
    const catId = await createCategory({
      name: 'Gia sư',
      color: '#10b981',
      isIncomeEligible: true,
      sortOrder: 1,
    });
    const ruleId = await createRule(weeklyRule({ categoryId: catId }));
    const eventId = await createEvent({
      title: 'Buổi lẻ',
      categoryId: catId,
      date: '2026-08-05',
      startTime: '08:00',
      durationMinutes: 60,
      status: 'SCHEDULED',
    });

    const undo = await softDeleteCategoryUndoable(catId);

    expect((await db.rules.get(ruleId))?.categoryId).toBe(UNCATEGORIZED_ID);
    expect((await db.events.get(eventId))?.categoryId).toBe(UNCATEGORIZED_ID);
    expect((await db.categories.get(catId))?.deletedAt).toBeDefined();

    await undo();

    // Gỡ tombstone thôi là chưa đủ — lịch phải được kéo về đúng danh mục.
    expect((await db.categories.get(catId))?.deletedAt).toBeUndefined();
    expect((await db.rules.get(ruleId))?.categoryId).toBe(catId);
    expect((await db.events.get(eventId))?.categoryId).toBe(catId);
  });

  it('không cho xóa danh mục hệ thống', async () => {
    await expect(softDeleteCategoryUndoable(UNCATEGORIZED_ID)).rejects.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('copyWeek — ghi hàng loạt và rút lại nguyên thao tác', () => {
  const draft = (over = {}) => ({
    title: 'Ca sáng',
    categoryId: UNCATEGORIZED_ID,
    date: '2026-08-24',
    startTime: '08:00',
    durationMinutes: 120,
    status: 'SCHEDULED' as const,
    ...over,
  });

  it('tạo đủ số buổi và trả về đúng ngần ấy id KHÁC NHAU', async () => {
    const ids = await bulkCreateEvents([
      draft(),
      draft({ date: '2026-08-25' }),
      draft({ date: '2026-08-26' }),
    ]);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(await db.events.count()).toBe(3);
  });

  it('mảng rỗng không ghi gì và không nổ', async () => {
    expect(await bulkCreateEvents([])).toEqual([]);
    expect(await db.events.count()).toBe(0);
  });

  it('hoàn tác xóa mềm TOÀN BỘ buổi vừa chép, không đụng buổi có sẵn', async () => {
    const existing = await createEvent(draft({ title: 'Có sẵn', date: '2026-08-24' }));

    const { undo } = await copyWeek([draft(), draft({ date: '2026-08-25' })]);
    expect(await db.events.filter((e) => !e.deletedAt).count()).toBe(3);

    await undo();

    const alive = await db.events.filter((e) => !e.deletedAt).toArray();
    expect(alive).toHaveLength(1);
    expect(alive[0].id).toBe(existing);
  });

  it('hoàn tác vẫn xóa buổi đã bị sửa sau khi chép', async () => {
    // Toast còn hiện thì người dùng vẫn sửa được buổi vừa chép. Hoàn tác là
    // rút lại NGUYÊN thao tác chép, nên buổi đã sửa cũng phải đi theo — bỏ
    // sót nó sẽ để lại đúng thứ mà người dùng tưởng đã biến mất.
    const { undo } = await copyWeek([draft(), draft({ date: '2026-08-25' })]);
    const first = (await db.events.toArray())[0];
    await db.events.update(first.id, { title: 'Đã đổi tên' });

    await undo();

    expect(await db.events.filter((e) => !e.deletedAt).count()).toBe(0);
    // Xóa MỀM: bản ghi còn đó để thùng rác thấy và để Cloud Sync biết đường.
    expect(await db.events.count()).toBe(2);
  });
});

describe('applySubmit — hoàn tác cho buổi ADD', () => {
  it('buổi ADD lấy đúng rate của exception để chụp snapshot hoàn tác', async () => {
    // Việc 3: Đảm bảo khi hoàn tác sửa buổi ADD, rate của nó không bị biến
    // thành rate fallback từ category.
    const ruleId = await createRule(weeklyRule());
    const exceptionId = await upsertException({
      type: 'ADD',
      recurringRuleId: ruleId,
      newDate: '2026-08-04',
      newStartTime: '08:00',
      newDurationMinutes: 60,
      newRatePerHour: undefined, // Thừa kế
    });

    const target = {
      kind: 'rule' as const,
      rule: await db.rules.get(ruleId) as any,
      occurrence: {
        exceptionId,
        date: '2026-08-04',
        startTime: '08:00',
        durationMinutes: 60,
        ratePerHour: 100_000, // Rate được resolve do thừa kế
      } as any,
    };

    const payload = {
      scope: 'OCCURRENCE' as const,
      date: '2026-08-04',
      startTime: '08:00',
      durationMinutes: 60,
      ratePerHour: 200_000, // Gán cứng
    };

    const { undo } = await applySubmit(payload as any, target);

    // Rate đã bị ghi đè thành 200k
    let exc = await db.exceptions.get(exceptionId);
    expect(exc?.newRatePerHour).toBe(200_000);

    // Hoàn tác
    await undo();

    exc = await db.exceptions.get(exceptionId);
    // Phải trở về undefined (rate thừa kế), không phải 100k
    expect(exc?.newRatePerHour).toBeUndefined();
  });
});
