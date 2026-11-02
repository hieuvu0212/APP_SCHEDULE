// ═══════════════════════════════════════════════════════════════════════════
//  db/pushQueue.ts — ghi hàng đợi Web Push lên Supabase
//
//  Đặt cạnh db/sync.ts, không nằm trong db/repo/ (repo dành cho Dexie; đây
//  nói chuyện trực tiếp với Supabase).
//
//  ⚠️ VÌ SAO PHẢI RÚT LẠI HÀNG KHÔNG CÒN TRONG KẾ HOẠCH:
//
//  Nạp hàng đợi lúc 8 giờ, hủy buổi lúc 9 giờ, thông báo vẫn bắn lúc 10 giờ
//  nếu hàng cũ còn nằm trên mây. Sau khi upsert, hàm xóa mềm mọi hàng
//  `sent_at IS NULL` của user mà `id` không có trong kế hoạch vừa tính.
// ═══════════════════════════════════════════════════════════════════════════

import { liveQuery } from 'dexie';
import { addDays, toDateKey } from '../core/time';
import { expandSchedule } from '../core/expand';
import { planReminderQueue } from '../core/pushQueue';
import { getSupabase } from './cloud';
import { db } from './schema';
import { getExceptionsInWindow } from './repo/exceptions';
import { listEventsInWindow } from './repo/events';
import { listRules } from './repo/rules';
import { loadSettings } from './repo/settings';
import i18n from '../i18n';

/**
 * Nạp lại hàng đợi mỗi khi lịch hoặc cài đặt nhắc ở máy này đổi.
 *
 * ⚠️ VÌ SAO KHÔNG ĐỂ MỖI `syncWithCloud()` LO:
 *
 * Hàng đợi chỉ được rút lại trong `syncReminderQueue()`, mà hàm đó trước đây
 * chỉ chạy sau `syncWithCloud()` — và `syncWithCloud()` CỐ Ý không chạy khi dữ
 * liệu cục bộ đổi (xem core/autoSync.ts). Hủy buổi rồi đóng app trước lần đồng
 * bộ kế tiếp thì hàng cũ nằm nguyên trên mây và thông báo của buổi đã hủy vẫn
 * bắn — đúng trường hợp mà Web Push sinh ra để phục vụ (app đã đóng).
 *
 * Lý do cấm kích hoạt theo dữ liệu đổi ở autoSync KHÔNG áp dụng ở đây: đồng bộ
 * đầy đủ có chiều KÉO VỀ, kéo về là ghi vào Dexie, ghi vào Dexie lại kích hoạt
 * đồng bộ → vòng lặp. `syncReminderQueue()` chỉ ĐỌC Dexie và ghi lên mây, không
 * có cạnh nào quay về, nên theo dõi thay đổi để gọi nó không tạo vòng.
 *
 * Gộp các lần ghi dồn dập bằng debounce (người dùng kéo-thả, gõ liên tiếp), và
 * không bao giờ chạy hai lượt chồng nhau: ghi tới giữa lúc đang chạy thì chạy
 * lại đúng một lần sau đó, để lượt cuối luôn nhìn thấy dữ liệu mới nhất.
 *
 * Trả về hàm hủy theo dõi.
 */
export function watchReminderQueue(debounceMs = 3000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirtyWhileRunning = false;
  let stopped = false;
  let first = true;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  };

  const run = async () => {
    if (stopped) return;
    if (running) {
      dirtyWhileRunning = true;
      return;
    }
    running = true;
    try {
      await syncReminderQueue();
    } finally {
      running = false;
      if (dirtyWhileRunning && !stopped) {
        dirtyWhileRunning = false;
        schedule();
      }
    }
  };

  // Chỉ cần BIẾT là bảng đã đổi, không cần nội dung: đếm là đủ để liveQuery
  // theo dõi cả bảng mà không kéo dữ liệu về mỗi lần.
  const subscription = liveQuery(() =>
    Promise.all([
      db.rules.count(),
      db.exceptions.count(),
      db.events.count(),
      db.settings.get('system'),
    ]),
  ).subscribe({
    next: () => {
      // Lượt phát đầu tiên chỉ là trạng thái hiện có, không phải một thay đổi.
      // Lần mở app đã có `useAutoSync('startup')` lo việc nạp.
      if (first) {
        first = false;
        return;
      }
      schedule();
    },
    error: (e) => console.error('Failed to watch reminder queue sources:', e),
  });

  return () => {
    stopped = true;
    clearTimeout(timer);
    subscription.unsubscribe();
  };
}

/**
 * Đồng bộ hàng đợi nhắc lịch Web Push lên đám mây.
 *
 * Chỉ chạy khi đã cấu hình Supabase và người dùng đã đăng nhập.
 * Được gọi từ useAutoSync sau mỗi lần đồng bộ dữ liệu thành công, và từ
 * `watchReminderQueue` mỗi khi dữ liệu cục bộ đổi.
 */
export async function syncReminderQueue(): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const settings = await loadSettings();

    // Nếu người dùng tắt nhắc lịch, rút lại toàn bộ hàng chưa gửi trên mây
    if (!settings.remindersEnabled) {
      const { error: disableError } = await supabase
        .from('reminder_queue')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('sent_at', null)
        .is('deleted_at', null);
      if (disableError) console.error('Failed to withdraw reminder_queue rows:', disableError);
      return;
    }

    const today = toDateKey(new Date());
    const horizonDays = 7;
    const end = addDays(today, horizonDays);

    const [rules, exceptions, events] = await Promise.all([
      listRules(),
      getExceptionsInWindow(today, end),
      listEventsInWindow(today, end),
    ]);

    const occurrences = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: today,
      windowEnd: end,
    });
    const planned = planReminderQueue(
      occurrences,
      settings.reminderLeadMinutes,
      new Date(),
      horizonDays,
    );

    const now = new Date().toISOString();

    // 1. Upsert các hàng trong kế hoạch mới
    if (planned.length > 0) {
      const rows = planned.map((r) => ({
        user_id: user.id,
        id: r.id,
        fire_at: r.fireAt,
        start_at: r.startAt,
        title: r.title,
        body: i18n.t('reminder.body', {
          // Đếm từ lúc BẮN, không phải lúc nạp — xem `minutesBeforeStart`.
          minutes: r.minutesBeforeStart,
          time: r.startTime,
        }),
        url: './#/week',
        // KHÔNG gửi `created_at`: hàng đợi nạp lại sau mỗi lần đồng bộ, gửi
        // thì mỗi lần nạp đè mất mốc tạo gốc. Cột có DEFAULT cho lần INSERT.
        updated_at: now,
        deleted_at: null,
      }));

      const { error: upsertError } = await supabase
        .from('reminder_queue')
        .upsert(rows, { onConflict: 'user_id,id' });

      // ⚠️ KHÔNG `return` ở đây. Bước 2 bên dưới là bước AN TOÀN: nó ngăn thông
      // báo của một buổi đã hủy. Thoát sớm khi upsert lỗi thì một lần mạng chập
      // chờn đúng lúc người dùng hủy buổi sẽ để hàng cũ nằm nguyên trên mây, và
      // cron vẫn bắn nó. Đẩy hàng mới hỏng chỉ làm lỡ một lời nhắc; rút lại hỏng
      // thì nhắc một buổi không còn tồn tại — nên bước sau phải chạy bất kể.
      if (upsertError) {
        console.error('Failed to upsert reminder_queue:', upsertError);
      }
    }

    // 2. Rút lại những hàng không còn trong kế hoạch (đã hủy buổi, đổi giờ, v.v.)
    const { data: existing, error: selectError } = await supabase
      .from('reminder_queue')
      .select('id')
      .eq('user_id', user.id)
      .is('sent_at', null)
      .is('deleted_at', null);

    if (!selectError && existing && existing.length > 0) {
      const plannedIds = new Set(planned.map((r) => r.id));
      const toSoftDelete = existing
        .filter((row) => !plannedIds.has(row.id))
        .map((row) => row.id);

      if (toSoftDelete.length > 0) {
        const { error: withdrawError } = await supabase
          .from('reminder_queue')
          .update({ deleted_at: now })
          .eq('user_id', user.id)
          // Cron có thể vừa gửi hàng này giữa lúc ta đọc và ghi; đã gửi thì là
          // lịch sử, không rút.
          .is('sent_at', null)
          .in('id', toSoftDelete);
        // Hàng chưa rút vẫn nằm trong `existing` của lần nạp sau, nên lần sau
        // tự thử lại — nhưng phải kêu lên, không nuốt im.
        if (withdrawError) console.error('Failed to withdraw reminder_queue rows:', withdrawError);
      }
    }
  } catch (e) {
    console.error('Failed to sync reminder queue:', e);
  }
}
