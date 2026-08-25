// ═══════════════════════════════════════════════════════════════════════════
//  core/backup.ts — kiểm tra và trộn dữ liệu sao lưu
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Toàn bộ dữ liệu của ứng dụng nằm trong IndexedDB của một trình duyệt. Người
//  dùng bấm "xóa dữ liệu duyệt web", cài lại máy, hay đổi trình duyệt là mất
//  trắng — không có máy chủ nào giữ hộ. Sao lưu không phải tính năng phụ, nó
//  là thứ duy nhất đứng giữa hai năm lịch và con số không.
//
//  Việc ĐỌC/GHI DB nằm ở db/backup.ts. Ở đây chỉ có phần kiểm tra hình dạng
//  và giải quyết xung đột — vì đó mới là phần dễ sai và cần test.
//
//  ⚠️ QUY TẮC TRỘN dùng chung với Phase 7 (đồng bộ Cloud): bản ghi nào có
//  `updatedAt` MUỘN HƠN thì thắng. Viết ở đây để lúc lên Cloud không phải
//  nghĩ lại, và quan trọng hơn là để nó có test ngay từ bây giờ.
// ═══════════════════════════════════════════════════════════════════════════

export const BACKUP_FORMAT = 'personal-schedule-backup';

/** Các bảng được sao lưu. Thêm bảng mới thì phải thêm vào đây. */
export const BACKUP_TABLES = [
  'categories',
  'rules',
  'exceptions',
  'events',
  'salaryRules',
  'adjustments',
  'adjustmentTemplates',
  'payments',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** Khớp với SCHEMA_VERSION lúc xuất */
  schemaVersion: number;
  /** ISO 8601 UTC */
  exportedAt: string;
  data: Record<BackupTable, unknown[]>;
  settings?: unknown;
}

export type ValidationResult =
  | { ok: true; backup: BackupFile; unknownTables: string[] }
  | { ok: false; reason: BackupError };

export type BackupError =
  | 'notObject'
  | 'wrongFormat'
  | 'missingData'
  | 'newerSchema'
  | 'tableNotArray';

/**
 * Kiểm tra một object vừa đọc từ file có dùng được không.
 *
 * KHÔNG kiểm tra từng bản ghi. Kiểm sâu tới mức đó sẽ phải nhân bản toàn bộ
 * định nghĩa schema ở đây, và schema thì còn đổi. Mục tiêu là bắt được nhầm
 * file — người dùng chọn nhầm một file JSON bất kỳ trên máy — chứ không phải
 * chống dữ liệu bị sửa tay có chủ đích.
 *
 * `currentSchemaVersion` truyền vào chứ không import từ db/, để giữ core/
 * không phụ thuộc tầng dưới.
 */
export function validateBackup(
  raw: unknown,
  currentSchemaVersion: number,
): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'notObject' };
  }

  const candidate = raw as Partial<BackupFile> & { data?: Record<string, unknown> };

  if (candidate.format !== BACKUP_FORMAT) return { ok: false, reason: 'wrongFormat' };
  if (typeof candidate.data !== 'object' || candidate.data === null) {
    return { ok: false, reason: 'missingData' };
  }

  // File từ bản ứng dụng MỚI HƠN có thể chứa trường mà bản này không hiểu, và
  // nhập vào sẽ âm thầm làm mất chúng. Chặn lại thay vì để người dùng phát
  // hiện sau vài tuần.
  const version = typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : 0;
  if (version > currentSchemaVersion) return { ok: false, reason: 'newerSchema' };

  const data: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows = (candidate.data as Record<string, unknown>)[table];
    if (rows === undefined) {
      // Bảng thiếu thì coi như rỗng — bản sao lưu cũ chưa có bảng đó.
      data[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) return { ok: false, reason: 'tableNotArray' };
    data[table] = rows;
  }

  // Bảng lạ trong file (từ bản mới hơn cùng schemaVersion) — báo cho người
  // dùng biết là có thứ không nhập được, thay vì lặng lẽ bỏ qua.
  const known = new Set<string>(BACKUP_TABLES);
  const unknownTables = Object.keys(candidate.data as object).filter((k) => !known.has(k));

  return {
    ok: true,
    unknownTables,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: version,
      exportedAt:
        typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
      data: data as Record<BackupTable, unknown[]>,
      settings: candidate.settings,
    },
  };
}

/** Hình dạng tối thiểu để trộn được: có id và có dấu thời gian sửa đổi */
export interface Mergeable {
  id: string;
  updatedAt?: string;
}

/**
 * `a` có mới hơn `b` không — PHÉP SO SÁNH DUY NHẤT quyết định ai thắng.
 *
 * Tách thành hàm riêng vì có HAI nơi cần nó: trộn file sao lưu (mergeById ở
 * dưới) và đồng bộ đám mây (core/sync.ts). Hai bản sao của cùng một quy tắc
 * sẽ lệch nhau, và lệch ở đây nghĩa là cùng một cặp bản ghi cho ra kết quả
 * khác nhau tùy người dùng bấm Nhập hay bấm Đồng bộ.
 *
 * ⚠️ SO CHUỖI, KHÔNG PHẢI Date.getTime().
 *
 * Chuỗi ISO 8601 UTC so theo thứ tự từ điển là đúng thứ tự thời gian, miễn là
 * ĐỊNH DẠNG ĐỒNG NHẤT. Đó là lý do mọi cột thời gian trên Supabase khai là
 * `text` chứ không phải `timestamptz`: `timestamptz` trả về "…+00:00" trong
 * khi client ghi "….000Z", và ở thế hòa thì '+' (0x2B) < '.' (0x2E) khiến bản
 * đến thắng bản đang có — ngược hẳn quy tắc dưới đây.
 *
 * Bản ghi thiếu `updatedAt` bị coi là cũ nhất: dữ liệu không có dấu thời gian
 * thì không có cơ sở nào để thắng dữ liệu có.
 */
export function isNewer(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') > (b ?? '');
}

export interface MergeReport<T> {
  merged: T[];
  added: number;
  updated: number;
  kept: number;
}

/**
 * Trộn hai tập bản ghi theo id, bản có `updatedAt` MUỘN HƠN thắng.
 *
 * Ba điểm cố ý:
 *
 *  · Bản ghi chỉ có ở MỘT bên đều được giữ. Trộn không bao giờ xóa gì — muốn
 *    xóa thì dùng chế độ ghi đè.
 *
 *  · Bản ghi thiếu `updatedAt` bị coi là cũ nhất. Dữ liệu không có dấu thời
 *    gian thì không có cơ sở để thắng bản có.
 *
 *  · Hòa (updatedAt bằng nhau) thì GIỮ BẢN ĐANG CÓ. Nhập lại đúng file vừa
 *    xuất phải là thao tác không thay đổi gì.
 */
export function mergeById<T extends Mergeable>(
  existing: T[],
  incoming: T[],
): MergeReport<T> {
  const byId = new Map<string, T>(existing.map((row) => [row.id, row]));
  let added = 0;
  let updated = 0;
  let kept = 0;

  for (const row of incoming) {
    if (!row || typeof row.id !== 'string') continue;
    const current = byId.get(row.id);

    if (!current) {
      byId.set(row.id, row);
      added++;
      continue;
    }

    if (isNewer(row.updatedAt, current.updatedAt)) {
      byId.set(row.id, row);
      updated++;
    } else {
      kept++;
    }
  }

  return { merged: [...byId.values()], added, updated, kept };
}

/** Tên file gợi ý: personal-schedule-2026-08-21.json */
export function backupFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `personal-schedule-${y}-${m}-${d}.json`;
}

/** Đếm tổng số bản ghi trong một file sao lưu — dùng cho câu xác nhận */
export function countRecords(backup: BackupFile): number {
  return BACKUP_TABLES.reduce((sum, table) => sum + (backup.data[table]?.length ?? 0), 0);
}
