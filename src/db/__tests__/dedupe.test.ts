// ═══════════════════════════════════════════════════════════════════════════
//  db/dedupe.ts — gộp danh mục trùng
//
//  Bài đầu tiên TÁI TẠO chính lỗi đã xảy ra với người dùng: seed hai lần trên
//  hai IndexedDB khác nhau rồi đồng bộ, và đếm xem "Gia sư" xuất hiện mấy lần.
//  Không có nó thì phần còn lại chỉ chứng minh hàm gộp chạy, chứ không chứng
//  minh nó giải quyết đúng vấn đề.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import { SEEDED_CATEGORY_IDS, UNCATEGORIZED_ID } from '../../types';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { seedIfEmpty } from '../seed';
import {
  countCategoryRefs,
  dropUnusedSeedDuplicates,
  findDuplicates,
  mergeCategories,
} from '../dedupe';

const NOW = '2026-08-24T00:00:00.000Z';
const base = { createdAt: NOW, updatedAt: NOW };

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(ALL_TABLES.map((t) => t.clear()));
});

// ─── Nguyên nhân gốc ───────────────────────────────────────────────────────

describe('seedIfEmpty — danh tính phải ỔN ĐỊNH giữa các máy', () => {
  it('seed hai lần cho ra CÙNG bộ id', async () => {
    // ⚠️ Đây là bài canh đúng lỗi đã báo.
    //
    // Bản trước dùng `newId()`, nên mỗi IndexedDB mới sinh một bộ id khác cho
    // cùng năm khái niệm. Đồng bộ coi chúng là bản ghi mới và đẩy lên, rồi
    // kéo bản cũ về — "Gia sư" nhân thành hai, ba, bốn.
    //
    // Đổi bất kỳ id nào trong seed.ts về `newId()` là bài này đỏ.
    await seedIfEmpty();
    const first = (await db.categories.toArray()).map((c) => c.id).sort();

    await db.categories.clear();
    await seedIfEmpty();
    const second = (await db.categories.toArray()).map((c) => c.id).sort();

    expect(second).toEqual(first);
  });

  it('mọi id seed đều là hằng số đọc được, không phải UUID', async () => {
    await seedIfEmpty();
    const ids = (await db.categories.toArray()).map((c) => c.id);
    for (const id of ids) expect(id.startsWith('sys-')).toBe(true);
  });

  it('hai máy seed rồi trộn lại KHÔNG sinh bản trùng', async () => {
    // Mô phỏng đúng đường đi của lỗi: máy A seed, máy B seed, đồng bộ gộp.
    await seedIfEmpty();
    const mayA = await db.categories.toArray();

    await db.categories.clear();
    await seedIfEmpty();
    const mayB = await db.categories.toArray();

    // `bulkPut` theo id — đúng cách planSync ghi dữ liệu kéo về.
    await db.categories.bulkPut(mayA);
    await db.categories.bulkPut(mayB);

    const names = (await db.categories.toArray()).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n === 'Gia sư')).toHaveLength(1);
  });
});

// ─── Đếm tham chiếu ────────────────────────────────────────────────────────

describe('countCategoryRefs — phải đếm đủ BẢY nơi', () => {
  it('đếm được exceptions.newCategoryId', async () => {
    // ⚠️ Trường này tên KHÁC sáu cái kia, nên tìm bằng cách gõ "categoryId" là
    // bỏ sót. Bỏ sót thì gộp xong, buổi đã đổi danh mục riêng sẽ trỏ tới danh
    // mục vừa bị xóa mềm và biến mất khỏi mọi bộ lọc.
    await db.exceptions.add({
      id: 'x1', type: 'REPLACE', recurringRuleId: 'r1',
      originalDate: '2026-08-10', newCategoryId: 'cat-a', ...base,
    });
    expect((await countCategoryRefs())['cat-a']).toBe(1);
  });

  it('cộng dồn qua nhiều bảng', async () => {
    await db.rules.add({
      id: 'r1', title: 'Ca', categoryId: 'cat-a', freq: 'WEEKLY', interval: 1,
      daysOfWeek: [1], startDate: '2026-08-03', startTime: '18:00',
      durationMinutes: 120, ...base,
    });
    await db.events.add({
      id: 'e1', title: 'Họp', categoryId: 'cat-a', date: '2026-08-24',
      startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base,
    });
    await db.payments.add({
      id: 'p1', clientId: 'minh', clientLabel: 'Minh', categoryId: 'cat-a',
      month: '2026-08', amount: 100, ...base,
    });
    expect((await countCategoryRefs())['cat-a']).toBe(3);
  });
});

// ─── Gộp ───────────────────────────────────────────────────────────────────

async function twoTutorCategories() {
  await db.categories.bulkAdd([
    { id: 'keep', name: 'Gia sư', color: '#10b981', isIncomeEligible: true, ...base },
    { id: 'dup', name: 'Gia sư', color: '#10b981', isIncomeEligible: true, ...base },
  ]);
}

describe('mergeCategories', () => {
  it('trỏ lại tham chiếu ở CẢ BẢY nơi rồi xóa mềm bản thừa', async () => {
    await twoTutorCategories();
    await db.rules.add({
      id: 'r1', title: 'Ca', categoryId: 'dup', freq: 'WEEKLY', interval: 1,
      daysOfWeek: [1], startDate: '2026-08-03', startTime: '18:00',
      durationMinutes: 120, ...base,
    });
    await db.events.add({
      id: 'e1', title: 'Họp', categoryId: 'dup', date: '2026-08-24',
      startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base,
    });
    await db.salaryRules.add({
      id: 's1', categoryId: 'dup', mode: 'HOURLY', effectiveFrom: '2026-01',
      ratePerHour: 45000, currency: 'VND', ...base,
    });
    await db.adjustments.add({
      id: 'a1', categoryId: 'dup', month: '2026-08', kind: 'BONUS',
      label: 'Thưởng', amount: 100, ...base,
    });
    await db.adjustmentTemplates.add({
      id: 't1', categoryId: 'dup', kind: 'BONUS', label: 'Mẫu', defaultAmount: 100, ...base,
    });
    await db.payments.add({
      id: 'p1', clientId: 'minh', clientLabel: 'Minh', categoryId: 'dup',
      month: '2026-08', amount: 100, ...base,
    });
    await db.exceptions.add({
      id: 'x1', type: 'REPLACE', recurringRuleId: 'r1',
      originalDate: '2026-08-10', newCategoryId: 'dup', ...base,
    });

    const result = await mergeCategories('keep', ['dup']);

    expect(result.repointed).toBe(7);
    expect(result.removed).toBe(1);
    expect((await countCategoryRefs())['dup'] ?? 0).toBe(0);
    expect((await countCategoryRefs())['keep']).toBe(7);
    expect((await db.categories.get('dup'))?.deletedAt).toBeTruthy();
  });

  it('XÓA MỀM chứ không xóa cứng — tombstone mang lệnh xóa sang máy khác', async () => {
    // Xóa cứng thì máy kia sẽ đẩy danh mục đó sống lại ở lần đồng bộ sau, và
    // bản trùng quay về. Cùng vòng lặp đã gặp ở Thùng rác.
    await twoTutorCategories();
    await mergeCategories('keep', ['dup']);
    expect(await db.categories.get('dup')).toBeDefined();
  });

  it('không đụng tới bản ghi của danh mục khác', async () => {
    await twoTutorCategories();
    await db.categories.add({ id: 'other', name: 'Đi làm', color: '#000', isIncomeEligible: true, ...base });
    await db.events.add({
      id: 'e-other', title: 'X', categoryId: 'other', date: '2026-08-24',
      startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base,
    });

    await mergeCategories('keep', ['dup']);

    expect((await db.events.get('e-other'))?.categoryId).toBe('other');
  });

  it('gộp một danh mục vào chính nó thì ném lỗi', async () => {
    await twoTutorCategories();
    await expect(mergeCategories('keep', ['keep'])).rejects.toThrow();
  });

  it('gộp được nhiều bản cùng lúc', async () => {
    await db.categories.bulkAdd([
      { id: 'keep', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
      { id: 'd1', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
      { id: 'd2', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
    ]);
    const result = await mergeCategories('keep', ['d1', 'd2']);
    expect(result.removed).toBe(2);
    expect((await findDuplicates()).groups).toEqual([]);
  });
});

describe('mergeCategories — hoàn tác', () => {
  it('trả từng bản ghi về ĐÚNG danh mục cũ của nó', async () => {
    // Không phải "trỏ hết về một cái nào đó": gộp hai bản khác nhau vào một
    // thì hoàn tác phải tách lại đúng như cũ.
    await db.categories.bulkAdd([
      { id: 'keep', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
      { id: 'd1', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
      { id: 'd2', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base },
    ]);
    await db.events.bulkAdd([
      { id: 'e1', title: 'A', categoryId: 'd1', date: '2026-08-24', startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base },
      { id: 'e2', title: 'B', categoryId: 'd2', date: '2026-08-25', startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base },
    ]);

    const result = await mergeCategories('keep', ['d1', 'd2']);
    expect((await db.events.get('e1'))?.categoryId).toBe('keep');

    await result.undo();

    expect((await db.events.get('e1'))?.categoryId).toBe('d1');
    expect((await db.events.get('e2'))?.categoryId).toBe('d2');
  });

  it('gỡ tombstone khỏi danh mục đã gộp', async () => {
    await twoTutorCategories();
    const result = await mergeCategories('keep', ['dup']);
    await result.undo();
    expect((await db.categories.get('dup'))?.deletedAt).toBeUndefined();
  });
});

// ─── Dọn tự động ───────────────────────────────────────────────────────────

describe('dropUnusedSeedDuplicates', () => {
  it('máy mới: seed rồi kéo về danh mục thật → bản seed thừa tự biến mất', async () => {
    // Đúng đường đi của một máy mới cài app cho tài khoản đã có dữ liệu.
    await seedIfEmpty();
    await db.categories.add({ id: 'cua-toi', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base });
    await db.events.add({
      id: 'e1', title: 'Ca', categoryId: 'cua-toi', date: '2026-08-24',
      startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base,
    });

    expect(await dropUnusedSeedDuplicates()).toBe(1);

    const live = (await db.categories.toArray()).filter((c) => !c.deletedAt);
    expect(live.filter((c) => c.name === 'Gia sư')).toHaveLength(1);
    expect(live.find((c) => c.name === 'Gia sư')?.id).toBe('cua-toi');
  });

  it('không có gì trùng thì không đụng vào đâu cả', async () => {
    await seedIfEmpty();
    expect(await dropUnusedSeedDuplicates()).toBe(0);
    expect((await db.categories.toArray()).filter((c) => c.deletedAt)).toHaveLength(0);
  });

  it('bản seed ĐÃ dùng thì giữ nguyên, để người dùng tự quyết', async () => {
    await seedIfEmpty();
    await db.categories.add({ id: 'cua-toi', name: 'Gia sư', color: '#000', isIncomeEligible: true, ...base });
    await db.events.add({
      id: 'e1', title: 'Ca', categoryId: SEEDED_CATEGORY_IDS.tutor, date: '2026-08-24',
      startTime: '09:00', durationMinutes: 60, status: 'SCHEDULED', ...base,
    });

    expect(await dropUnusedSeedDuplicates()).toBe(0);
  });

  it('không bao giờ đụng vào "Chưa phân loại"', async () => {
    await seedIfEmpty();
    await db.categories.add({ id: 'gia-mao', name: 'Chưa phân loại', color: '#000', isIncomeEligible: false, ...base });

    await dropUnusedSeedDuplicates();

    expect((await db.categories.get(UNCATEGORIZED_ID))?.deletedAt).toBeUndefined();
  });
});
