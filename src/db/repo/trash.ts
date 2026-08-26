// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/trash.ts — bản ghi đã xóa mềm
//
//  Toàn bộ ứng dụng xóa mềm: mọi thao tác xóa chỉ gán `deletedAt` để nút Hoàn
//  tác còn đường quay lại, và để Phase đồng bộ Cloud biết mà xóa ở phía kia.
//  Nhưng khi toast Hoàn tác tắt, những bản ghi đó không còn màn hình nào chạm
//  tới: không khôi phục được, không xóa hẳn được, và vẫn nằm trong file sao
//  lưu mãi mãi.
//
//  Đây là chỗ đóng vòng đó.
//
//  ⚠️ XÓA VĨNH VIỄN LÀ XÓA THẬT. Không có hoàn tác cho nó, và với Phase 7 thì
//  còn tệ hơn: mất tombstone nghĩa là mất luôn tín hiệu "hãy xóa bản ghi này
//  ở máy khác". Dọn xong rồi đồng bộ, bản ghi có thể sống lại từ máy chưa
//  nhận được lệnh xóa. Vì thế mặc định chỉ dọn thứ đã xóa quá 30 ngày.
// ═══════════════════════════════════════════════════════════════════════════

import type { BackupTable } from '../../core/backup';
import { BACKUP_TABLES } from '../../core/backup';
import { isPurgeable } from '../../core/trash';
import { db, nowISO } from '../schema';
import { ALL_TABLES, tableOf, type SoftDeletableRow } from '../tables';
import { restoreExceptionsOfRule } from './exceptions';

export interface TrashItem {
  table: BackupTable;
  id: string;
  /** Chuỗi để người dùng nhận ra đây là cái gì */
  label: string;
  deletedAt: string;
}

/**
 * Nhãn dễ đọc cho một bản ghi bất kỳ.
 *
 * Mỗi bảng gọi "tên" bằng một trường khác nhau, và exception thì không có
 * tên nào cả — nó là một sửa đổi, nên phải mô tả bằng loại và ngày.
 */
function labelOf(table: BackupTable, row: SoftDeletableRow): string {
  switch (table) {
    case 'clients':
    case 'categories':
      return String(row.name ?? '?');
    case 'rules':
    case 'events':
      return String(row.title ?? '?');
    case 'adjustments':
    case 'adjustmentTemplates':
      return String(row.label ?? '?');
    case 'salaryRules':
      return String(row.effectiveFrom ?? '?');
    case 'exceptions':
      return `${String(row.type ?? '?')} · ${String(row.originalDate ?? row.newDate ?? '?')}`;
    case 'payments':
      return `${String(row.clientLabel ?? '?')} · ${String(row.month ?? '')}`;
  }
}

export async function listTrash(): Promise<TrashItem[]> {
  const chunks = await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      const rows = await tableOf(table).toArray();
      return rows
        .filter((row) => typeof row.deletedAt === 'string')
        .map((row) => ({
          table,
          id: row.id,
          label: labelOf(table, row),
          deletedAt: String(row.deletedAt),
        }));
    }),
  );

  // Mới xóa lên đầu — thứ người dùng nhiều khả năng đang tìm nhất.
  return chunks.flat().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Gỡ tombstone cho một bản ghi.
 *
 * Khôi phục một RecurringRule kéo theo cả những exception bị dọn CÙNG LÚC với
 * nó — `softDeleteRule` đóng chung một dấu thời gian cho cả hai chính là để
 * phục vụ chỗ này. Thiếu bước đó thì chuỗi sống lại nhưng mọi buổi đã hủy,
 * đã dời, đã sửa riêng trong chuỗi đó đều biến mất.
 *
 * ⚠️ Khôi phục Category KHÔNG kéo được lịch về.
 * Lúc xóa, rule và event của nó đã bị dời sang "Chưa phân loại" và bản ghi
 * không lưu lại chúng vốn thuộc về đâu. Chỉ nút Hoàn tác ngay lúc đó mới làm
 * được việc ấy, vì nó giữ danh sách trong bộ nhớ. Màn hình thùng rác nói rõ
 * điều này thay vì để người dùng tưởng mọi thứ tự về chỗ cũ.
 */
export async function restoreFromTrash(table: BackupTable, id: string): Promise<void> {
  const t = nowISO();
  const row = await tableOf(table).get(id);
  if (!row) return;

  await tableOf(table).update(id, { deletedAt: undefined, updatedAt: t });

  if (table === 'rules' && typeof row.deletedAt === 'string') {
    await restoreExceptionsOfRule(id, row.deletedAt);
  }
}

/**
 * Bản ghi đã bị xóa cứng ở máy này.
 *
 * Trả về danh sách chứ không phải con số, vì phía đám mây cần biết ĐÚNG những
 * id nào để xóa theo. Xem db/purge.ts — thiếu bước đó thì bản ghi sống lại ở
 * lần đồng bộ kế tiếp.
 */
export interface PurgedRef {
  table: BackupTable;
  id: string;
}

/** Xóa vĩnh viễn đúng một bản ghi Ở MÁY NÀY. Đám mây do db/purge.ts lo. */
export async function purgeOne(table: BackupTable, id: string): Promise<void> {
  await tableOf(table).delete(id);
}

/**
 * Xóa vĩnh viễn mọi bản ghi có `deletedAt` cũ hơn `cutoff`, Ở MÁY NÀY.
 *
 * Chạy trong MỘT giao dịch: dọn được một nửa rồi đứt sẽ để lại exception mồ
 * côi trỏ tới rule đã bị xóa cứng.
 */
export async function purgeOlderThan(cutoff: string): Promise<PurgedRef[]> {
  const purged: PurgedRef[] = [];

  await db.transaction(
    'rw',
    ALL_TABLES,
    async () => {
      for (const table of BACKUP_TABLES) {
        const rows = await tableOf(table).toArray();
        const doomed = rows
          .filter((row) => isPurgeable(row.deletedAt, cutoff))
          .map((row) => row.id);
        if (doomed.length) {
          await tableOf(table).bulkDelete(doomed);
          for (const id of doomed) purged.push({ table, id });
        }
      }
    },
  );

  return purged;
}
