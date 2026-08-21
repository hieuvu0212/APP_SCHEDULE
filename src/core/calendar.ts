// ═══════════════════════════════════════════════════════════════════════════
//  core/calendar.ts — dựng khung ngày tháng cho Week View và Month View
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Tách khỏi component vì đây là chỗ dễ sai lệch một ngày nhất: tuần bắt đầu
//  từ đâu, lưới tháng đệm bao nhiêu ô, tháng nào cần 6 hàng. Sai ở đây thì
//  mọi thứ vẽ lên đều lệch, mà nhìn bằng mắt rất khó phát hiện.
//
//  LƯU Ý: `weekStartsOn` CHỈ ảnh hưởng thứ tự cột khi render. Nó KHÔNG được
//  đụng tới `daysOfWeek` của RecurringRule — chỗ đó luôn theo Date.getDay().
// ═══════════════════════════════════════════════════════════════════════════

import { addDays, monthBounds, startOfWeek, toDateKey } from './time';

/** Trần cứng cho lưới tháng: 6 hàng × 7 cột */
const MAX_GRID_CELLS = 42;

/** Ngày hôm nay dạng "YYYY-MM-DD" theo giờ địa phương */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** Bảy ngày của tuần chứa `anchor`, theo đúng thứ tự cột sẽ render */
export function weekDates(anchor: string, weekStartsOn: 0 | 1 = 1): string[] {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Lưới tháng: luôn là bội số của 7, phủ trọn tháng và đệm thêm ngày của
 * tháng trước / tháng sau cho đủ hàng.
 *
 * Số hàng KHÔNG cố định là 6. Tháng 2 của năm thường bắt đầu đúng đầu tuần
 * chỉ cần 4 hàng. Ép cứng 6 hàng sẽ đệm thừa một tuần trống.
 */
export function monthGridDates(month: string, weekStartsOn: 0 | 1 = 1): string[] {
  const { start, end } = monthBounds(month);
  const out: string[] = [];
  let cursor = startOfWeek(start, weekStartsOn);

  while ((cursor <= end || out.length % 7 !== 0) && out.length < MAX_GRID_CELLS) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** "2026-08" + 1 → "2026-09". Xử lý đúng ranh giới năm. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Nhãn thứ trong tuần theo đúng thứ tự cột.
 * Trả về mã Date.getDay() (0=CN … 6=T7) để tầng hiển thị tự tra chuỗi i18n —
 * core/ không giữ chuỗi ngôn ngữ.
 */
export function weekdayOrder(weekStartsOn: 0 | 1 = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
}

/** Ngày này có thuộc tháng `month` không — dùng để làm mờ ô đệm */
export function isInMonth(date: string, month: string): boolean {
  return date.startsWith(month);
}
