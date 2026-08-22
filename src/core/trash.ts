// ═══════════════════════════════════════════════════════════════════════════
//  core/trash.ts — mốc thời gian cho việc dọn thùng rác
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Nhỏ nhưng đáng tách ra: đây là phép tính ngày tháng, và mọi phép tính ngày
//  tháng trong dự án này đều đã từng có chỗ sai. `deletedAt` là ISO UTC nên
//  so sánh chuỗi cho kết quả đúng với so sánh thời gian — nhưng chỉ khi cả
//  hai vế cùng định dạng, và đó chính là thứ cần test.
// ═══════════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 86_400_000;

/**
 * Mốc ISO UTC của thời điểm `days` ngày trước.
 *
 * Bản ghi có `deletedAt` CŨ HƠN mốc này là ứng viên để xóa vĩnh viễn.
 * `days = 0` trả về đúng thời điểm hiện tại, nghĩa là dọn sạch mọi thứ.
 */
export function purgeCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - Math.max(0, days) * MS_PER_DAY).toISOString();
}

/**
 * Bản ghi này đã đủ cũ để xóa vĩnh viễn chưa.
 *
 * Bản ghi KHÔNG có `deletedAt` không bao giờ bị dọn — nó đang sống. Trả về
 * `false` cho trường hợp đó thay vì để phép so sánh với `undefined` tự quyết
 * định: `undefined < cutoff` là `false` trong JS, đúng ngẫu nhiên chứ không
 * phải do có ai nghĩ tới.
 */
export function isPurgeable(deletedAt: string | undefined, cutoff: string): boolean {
  if (!deletedAt) return false;
  return deletedAt <= cutoff;
}

/** Số ngày kể từ lúc bị xóa — dùng để hiển thị "đã xóa 3 ngày trước" */
export function daysSinceDeleted(deletedAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(deletedAt).getTime();
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}
