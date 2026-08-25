// ═══════════════════════════════════════════════════════════════════════════
//  db/dedupe.ts — gộp danh mục trùng, trỏ lại mọi tham chiếu
//
//  Phần chọn ai giữ ai gộp nằm ở core/dedupe.ts và có test. File này lo việc
//  ghi — và đây là thao tác ghi RỘNG NHẤT trong toàn ứng dụng: nó chạm vào
//  bảy bảng cùng lúc.
//
//  ⚠️ BẢY NƠI, KHÔNG PHẢI SÁU. THIẾU MỘT LÀ MỒ CÔI DỮ LIỆU.
//
//      rules.categoryId
//      events.categoryId
//      salaryRules.categoryId
//      adjustments.categoryId
//      adjustmentTemplates.categoryId
//      payments.categoryId
//      exceptions.newCategoryId        ← DỄ QUÊN NHẤT
//
//  `exceptions.newCategoryId` không tên giống sáu cái kia, nên tìm bằng cách
//  gõ "categoryId" là bỏ sót. Bỏ sót nó thì một buổi đã đổi danh mục riêng sẽ
//  trỏ tới danh mục vừa bị xóa mềm, và nó biến mất khỏi mọi bộ lọc mà không
//  báo gì.
//
//  ⚠️ MỘT GIAO DỊCH DUY NHẤT. Trỏ lại được ba bảng rồi đứt sẽ để lại trạng
//  thái nửa vời không có đường quay về — danh mục cũ đã xóa mà lịch vẫn trỏ
//  tới nó.
// ═══════════════════════════════════════════════════════════════════════════

import type { Category } from '../types';
import type { RefCounts } from '../core/dedupe';
import { findDuplicateCategories, unusedSeedDuplicates, type DuplicateGroup } from '../core/dedupe';
import { db, nowISO } from './schema';
import { ALL_TABLES } from './tables';

/**
 * Mỗi nơi trỏ tới Category: bảng nào, qua trường nào.
 *
 * Khai thành DỮ LIỆU chứ không viết bảy đoạn lệnh giống nhau. Thêm một bảng
 * mới có `categoryId` thì thêm đúng một dòng ở đây, và cả việc đếm lẫn việc
 * trỏ lại đều tự bao phủ nó — hai chỗ không thể lệch nhau.
 */
const REFERENCES = [
  { table: () => db.rules, field: 'categoryId' },
  { table: () => db.events, field: 'categoryId' },
  { table: () => db.salaryRules, field: 'categoryId' },
  { table: () => db.adjustments, field: 'categoryId' },
  { table: () => db.adjustmentTemplates, field: 'categoryId' },
  { table: () => db.payments, field: 'categoryId' },
  { table: () => db.exceptions, field: 'newCategoryId' },
] as const;

/** Đếm bản ghi đang trỏ tới từng danh mục, trên cả bảy nơi */
export async function countCategoryRefs(): Promise<RefCounts> {
  const counts: RefCounts = {};

  for (const ref of REFERENCES) {
    // Ép qua `unknown`: bảy bảng có bảy kiểu hàng khác nhau, và ở đây ta chỉ
    // quan tâm đúng hai trường chung — `id` và trường trỏ tới danh mục. Cùng
    // lý do với phép ép trong db/tables.ts, chỉ khác là gom về một chỗ.
    const rows = (await ref.table().toArray()) as unknown as Array<Record<string, unknown>>;
    for (const row of rows) {
      // Bản ghi đã xóa mềm VẪN TÍNH. Người dùng có thể khôi phục nó, và lúc
      // đó nó phải trỏ tới một danh mục còn tồn tại.
      const id = row[ref.field];
      if (typeof id === 'string') counts[id] = (counts[id] ?? 0) + 1;
    }
  }

  return counts;
}

export interface DuplicateReport {
  groups: DuplicateGroup[];
  totalExtra: number;
}

/** Đọc DB và dựng danh sách nhóm trùng để hiển thị. Không ghi gì. */
export async function findDuplicates(): Promise<DuplicateReport> {
  const [categories, refs] = await Promise.all([db.categories.toArray(), countCategoryRefs()]);
  const groups = findDuplicateCategories(categories, refs);
  return { groups, totalExtra: groups.reduce((n, g) => n + g.merge.length, 0) };
}

export interface MergeResult {
  /** Số bản ghi đã được trỏ sang danh mục giữ lại */
  repointed: number;
  /** Số danh mục đã bị xóa mềm */
  removed: number;
  undo: () => Promise<void>;
}

/**
 * Gộp `mergeIds` vào `keepId`.
 *
 * Hoàn tác được: hàm trả về kèm cách hoàn nguyên, đúng nguyên tắc chung của
 * dự án — không có undo stack toàn cục. Bản hoàn nguyên trỏ NGƯỢC từng bản
 * ghi về đúng danh mục cũ của nó, nên nó cần nhớ ánh xạ id → danh mục gốc chứ
 * không chỉ "trỏ hết về cái nào đó".
 */
export async function mergeCategories(keepId: string, mergeIds: string[]): Promise<MergeResult> {
  if (mergeIds.includes(keepId)) {
    throw new Error('Không thể gộp một danh mục vào chính nó');
  }

  const t = nowISO();
  const doomed = new Set(mergeIds);

  /** Ghi lại từng bản ghi đã đụng vào, để hoàn tác trỏ đúng chỗ cũ */
  const touched: Array<{ index: number; id: string; previous: string }> = [];
  let removed = 0;

  await db.transaction('rw', ALL_TABLES, async () => {
    for (const [index, ref] of REFERENCES.entries()) {
      const table = ref.table() as unknown as {
        toArray: () => Promise<Array<Record<string, unknown>>>;
        update: (id: string, changes: Record<string, unknown>) => Promise<number>;
      };
      const rows = await table.toArray();

      for (const row of rows) {
        const current = row[ref.field];
        if (typeof current !== 'string' || !doomed.has(current)) continue;

        touched.push({ index, id: String(row.id), previous: current });
        await table.update(String(row.id), { [ref.field]: keepId, updatedAt: t });
      }
    }

    for (const id of mergeIds) {
      // Xóa MỀM, không xóa cứng. Tombstone là thứ mang lệnh xóa sang máy khác
      // — xóa cứng ở đây thì máy kia sẽ đẩy danh mục đó sống lại ở lần đồng
      // bộ sau, và người dùng thấy bản trùng quay về.
      const updated = await db.categories.update(id, { deletedAt: t, updatedAt: t });
      removed += updated;
    }
  });

  const undo = async () => {
    const back = nowISO();
    await db.transaction('rw', ALL_TABLES, async () => {
      for (const item of touched) {
        const ref = REFERENCES[item.index];
        const table = ref.table() as unknown as {
          update: (id: string, changes: Record<string, unknown>) => Promise<number>;
        };
        await table.update(item.id, { [ref.field]: item.previous, updatedAt: back });
      }
      for (const id of mergeIds) {
        // `undefined` là lệnh XÓA THUỘC TÍNH với Dexie — đó là cách gỡ
        // tombstone. Xem README, mục Hoàn tác.
        await db.categories.update(id, { deletedAt: undefined, updatedAt: back });
      }
    });
  };

  return { repointed: touched.length, removed, undo };
}

/**
 * Dọn danh mục seed CHƯA DÙNG bị trùng tên. Chạy sau mỗi lần đồng bộ.
 *
 * An toàn để chạy tự động vì điều kiện rất hẹp: id là `sys-*`, không phải
 * danh mục hệ thống, và KHÔNG bản ghi nào trỏ tới nó. Xem chú thích của
 * `unusedSeedDuplicates()`.
 *
 * Trả về số danh mục đã dọn — bằng 0 trong tuyệt đại đa số lần chạy.
 */
export async function dropUnusedSeedDuplicates(): Promise<number> {
  const [categories, refs] = await Promise.all([db.categories.toArray(), countCategoryRefs()]);
  const doomed = unusedSeedDuplicates(categories as Category[], refs);
  if (doomed.length === 0) return 0;

  const t = nowISO();
  await db.transaction('rw', db.categories, async () => {
    for (const id of doomed) {
      await db.categories.update(id, { deletedAt: t, updatedAt: t });
    }
  });
  return doomed.length;
}
