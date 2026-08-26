// ═══════════════════════════════════════════════════════════════════════════
//  core/sync.ts — quyết định ai thắng khi đồng bộ đám mây
//
//  HÀM THUẦN. Không import React, không import Dexie, không chạm mạng.
//
//  Phần nói chuyện với Supabase và Dexie nằm ở db/sync.ts. Ở đây chỉ có phép
//  so sánh — vì đó mới là phần dễ sai, và là phần duy nhất có thể làm MẤT DỮ
//  LIỆU của người dùng ở cả hai phía cùng lúc.
//
//  ⚠️ QUY TẮC THẮNG THUA DÙNG CHUNG với việc nhập file sao lưu: cả hai gọi
//  `isNewer()` trong core/backup.ts. Bản đồng bộ đầu tiên tự viết lại phép so
//  bằng `new Date(x).getTime()` thay vì dùng lại hàm đã có — hai bản sao của
//  cùng một quy tắc, và chúng đã lệch nhau ngay từ đầu ở thế hòa.
//
//  ─── VÌ SAO KHÔNG DÙNG THẲNG mergeById() ──────────────────────────────────
//
//  `mergeById()` trả về MẢNG ĐÃ TRỘN — đủ cho việc nhập file, vì ở đó chỉ có
//  một phía để ghi. Đồng bộ cần biết thêm CHIỀU: bản ghi này phải đẩy lên hay
//  kéo về. Nên đây là hàm khác, nhưng nó bắt buộc dùng chung phép so sánh.
// ═══════════════════════════════════════════════════════════════════════════

import { isNewer, type Mergeable } from './backup';

export interface SyncPlan<T> {
  /** Local mới hơn, hoặc đám mây chưa có → đẩy lên */
  toPush: T[];
  /** Đám mây mới hơn, hoặc local chưa có → ghi xuống */
  toPull: T[];
  /** Hai bên đã bằng nhau — đếm để báo cáo, không làm gì */
  inSync: number;
}

/**
 * Dựng kế hoạch đồng bộ cho MỘT bảng. Không ghi gì cả.
 *
 * Cùng tinh thần với `planWeekCopy()`: tính trước, hiển thị đúng cái đã tính,
 * rồi mới ghi đúng cái đã hiển thị. Không có đường nào để đếm một đằng ghi
 * một nẻo.
 *
 * BỐN TRƯỜNG HỢP:
 *
 *   chỉ ở local        → đẩy lên   (máy này vừa tạo, hoặc đám mây mới dựng)
 *   chỉ ở đám mây      → kéo về    (máy khác tạo, hoặc máy này vừa cài lại)
 *   cả hai, khác nhau  → bên mới hơn thắng
 *   cả hai, bằng nhau  → không làm gì
 *
 * ⚠️ TOMBSTONE LÀ DỮ LIỆU, KHÔNG PHẢI SỰ VẮNG MẶT.
 *
 * Bản ghi đã xóa mềm vẫn là một dòng có `deletedAt`, nên nó đi qua đúng bốn
 * nhánh trên như mọi dòng khác — đó chính là cách lệnh xóa lan sang máy khác.
 * Hàm này KHÔNG lọc bỏ chúng. Lọc là biến "hãy xóa bản ghi này" thành "máy
 * này không biết gì về bản ghi này", và phía kia sẽ đẩy nó sống lại.
 *
 * Việc khôi phục (gỡ `deletedAt`) cũng chỉ là một bản ghi có `updatedAt` mới
 * hơn — nhưng để nó lan được thì tầng đẩy phải gửi `deleted_at: null` TƯỜNG
 * MINH thay vì bỏ trống trường đó. Xem db/sync.ts.
 */
export function planSync<T extends Mergeable>(local: T[], cloud: T[]): SyncPlan<T> {
  const cloudById = new Map(cloud.map((row) => [row.id, row]));
  const localIds = new Set(local.map((row) => row.id));

  const toPush: T[] = [];
  const toPull: T[] = [];
  let inSync = 0;

  for (const mine of local) {
    const theirs = cloudById.get(mine.id);
    if (!theirs) {
      toPush.push(mine);
    } else if (isNewer(mine.updatedAt, theirs.updatedAt)) {
      toPush.push(mine);
    } else if (isNewer(theirs.updatedAt, mine.updatedAt)) {
      toPull.push(theirs);
    } else {
      inSync++;
    }
  }

  for (const theirs of cloud) {
    if (!localIds.has(theirs.id)) toPull.push(theirs);
  }

  return { toPush, toPull, inSync };
}

/** Kết quả của một lần đồng bộ, theo từng bảng */
export interface TableSyncResult {
  table: string;
  pushed: number;
  pulled: number;
  inSync: number;
  /** Thông điệp lỗi nếu bảng này hỏng. Các bảng khác vẫn chạy tiếp. */
  error?: string;
}

export interface SyncReport {
  tables: TableSyncResult[];
  pushed: number;
  pulled: number;
  failed: number;
}

export function summarize(tables: TableSyncResult[]): SyncReport {
  return {
    tables,
    pushed: tables.reduce((n, r) => n + r.pushed, 0),
    pulled: tables.reduce((n, r) => n + r.pulled, 0),
    failed: tables.filter((r) => r.error).length,
  };
}
