// ═══════════════════════════════════════════════════════════════════════════
//  db/tables.ts — tra bảng Dexie theo tên, dưới một kiểu DUY NHẤT
//
//  Sao lưu và thùng rác đều phải làm cùng một việc trên cả bảy bảng: đọc hết,
//  lọc theo `deletedAt`, ghi lại. Chúng không quan tâm bảng đó chứa Category
//  hay PayrollAdjustment — chỉ cần biết mỗi dòng có `id` và có thể có
//  `deletedAt`.
//
//  ⚠️ VÌ SAO PHẢI ÉP KIỂU Ở ĐÂY.
//
//  Viết `switch` trả về `db.categories` / `db.rules` / … thì TypeScript suy ra
//  kiểu trả về là UNION của bảy `Table<T>`. Gọi `bulkPut` trên union đó lập
//  tức hỏng: mỗi thành viên có chữ ký generic riêng, và TS không tìm được một
//  chữ ký chung nào tương thích với tất cả —
//      TS2349: This expression is not callable.
//  Cùng lý do khiến `toArray()` trả về union của bảy mảng, không ép sang một
//  kiểu chung được.
//
//  Gom về một phép ép DUY NHẤT ở đây, có chú thích, còn hơn rải `as never`
//  khắp hai file gọi — thứ vừa che mất lỗi thật vừa không giải thích gì.
// ═══════════════════════════════════════════════════════════════════════════

import type { Table } from 'dexie';
import type { BackupTable } from '../core/backup';
import { db } from './schema';

/**
 * Hình dạng tối thiểu mà MỌI bảng trong sao lưu đều thỏa mãn.
 *
 * Chỉ số `[key: string]: unknown` là cố ý: tầng thùng rác cần đọc `name`,
 * `title`, `label` — mỗi bảng gọi "tên" bằng một trường khác nhau — mà không
 * phải viết bảy nhánh ép kiểu riêng.
 */
export interface SoftDeletableRow {
  id: string;
  updatedAt?: string;
  deletedAt?: string;
  [key: string]: unknown;
}

export function tableOf(name: BackupTable): Table<SoftDeletableRow, string> {
  const tables: Record<BackupTable, unknown> = {
    categories: db.categories,
    clients: db.clients,
    rules: db.rules,
    exceptions: db.exceptions,
    events: db.events,
    salaryRules: db.salaryRules,
    adjustments: db.adjustments,
    adjustmentTemplates: db.adjustmentTemplates,
    payments: db.payments,
  };
  return tables[name] as Table<SoftDeletableRow, string>;
}

/** Mọi bảng có xóa mềm — dùng cho giao dịch chạy trên toàn bộ */
export const ALL_TABLES = [
  db.categories,
  db.clients,
  db.rules,
  db.exceptions,
  db.events,
  db.salaryRules,
  db.adjustments,
  db.adjustmentTemplates,
  db.payments,
];
