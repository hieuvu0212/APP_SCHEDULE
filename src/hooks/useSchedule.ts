// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useSchedule.ts — CHỖ DUY NHẤT nối db/ với core/
//
//  Component không tự gọi expandSchedule. Chúng nhận Occurrence đã hợp nhất
//  rule + exception + event và đã gắn cờ trùng lịch.
//
//  ⚠️ Ba nguồn phải nạp CÙNG NHAU cho CÙNG một cửa sổ:
//     · rules      — TOÀN BỘ (rule cũ vẫn sinh buổi cho tuần này)
//     · exceptions — truy vấn HAI CHIỀU (originalDate ∪ newDate)
//     · events     — lọc theo date
//  Thiếu vế `newDate` ở exception là buổi đã dời biến mất. Xem
//  db/repo/exceptions.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import type { Category, Occurrence } from '../types';
import { detectConflicts } from '../core/conflict';
import { expandSchedule } from '../core/expand';
import { listCategories } from '../db/repo/categories';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listRules } from '../db/repo/rules';
import { useSettings } from './useSettings';

/**
 * Occurrence của cửa sổ [windowStart, windowEnd], đã gắn cờ trùng lịch.
 *
 * Trả về `undefined` ở lần chạy đầu — đó là quy ước của useLiveQuery, dùng
 * để phân biệt "đang tải" với "không có buổi nào".
 */
export function useSchedule(
  windowStart: string,
  windowEnd: string,
): Occurrence[] | undefined {
  const settings = useSettings();
  const autoComplete = settings.autoCompletePastOccurrences;

  return useLiveQuery(async () => {
    const [rules, exceptions, events] = await Promise.all([
      listRules(),
      getExceptionsInWindow(windowStart, windowEnd),
      listEventsInWindow(windowStart, windowEnd),
    ]);

    const occurrences = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart,
      windowEnd,
      now: new Date(),
      autoCompletePast: autoComplete,
    });

    const { fetchClientNames } = await import('./useClientNames');
    const clientMap = await fetchClientNames();
    for (const occ of occurrences) {
      if (occ.clientId) {
        occ.clientName = clientMap.get(occ.clientId);
      }
    }

    return detectConflicts(occurrences);
  }, [windowStart, windowEnd, autoComplete]);
}

/** Danh mục còn sống, đã sắp theo sortOrder */
export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => listCategories(), []);
}

/** Tra danh mục theo id — dùng nhiều tới mức đáng tách riêng */
export function categoryMap(categories: Category[] | undefined): Map<string, Category> {
  return new Map((categories ?? []).map((c) => [c.id, c]));
}

/** Gom occurrence theo ngày, để mỗi cột / mỗi ô lưới chỉ nhận phần của mình */
export function groupByDate(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const list = out.get(o.date);
    if (list) list.push(o);
    else out.set(o.date, [o]);
  }
  return out;
}
