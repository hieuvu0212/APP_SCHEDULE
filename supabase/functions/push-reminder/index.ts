import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import webpush from 'npm:web-push';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  configureVapid,
  processDueReminders,
  type DueReminder,
  type PushSubscriptionRow,
} from './process.ts';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
// Dịch vụ push của Apple từ chối subject không liên lạc được, nên giá trị mặc
// định chỉ là chỗ giữ chỗ — đặt `VAPID_SUBJECT` thật bằng `supabase secrets set`.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

// Không gọi `setVapidDetails` trần ở đây: khóa sai định dạng làm nó ném ngay lúc
// nạp module, và hàm không khởi động được. `configureVapid` trả câu lỗi để bước
// dừng sớm bên dưới trả về — xem chú thích trong process.ts.
const VAPID_ERROR = configureVapid(
  (subject, publicKey, privateKey) => webpush.setVapidDetails(subject, publicKey, privateKey),
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. Xác thực bằng CRON_SECRET — anon key công khai nên không dùng verify_jwt
  const cronSecret = Deno.env.get('CRON_SECRET');
  const requestSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ⚠️ DỪNG SỚM KHI THIẾU HOẶC SAI KHÓA VAPID — ĐỪNG ĐỂ CHẠY TIẾP.
  //
  // Thiếu khóa thì `setVapidDetails` không chạy, mọi lần gửi đều ném lỗi, và
  // các hàng bị đánh `sent_at` hoặc xoay vòng tới hạn chót. Hàng đợi rút cạn mà
  // không một thông báo nào tới nơi, và cron nhận về HTTP 200 — hỏng hoàn toàn
  // im lặng, đúng loại lỗi tệ nhất. Cấu hình sai phải kêu lên.
  if (VAPID_ERROR) {
    return new Response(
      JSON.stringify({ success: false, error: VAPID_ERROR }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const nowIso = new Date().toISOString();

    // 2. Quét hàng đợi reminder_queue: fire_at <= now, chưa gửi, chưa bị xóa
    const { data: dueReminders, error: queueError } = await supabaseClient
      .from('reminder_queue')
      .select('id, user_id, title, body, url, fire_at, start_at')
      .lte('fire_at', nowIso)
      .is('sent_at', null)
      .is('deleted_at', null)
      // `limit` mà không `order` thì Postgres được phép trả về BẤT KỲ 500 hàng
      // nào. Quá 500 hàng tới hạn cùng lúc, những hàng bị bỏ lại có thể là
      // những hàng bị bỏ lại mãi mãi. Cũ trước là thứ tự duy nhất đúng ở đây.
      .order('fire_at', { ascending: true })
      .limit(500);

    if (queueError) {
      throw queueError;
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          errors: 0,
          retried: 0,
          expired: 0,
          deferred: 0,
          dbErrors: 0,
          failures: {},
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 3. Gom user_id và lấy push_subscriptions của các user đó trong một truy vấn
    const userIds = Array.from(new Set(dueReminders.map((r) => r.user_id)));
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .is('deleted_at', null);

    if (subError) {
      throw subError;
    }

    // 4–5. Gửi và đánh `sent_at`: toàn bộ quyết định nằm ở process.ts, nơi
    // `tsc` và Vitest nhìn thấy được. Ở đây chỉ nối dây vào Supabase và web-push.
    const summary = await processDueReminders(
      dueReminders as DueReminder[],
      (subscriptions ?? []) as PushSubscriptionRow[],
      {
        send: (sub, payload, options) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            options,
          ),
        markSent: (reminder, sentAt) =>
          supabaseClient
            .from('reminder_queue')
            .update({ sent_at: sentAt })
            .eq('user_id', reminder.user_id)
            .eq('id', reminder.id),
        // Xóa mềm với đủ cả hai vế khóa: cùng một trình duyệt đăng nhập hai tài
        // khoản cho ra cùng `id` dưới hai `user_id`.
        softDeleteSubscription: (sub, deletedAt) =>
          supabaseClient
            .from('push_subscriptions')
            .update({ deleted_at: deletedAt })
            .eq('user_id', sub.user_id)
            .eq('id', sub.id),
        now: () => Date.now(),
        log: (message, detail) => console.error(message, JSON.stringify(detail)),
      },
    );

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
