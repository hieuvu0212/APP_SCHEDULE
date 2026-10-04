// ═══════════════════════════════════════════════════════════════════════════
//  Test tích hợp tầng db/ — ĐỒNG BỘ ĐÁM MÂY
//
//  IndexedDB thật (fake-indexeddb) + một CloudTransport giả. Không mock Dexie,
//  không chạm mạng.
//
//  ⚠️ VÌ SAO KHÔNG MOCK DEXIE Ở ĐÂY.
//
//  Nửa số lỗi trong tầng này nằm ở chỗ Dexie phân biệt "thuộc tính có giá trị
//  undefined" với "thuộc tính không tồn tại" — mà một bản mock sẽ coi hai thứ
//  đó là một. Toàn bộ cơ chế khôi phục từ Thùng rác dựa trên phép phân biệt
//  đó, và chính nó là thứ bản đồng bộ đầu tiên làm hỏng.
//
//  Mỗi bài dưới đây tương ứng một lỗi CÓ THẬT trong bản đồng bộ đầu tiên, hoặc
//  một bẫy đã biết mà nếu gỡ ra thì lỗi quay lại.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import type { Category } from '../../types';
import { db, type SyncBaseRow } from '../schema';
import { ALL_TABLES } from '../tables';
import { columnsFor, fromCloud, syncWithCloud, toCloud, type CloudRow, type CloudTransport } from '../sync';
import { exportBackup, importBackup } from '../backup';
import { purgeOne } from '../purge';
import { loadBases, saveBases } from '../syncBase';

const USER = 'user-1';

/**
 * Đám mây giả: một Map các bảng.
 *
 * `upsert` mô phỏng đúng hành vi của PostgREST — chỉ ghi đè NHỮNG CỘT CÓ MẶT
 * trong payload, giữ nguyên các cột khác. Đó chính xác là chỗ bản đồng bộ đầu
 * tiên vỡ, nên bản giả này phải trung thực ở đúng điểm đó, nếu không thì test
 * chỉ chứng minh được rằng mã chạy chứ không chứng minh nó đúng.
 */
function fakeCloud(seed: Record<string, CloudRow[]> = {}) {
  const tables = new Map<string, Map<string, CloudRow>>();
  for (const [name, rows] of Object.entries(seed)) {
    tables.set(name, new Map(rows.map((r) => [String(r.id), { ...r }])));
  }

  let failTable: string | null = null;
  const upsertCalls: { table: string; rows: CloudRow[] }[] = [];
  const deleteCalls: { table: string; ids: string[] }[] = [];
  /** Đếm số dòng ĐẦY ĐỦ đã tải về — chỉ số để đo tính gia tăng */
  let fullRowsFetched = 0;

  const store = (table: string) => tables.get(table) ?? new Map<string, CloudRow>();
  const guard = (table: string) => {
    if (table === failTable) throw new Error(`boom: ${table}`);
  };

  const transport: CloudTransport = {
    userId: USER,

    async fetchManifest(table) {
      guard(table);
      return [...store(table).values()].map((r) => ({
        id: String(r.id),
        updatedAt: (r.updated_at as string | null) ?? undefined,
      }));
    },

    async fetchByIds(table, ids) {
      guard(table);
      const rows = ids
        .map((id) => store(table).get(id))
        .filter((r): r is CloudRow => r !== undefined)
        .map((r) => ({ ...r }));
      fullRowsFetched += rows.length;
      return rows;
    },

    async fetchSample(table) {
      guard(table);
      const first = [...store(table).values()][0];
      if (first) fullRowsFetched += 1;
      return first ? { ...first } : null;
    },

    async upsert(table, rows) {
      guard(table);
      upsertCalls.push({ table, rows });
      const s = store(table);
      tables.set(table, s);
      for (const row of rows) {
        const id = String(row.id);
        s.set(id, { ...(s.get(id) ?? {}), ...row });
      }
    },

    async deleteByIds(table, ids) {
      guard(table);
      deleteCalls.push({ table, ids });
      const s = store(table);
      for (const id of ids) s.delete(id);
    },
  };

  return {
    transport,
    upsertCalls,
    deleteCalls,
    fullRowsFetched: () => fullRowsFetched,
    resetCounters: () => {
      fullRowsFetched = 0;
      upsertCalls.length = 0;
    },
    fail: (table: string) => {
      failTable = table;
    },
    rows: (table: string) => [...(tables.get(table)?.values() ?? [])],
    get: (table: string, id: string) => tables.get(table)?.get(id),
  };
}

const category = (over: Record<string, unknown> = {}) => ({
  id: 'cat-a',
  name: 'Gia sư',
  color: '#f59e0b',
  isIncomeEligible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

/** Hàng như PostgREST trả về: snake_case, ĐỦ MỌI CỘT, cột trống là null */
const cloudCategory = (over: Record<string, unknown> = {}): CloudRow => ({
  user_id: USER,
  id: 'cat-a',
  name: 'Gia sư',
  color: '#f59e0b',
  text_color: null,
  default_rate_per_hour: null,
  is_income_eligible: true,
  is_system: null,
  sort_order: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([...ALL_TABLES, db.syncBase].map((t) => t.clear()));
});

// ─── Biến đổi hình dạng ────────────────────────────────────────────────────

describe('fromCloud', () => {
  it('gỡ user_id — nó là chuyện của máy chủ, không phải của bản ghi', () => {
    // Bản trước giữ lại nó, nên mọi bản ghi kéo về mọc thêm một trường mà
    // phần còn lại của ứng dụng không biết tới, rồi trôi vào file sao lưu.
    expect(fromCloud(cloudCategory())).not.toHaveProperty('userId');
  });

  it('đổi snake_case sang camelCase', () => {
    expect(fromCloud(cloudCategory()).isIncomeEligible).toBe(true);
  });

  it('null trở thành VẮNG MẶT, không phải null', () => {
    // Bản ghi tạo tại máy đơn giản là không có `deletedAt`. Nếu bản kéo về
    // mang `deletedAt: null` thì cùng một buổi có hai hình dạng khác nhau tùy
    // nó sinh ra ở đâu — và mọi phép kiểm `'deletedAt' in row` sẽ nói dối.
    const row = fromCloud(cloudCategory());
    expect('deletedAt' in row).toBe(false);
    expect('textColor' in row).toBe(false);
  });

  it('giữ nguyên false và 0 — chúng là giá trị, không phải sự vắng mặt', () => {
    const row = fromCloud(cloudCategory({ is_income_eligible: false, sort_order: 0 }));
    expect(row.isIncomeEligible).toBe(false);
    expect(row.sortOrder).toBe(0);
  });
});

describe('toCloud', () => {
  const columns = Object.keys(cloudCategory());

  it('điền null cho cột mà bản ghi không có', () => {
    const out = toCloud(category(), columns, USER);
    expect(out.deleted_at).toBeNull();
    expect(out.text_color).toBeNull();
  });

  it('gắn user_id', () => {
    expect(toCloud(category(), columns, USER).user_id).toBe(USER);
  });

  it('giữ false và 0 chứ không biến chúng thành null', () => {
    // `??` chứ không phải `||`. Với `||` thì isIncomeEligible=false sẽ thành
    // null, và danh mục "không tính thu nhập" biến thành "chưa khai báo".
    const out = toCloud(category({ isIncomeEligible: false, sortOrder: 0 }), columns, USER);
    expect(out.is_income_eligible).toBe(false);
    expect(out.sort_order).toBe(0);
  });
});

describe('columnsFor', () => {
  it('lấy danh sách cột từ dữ liệu đám mây khi có', () => {
    expect(columnsFor([cloudCategory()], [])).toContain('default_rate_per_hour');
  });

  it('bảng đám mây rỗng thì suy từ bản ghi local, luôn kèm deleted_at', () => {
    const cols = columnsFor([], [category()]);
    expect(cols).toContain('deleted_at');
    expect(cols).toContain('is_income_eligible');
  });

  it('bỏ qua userId rác do bản đồng bộ cũ để lại', () => {
    expect(columnsFor([], [category({ userId: USER })])).not.toContain('user_id');
  });
});

// ─── Vòng đồng bộ ──────────────────────────────────────────────────────────

describe('syncWithCloud — hai chiều', () => {
  it('đẩy bản ghi local lên đám mây trống', async () => {
    await db.categories.add(category());
    const cloud = fakeCloud();

    const report = await syncWithCloud(cloud.transport);

    expect(report.failed).toBe(0);
    expect(report.pushed).toBe(1);
    expect(cloud.rows('categories')).toHaveLength(1);
    expect(cloud.get('categories', 'cat-a')?.user_id).toBe(USER);
  });

  it('kéo bản ghi đám mây về máy trống', async () => {
    const cloud = fakeCloud({ categories: [cloudCategory()] });

    const report = await syncWithCloud(cloud.transport);

    expect(report.pulled).toBe(1);
    const local = await db.categories.get('cat-a');
    expect(local?.name).toBe('Gia sư');
    expect(local).not.toHaveProperty('userId');
  });

  it('bên có updatedAt muộn hơn thắng', async () => {
    await db.categories.add(category({ name: 'Tên mới', updatedAt: '2026-03-01T00:00:00.000Z' }));
    const cloud = fakeCloud({
      categories: [cloudCategory({ name: 'Tên cũ', updated_at: '2026-01-01T00:00:00.000Z' })],
    });

    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.name).toBe('Tên mới');
    expect((await db.categories.get('cat-a'))?.name).toBe('Tên mới');
  });

  it('chạy hai lần liên tiếp thì lần hai không ghi gì', async () => {
    await db.categories.add(category());
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport);
    const callsAfterFirst = cloud.upsertCalls.length;
    const second = await syncWithCloud(cloud.transport);

    expect(second.pushed).toBe(0);
    expect(second.pulled).toBe(0);
    expect(cloud.upsertCalls).toHaveLength(callsAfterFirst);
  });
});

describe('syncWithCloud — tombstone và khôi phục', () => {
  it('lệnh xóa lan lên đám mây', async () => {
    await db.categories.add(
      category({ deletedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }),
    );
    const cloud = fakeCloud({ categories: [cloudCategory()] });

    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.deleted_at).toBe('2026-03-01T00:00:00.000Z');
  });

  it('lệnh xóa từ đám mây lan xuống máy', async () => {
    await db.categories.add(category());
    const cloud = fakeCloud({
      categories: [
        cloudCategory({
          deleted_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        }),
      ],
    });

    await syncWithCloud(cloud.transport);

    expect((await db.categories.get('cat-a'))?.deletedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('KHÔI PHỤC TỪ THÙNG RÁC XÓA ĐƯỢC TOMBSTONE TRÊN ĐÁM MÂY', async () => {
    // ⚠️ ĐÂY LÀ BÀI QUAN TRỌNG NHẤT CỦA CẢ FILE.
    //
    // Khôi phục xóa hẳn thuộc tính `deletedAt` (Dexie hiểu `undefined` là lệnh
    // xóa thuộc tính). Bản đồng bộ đầu tiên dựng payload bằng Object.keys nên
    // payload KHÔNG CÓ khóa `deleted_at`, và PostgREST chỉ ghi đè những cột có
    // mặt — tombstone trên đám mây nằm nguyên.
    //
    // Kết quả: bản ghi "sống ở máy này, chết trên đám mây". Máy khác kéo về
    // vẫn thấy nó bị xóa, và thao tác khôi phục biến mất không dấu vết.
    //
    // Nếu ai đó đổi `toCloud` về kiểu chỉ gửi những trường có giá trị, bài này
    // đỏ ngay.
    await db.categories.add(category({ updatedAt: '2026-03-01T00:00:00.000Z' }));
    const cloud = fakeCloud({
      categories: [
        cloudCategory({
          deleted_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        }),
      ],
    });

    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.deleted_at).toBeNull();
  });

  it('bản ghi đã xóa mềm vẫn đi lên ngay từ lần đồng bộ đầu tiên', async () => {
    // Đám mây rỗng nên không có hàng nào để suy ra danh sách cột.
    // `columnsFor` phải tự thêm `deleted_at`, nếu không thì tombstone chỉ được
    // đẩy lên như một bản ghi SỐNG và bản xóa mất hẳn.
    await db.categories.add(category({ deletedAt: '2026-03-01T00:00:00.000Z' }));
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.deleted_at).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('syncWithCloud — một bảng lỗi không kéo theo bảng khác', () => {
  it('bảng hỏng được ghi nhận, bảy bảng còn lại vẫn đồng bộ', async () => {
    // ⚠️ Bản trước `throw` thẳng trong vòng lặp. `salary_rules` đứng thứ NĂM
    // trong tám bảng và lược đồ của nó sai, nên adjustments,
    // adjustment_templates và payments không bao giờ được đồng bộ — trong khi
    // người dùng chỉ thấy một dòng "Lỗi đồng bộ" và tưởng mạng chập chờn.
    await db.categories.add(category());
    await db.payments.add({
      id: 'pay-1',
      clientId: 'minh',
      clientLabel: 'Minh',
      categoryId: 'cat-a',
      month: '2026-08',
      amount: 500000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const cloud = fakeCloud();
    cloud.fail('salary_rules');

    const report = await syncWithCloud(cloud.transport);

    expect(report.failed).toBe(1);
    expect(report.tables.find((r) => r.table === 'salaryRules')?.error).toContain('boom');

    // payments đứng SAU salaryRules trong thứ tự đồng bộ — đây là điểm mấu chốt.
    expect(cloud.rows('payments')).toHaveLength(1);
    expect(cloud.rows('categories')).toHaveLength(1);
  });
});

describe('syncWithCloud — tên bảng', () => {
  it('salaryRules đi tới bảng salary_rules, không phải salaryrules', async () => {
    await db.salaryRules.add({
      id: 'sal-1',
      categoryId: 'cat-a',
      mode: 'HOURLY',
      effectiveFrom: '2026-01',
      ratePerHour: 45000,
      currency: 'VND',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport);

    expect(cloud.rows('salary_rules')).toHaveLength(1);
    // Trường của mô hình lương KHOẢNG HIỆU LỰC, không phải mô hình một-tháng-
    // một-bản-ghi mà REVIEW đã bác bỏ.
    expect(cloud.get('salary_rules', 'sal-1')).toHaveProperty('effective_from', '2026-01');
  });

  it('adjustmentTemplates đi tới adjustment_templates', async () => {
    await db.adjustmentTemplates.add({
      id: 'tpl-1',
      categoryId: 'cat-a',
      kind: 'BONUS',
      label: 'Chuyên cần',
      defaultAmount: 300000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport);

    expect(cloud.rows('adjustment_templates')).toHaveLength(1);
  });
});

// ─── Đồng bộ gia tăng ──────────────────────────────────────────────────────

describe('syncWithCloud — chỉ tải nội dung của dòng THẬT SỰ đổi', () => {
  it('không có gì đổi thì không tải một dòng đầy đủ nào', async () => {
    // ⚠️ Đây là toàn bộ lý do bản kê tồn tại.
    //
    // Bản trước gọi `fetchAll` và kéo về TOÀN BỘ mọi dòng của cả tám bảng ở
    // MỖI lần bấm Đồng bộ, rồi vứt đi gần hết. Với hai năm lịch thì đó là vài
    // MB mỗi lần, cho một thao tác thường không đổi gì cả.
    await db.categories.add(category());
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport); // lần đầu: đẩy lên
    cloud.resetCounters();

    const second = await syncWithCloud(cloud.transport);

    expect(second.pushed).toBe(0);
    expect(second.pulled).toBe(0);
    expect(cloud.fullRowsFetched()).toBe(0);
  });

  it('một dòng đổi thì chỉ tải đúng dòng đó', async () => {
    const cloud = fakeCloud({
      categories: [
        cloudCategory({ id: 'cat-a' }),
        cloudCategory({ id: 'cat-b', name: 'Đi làm' }),
        cloudCategory({ id: 'cat-c', name: 'Học' }),
      ],
    });

    await syncWithCloud(cloud.transport); // kéo cả ba về
    cloud.resetCounters();

    // Máy khác sửa đúng một danh mục.
    await cloud.transport.upsert('categories', [
      cloudCategory({ id: 'cat-b', name: 'Đi làm (mới)', updated_at: '2026-06-01T00:00:00.000Z' }),
    ]);

    const report = await syncWithCloud(cloud.transport);

    expect(report.pulled).toBe(1);
    expect(cloud.fullRowsFetched()).toBe(1);
    expect((await db.categories.get('cat-b'))?.name).toBe('Đi làm (mới)');
    expect((await db.categories.get('cat-a'))?.name).toBe('Gia sư');
  });

  it('đẩy lên khi đám mây rỗng vẫn biết đủ danh sách cột', async () => {
    // Không kéo dòng nào về thì không có mẫu để suy lược đồ. `fetchSample`
    // lấp chỗ đó — và với bảng rỗng nó trả null, lúc đó suy từ bản ghi local.
    await db.categories.add(category({ deletedAt: '2026-03-01T00:00:00.000Z' }));
    const cloud = fakeCloud();

    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.deleted_at).toBe('2026-03-01T00:00:00.000Z');
  });
});

// ─── Gộp theo từng trường ──────────────────────────────────────────────────

/**
 * Trạng thái của MỘT máy: dữ liệu và bản gốc đồng bộ của nó.
 *
 * Chỉ có một IndexedDB trong bộ test, nên "hai máy" là chụp lại trạng thái
 * của máy này rồi nạp lại trạng thái của máy kia. Cả hai đều chạy đúng
 * `syncWithCloud` thật trên đúng một đám mây giả — không giả lập kết quả.
 */
interface Device {
  categories: Category[];
  syncBase: SyncBaseRow[];
}

const NEW_DEVICE: Device = { categories: [], syncBase: [] };

async function snapshot(): Promise<Device> {
  return { categories: await db.categories.toArray(), syncBase: await db.syncBase.toArray() };
}

async function become(device: Device) {
  await Promise.all([...ALL_TABLES, db.syncBase].map((t) => t.clear()));
  await db.categories.bulkPut(device.categories);
  await db.syncBase.bulkPut(device.syncBase);
}

describe('syncWithCloud — hai máy sửa CÙNG một bản ghi', () => {
  const T1 = '2026-02-01T00:00:00.000Z';
  const T2 = '2026-03-01T00:00:00.000Z';

  /** A tạo và đẩy lên; B kéo về, đổi TÊN lúc T2 và đẩy lên. Trả về máy B. */
  async function bothEdited(cloud: ReturnType<typeof fakeCloud>) {
    await db.categories.add(category());
    await syncWithCloud(cloud.transport);
    const deviceA = await snapshot();

    await become(NEW_DEVICE);
    await syncWithCloud(cloud.transport);
    await db.categories.update('cat-a', { name: 'Gia sư (B)', updatedAt: T2 });
    await syncWithCloud(cloud.transport);
    const deviceB = await snapshot();

    // A chưa biết gì, đổi MÀU lúc T1 — SỚM hơn B — rồi mới đồng bộ.
    await become(deviceA);
    await db.categories.update('cat-a', { color: '#000000', updatedAt: T1 });
    return deviceB;
  }

  it('hai trường khác nhau → CẢ HAI thay đổi sống sót, ở cả hai máy', async () => {
    // ⚠️ LỖI GỐC: luật "cả bản ghi nào mới hơn thì thắng" thấy bản của B
    // (T2) mới hơn bản của A (T1), kéo đè nguyên khối, và màu mà A vừa chọn
    // biến mất — báo cáo vẫn xanh, không có gì để thấy.
    const cloud = fakeCloud();
    const deviceB = await bothEdited(cloud);

    const report = await syncWithCloud(cloud.transport);

    expect(report.merged).toBe(1);
    const a = await db.categories.get('cat-a');
    expect(a?.name).toBe('Gia sư (B)');
    expect(a?.color).toBe('#000000');
    expect(cloud.get('categories', 'cat-a')?.name).toBe('Gia sư (B)');
    expect(cloud.get('categories', 'cat-a')?.color).toBe('#000000');
    // Muộn hơn HẲN bản của B, nếu không thì B không bao giờ kéo bản gộp về.
    expect(String(cloud.get('categories', 'cat-a')?.updated_at) > T2).toBe(true);

    // B đồng bộ lại và nhận bản gộp.
    await become(deviceB);
    await syncWithCloud(cloud.transport);
    const b = await db.categories.get('cat-a');
    expect(b?.name).toBe('Gia sư (B)');
    expect(b?.color).toBe('#000000');
  });

  it('đồng bộ lần nữa sau khi gộp thì không tải một dòng đầy đủ nào', async () => {
    // Bản gộp phải được ghi xuống CẢ máy này, không chỉ đẩy lên. Quên bước đó
    // thì bản gốc (= bản gộp) khớp đám mây mà local vẫn là bản trước khi gộp:
    // lần sau `planSync` thấy "chỉ local sửa" và ĐẨY bản chưa gộp đè lên —
    // thay đổi của máy kia mất ở lượt thứ hai thay vì lượt đầu.
    const cloud = fakeCloud();
    await bothEdited(cloud);
    await syncWithCloud(cloud.transport);
    cloud.resetCounters();

    const again = await syncWithCloud(cloud.transport);

    expect(again.pushed + again.pulled + again.merged).toBe(0);
    expect(cloud.fullRowsFetched()).toBe(0);
  });

  it('xóa vĩnh viễn thì bỏ luôn bản gốc của dòng đó', async () => {
    await db.categories.add(category({ deletedAt: T1, updatedAt: T1 }));
    const cloud = fakeCloud();
    await syncWithCloud(cloud.transport);
    expect(await db.syncBase.count()).toBe(1);

    await purgeOne('categories', 'cat-a', cloud.transport);

    expect(await db.syncBase.count()).toBe(0);
  });

  it('khôi phục sao lưu kiểu GHI ĐÈ không đẩy bản cũ đè lên mọi máy khác', async () => {
    // Giữ bản gốc qua lần ghi đè thì đám mây trùng bản gốc, local thì khác:
    // `planSync` kết luận "chỉ máy này sửa" và đẩy bản CŨ trong file lên —
    // một lần khôi phục ở một máy âm thầm quay ngược dữ liệu của mọi máy.
    // Bỏ bản gốc thì dòng đó lùi về luật cũ: bên mới hơn thắng.
    await db.categories.add(category());
    const cloud = fakeCloud();
    await syncWithCloud(cloud.transport);
    const backup = await exportBackup();

    await db.categories.update('cat-a', { name: 'Tên mới', updatedAt: T2 });
    await syncWithCloud(cloud.transport);

    await importBackup(backup, 'replace');
    await syncWithCloud(cloud.transport);

    expect(cloud.get('categories', 'cat-a')?.name).toBe('Tên mới');
    expect((await db.categories.get('cat-a'))?.name).toBe('Tên mới');
  });

  it('bản gốc của tài khoản khác không được dùng', async () => {
    // Đăng nhập tài khoản khác trên cùng máy: bản gốc cũ mô tả điều mà máy
    // này và NGƯỜI KHÁC đã thống nhất. Dùng nó là so nhầm lịch sử.
    await saveBases('categories', 'user-1', [category()]);

    expect((await loadBases('categories', 'user-1')).size).toBe(1);
    expect((await loadBases('categories', 'user-2')).size).toBe(0);
  });
});
