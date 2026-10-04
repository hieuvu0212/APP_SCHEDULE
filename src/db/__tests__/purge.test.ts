// ═══════════════════════════════════════════════════════════════════════════
//  db/purge.ts — xóa vĩnh viễn ở CẢ HAI phía
//
//  Lỗ hổng mà file này bịt: xóa cứng ở máy nhưng hàng trên đám mây còn nguyên,
//  nên lần đồng bộ kế tiếp kéo nó về và BẢN GHI SỐNG LẠI. Người dùng xóa lần
//  nữa, nó lại về — một vòng lặp mà nhìn từ phía họ thì giống hệt như ứng dụng
//  bị hỏng.
//
//  Bài "xóa rồi đồng bộ thì bản ghi KHÔNG quay về" ở cuối file là bài chứng
//  minh vòng lặp đó đã đóng. Nó chạy nguyên cả hai bước thật, không giả lập
//  kết quả.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { purgeOlderThan, purgeOne } from '../purge';
import { syncWithCloud, type CloudRow, type CloudTransport } from '../sync';

const USER = 'user-1';

function fakeCloud(seed: Record<string, CloudRow[]> = {}) {
  const tables = new Map<string, Map<string, CloudRow>>();
  for (const [name, rows] of Object.entries(seed)) {
    tables.set(name, new Map(rows.map((r) => [String(r.id), { ...r }])));
  }
  const store = (t: string) => tables.get(t) ?? new Map<string, CloudRow>();

  let deleteFails = false;

  const transport: CloudTransport = {
    userId: USER,
    async fetchManifest(table) {
      return [...store(table).values()].map((r) => ({
        id: String(r.id),
        updatedAt: (r.updated_at as string | null) ?? undefined,
      }));
    },
    async fetchByIds(table, ids) {
      return ids
        .map((id) => store(table).get(id))
        .filter((r): r is CloudRow => r !== undefined)
        .map((r) => ({ ...r }));
    },
    async fetchSample(table) {
      const first = [...store(table).values()][0];
      return first ? { ...first } : null;
    },
    async upsert(table, rows) {
      const s = store(table);
      tables.set(table, s);
      for (const row of rows) s.set(String(row.id), { ...(s.get(String(row.id)) ?? {}), ...row });
    },
    async deleteByIds(table, ids) {
      if (deleteFails) throw new Error('mạng lỗi');
      const s = store(table);
      for (const id of ids) s.delete(id);
    },
  };

  return {
    transport,
    breakDelete: () => {
      deleteFails = true;
    },
    rows: (table: string) => [...(tables.get(table)?.values() ?? [])],
  };
}

const OLD = '2020-01-01T00:00:00.000Z';

const deletedCategory = (id: string) => ({
  id,
  name: 'Cũ',
  color: '#94a3b8',
  isIncomeEligible: false,
  createdAt: OLD,
  updatedAt: OLD,
  deletedAt: OLD,
});

const cloudRow = (id: string): CloudRow => ({
  user_id: USER,
  id,
  name: 'Cũ',
  color: '#94a3b8',
  text_color: null,
  default_rate_per_hour: null,
  is_income_eligible: false,
  is_system: null,
  sort_order: null,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: OLD,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([...ALL_TABLES, db.syncBase].map((t) => t.clear()));
});

describe('purgeOne', () => {
  it('xóa ở máy VÀ trên đám mây', async () => {
    await db.categories.add(deletedCategory('cat-a'));
    const cloud = fakeCloud({ categories: [cloudRow('cat-a')] });

    const result = await purgeOne('categories', 'cat-a', cloud.transport);

    expect(result.removed).toBe(1);
    expect(result.cloud).toEqual({ kind: 'done', removed: 1 });
    expect(await db.categories.get('cat-a')).toBeUndefined();
    expect(cloud.rows('categories')).toHaveLength(0);
  });
});

describe('purgeOlderThan', () => {
  it('xóa mọi tombstone quá hạn ở cả hai phía', async () => {
    await db.categories.bulkAdd([deletedCategory('cat-a'), deletedCategory('cat-b')]);
    const cloud = fakeCloud({ categories: [cloudRow('cat-a'), cloudRow('cat-b')] });

    const result = await purgeOlderThan('2026-01-01T00:00:00.000Z', cloud.transport);

    expect(result.removed).toBe(2);
    expect(cloud.rows('categories')).toHaveLength(0);
  });

  it('không đụng tới bản ghi còn sống', async () => {
    await db.categories.bulkAdd([
      deletedCategory('cat-a'),
      { ...deletedCategory('cat-b'), deletedAt: undefined },
    ]);
    const cloud = fakeCloud();

    await purgeOlderThan('2026-01-01T00:00:00.000Z', cloud.transport);

    expect(await db.categories.get('cat-a')).toBeUndefined();
    expect(await db.categories.get('cat-b')).toBeDefined();
  });
});

describe('purge — khi phần đám mây không chạy được', () => {
  it('mạng lỗi thì vẫn xóa ở máy, và BÁO RÕ là đám mây chưa xóa', async () => {
    // Bản ghi ở máy đã mất vĩnh viễn rồi — ném lỗi ra ngoài lúc này sẽ khiến
    // giao diện trông như cả thao tác đã thất bại, trong khi nửa đầu của nó
    // đã thành công và không hoàn tác được.
    await db.categories.add(deletedCategory('cat-a'));
    const cloud = fakeCloud({ categories: [cloudRow('cat-a')] });
    cloud.breakDelete();

    const result = await purgeOne('categories', 'cat-a', cloud.transport);

    expect(await db.categories.get('cat-a')).toBeUndefined();
    expect(result.cloud.kind).toBe('failed');
    expect(cloud.rows('categories')).toHaveLength(1);
  });
});

describe('vòng lặp bản ghi sống lại đã đóng', () => {
  it('xóa vĩnh viễn rồi đồng bộ thì bản ghi KHÔNG quay về', async () => {
    // ⚠️ BÀI QUAN TRỌNG NHẤT CỦA FILE. Chạy nguyên cả hai bước thật.
    //
    // Trước khi có db/purge.ts: purgeOne xóa ở máy, hàng trên mây còn nguyên,
    // syncWithCloud thấy "đám mây có, local không" và kéo nó về. Người dùng
    // xóa vĩnh viễn xong bấm Đồng bộ là nó hiện lại trong thùng rác.
    await db.categories.add(deletedCategory('cat-a'));
    const cloud = fakeCloud({ categories: [cloudRow('cat-a')] });

    await purgeOne('categories', 'cat-a', cloud.transport);
    await syncWithCloud(cloud.transport);

    expect(await db.categories.get('cat-a')).toBeUndefined();
    expect(cloud.rows('categories')).toHaveLength(0);
  });

  it('KHÔNG xóa trên mây thì bản ghi quay về — chứng minh bài trên có ý nghĩa', async () => {
    // Bài đối chứng: gọi thẳng repo cục bộ, bỏ qua db/purge.ts. Nếu bài này
    // cũng xanh thì bài phía trên không chứng minh được gì cả.
    const { purgeOne: purgeLocalOnly } = await import('../repo/trash');

    await db.categories.add(deletedCategory('cat-a'));
    const cloud = fakeCloud({ categories: [cloudRow('cat-a')] });

    await purgeLocalOnly('categories', 'cat-a');
    await syncWithCloud(cloud.transport);

    expect(await db.categories.get('cat-a')).toBeDefined(); // sống lại
  });
});
