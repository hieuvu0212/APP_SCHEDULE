// ═══════════════════════════════════════════════════════════════════════════
//  core/pushQueue.ts — lập kế hoạch hàng đợi Web Push
//
//  HÀM THUẦN. Không import React, không import Dexie, không đụng tới Supabase.
//
//  ⚠️ VÌ SAO PHÉP QUY ĐỔI NẰM Ở ĐÂY CHỨ KHÔNG Ở EDGE FUNCTION:
//
//  Giờ trong CSDL là giờ trôi nổi ("18:00"). Chỉ ở máy của người dùng — nơi
//  biết múi giờ địa phương — "18:00" mới quy đổi chính xác ra một thời điểm
//  UTC (instant) thật.
//
//  `planReminderQueue` nhận các `Occurrence` đã được client mở rộng đúng qua
//  `expandSchedule()`, lọc và tính mốc `fireAt` dạng ISO 8601 UTC kết thúc
//  bằng `Z` để Edge Function chỉ việc so sánh chuỗi với `now().toISOString()`.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence } from '../types';

export interface QueuedReminder {
  /** = Occurrence.key — tất định, nạp lại chỉ đè lên chính nó */
  id: string;
  /** ISO 8601 UTC, LUÔN kết thúc bằng Z */
  fireAt: string;
  startTime: string;
  title: string;
  minutesUntilStart: number;
}

/**
 * Lập kế hoạch hàng đợi thông báo đẩy trong khoảng `horizonDays` (mặc định 7 ngày).
 *
 * Quy tắc:
 *  - Chỉ nhận `status === 'SCHEDULED'`. Hủy, vắng mặt, hoàn thành đều loại.
 *  - Loại bỏ các buổi đã qua (`startAbs <= nowMs`) hoặc xa hơn `horizonDays`.
 *  - `fireAt = new Date(Math.max(nowMs, o.startAbs - leadMinutes * 60_000)).toISOString()`.
 *    Phép `Math.max` là bắt buộc: buổi cách hiện tại ít hơn `leadMinutes` phải
 *    bắn ngay (fireAt = now), không mang mốc quá khứ.
 *  - `id = o.key` (tất định, không sinh id ngẫu nhiên).
 */
export function planReminderQueue(
  occurrences: Occurrence[],
  leadMinutes: number,
  now: Date = new Date(),
  horizonDays: number = 7,
): QueuedReminder[] {
  const nowMs = now.getTime();
  const leadMs = Math.max(0, leadMinutes) * 60_000;
  const horizonMs = nowMs + Math.max(0, horizonDays) * 86_400_000;

  return occurrences
    .filter((o) => o.status === 'SCHEDULED')
    .filter((o) => o.startAbs > nowMs && o.startAbs <= horizonMs)
    .map((o) => ({
      id: o.key,
      fireAt: new Date(Math.max(nowMs, o.startAbs - leadMs)).toISOString(),
      startTime: o.startTime,
      title: o.title,
      minutesUntilStart: Math.round((o.startAbs - nowMs) / 60_000),
    }))
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
}
