// ═══════════════════════════════════════════════════════════════════════════
//  push-reminder/process.ts — phần QUYẾT ĐỊNH của Edge Function
//
//  ⚠️ VÌ SAO TÁCH RA FILE NÀY, VÀ VÌ SAO NÓ KHÔNG ĐƯỢC IMPORT GÌ:
//
//  `index.ts` chạy trên Deno: `Deno.env`, import qua URL, `npm:web-push`.
//  `tsc -b` của ứng dụng không đọc được nó, Vitest không chạy được nó — nên nó
//  nằm ngoài cả sáu cổng chặn (README, "`supabase/functions/` nằm ngoài TẤT CẢ
//  sáu cổng"). Mọi lỗi ở đó chỉ lộ ra trên Supabase thật.
//
//  File này giữ mọi thứ CÓ THỂ sai — gửi cho ai, khi nào đánh `sent_at`, lỗi
//  nào thì xóa subscription — dưới dạng TypeScript thuần, nhận I/O qua tham số.
//  `src/__tests__/pushReminder.test.ts` import nó, nên `tsc -b` kiểm kiểu và
//  Vitest chạy nó thật. `index.ts` chỉ còn phần nối dây: đọc env, truy vấn,
//  gọi `web-push`.
//
//  Giữ nó KHÔNG import gì: một `import` qua URL là Vitest hết nạp được, một
//  `Deno.*` là `tsc` báo lỗi. Import nội bộ phải có đuôi `.ts` vì Deno đòi.
// ═══════════════════════════════════════════════════════════════════════════

/** Một hàng của `reminder_queue` đã tới hạn */
export interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string | null;
  fire_at: string;
}

/** Một hàng của `push_subscriptions` */
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Thứ `public/sw.js` đọc trong sự kiện `push` */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Kết quả của một câu `update` supabase-js: lỗi TRẢ VỀ, không ném. Query builder
 * của supabase-js là thenable chứ không phải Promise, nên các hàm dưới khai
 * `PromiseLike`.
 */
export interface DbResult {
  error: unknown;
}

/** I/O mà vòng xử lý cần; `index.ts` nối chúng vào Supabase và `web-push` */
export interface ProcessDeps {
  /** Ném lỗi khi gửi thất bại; lỗi của `web-push` mang `statusCode` */
  send(sub: PushSubscriptionRow, payload: string): Promise<unknown>;
  markSent(reminder: DueReminder, sentAt: string): PromiseLike<DbResult>;
  softDeleteSubscription(sub: PushSubscriptionRow, deletedAt: string): PromiseLike<DbResult>;
  now(): number;
}

export interface ProcessSummary {
  processed: number;
  sent: number;
  errors: number;
}

export function buildPayload(reminder: DueReminder): PushPayload {
  return {
    title: reminder.title,
    body: reminder.body,
    url: reminder.url || './#/week',
    // `reminder_queue.id` chính là `Occurrence.key`, cũng là `tag` mà nhắc lịch
    // trong trang (`useReminders`) đặt. Có cùng tag thì thông báo đẩy THAY
    // thông báo trong trang thay vì xếp chồng khi app đang mở. `sw.js` đọc
    // trường này; payload cũ không có thì nó không đặt tag.
    tag: reminder.id,
  };
}

export function statusCodeOf(err: unknown): number | undefined {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

export async function processDueReminders(
  reminders: DueReminder[],
  subscriptions: PushSubscriptionRow[],
  deps: ProcessDeps,
): Promise<ProcessSummary> {
  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  let sent = 0;
  let errors = 0;

  for (const reminder of reminders) {
    const payload = JSON.stringify(buildPayload(reminder));

    for (const sub of byUser.get(reminder.user_id) ?? []) {
      try {
        await deps.send(sub, payload);
        sent++;
      } catch (err) {
        // Chỉ lỗi của TỪNG subscription mới được nuốt: một endpoint hỏng không
        // được chặn những endpoint còn lại.
        errors++;
        const status = statusCodeOf(err);
        if (status === 410 || status === 404) {
          // Câu update phải có cả hai vế khóa — xem `softDeleteSubscription`
          // ở index.ts và README, mục "Edge Function viết lại".
          await deps.softDeleteSubscription(sub, new Date(deps.now()).toISOString());
        }
      }
    }

    // Đánh `sent_at` cho cả hàng không có subscription nào, nếu không chúng
    // nằm lại vĩnh viễn và mỗi lần cron chạy lại quét qua.
    await deps.markSent(reminder, new Date(deps.now()).toISOString());
  }

  return { processed: reminders.length, sent, errors };
}
