// ═══════════════════════════════════════════════════════════════════════════
//  db/pushQueue.ts — nạp hàng đợi Web Push và RÚT LẠI hàng không còn trong kế hoạch
//
//  Lỗ hổng mà file này bịt: `core/pushQueue.ts` có test, còn `db/pushQueue.ts` —
//  chỗ duy nhất quyết định một buổi đã hủy có bị bắn thông báo hay không —
//  chưa có bài nào. Toàn bộ phần "rút lại" chưa từng được chạy dưới test.
//
//  IndexedDB thật (fake-indexeddb) + một Supabase giả. Bản giả chỉ mô phỏng đúng
//  những hành vi mà mã dưới test dựa vào: `upsert` chỉ ghi đè cột có mặt trong
//  payload (nên `sent_at` sống sót), và các bộ lọc `eq/is/in` nối được nhau.
// ═══════════════════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../schema';
import { ALL_TABLES } from '../tables';
import { createEvent, updateEvent } from '../repo/events';
import { createRule } from '../repo/rules';
import { setOccurrenceStatus, upsertException } from '../repo/exceptions';
import { saveSettings } from '../repo/settings';
import { syncReminderQueue, watchReminderQueue } from '../pushQueue';
import { toAbsolute } from '../../core/time';

const USER = 'user-1';

type Row = Record<string, unknown>;

const harness = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('../cloud', () => ({
  getSupabase: async () => harness.client,
}));

function fakeSupabase() {
  const rows = new Map<string, Row>(); // khóa = `${user_id}|${id}`
  let upsertFails = false;
  let userCalls = 0;

  const key = (r: Row) => `${r.user_id}|${r.id}`;

  function filterable(exec: (filters: Array<(r: Row) => boolean>) => unknown) {
    const filters: Array<(r: Row) => boolean> = [];
    const api = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      is(col: string, val: null) {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(exec(filters)).then(resolve, reject);
      },
    };
    return api;
  }

  const client = {
    auth: {
      getUser: async () => {
        userCalls++;
        return { data: { user: { id: USER } } };
      },
    },
    from(table: string) {
      if (table !== 'reminder_queue') throw new Error(`bảng lạ: ${table}`);
      return {
        async upsert(batch: Row[]) {
          if (upsertFails) return { error: { message: 'mạng lỗi' } };
          for (const r of batch) {
            const k = key(r);
            // Giống PostgREST: chỉ cột có mặt mới bị ghi đè.
            rows.set(k, { sent_at: null, ...(rows.get(k) ?? {}), ...r });
          }
          return { error: null };
        },
        select() {
          return filterable((fs) => ({
            data: [...rows.values()].filter((r) => fs.every((f) => f(r))).map((r) => ({ id: r.id })),
            error: null,
          }));
        },
        update(patch: Row) {
          return filterable((fs) => {
            for (const r of rows.values()) if (fs.every((f) => f(r))) Object.assign(r, patch);
            return { error: null };
          });
        },
      };
    },
  };

  harness.client = client;

  return {
    rows: () => [...rows.values()],
    byId: (id: string) => [...rows.values()].find((r) => r.id === id),
    /** Hàng còn hiệu lực = chưa gửi, chưa bị rút. Đây là thứ cron sẽ bắn. */
    live: () => [...rows.values()].filter((r) => !r.sent_at && !r.deleted_at),
    markSent: (id: string) => {
      const r = [...rows.values()].find((x) => x.id === id);
      if (r) r.sent_at = '2026-08-30T09:00:00.000Z';
    },
    breakUpsert: () => {
      upsertFails = true;
    },
    /** Số lần `syncReminderQueue` đã chạy tới bước hỏi người dùng */
    runs: () => userCalls,
  };
}

// 30/08/2026 10:00 giờ ĐỊA PHƯƠNG của máy chạy test. Dựng bằng constructor local
// (không phải chuỗi ISO) để bài đúng ở mọi TZ — ca 18:00 luôn cách 8 tiếng.
const NOW = new Date(2026, 7, 30, 10, 0);

const single = (over = {}) => ({
  title: 'Học Toán',
  categoryId: 'cat-a',
  date: '2026-08-30',
  startTime: '18:00',
  durationMinutes: 90,
  status: 'SCHEDULED' as const,
  ...over,
});

let cloud: ReturnType<typeof fakeSupabase>;

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(ALL_TABLES.map((t) => t.clear()));
  // Chỉ giả `Date`: bật giả cả setTimeout/queueMicrotask làm fake-indexeddb treo.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  cloud = fakeSupabase();
  await saveSettings({ remindersEnabled: true, reminderLeadMinutes: 30 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('syncReminderQueue — nạp hàng đợi', () => {
  it('fire_at là INSTANT UTC của giờ địa phương: 18:00 trừ 30 phút', async () => {
    await createEvent(single());

    await syncReminderQueue();

    const [row] = cloud.live();
    expect(row.fire_at).toMatch(/Z$/);
    // So bằng instant, không bằng chuỗi giờ: đúng với bất kỳ múi giờ nào.
    expect(new Date(row.fire_at as string).getTime()).toBe(toAbsolute('2026-08-30', '18:00') - 30 * 60_000);
  });

  it('nạp lại nhiều lần không đẻ thêm hàng và không đè mất created_at', async () => {
    await createEvent(single());

    await syncReminderQueue();
    await syncReminderQueue();
    await syncReminderQueue();

    expect(cloud.rows()).toHaveLength(1);
    // Payload không được mang created_at, để DEFAULT của cột giữ mốc tạo gốc.
    expect('created_at' in cloud.rows()[0]).toBe(false);
  });

  it('hàng đã gửi không bị đánh thức lại khi nạp lại', async () => {
    const id = await createEvent(single());
    await syncReminderQueue();
    cloud.markSent(`single:${id}`);

    await syncReminderQueue();

    expect(cloud.byId(`single:${id}`)?.sent_at).not.toBeNull();
    expect(cloud.live()).toHaveLength(0);
  });
});

/** Chờ một điều kiện với đồng hồ THẬT (chỉ `Date` bị giả, setTimeout vẫn chạy). */
async function until(cond: () => boolean, ms = 2000): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return cond();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('watchReminderQueue — hủy buổi rồi đóng app ngay, không chờ đồng bộ', () => {
  // Lỗi gốc: hàng đợi chỉ được rút lại sau `syncWithCloud()`, mà hàm đó cố ý
  // KHÔNG chạy khi dữ liệu cục bộ đổi. Hủy buổi rồi đóng app trước lần đồng bộ
  // kế tiếp thì hàng cũ nằm nguyên trên mây tới giờ bắn. `syncReminderQueue`
  // chỉ ĐỌC Dexie và ghi lên mây nên theo dõi thay đổi để gọi nó không dựng lại
  // vòng lặp mà core/autoSync.ts cảnh báo.
  it('hủy một buổi → hàng bị rút mà KHÔNG ai gọi syncWithCloud', async () => {
    const id = await createEvent(single());
    await syncReminderQueue();
    expect(cloud.live()).toHaveLength(1);

    const stop = watchReminderQueue(20);
    try {
      await pause(30); // qua lượt phát đầu tiên của liveQuery
      await updateEvent(id, { status: 'CANCELLED' });

      expect(await until(() => cloud.live().length === 0)).toBe(true);
      expect(cloud.byId(`single:${id}`)?.deleted_at).toBeTruthy();
    } finally {
      stop();
    }
  });

  it('thêm buổi mới cũng được nạp lên mà không cần đồng bộ', async () => {
    const stop = watchReminderQueue(20);
    try {
      await pause(30);
      await createEvent(single());
      expect(await until(() => cloud.live().length === 1)).toBe(true);
    } finally {
      stop();
    }
  });

  it('năm lần ghi liên tiếp chỉ gộp thành MỘT lượt chạy (không bão request)', async () => {
    const stop = watchReminderQueue(60);
    try {
      await pause(30);
      const before = cloud.runs();
      for (let i = 0; i < 5; i++) await createEvent(single({ title: `B${i}`, startTime: `1${i + 1}:00` }));

      expect(await until(() => cloud.live().length === 5)).toBe(true);
      await pause(150); // đủ để một lượt thừa (nếu có) lộ ra
      expect(cloud.runs() - before).toBe(1);
    } finally {
      stop();
    }
  });

  it('mở theo dõi mà chưa ai ghi gì thì không gọi mạng', async () => {
    await createEvent(single());
    const stop = watchReminderQueue(20);
    try {
      await pause(120);
      expect(cloud.runs()).toBe(0);
    } finally {
      stop();
    }
  });

  it('sau stop() ghi dữ liệu không kéo theo lượt chạy nào', async () => {
    const stop = watchReminderQueue(20);
    await pause(30);
    stop();

    await createEvent(single());
    await pause(120);

    expect(cloud.runs()).toBe(0);
  });
});

describe('syncReminderQueue — hủy buổi đã nằm trong hàng đợi', () => {
  it('đánh dấu buổi lẻ CANCELLED → hàng bị rút, cron không còn gì để bắn', async () => {
    // Kịch bản gốc của lỗi: nạp lúc 8h, hủy lúc 9h, thông báo vẫn bắn lúc 10h
    // vì hàng cũ còn nằm trên mây.
    const id = await createEvent(single());
    await syncReminderQueue();
    expect(cloud.live()).toHaveLength(1);

    await updateEvent(id, { status: 'CANCELLED' });
    await syncReminderQueue();

    expect(cloud.live()).toHaveLength(0);
    expect(cloud.byId(`single:${id}`)?.deleted_at).toBeTruthy();
  });

  it('xóa mềm buổi lẻ → hàng bị rút', async () => {
    const id = await createEvent(single());
    await syncReminderQueue();

    await db.events.update(id, { deletedAt: NOW.toISOString() });
    await syncReminderQueue();

    expect(cloud.live()).toHaveLength(0);
  });

  it('hủy MỘT buổi của lịch lặp (exception CANCEL) → chỉ hàng đó bị rút', async () => {
    const ruleId = await createRule({
      title: 'Ca tối',
      categoryId: 'cat-a',
      freq: 'WEEKLY',
      interval: 1,
      daysOfWeek: [0, 1], // CN 30/08 và T2 31/08
      startDate: '2026-08-30',
      startTime: '18:00',
      durationMinutes: 90,
    });
    await syncReminderQueue();
    expect(cloud.live().map((r) => r.id).sort()).toEqual([
      `rule:${ruleId}:2026-08-30`,
      `rule:${ruleId}:2026-08-31`,
    ]);

    await upsertException({ type: 'CANCEL', recurringRuleId: ruleId, originalDate: '2026-08-30' });
    await syncReminderQueue();

    expect(cloud.live().map((r) => r.id)).toEqual([`rule:${ruleId}:2026-08-31`]);
  });

  it('đánh dấu buổi của lịch lặp là vắng mặt (STATUS) → hàng bị rút', async () => {
    const ruleId = await createRule({
      title: 'Ca tối',
      categoryId: 'cat-a',
      freq: 'WEEKLY',
      interval: 1,
      daysOfWeek: [0],
      startDate: '2026-08-30',
      startTime: '18:00',
      durationMinutes: 90,
    });
    await syncReminderQueue();

    await setOccurrenceStatus(ruleId, '2026-08-30', 'NO_SHOW');
    await syncReminderQueue();

    expect(cloud.live()).toHaveLength(0);
  });

  it('buổi bị hủy mà lần đẩy hàng mới LỖI vẫn phải bị rút', async () => {
    // Lỗi thật: khối rút lại nằm SAU upsert và upsert lỗi thì `return` sớm.
    // Một lần mạng chập chờn đúng lúc người dùng hủy buổi thì hàng cũ ở lại,
    // và thông báo của buổi đã hủy vẫn bắn. Rút lại là việc an toàn, không
    // được phụ thuộc vào việc đẩy hàng mới có thành công hay không.
    const cancelled = await createEvent(single({ title: 'Sẽ hủy' }));
    await syncReminderQueue();

    await updateEvent(cancelled, { status: 'CANCELLED' });
    await createEvent(single({ title: 'Buổi mới', startTime: '20:00' }));
    cloud.breakUpsert();
    await syncReminderQueue();

    expect(cloud.byId(`single:${cancelled}`)?.deleted_at).toBeTruthy();
  });

  it('khôi phục buổi đã hủy thì hàng sống lại', async () => {
    const id = await createEvent(single());
    await syncReminderQueue();
    await updateEvent(id, { status: 'CANCELLED' });
    await syncReminderQueue();
    expect(cloud.live()).toHaveLength(0);

    await updateEvent(id, { status: 'SCHEDULED' });
    await syncReminderQueue();

    expect(cloud.live()).toHaveLength(1);
  });

  it('không rút hàng đã gửi (đánh dấu sent_at) dù buổi không còn trong kế hoạch', async () => {
    const id = await createEvent(single());
    await syncReminderQueue();
    cloud.markSent(`single:${id}`);

    await updateEvent(id, { status: 'CANCELLED' });
    await syncReminderQueue();

    // Đã gửi rồi thì là lịch sử; rút lại nó chỉ làm hỏng dấu vết.
    expect(cloud.byId(`single:${id}`)?.deleted_at ?? null).toBeNull();
  });

  it('tắt nhắc lịch → rút toàn bộ hàng chưa gửi, không đụng hàng đã gửi', async () => {
    const a = await createEvent(single({ title: 'A' }));
    const b = await createEvent(single({ title: 'B', startTime: '20:00' }));
    await syncReminderQueue();
    cloud.markSent(`single:${a}`);

    await saveSettings({ remindersEnabled: false });
    await syncReminderQueue();

    expect(cloud.live()).toHaveLength(0);
    expect(cloud.byId(`single:${b}`)?.deleted_at).toBeTruthy();
    expect(cloud.byId(`single:${a}`)?.deleted_at ?? null).toBeNull();
  });
});
