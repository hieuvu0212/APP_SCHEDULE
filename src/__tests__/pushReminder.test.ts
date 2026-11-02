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
  MAX_LATE_MS,
  RUN_BUDGET_MS,
  SEND_TIMEOUT_MS,
  processDueReminders,
  type DueReminder,
  type PushPayload,
  type PushSubscriptionRow,
  type SendOptions,
} from '../../supabase/functions/push-reminder/process.ts';
// Chỉ đọc được mã nguồn của index.ts (Deno) — xem bài "nối dây" cuối file.
import indexSource from '../../supabase/functions/push-reminder/index.ts?raw';

// Buổi 11:00Z, báo trước 15 phút → fire_at 10:45Z. Cron chạy lúc 10:47Z.
const NOW = Date.parse('2026-11-03T10:47:00.000Z');
const MIN = 60_000;

function reminder(over: Partial<DueReminder> = {}): DueReminder {
  return {
    id: 'rule:abc:2026-11-03',
    user_id: 'user-a',
    title: 'Toán lớp 9',
    body: 'Bắt đầu lúc 18:00, còn 15 phút nữa.',
    url: './#/week',
    fire_at: '2026-11-03T10:45:00.000Z',
    start_at: '2026-11-03T11:00:00.000Z',
    ...over,
  };
}

function sub(id: string, user_id = 'user-a'): PushSubscriptionRow {
  return { id, user_id, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' };
}

/** Lỗi giống `WebPushError` của web-push: mang `statusCode` */
const pushError = (statusCode: number) => Object.assign(new Error('Received unexpected response code'), { statusCode });

/** Lỗi mạng, timeout socket: không có phản hồi nào nên không có `statusCode` */
const networkError = () => new Error('getaddrinfo ENOTFOUND push.example');

/**
 * Bản giả của toàn bộ I/O. `failWith` quyết định lần gửi tới subscription nào
 * thì ném lỗi gì; `msPerSend` cho đồng hồ chạy theo mỗi lần gửi, để thử ngân
 * sách thời gian.
 */
function fakeIo(failWith: Record<string, unknown> = {}, msPerSend = 0) {
  const sends: Array<{ sub: string; payload: PushPayload; options: SendOptions }> = [];
  const marked: string[] = [];
  const deleted: Array<{ user_id: string; id: string }> = [];
  const clock = { t: NOW };

  const deps = {
    send: async (s: PushSubscriptionRow, payload: string, options: SendOptions) => {
      clock.t += msPerSend;
      if (s.id in failWith) throw failWith[s.id];
      sends.push({ sub: s.id, payload: JSON.parse(payload) as PushPayload, options });
    },
    markSent: async (r: DueReminder) => {
      marked.push(r.id);
      return { error: null };
    },
    softDeleteSubscription: async (s: PushSubscriptionRow) => {
      deleted.push({ user_id: s.user_id, id: s.id });
      return { error: null };
    },
    now: () => clock.t,
  };

  return { deps, sends, marked, deleted, clock };
}

describe('processDueReminders — gửi', () => {
  // `tag` là sợi dây giữa Edge Function và sw.js: thiếu nó thì khi app đang mở,
  // thông báo đẩy và nhắc lịch trong trang của cùng một buổi xếp chồng nhau.
  it('payload mang tiêu đề, nội dung, url và tag = reminder_queue.id', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [sub('s1')], io.deps);

    // `options` có bài riêng ở "TTL, urgency, timeout".
    expect(io.sends.map(({ sub, payload }) => ({ sub, payload }))).toEqual([
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

describe('processDueReminders — lỗi tạm thời thì thử lại ở lượt sau', () => {
  // Lỗi gốc: mọi lần gửi thất bại tạm thời mà hàng vẫn bị đánh sent_at, nên
  // một lần push service trả 503 là lời nhắc đó mất hẳn.
  it.each([
    ['503', pushError(503)],
    ['500', pushError(500)],
    ['429', pushError(429)],
    ['408', pushError(408)],
    ['lỗi mạng', networkError()],
  ])('mọi thiết bị lỗi %s: KHÔNG đánh sent_at, để lượt cron sau thử lại', async (_label, err) => {
    const io = fakeIo({ s1: err, s2: err });

    const summary = await processDueReminders([reminder()], [sub('s1'), sub('s2')], io.deps);

    expect(io.marked).toEqual([]);
    expect(summary.retried).toBe(1);
    expect(io.deleted).toEqual([]);
  });

  // Gửi lại cả hàng thì thiết bị đã nhận nhận thêm lần nữa. Chấp nhận thiết bị
  // lỗi lỡ lời nhắc này: theo dõi từng thiết bị cần thêm một bảng.
  it('một thiết bị nhận được, một lỗi tạm thời: coi là xong, không gửi lại', async () => {
    const io = fakeIo({ s2: pushError(503) });

    await processDueReminders([reminder()], [sub('s1'), sub('s2')], io.deps);

    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
  });

  // 401/403 thường là khóa VAPID lệch với khóa trình duyệt đã đăng ký — thử lại
  // không bao giờ khỏi. Cũng không xóa subscription: lỗi là của cấu hình máy
  // chủ, xóa thì một lần cấu hình sai xóa sạch đăng ký của mọi người dùng.
  it.each([400, 401, 403, 413])('lỗi vĩnh viễn %i: đánh sent_at, không thử lại, không xóa subscription', async (status) => {
    const io = fakeIo({ s1: pushError(status) });

    const summary = await processDueReminders([reminder()], [sub('s1')], io.deps);

    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
    expect(summary.retried).toBe(0);
    expect(io.deleted).toEqual([]);
  });

  it('410 ở thiết bị này, 503 ở thiết bị kia: xóa thiết bị chết, thử lại cho thiết bị còn sống', async () => {
    const io = fakeIo({ s1: pushError(410), s2: pushError(503) });

    await processDueReminders([reminder()], [sub('s1'), sub('s2')], io.deps);

    expect(io.deleted).toEqual([{ user_id: 'user-a', id: 's1' }]);
    expect(io.marked).toEqual([]);
  });
});

describe('processDueReminders — hạn chót', () => {
  // Lần thử lại không được bắn "còn 15 phút" cho buổi đã bắt đầu. Đây là lý do
  // `start_at` tồn tại: với báo trước 5 phút và cron 5 phút, không hạn chót nào
  // tính từ fire_at vừa cho thử lại vừa không lố giờ vào buổi.
  it('đã tới giờ vào buổi: không gửi, đánh sent_at để hàng rời hàng đợi', async () => {
    const io = fakeIo();
    io.clock.t = Date.parse('2026-11-03T11:00:00.000Z');
    const lead5 = reminder({ fire_at: '2026-11-03T10:55:00.000Z' });

    const summary = await processDueReminders([lead5], [sub('s1')], io.deps);

    expect(io.sends).toEqual([]);
    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
    expect(summary.expired).toBe(1);
  });

  // Câu thông báo đã dịch sẵn ở client ("còn 60 phút nữa"). Gửi quá trễ so với
  // fire_at thì câu đó sai, dù buổi chưa bắt đầu. Cũng chặn cả trường hợp hàm
  // ngừng vài giờ rồi chạy lại và bắn dồn cả loạt lời nhắc cũ.
  it('trễ quá MAX_LATE_MS so với fire_at: không gửi dù buổi chưa bắt đầu', async () => {
    const io = fakeIo();
    const lead60 = reminder({ fire_at: '2026-11-03T10:00:00.000Z', start_at: '2026-11-03T11:00:00.000Z' });
    io.clock.t = Date.parse(lead60.fire_at) + MAX_LATE_MS;

    await processDueReminders([lead60], [sub('s1')], io.deps);

    expect(io.sends).toEqual([]);
    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
  });

  it('hàng từ bản app cũ (không có start_at): hạn chót chỉ tính từ fire_at', async () => {
    const io = fakeIo();
    const old = reminder({ start_at: null });

    await processDueReminders([old], [sub('s1')], io.deps);
    expect(io.sends).toHaveLength(1);

    const late = fakeIo();
    late.clock.t = Date.parse(old.fire_at) + MAX_LATE_MS + MIN;
    await processDueReminders([old], [sub('s1')], late.deps);
    expect(late.sends).toEqual([]);
    expect(late.marked).toEqual(['rule:abc:2026-11-03']);
  });

  // Hàng hỏng không được nằm lại và bị quét lại mãi mãi.
  it('fire_at không đọc được: coi là quá hạn, không gửi', async () => {
    const io = fakeIo();

    await processDueReminders([reminder({ fire_at: 'không phải ngày' })], [sub('s1')], io.deps);

    expect(io.sends).toEqual([]);
    expect(io.marked).toEqual(['rule:abc:2026-11-03']);
  });
});

describe('processDueReminders — TTL, urgency, timeout', () => {
  // web-push mặc định TTL 4 tuần: máy tắt lúc bắn thì dịch vụ push giữ lời nhắc
  // rồi giao khi máy bật lại, có thể vài ngày sau. TTL phải hết đúng lúc lời
  // nhắc hết giá trị.
  it('TTL = số giây tới hạn chót; urgency high; có timeout', async () => {
    const io = fakeIo();

    await processDueReminders([reminder()], [sub('s1')], io.deps);

    // fire 10:45, start 11:00, now 10:47 → hạn chót = min(11:00, 10:55) = 10:55.
    expect(io.sends[0].options).toEqual({ TTL: 8 * 60, urgency: 'high', timeout: SEND_TIMEOUT_MS });
  });

  it('báo trước 5 phút: TTL dừng ở giờ vào buổi, không phải fire_at + MAX_LATE_MS', async () => {
    const io = fakeIo();
    io.clock.t = Date.parse('2026-11-03T10:57:00.000Z');

    await processDueReminders([reminder({ fire_at: '2026-11-03T10:55:00.000Z' })], [sub('s1')], io.deps);

    expect(io.sends[0].options.TTL).toBe(3 * 60);
  });
});

describe('processDueReminders — ngân sách thời gian', () => {
  // Một lượt kéo dài quá chu kỳ cron thì lượt sau chọn lại đúng những hàng chưa
  // kịp đánh dấu và gửi trùng. Dừng sớm, để phần còn lại NGUYÊN VẸN cho lượt sau.
  it('hết ngân sách: các hàng còn lại không gửi, không đánh sent_at', async () => {
    const perSend = RUN_BUDGET_MS / 2;
    const io = fakeIo({}, perSend);
    const rows = ['a', 'b', 'c', 'd'].map((k) => reminder({ id: k }));

    const summary = await processDueReminders(rows, [sub('s1')], io.deps);

    expect(io.marked).toEqual(['a', 'b']);
    expect(summary.deferred).toBe(2);
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
