// ═══════════════════════════════════════════════════════════════════════════
//  supabase/functions/push-reminder/process.ts — phần quyết định của Edge Function
//
//  Edge Function chạy trên Deno, nằm ngoài sáu cổng chặn. Phần quyết định được
//  tách sang process.ts (TypeScript thuần, không import gì) để bài này chạy nó
//  thật — và để `tsc -b` kiểm kiểu nó, vì một file được `src/` import thì nằm
//  trong chương trình của `tsc` dù đứng ngoài `include`.
//
//  I/O là bản giả ghi lại mọi lời gọi: bài test đo cái hàm QUYẾT ĐỊNH (gửi cho
//  ai, đánh `sent_at` hay để lại, xóa subscription nào), không đo Supabase.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import {
  processDueReminders,
  type DueReminder,
  type PushPayload,
  type PushSubscriptionRow,
} from '../../supabase/functions/push-reminder/process.ts';
// Chỉ đọc được mã nguồn của index.ts (Deno) — xem bài "nối dây" cuối file.
import indexSource from '../../supabase/functions/push-reminder/index.ts?raw';

const NOW = Date.parse('2026-11-03T10:45:00.000Z');

function reminder(over: Partial<DueReminder> = {}): DueReminder {
  return {
    id: 'rule:abc:2026-11-03',
    user_id: 'user-a',
    title: 'Toán lớp 9',
    body: 'Bắt đầu lúc 18:00, còn 15 phút nữa.',
    url: './#/week',
    fire_at: '2026-11-03T10:45:00.000Z',
    ...over,
  };
}

function sub(id: string, user_id = 'user-a'): PushSubscriptionRow {
  return { id, user_id, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' };
}

/** Lỗi giống `WebPushError` của web-push: mang `statusCode` */
const pushError = (statusCode: number) => Object.assign(new Error('Received unexpected response code'), { statusCode });

/**
 * Bản giả của toàn bộ I/O. `failWith` quyết định lần gửi tới subscription nào
 * thì ném lỗi gì.
 */
function fakeIo(failWith: Record<string, unknown> = {}) {
  const sends: Array<{ sub: string; payload: PushPayload }> = [];
  const marked: string[] = [];
  const deleted: Array<{ user_id: string; id: string }> = [];

  const deps = {
    send: async (s: PushSubscriptionRow, payload: string) => {
      if (s.id in failWith) throw failWith[s.id];
      sends.push({ sub: s.id, payload: JSON.parse(payload) as PushPayload });
    },
    markSent: async (r: DueReminder) => {
      marked.push(r.id);
      return { error: null };
    },
    softDeleteSubscription: async (s: PushSubscriptionRow) => {
      deleted.push({ user_id: s.user_id, id: s.id });
      return { error: null };
    },
    now: () => NOW,
  };

  return { deps, sends, marked, deleted };
}

describe('processDueReminders — gửi', () => {
  // `tag` là sợi dây giữa Edge Function và sw.js: thiếu nó thì khi app đang mở,
  // thông báo đẩy và nhắc lịch trong trang của cùng một buổi xếp chồng nhau.
  it('payload mang tiêu đề, nội dung, url và tag = reminder_queue.id', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [sub('s1')], io.deps);

    expect(io.sends).toEqual([
      {
        sub: 's1',
        payload: {
          title: 'Toán lớp 9',
          body: 'Bắt đầu lúc 18:00, còn 15 phút nữa.',
          url: './#/week',
          tag: 'rule:abc:2026-11-03',
        },
      },
    ]);
  });

  it('hàng không có url thì mở màn hình Tuần', async () => {
    const io = fakeIo();

    await processDueReminders([reminder({ url: null })], [sub('s1')], io.deps);

    expect(io.sends[0].payload.url).toBe('./#/week');
  });

  it('chỉ gửi tới subscription của đúng người dùng', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [sub('s1'), sub('s2', 'user-b')], io.deps);

    expect(io.sends.map((s) => s.sub)).toEqual(['s1']);
  });

  // Một endpoint hỏng không được chặn những endpoint còn lại.
  it('một subscription lỗi không chặn các subscription khác', async () => {
    const io = fakeIo({ s1: pushError(500) });

    const summary = await processDueReminders([reminder()], [sub('s1'), sub('s2')], io.deps);

    expect(io.sends.map((s) => s.sub)).toEqual(['s2']);
    expect(summary.sent).toBe(1);
    expect(summary.errors).toBe(1);
    // Lỗi máy chủ push không có nghĩa endpoint đã chết: không được xóa nó.
    expect(io.deleted).toEqual([]);
  });
});

describe('processDueReminders — subscription hết hạn', () => {
  it.each([404, 410])('lỗi %i xóa mềm subscription đó, với đủ hai vế khóa', async (status) => {
    const io = fakeIo({ s1: pushError(status) });

    await processDueReminders([reminder()], [sub('s1'), sub('s2')], io.deps);

    expect(io.deleted).toEqual([{ user_id: 'user-a', id: 's1' }]);
  });
});

describe('processDueReminders — đánh sent_at', () => {
  it('hàng đã gửi được đánh sent_at', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [sub('s1')], io.deps);

    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
  });

  // Không đánh thì hàng nằm lại vĩnh viễn và mỗi lần cron chạy lại quét qua.
  it('hàng của người dùng không có subscription nào cũng được đánh sent_at', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [], io.deps);

    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
    expect(io.sends).toEqual([]);
  });
});

// Toàn bộ test ở trên vô nghĩa nếu index.ts thôi gọi process.ts mà tự viết lại
// vòng gửi. Đây là phép đọc mã nguồn, không phải chạy hàm — thô, nhưng là chỗ
// duy nhất một cổng chặn thấy được index.ts.
describe('index.ts nối dây vào process.ts', () => {
  it('import processDueReminders từ ./process.ts và gọi nó', () => {
    expect(indexSource).toMatch(/from '\.\/process\.ts'/);
    expect(indexSource).toMatch(/\bprocessDueReminders\(/);
  });
});
