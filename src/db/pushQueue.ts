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

import { addDays, toDateKey } from '../core/time';
import { expandSchedule } from '../core/expand';
import { planReminderQueue } from '../core/pushQueue';
import { getSupabase } from './cloud';
import { getExceptionsInWindow } from './repo/exceptions';
import { listEventsInWindow } from './repo/events';
import { listRules } from './repo/rules';
import { loadSettings } from './repo/settings';
import i18n from '../i18n';

/**
 * Đồng bộ hàng đợi nhắc lịch Web Push lên đám mây.
 *
 * Chỉ chạy khi đã cấu hình Supabase và người dùng đã đăng nhập.
 * Được gọi từ SyncProvider sau mỗi lần đồng bộ dữ liệu thành công.
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
      await supabase
        .from('reminder_queue')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('sent_at', null)
        .is('deleted_at', null);
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
        title: r.title,
        body: i18n.t('reminder.body', {
          minutes: r.minutesUntilStart,
          time: r.startTime,
        }),
        url: './#/week',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));

      const { error: upsertError } = await supabase
        .from('reminder_queue')
        .upsert(rows, { onConflict: 'user_id,id' });

      if (upsertError) {
        console.error('Failed to upsert reminder_queue:', upsertError);
        return;
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
        await supabase
          .from('reminder_queue')
          .update({ deleted_at: now })
          .eq('user_id', user.id)
          .in('id', toSoftDelete);
      }
    }
  } catch (e) {
    console.error('Failed to sync reminder queue:', e);
  }
}
