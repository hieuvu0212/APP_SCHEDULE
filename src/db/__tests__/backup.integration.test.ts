// ═══════════════════════════════════════════════════════════════════════════
//  Test tích hợp: sao lưu, khôi phục, thùng rác
//
//  core/backup.ts đã có test cho phần kiểm tra hình dạng và quy tắc trộn.
//  Ở đây kiểm phần còn lại: dữ liệu đi qua IndexedDB rồi quay về có còn
//  nguyên vẹn không. Đó là chỗ mà một hàm thuần đúng vẫn có thể lắp sai.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { exportBackup, importBackup } from '../backup';
import { createCategory } from '../repo/categories';
import { createEvent } from '../repo/events';
import { createRule } from '../repo/rules';
import { listTrash, purgeOlderThan, restoreFromTrash } from '../repo/trash';
import { purgeCutoff } from '../../core/trash';
import { countRecords, validateBackup } from '../../core/backup';
import { SCHEMA_VERSION } from '../schema';

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(ALL_TABLES.map((t) => t.clear()));
});

async function seedSample() {
  const catId = await createCategory({
    name: 'Gia sư',
    color: '#10b981',
    isIncomeEligible: true,
    sortOrder: 1,
  });
  await createRule({
    title: 'Dạy Minh',
    categoryId: catId,
    freq: 'WEEKLY',
    interval: 1,
    daysOfWeek: [4],
    startDate: '2026-08-06',
    startTime: '08:00',
    durationMinutes: 240,
  });
  await createEvent({
    title: '中文课 HSK4',
    categoryId: catId,
    date: '2026-08-05',
    startTime: '19:00',
    durationMinutes: 90,
    status: 'SCHEDULED',
  });
  return catId;
}

// ───────────────────────────────────────────────────────────────────────────

describe('exportBackup', () => {
  it('file xuất ra tự nó phải qua được vòng kiểm tra của chính mình', async () => {
    await seedSample();
    const backup = await exportBackup();
    const result = validateBackup(backup, SCHEMA_VERSION);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(countRecords(result.backup)).toBe(3);
      expect(result.unknownTables).toEqual([]);
    }
  });

  it('giữ nguyên chuỗi Unicode qua vòng JSON', async () => {
    // Tiêu đề là dữ liệu người dùng và có thể là bất kỳ thứ tiếng nào.
    await seedSample();
    const text = JSON.stringify(await exportBackup());
    const parsed = JSON.parse(text) as { data: { events: Array<{ title: string }> } };
    expect(parsed.data.events[0].title).toBe('中文课 HSK4');
  });

  it('giữ lại cả bản ghi đã xóa mềm', async () => {
    // Bỏ tombstone đi thì khôi phục xong, mọi thứ người dùng đã cố ý dọn sẽ
    // hiện về.
    const catId = await seedSample();
    await db.categories.update(catId, { deletedAt: '2026-08-01T00:00:00Z' });

    const backup = await exportBackup();
    const cats = backup.data.categories as Array<{ deletedAt?: string }>;
    expect(cats.some((c) => c.deletedAt === '2026-08-01T00:00:00Z')).toBe(true);
  });
});

describe('importBackup', () => {
  it('xuất rồi nhập lại chế độ TRỘN là thao tác không đổi gì', async () => {
    await seedSample();
    const backup = await exportBackup();

    const report = await importBackup(backup, 'merge');

    expect(report.added).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.kept).toBe(3);
    expect(await db.events.count()).toBe(1);
  });

  it('TRỘN không xóa dữ liệu chỉ có ở máy này', async () => {
    await seedSample();
    const backup = await exportBackup();

    await createEvent({
      title: 'Thêm sau khi xuất file',
      categoryId: 'cat-x',
      date: '2026-09-01',
      startTime: '10:00',
      durationMinutes: 60,
      status: 'SCHEDULED',
    });

    await importBackup(backup, 'merge');
    expect(await db.events.count()).toBe(2);
  });

  it('GHI ĐÈ xóa sạch rồi dựng lại đúng nội dung file', async () => {
    await seedSample();
    const backup = await exportBackup();

    await createEvent({
      title: 'Sẽ bị ghi đè mất',
      categoryId: 'cat-x',
      date: '2026-09-01',
      startTime: '10:00',
      durationMinutes: 60,
      status: 'SCHEDULED',
    });
    expect(await db.events.count()).toBe(2);

    await importBackup(backup, 'replace');
    expect(await db.events.count()).toBe(1);
    expect((await db.events.toArray())[0].title).toBe('中文课 HSK4');
  });

  it('TRỘN lấy bản có updatedAt muộn hơn', async () => {
    const catId = await seedSample();
    const backup = await exportBackup();

    // Máy này sửa sau khi xuất file → bản trong DB phải thắng.
    await db.categories.update(catId, {
      name: 'Đổi sau',
      updatedAt: '2099-01-01T00:00:00Z',
    });
    await importBackup(backup, 'merge');
    expect((await db.categories.get(catId))?.name).toBe('Đổi sau');

    // Ngược lại: file mới hơn thì file thắng.
    await db.categories.update(catId, { updatedAt: '2000-01-01T00:00:00Z' });
    await importBackup(backup, 'merge');
    expect((await db.categories.get(catId))?.name).toBe('Gia sư');
  });
});

describe('thùng rác', () => {
  it('chỉ liệt kê bản ghi mang tombstone', async () => {
    const catId = await seedSample();
    expect(await listTrash()).toEqual([]);

    await db.categories.update(catId, { deletedAt: '2026-08-01T00:00:00Z' });
    const items = await listTrash();

    expect(items).toHaveLength(1);
    expect(items[0].table).toBe('categories');
    expect(items[0].label).toBe('Gia sư');
  });

  it('khôi phục gỡ tombstone', async () => {
    const catId = await seedSample();
    await db.categories.update(catId, { deletedAt: '2026-08-01T00:00:00Z' });

    await restoreFromTrash('categories', catId);

    expect((await db.categories.get(catId))?.deletedAt).toBeUndefined();
    expect(await listTrash()).toEqual([]);
  });

  it('dọn vĩnh viễn chỉ đụng bản ghi CŨ HƠN mốc, không đụng bản đang sống', async () => {
    const catId = await seedSample();
    const events = await db.events.toArray();

    await db.categories.update(catId, { deletedAt: '2020-01-01T00:00:00Z' });
    await db.events.update(events[0].id, { deletedAt: new Date().toISOString() });

    // Trả về DANH SÁCH id chứ không phải số đếm: `db/purge.ts` cần biết đúng
    // những id nào để xóa theo ở phía đám mây. Thiếu chúng thì bản ghi sống
    // lại ở lần đồng bộ kế tiếp — xem db/__tests__/purge.test.ts.
    const removed = await purgeOlderThan(purgeCutoff(30));

    expect(removed).toEqual([{ table: 'categories', id: catId }]);
    expect(await db.categories.get(catId)).toBeUndefined();
    // Vừa xóa hôm nay → chưa tới lượt.
    expect(await db.events.count()).toBe(1);
    // Rule chưa bị xóa bao giờ → không được đụng tới.
    expect(await db.rules.count()).toBe(1);
  });
});
