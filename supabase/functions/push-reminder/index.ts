import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import webpush from 'npm:web-push';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushSubscriptionData {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const nowIso = new Date().toISOString();

    // 2. Quét hàng đợi reminder_queue: fire_at <= now, chưa gửi, chưa bị xóa
    const { data: dueReminders, error: queueError } = await supabaseClient
      .from('reminder_queue')
      .select('id, user_id, title, body, url, fire_at')
      .lte('fire_at', nowIso)
      .is('sent_at', null)
      .is('deleted_at', null)
      .limit(500);

    if (queueError) {
      throw queueError;
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, sent: 0, errors: 0 }),
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

    const userSubs = new Map<string, PushSubscriptionData[]>();
    for (const sub of (subscriptions || []) as PushSubscriptionData[]) {
      const list = userSubs.get(sub.user_id) ?? [];
      list.push(sub);
      userSubs.set(sub.user_id, list);
    }

    let sentCount = 0;
    let errorCount = 0;

    // 4. Gửi thông báo tới từng subscription
    for (const reminder of dueReminders) {
      const subs = userSubs.get(reminder.user_id) ?? [];
      const payload = {
        title: reminder.title,
        body: reminder.body,
        url: reminder.url || './#/week',
      };

      for (const sub of subs) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSub, JSON.stringify(payload));
          sentCount++;
        } catch (err: unknown) {
          errorCount++;
          // Nếu endpoint hỏng (410 Gone / 404 Not Found), xóa mềm với đủ cả hai vế khóa
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await supabaseClient
              .from('push_subscriptions')
              .update({ deleted_at: nowIso })
              .eq('user_id', sub.user_id)
              .eq('id', sub.id);
          }
        }
      }

      // 5. Đánh dấu sent_at cho hàng đợi đã xử lý (kể cả user không có subscription)
      await supabaseClient
        .from('reminder_queue')
        .update({ sent_at: nowIso })
        .eq('user_id', reminder.user_id)
        .eq('id', reminder.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: dueReminders.length,
        sent: sentCount,
        errors: errorCount,
      }),
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
