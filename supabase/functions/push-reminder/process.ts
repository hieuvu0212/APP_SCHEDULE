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

// ─── Chính sách gửi ─────────────────────────────────────────────────────────
//
// ⚠️ HẠN CHÓT CỦA MỘT LỜI NHẮC — vì sao có hai mốc:
//
// Gửi lỗi tạm thời thì thử lại ở lượt cron sau, thay vì đánh `sent_at` và để
// lời nhắc mất. Nhưng một lời nhắc chỉ còn giá trị trong một khoảng ngắn:
//
//   · Sau GIỜ VÀO BUỔI (`start_at`) thì "còn 15 phút nữa" là sai hẳn. Đây là lý
//     do client gửi `start_at`: báo trước chọn được là 5 phút, cron chạy 5 phút
//     một lần, nên không hạn chót nào tính từ `fire_at` vừa cho thử lại vừa
//     không lố giờ vào buổi.
//   · Quá `MAX_LATE_MS` sau `fire_at` thì câu đã dịch sẵn ở client ("còn 60
//     phút nữa") cũng sai, dù buổi chưa bắt đầu. Mốc này còn chặn trường hợp
//     hàm ngừng vài giờ rồi chạy lại và bắn dồn cả loạt lời nhắc cũ.
//
// Hạn chót là mốc nào tới trước. Hàng do bản app cũ nạp không có `start_at`
// thì chỉ còn mốc thứ hai.

/** Gửi trễ hơn `fire_at` bấy nhiêu thì câu "còn N phút" đã sai quá mức chấp nhận */
export const MAX_LATE_MS = 10 * 60_000;

/**
 * Timeout SOCKET của web-push (khoảng im lặng, không phải tổng thời gian).
 * Mặc định không có: một endpoint treo chặn cả vòng.
 */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * Một lượt dừng nhận hàng mới sau chừng này thời gian; phần còn lại để NGUYÊN
 * cho lượt sau. Lượt kéo dài quá chu kỳ cron (5 phút) thì lượt kế chọn lại đúng
 * những hàng chưa kịp đánh dấu và gửi trùng; lượt vượt giới hạn thời gian chạy
 * của Edge Function (theo tài liệu Supabase lúc viết: 150 giây ở gói Free) thì
 * bị giết giữa chừng. 100 giây nằm dưới cả hai.
 */
export const RUN_BUDGET_MS = 100_000;

/** Một hàng của `reminder_queue` đã tới hạn */
export interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string | null;
  fire_at: string;
  /** Giờ vào buổi. NULL với hàng do bản app cũ nạp */
  start_at: string | null;
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

/** Đúng tên trường của `RequestOptions` trong web-push */
export interface SendOptions {
  TTL: number;
  urgency: 'high';
  timeout: number;
}

/** I/O mà vòng xử lý cần; `index.ts` nối chúng vào Supabase và `web-push` */
export interface ProcessDeps {
  /** Ném lỗi khi gửi thất bại; lỗi của `web-push` mang `statusCode` */
  send(sub: PushSubscriptionRow, payload: string, options: SendOptions): Promise<unknown>;
  markSent(reminder: DueReminder, sentAt: string): PromiseLike<DbResult>;
  softDeleteSubscription(sub: PushSubscriptionRow, deletedAt: string): PromiseLike<DbResult>;
  now(): number;
  /** Log của Edge Function hiện trên dashboard Supabase. KHÔNG truyền endpoint vào đây */
  log(message: string, detail: Record<string, unknown>): void;
}

export interface ProcessSummary {
  /** Số hàng đã xem xét trong lượt này (không tính hàng hoãn vì hết ngân sách) */
  processed: number;
  /** Số lần gửi thành công, đếm theo thiết bị */
  sent: number;
  /** Số lần gửi lỗi, đếm theo thiết bị */
  errors: number;
  /** Số hàng để lại cho lượt sau vì mọi thiết bị lỗi tạm thời */
  retried: number;
  /** Số hàng bỏ, không gửi, vì đã qua hạn chót */
  expired: number;
  /** Số hàng chưa xem vì hết `RUN_BUDGET_MS` */
  deferred: number;
  /** Số câu ghi vào CSDL (đánh sent_at, xóa mềm subscription) trả về lỗi */
  dbErrors: number;
  /**
   * Lỗi gửi đếm theo mã HTTP; `network` khi không có phản hồi. Để lần gọi tay ở
   * ACCEPTANCE A4 nói được 403 (khóa VAPID lệch) khác 410 (endpoint chết) khác
   * lỗi mạng — `errors: 3` thì không nói được gì.
   */
  failures: Record<string, number>;
}

/**
 * - `gone`: endpoint đã chết (404/410) → xóa mềm subscription.
 * - `transient`: có thể khỏi nếu thử lại — 408, 429, 5xx, và lỗi KHÔNG có
 *   `statusCode` (lỗi mạng, timeout socket: không có phản hồi nào cả).
 * - `permanent`: 4xx còn lại. 401/403 thường là khóa VAPID lệch với khóa trình
 *   duyệt đã đăng ký; thử lại không bao giờ khỏi. KHÔNG xóa subscription: lỗi
 *   là của cấu hình máy chủ, xóa thì một lần cấu hình sai xóa sạch đăng ký của
 *   mọi người dùng.
 */
export type SendFailure = 'gone' | 'transient' | 'permanent';

export function classifyPushError(err: unknown): SendFailure {
  const status = statusCodeOf(err);
  if (status === 404 || status === 410) return 'gone';
  if (status === undefined || status === 408 || status === 429 || status >= 500) return 'transient';
  return 'permanent';
}

/** Epoch ms mà sau đó lời nhắc không còn đáng gửi. Xem "HẠN CHÓT" ở đầu file */
export function deadlineMs(reminder: Pick<DueReminder, 'fire_at' | 'start_at'>): number {
  const late = Date.parse(reminder.fire_at) + MAX_LATE_MS;
  // `fire_at` hỏng thì coi là quá hạn: hàng đó không được nằm lại và bị quét
  // lại mãi mãi.
  if (!Number.isFinite(late)) return -Infinity;
  const start = reminder.start_at ? Date.parse(reminder.start_at) : NaN;
  return Number.isFinite(start) ? Math.min(start, late) : late;
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

/**
 * Cấu hình khóa VAPID, trả câu lỗi thay vì ném.
 *
 * ⚠️ web-push ném NGAY khi khóa hoặc subject sai định dạng (dán thừa dấu nháy
 * hay khoảng trắng, subject không phải `mailto:`/`https:`). Gọi ở cấp module mà
 * không bắt thì hàm không khởi động được và Supabase chỉ trả một lỗi boot chung
 * chung — khối "dừng sớm khi thiếu khóa" ở index.ts chỉ bắt được khóa THIẾU,
 * không bắt được khóa SAI. Thông điệp của web-push không chứa giá trị khóa.
 */
export function configureVapid(
  set: (subject: string, publicKey: string, privateKey: string) => unknown,
  subject: string,
  publicKey: string,
  privateKey: string,
): string | null {
  if (!publicKey || !privateKey) return 'VAPID keys not configured';
  try {
    set(subject, publicKey, privateKey);
    return null;
  } catch (err) {
    return `VAPID configuration invalid: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const MAX_LOGGED_TEXT = 300;

/**
 * Thông điệp và thân phản hồi của lỗi gửi, để log — đã che endpoint.
 *
 * Endpoint là bearer: có nó cộng khóa VAPID là gửi được thông báo tới máy đó,
 * và log của Edge Function hiện trên dashboard. Thông điệp lỗi của tầng mạng có
 * thể chứa nguyên URL, nên che bằng phép thay chuỗi chứ không tin vào định dạng.
 */
function describeError(err: unknown, endpoint: string): { message: string; body?: string } {
  // `split('')` tách theo từng ký tự: endpoint rỗng thì không có gì để che.
  const redact = (text: string) =>
    (endpoint ? text.split(endpoint).join('<endpoint>') : text).slice(0, MAX_LOGGED_TEXT);
  const message = redact(err instanceof Error ? err.message : String(err));
  const body = (err as { body?: unknown } | null)?.body;
  return typeof body === 'string' && body ? { message, body: redact(body) } : { message };
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

  const summary: ProcessSummary = {
    processed: 0,
    sent: 0,
    errors: 0,
    retried: 0,
    expired: 0,
    deferred: 0,
    dbErrors: 0,
    failures: {},
  };
  const startedAt = deps.now();
  const iso = () => new Date(deps.now()).toISOString();

  // supabase-js TRẢ lỗi chứ không ném. Bỏ qua `error` thì đánh sent_at hỏng mà
  // không ai biết, và lượt sau gửi lại lời nhắc đã tới nơi (cùng `tag` nên nó
  // thay thế chứ không xếp chồng, nhưng vẫn kêu thêm một lần).
  const markSent = async (reminder: DueReminder) => {
    const { error } = await deps.markSent(reminder, iso());
    if (error) {
      summary.dbErrors++;
      deps.log('reminder_queue: mark sent failed', { reminder: reminder.id, error });
    }
  };

  for (let i = 0; i < reminders.length; i++) {
    if (deps.now() - startedAt >= RUN_BUDGET_MS) {
      // Hoãn, KHÔNG đánh dấu: hàng chưa gửi mà mang sent_at là hàng mất.
      summary.deferred = reminders.length - i;
      break;
    }

    const reminder = reminders[i];
    summary.processed++;

    const nowMs = deps.now();
    const deadline = deadlineMs(reminder);
    if (nowMs >= deadline) {
      // Bỏ hẳn: đánh sent_at để hàng rời hàng đợi, nhưng không gửi.
      summary.expired++;
      await markSent(reminder);
      continue;
    }

    const payload = JSON.stringify(buildPayload(reminder));
    const options: SendOptions = {
      // web-push mặc định TTL 4 TUẦN: máy tắt lúc bắn thì dịch vụ push giữ lời
      // nhắc rồi giao khi máy bật lại, có thể vài ngày sau. Cho nó hết hạn đúng
      // lúc lời nhắc hết giá trị.
      TTL: Math.max(1, Math.floor((deadline - nowMs) / 1000)),
      // `normal` thì Android ở chế độ Doze có thể giữ lại nhiều phút.
      urgency: 'high',
      timeout: SEND_TIMEOUT_MS,
    };

    let delivered = false;
    let transient = false;

    for (const sub of byUser.get(reminder.user_id) ?? []) {
      try {
        await deps.send(sub, payload, options);
        summary.sent++;
        delivered = true;
      } catch (err) {
        // Chỉ lỗi của TỪNG subscription mới được nuốt: một endpoint hỏng không
        // được chặn những endpoint còn lại.
        summary.errors++;
        const status = statusCodeOf(err);
        const failure = classifyPushError(err);
        const key = status === undefined ? 'network' : String(status);
        summary.failures[key] = (summary.failures[key] ?? 0) + 1;
        deps.log('push send failed', {
          reminder: reminder.id,
          subscription: sub.id,
          status: status ?? null,
          failure,
          ...describeError(err, sub.endpoint),
        });
        if (failure === 'transient') transient = true;
        if (failure === 'gone') {
          // Câu update phải có cả hai vế khóa — xem `softDeleteSubscription`
          // ở index.ts và README, mục "Edge Function viết lại".
          const { error } = await deps.softDeleteSubscription(sub, iso());
          if (error) {
            summary.dbErrors++;
            deps.log('push_subscriptions: soft delete failed', { subscription: sub.id, error });
          }
        }
      }
    }

    // Thử lại CHỈ khi không thiết bị nào nhận được. Một thiết bị đã nhận mà gửi
    // lại cả hàng thì nó nhận hai lần; chấp nhận thiết bị lỗi lỡ lời nhắc này,
    // vì theo dõi từng thiết bị cần thêm một bảng. Lượt sau thấy lại hàng này
    // (sent_at vẫn NULL), và hạn chót ở trên quyết định nó còn được gửi không.
    if (!delivered && transient) {
      summary.retried++;
      continue;
    }

    // Đánh `sent_at` cho cả hàng không có subscription nào, nếu không chúng
    // nằm lại vĩnh viễn và mỗi lần cron chạy lại quét qua.
    await markSent(reminder);
  }

  return summary;
}
