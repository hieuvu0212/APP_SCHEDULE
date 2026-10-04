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
  /**
   * CẢ HAI phía đã sửa kể từ lần đồng bộ trước → gộp theo từng trường.
   * Mang bản kê phía LOCAL; nội dung đám mây phải tải về mới gộp được.
   */
  toMerge: T[];
  /**
   * Đã khớp nhau nhưng bản gốc thiếu hoặc lỗi thời → ghi lại bản gốc từ bản
   * local, KHÔNG cần tải gì. Đây là đường để những dòng đồng bộ từ trước khi
   * có bản gốc tự có bản gốc ngay lần đồng bộ đầu tiên sau khi nâng cấp.
   */
  toRebase: T[];
  /** Hai bên đã bằng nhau — đếm để báo cáo, không làm gì */
  inSync: number;
}

const sameStamp = (a: string | undefined, b: string | undefined) => (a ?? '') === (b ?? '');

/**
 * Dựng kế hoạch đồng bộ cho MỘT bảng. Không ghi gì cả.
 *
 * Cùng tinh thần với `planWeekCopy()`: tính trước, hiển thị đúng cái đã tính,
 * rồi mới ghi đúng cái đã hiển thị. Không có đường nào để đếm một đằng ghi
 * một nẻo.
 *
 * `base` là bản kê của BẢN GỐC — `updatedAt` mà hai bên cùng giữ ngay sau lần
 * đồng bộ thành công gần nhất của từng dòng (db/syncBase.ts). Không truyền thì
 * hàm cư xử y hệt bản trước: cả bản ghi nào mới hơn thì thắng.
 *
 * CÁC TRƯỜNG HỢP:
 *
 *   chỉ ở local                 → đẩy lên (máy này vừa tạo, hoặc mây mới dựng)
 *   chỉ ở đám mây               → kéo về  (máy khác tạo, hoặc máy này cài lại)
 *   cả hai, `updatedAt` bằng nhau → không làm gì (ghi lại bản gốc nếu thiếu)
 *   cả hai, CHƯA có bản gốc     → bên mới hơn thắng — luật cũ, nguyên vẹn
 *   cả hai, đám mây = bản gốc   → chỉ local sửa → đẩy lên
 *   cả hai, local = bản gốc     → chỉ đám mây sửa → kéo về
 *   cả hai, cả hai ≠ bản gốc    → HAI MÁY CÙNG SỬA → gộp theo từng trường
 *
 * ⚠️ KHI CÓ BẢN GỐC, CHIỀU ĐI DO "AI ĐÃ SỬA" QUYẾT ĐỊNH, KHÔNG PHẢI "AI MỚI HƠN".
 * Hai câu đó trùng nhau khi đồng hồ hai máy khớp. Khi không khớp — máy A chạy
 * chậm mười phút, sửa một buổi — luật cũ thấy bản trên mây "mới hơn" và kéo
 * đè lên đúng thay đổi vừa làm. So với bản gốc thì lệch đồng hồ không tạo ra
 * được trạng thái đó.
 *
 * ⚠️ TOMBSTONE LÀ DỮ LIỆU, KHÔNG PHẢI SỰ VẮNG MẶT.
 *
 * Bản ghi đã xóa mềm vẫn là một dòng có `deletedAt`, nên nó đi qua đúng các
 * nhánh trên như mọi dòng khác — đó chính là cách lệnh xóa lan sang máy khác.
 * Hàm này KHÔNG lọc bỏ chúng. Lọc là biến "hãy xóa bản ghi này" thành "máy
 * này không biết gì về bản ghi này", và phía kia sẽ đẩy nó sống lại.
 *
 * Việc khôi phục (gỡ `deletedAt`) cũng chỉ là một bản ghi có `updatedAt` mới
 * hơn — nhưng để nó lan được thì tầng đẩy phải gửi `deleted_at: null` TƯỜNG
 * MINH thay vì bỏ trống trường đó. Xem db/sync.ts.
 */
export function planSync<T extends Mergeable>(
  local: T[],
  cloud: T[],
  base: Mergeable[] = [],
): SyncPlan<T> {
  const cloudById = new Map(cloud.map((row) => [row.id, row]));
  const baseById = new Map(base.map((row) => [row.id, row]));
  const localIds = new Set(local.map((row) => row.id));

  const toPush: T[] = [];
  const toPull: T[] = [];
  const toMerge: T[] = [];
  const toRebase: T[] = [];
  let inSync = 0;

  for (const mine of local) {
    const theirs = cloudById.get(mine.id);
    const was = baseById.get(mine.id);

    if (!theirs) {
      toPush.push(mine);
    } else if (sameStamp(mine.updatedAt, theirs.updatedAt)) {
      // Đặt TRƯỚC mọi nhánh khác: không đổi gì thì không được tải gì. Lần đồng
      // bộ thứ hai tải về đúng 0 dòng đầy đủ — có test đo con số đó.
      inSync++;
      if (!was || !sameStamp(was.updatedAt, mine.updatedAt)) toRebase.push(mine);
    } else if (!was) {
      // Chưa có bản gốc thì không biết ai đã sửa gì — lùi về luật cũ.
      if (isNewer(mine.updatedAt, theirs.updatedAt)) toPush.push(mine);
      else toPull.push(theirs);
    } else if (sameStamp(theirs.updatedAt, was.updatedAt)) {
      toPush.push(mine);
    } else if (sameStamp(mine.updatedAt, was.updatedAt)) {
      toPull.push(theirs);
    } else {
      toMerge.push(mine);
    }
  }

  for (const theirs of cloud) {
    if (!localIds.has(theirs.id)) toPull.push(theirs);
  }

  return { toPush, toPull, toMerge, toRebase, inSync };
}

/** Kết quả của một lần đồng bộ, theo từng bảng */
export interface TableSyncResult {
  table: string;
  pushed: number;
  pulled: number;
  /** Số dòng hai máy cùng sửa và đã gộp theo từng trường (đã tính trong `pushed`) */
  merged: number;
  inSync: number;
  /** Thông điệp lỗi nếu bảng này hỏng. Các bảng khác vẫn chạy tiếp. */
  error?: string;
}

export interface SyncReport {
  tables: TableSyncResult[];
  pushed: number;
  pulled: number;
  merged: number;
  failed: number;
}

export function summarize(tables: TableSyncResult[]): SyncReport {
  return {
    tables,
    pushed: tables.reduce((n, r) => n + r.pushed, 0),
    pulled: tables.reduce((n, r) => n + r.pulled, 0),
    merged: tables.reduce((n, r) => n + r.merged, 0),
    failed: tables.filter((r) => r.error).length,
  };
}
