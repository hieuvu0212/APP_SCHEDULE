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

// ─── Bố cục cho BẢN IN ─────────────────────────────────────────────────────
//
//  Lưới giờ không in vừa một trang A4 và sẽ không bao giờ vừa: 17 tiếng nhân
//  56px là 952px, trong khi A4 ngang trừ lề chỉ còn khoảng 718px. Ép thu nhỏ
//  cho vừa thì một buổi 1 tiếng cao 35px và chữ chồng lên nhau — vừa giấy
//  nhưng không đọc được.
//
//  Bản in dùng cách trình bày KHÁC HẲN: ba hàng buổi × bảy cột ngày. Bỏ đi
//  vị trí chính xác theo phút, đổi lấy việc luôn vừa một trang bất kể lịch
//  dày tới đâu. Trên giấy, đọc được quan trọng hơn đo được.

export interface TimeBand {
  /** Khóa i18n cho nhãn hàng */
  key: string;
  /** Phút bắt đầu tính từ 00:00, BAO GỒM */
  from: number;
  /** Phút kết thúc, KHÔNG bao gồm */
  to: number;
}

/**
 * Ba buổi phủ trọn 24 giờ.
 *
 * Biên ngoài cố tình rộng hơn nhãn: hàng "Sáng" bắt đầu từ 00:00 chứ không
 * phải 06:00, và "Tối" kéo tới 24:00. Ca 05:00 hay 23:30 là chuyện có thật;
 * để hở khoảng nào là buổi rơi vào đó biến mất khỏi bản in mà không báo gì.
 */
export const PRINT_BANDS: TimeBand[] = [
  { key: 'print.morning', from: 0, to: 12 * 60 },
  { key: 'print.afternoon', from: 12 * 60, to: 18 * 60 },
  { key: 'print.evening', from: 18 * 60, to: 24 * 60 },
];

/** Buổi bắt đầu lúc `startTime` thuộc hàng nào. Xếp theo GIỜ BẮT ĐẦU. */
export function bandIndexOf(startTime: string, bands: TimeBand[] = PRINT_BANDS): number {
  const minute = toMinutes(startTime);
  const index = bands.findIndex((b) => minute >= b.from && minute < b.to);
  // Không khớp hàng nào thì dồn vào hàng cuối, thay vì để rơi mất.
  return index === -1 ? bands.length - 1 : index;
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
