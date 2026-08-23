// ═══════════════════════════════════════════════════════════════════════════
//  core/conflict.ts — phát hiện trùng lịch
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Hai điểm khác với bản kế hoạch gốc:
//
//  1. So sánh trên trục THỜI GIAN TUYỆT ĐỐI (epoch ms), không so chuỗi
//     "HH:mm" trong cùng một ngày. Nếu so theo ngày, ca 22:00–02:00 và sự
//     kiện 01:00 hôm sau nằm ở hai ngày khác nhau nên không bao giờ bị phát
//     hiện là trùng.
//
//  2. BẤT ĐẲNG THỨC NGHIÊM NGẶT: 10:00–12:00 và 12:00–14:00 KHÔNG trùng.
//
//  Trùng lịch chỉ CẢNH BÁO, không chặn thao tác — người dùng có thể cố ý
//  để trùng.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence } from '../types';
import { overlaps } from './time';

/**
 * Gắn cờ hasConflict / conflictWith cho từng occurrence.
 * Trả về mảng MỚI, không sửa đầu vào (giữ tính thuần khiết).
 *
 * Thuật toán quét: sắp theo thời điểm bắt đầu rồi chỉ so với các phần tử kế
 * tiếp còn chồng lấn — gần tuyến tính thay vì O(n²) toàn cục.
 */
export function detectConflicts(occurrences: Occurrence[]): Occurrence[] {
  const items = occurrences
    .map((o) => ({ ...o, hasConflict: false, conflictWith: [] as string[] }))
    .sort((a, b) => a.startAbs - b.startAbs);

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    // Buổi đã hủy không gây trùng lịch
    if (a.status === 'CANCELLED') continue;

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      // Đã sắp xếp → khi b bắt đầu sau khi a kết thúc thì mọi phần tử
      // sau đó cũng vậy, dừng luôn.
      if (b.startAbs >= a.endAbs) break;
      if (b.status === 'CANCELLED') continue;

      if (overlaps(a.startAbs, a.endAbs, b.startAbs, b.endAbs)) {
        a.hasConflict = true;
        b.hasConflict = true;
        a.conflictWith.push(b.key);
        b.conflictWith.push(a.key);
      }
    }
  }

  return items;
}
