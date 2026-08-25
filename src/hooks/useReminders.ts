// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useReminders.ts — bắn thông báo trước giờ vào buổi
//
//  Việc CHỌN buổi nào và hẹn lúc nào nằm ở core/reminder.ts và có test. Ở đây
//  chỉ còn phần không test được: xin quyền, đặt setTimeout, gọi Notification.
//
//  ⚠️ BA CHỖ DỄ SAI, mỗi chỗ một kiểu phiền khác nhau:
//
//  1. Cửa sổ truy vấn KHÔNG phải tuần đang xem. Người dùng lật sang tháng sau
//     để xem lịch thì vẫn phải được nhắc buổi chiều nay. Hook tự nạp hôm nay
//     và ngày mai, độc lập với màn hình.
//
//  2. Phải nhớ đã nhắc buổi nào. Mỗi lần dữ liệu đổi là hook chạy lại và đặt
//     lại toàn bộ hẹn giờ — không có sổ ghi thì sửa một ghi chú lúc 2 giờ
//     chiều sẽ khiến mọi buổi trong ngày bị nhắc lại từ đầu.
//
//  3. Hẹn giờ phải dọn khi hook chạy lại. Bỏ sót thì các hẹn giờ chồng lên
//     nhau và cùng một buổi bắn ra năm cái thông báo.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { expandSchedule } from '../core/expand';
import { pendingReminders } from '../core/reminder';
import { addDays, toDateKey } from '../core/time';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listRules } from '../db/repo/rules';
import { useSettings } from './useSettings';

/** Trạng thái quyền thông báo, để màn hình Cài đặt hiển thị đúng */
export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationState(): NotificationState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotificationState;
}

export async function requestNotificationPermission(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // VAPID public key from Supabase (demo)
        const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuB-5-SqWf1cZRYD40wAAQ';
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
        
        // Gửi sub này lên DB, demo code:
        console.log('Push subscription ready:', JSON.stringify(sub));
        // await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify(sub) });
      }
    } catch (e) {
      console.error('Failed to subscribe for push notifications:', e);
    }
  }
  
  return permission as NotificationState;
}

// Utility to convert Base64 URL to Uint8Array for VAPID
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useReminders(): void {
  const { t } = useTranslation();
  const settings = useSettings();
  const enabled = settings.remindersEnabled;
  const lead = settings.reminderLeadMinutes;

  // Sổ ghi những buổi đã nhắc trong phiên này. Dùng ref chứ không phải state:
  // ghi vào đây không được kéo theo một lần render nào.
  const fired = useRef(new Set<string>());

  const occurrences = useLiveQuery(async () => {
    if (!enabled) return [];
    const today = toDateKey(new Date());
    // Hôm nay và ngày mai — đủ để bắt cả ca đêm vắt qua nửa đêm.
    const end = addDays(today, 1);

    const [rules, exceptions, events] = await Promise.all([
      listRules(),
      getExceptionsInWindow(today, end),
      listEventsInWindow(today, end),
    ]);

    return expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: today,
      windowEnd: end,
      now: new Date(),
      // Nhắc lịch phải nhìn trạng thái NGƯỜI DÙNG đặt, không phải trạng thái
      // hệ thống suy ra. Buổi chưa xảy ra thì không thể "tự hoàn thành".
      autoCompletePast: false,
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !occurrences?.length) return;
    if (notificationState() !== 'granted') return;

    const timers = pendingReminders(occurrences, lead)
      .filter((r) => !fired.current.has(r.key))
      .map((r) =>
        setTimeout(() => {
          fired.current.add(r.key);
          new Notification(r.title, {
            body: t('reminder.body', {
              minutes: r.minutesUntilStart,
              time: r.startTime,
            }),
            tag: r.key, // trùng tag thì thông báo cũ bị thay, không xếp chồng
            icon: `${import.meta.env.BASE_URL}icon.svg`,
          });
        }, r.delayMs),
      );

    return () => timers.forEach(clearTimeout);
  }, [enabled, lead, occurrences, t]);
}
