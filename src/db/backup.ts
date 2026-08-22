// ═══════════════════════════════════════════════════════════════════════════
//  db/backup.ts — đọc/ghi toàn bộ DB cho việc sao lưu
//
//  Phần kiểm tra hình dạng và quy tắc trộn nằm ở core/backup.ts và có test.
//  File này chỉ lo việc nói chuyện với Dexie.
//
//  ⚠️ Sao lưu giữ NGUYÊN cả bản ghi đã xóa mềm (`deletedAt`). Bỏ chúng đi thì
//  khôi phục xong, thao tác xóa mà người dùng đã làm sẽ bị hoàn tác ngược —
//  mọi thứ họ cố ý dọn đi lại hiện về. Tombstone là dữ liệu, không phải rác.
// ═══════════════════════════════════════════════════════════════════════════

import type { SystemSettings } from '../types';
import type { BackupFile, BackupTable } from '../core/backup';
import { BACKUP_FORMAT, BACKUP_TABLES, mergeById } from '../core/backup';
import { db, SCHEMA_VERSION } from './schema';
import { ALL_TABLES, tableOf, type SoftDeletableRow } from './tables';
import { loadSettings, saveSettings } from './repo/settings';

export async function exportBackup(): Promise<BackupFile> {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async (name) => [name, await tableOf(name).toArray()] as const),
  );

  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(entries) as Record<BackupTable, unknown[]>,
    settings: await loadSettings(),
  };
}

export interface ImportReport {
  added: number;
  updated: number;
  kept: number;
  total: number;
}

/**
 * Nhập một file sao lưu.
 *
 *  'replace' — XÓA SẠCH rồi ghi lại. Máy sẽ giống hệt lúc xuất file.
 *  'merge'   — giữ dữ liệu đang có, bản ghi nào trùng id thì bản `updatedAt`
 *              muộn hơn thắng. KHÔNG xóa gì.
 *
 * Cả hai chạy trong MỘT giao dịch. Nếu đứt giữa chừng, Dexie cuộn lại toàn bộ
 * — không có trạng thái "khôi phục được một nửa", thứ còn tệ hơn là không
 * khôi phục gì.
 */
export async function importBackup(
  backup: BackupFile,
  mode: 'replace' | 'merge',
): Promise<ImportReport> {
  const report: ImportReport = { added: 0, updated: 0, kept: 0, total: 0 };

  await db.transaction(
    'rw',
    ALL_TABLES,
    async () => {
      for (const name of BACKUP_TABLES) {
        const table = tableOf(name);
        const incoming = (backup.data[name] ?? []) as SoftDeletableRow[];

        if (mode === 'replace') {
          await table.clear();
          const valid = incoming.filter((row) => row && typeof row.id === 'string');
          if (valid.length) await table.bulkPut(valid);
          report.added += valid.length;
          report.total += valid.length;
          continue;
        }

        const existing = await table.toArray();
        const result = mergeById(existing, incoming);
        await table.clear();
        if (result.merged.length) await table.bulkPut(result.merged);

        report.added += result.added;
        report.updated += result.updated;
        report.kept += result.kept;
        report.total += result.merged.length;
      }
    },
  );

  // Cấu hình nằm ngoài giao dịch trên vì nó ở bảng khác và không quan trọng
  // bằng — mất cấu hình thì chỉnh lại vài giây, mất lịch thì không lấy lại được.
  if (mode === 'replace' && backup.settings && typeof backup.settings === 'object') {
    // saveSettings đã trộn với DEFAULT_SETTINGS khi đọc, nên trường lạ hoặc
    // thiếu trong file cũ không làm hỏng cấu hình.
    await saveSettings(backup.settings as Partial<SystemSettings>);
  }

  return report;
}
