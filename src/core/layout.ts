// ═══════════════════════════════════════════════════════════════════════════
//  core/layout.ts — xếp chỗ cho các khối chồng lấn trong một cột ngày
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Week View định vị khối bằng CSS tuyệt đối. Hai buổi trùng giờ mà cùng
//  chiếm trọn bề ngang cột thì cái sau che mất cái trước — và trùng lịch
//  chính là thứ người dùng cần NHÌN THẤY nhất. Nên phải chia cột.
//
//  Tách khỏi component để test được bằng số, không cần dựng DOM.
//
//  ⚠️ Khác với core/conflict.ts: ở đây dùng khoảng HIỂN THỊ (đã kẹp trong
//  ngày, đã nống lên chiều cao tối thiểu), không phải khoảng thời gian thật.
//  Hai buổi 5 phút cách nhau 2 phút không "trùng lịch", nhưng vẽ ra thì đè
//  lên nhau, nên vẫn phải xếp hai cột.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence } from '../types';
import { MINUTES_PER_DAY, toMinutes } from './time';

/** Buổi ngắn hơn mức này vẫn được vẽ cao bằng mức này, để còn bấm trúng */
export const MIN_BLOCK_MINUTES = 20;

export interface PositionedOccurrence {
  occurrence: Occurrence;
  /** Phút tính từ 00:00 của ngày đang vẽ */
  topMin: number;
  /** Chiều cao tính bằng phút, ĐÃ KẸP trong ngày */
  heightMin: number;
  /** Cột thứ mấy trong cụm chồng lấn, đếm từ 0 */
  col: number;
  /** Tổng số cột của cụm — chiều rộng mỗi khối là 1/cols */
  cols: number;
  /** Bị cắt ở đáy vì tràn sang ngày hôm sau */
  clipped: boolean;
}

/**
 * Xếp chỗ cho các occurrence CỦA CÙNG MỘT NGÀY.
 *
 * Thuật toán: sắp theo giờ bắt đầu, gom thành cụm chồng lấn liên thông, rồi
 * trong mỗi cụm gán cột theo kiểu tham lam — tái dùng cột đầu tiên đã trống.
 *
 * Cả cụm dùng chung một `cols` để các khối thẳng hàng nhau, thay vì mỗi khối
 * một bề rộng khác nhau trông nham nhở.
 */
export function layoutDay(occurrences: Occurrence[]): PositionedOccurrence[] {
  const items: PositionedOccurrence[] = occurrences
    .map((o) => {
      const topMin = toMinutes(o.startTime);
      const room = MINUTES_PER_DAY - topMin;
      const raw = Math.min(o.durationMinutes, room);
      return {
        occurrence: o,
        topMin,
        heightMin: Math.max(MIN_BLOCK_MINUTES, raw),
        col: 0,
        cols: 1,
        clipped: o.durationMinutes > room,
      };
    })
    .sort(
      (a, b) =>
        a.topMin - b.topMin ||
        b.heightMin - a.heightMin ||
        a.occurrence.key.localeCompare(b.occurrence.key),
    );

  let cluster: PositionedOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    for (const it of cluster) {
      // Cột đầu tiên đã kết thúc trước khi khối này bắt đầu thì tái dùng.
      // Dùng `<=` ở đây là CỐ Ý: 10:00–12:00 và 12:00–14:00 không đè nhau
      // về mặt hình ảnh nên được xếp chung một cột.
      let c = colEnds.findIndex((end) => end <= it.topMin);
      if (c === -1) c = colEnds.length;
      colEnds[c] = it.topMin + it.heightMin;
      it.col = c;
    }
    for (const it of cluster) it.cols = colEnds.length;
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (it.topMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.topMin + it.heightMin);
  }
  flush();

  return items;
}

/**
 * Khoảng giờ đáng hiển thị, để Week View không bắt người dùng cuộn qua
 * tám tiếng trống mới thấy buổi đầu tiên.
 *
 * Luôn bao trọn [defaultStart, defaultEnd] rồi nới ra nếu có buổi nằm ngoài.
 * Trả về giờ nguyên (0–24).
 */
export function visibleHourRange(
  occurrences: Occurrence[],
  defaultStart = 6,
  defaultEnd = 23,
): { startHour: number; endHour: number } {
  let startHour = defaultStart;
  let endHour = defaultEnd;

  for (const o of occurrences) {
    const s = toMinutes(o.startTime);
    const e = Math.min(MINUTES_PER_DAY, s + o.durationMinutes);
    startHour = Math.min(startHour, Math.floor(s / 60));
    endHour = Math.max(endHour, Math.ceil(e / 60));
  }

  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}
