// ═══════════════════════════════════════════════════════════════════════════
//  db/syncBase.ts — BẢN GỐC cho phép gộp ba bên khi đồng bộ
//
//  Bản gốc của một dòng = nội dung dòng đó ngay sau lần đồng bộ thành công gần
//  nhất, lúc máy này và đám mây GIỐNG HỆT nhau. Có nó thì `planSync()` biết
//  phía nào đã sửa, và `mergeRecords()` biết TRƯỜNG nào đã sửa (core/).
//
//  ─── VÌ SAO CHỈ Ở MÁY NÀY ─────────────────────────────────────────────────
//
//  Cách "chuẩn sách" là đóng dấu thời gian cho TỪNG TRƯỜNG trên mọi bản ghi.
//  Cách đó đòi đổi lược đồ đám mây, đổi mọi đường ghi trong db/repo/, và bất
//  kỳ đường ghi nào quên đóng dấu sẽ âm thầm thua mọi xung đột. Bản gốc thì
//  không ai phải nhớ gì: nó chỉ được ghi ở ĐÚNG MỘT chỗ — vòng đồng bộ.
//
//  Nó là trạng thái của cặp (máy này, tài khoản này) với đám mây, nên:
//    · KHÔNG vào BACKUP_TABLES — khôi phục bản gốc của máy khác sang máy này
//      là nói dối về chuyện hai bên đã thống nhất điều gì.
//    · KHÔNG lên supabase_schema.sql — bản gốc trên mây là thứ máy khác có thể
//      ghi đè, mà toàn bộ giá trị của nó là KHÔNG ai khác chạm vào được.
//
//  Mất bản gốc (xóa dữ liệu duyệt web, khôi phục sao lưu kiểu ghi đè, đổi tài
//  khoản) thì không mất dữ liệu: dòng đó lùi về luật cũ "bên mới hơn thắng"
//  cho tới khi một lần đồng bộ ghi lại bản gốc.
// ═══════════════════════════════════════════════════════════════════════════

import type { BackupTable } from '../core/backup';
import { db } from './schema';
import type { SoftDeletableRow } from './tables';

/**
 * Bản gốc của một bảng, CHỈ của tài khoản đang đăng nhập.
 *
 * Lọc theo `userId` ở đây chứ không xóa bản gốc lúc đăng xuất: phiên hết hạn
 * rồi đăng nhập tài khoản khác không đi qua nút Đăng xuất nào cả.
 */
export async function loadBases(
  table: BackupTable,
  userId: string,
): Promise<Map<string, SoftDeletableRow>> {
  const rows = await db.syncBase.where('table').equals(table).toArray();
  const out = new Map<string, SoftDeletableRow>();
  for (const r of rows) {
    if (r.userId === userId) out.set(r.id, r.row as SoftDeletableRow);
  }
  return out;
}

/**
 * Ghi bản gốc cho những dòng VỪA được hai bên thống nhất.
 *
 * ⚠️ CHỈ GỌI SAU KHI phía bên kia đã thật sự nhận: sau `upsert` thành công
 * với dòng đẩy lên, sau `bulkPut` với dòng kéo về. Ghi trước mà lệnh mạng hỏng
 * thì bản gốc khai rằng đám mây đang giữ thứ nó chưa hề nhận. Lần sau local
 * trùng bản gốc, đám mây thì khác — `planSync` kết luận "chỉ đám mây sửa" và
 * KÉO BẢN CŨ ĐÈ LÊN đúng thay đổi chưa kịp đẩy của chính máy này.
 */
export async function saveBases(
  table: BackupTable,
  userId: string,
  rows: SoftDeletableRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.syncBase.bulkPut(rows.map((row) => ({ table, id: row.id, userId, row })));
}

/** Bỏ bản gốc của những dòng đã bị xóa cứng — xem db/purge.ts */
export async function dropBases(refs: { table: BackupTable; id: string }[]): Promise<void> {
  if (refs.length === 0) return;
  await db.syncBase.bulkDelete(refs.map((r) => [r.table, r.id] as [string, string]));
}
