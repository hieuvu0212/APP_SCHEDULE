// ═══════════════════════════════════════════════════════════════════════════
//  db/purge.ts — xóa vĩnh viễn, ở CẢ HAI phía
//
//  ⚠️ VÌ SAO FILE NÀY TỒN TẠI THAY VÌ GỌI THẲNG repo/trash.ts.
//
//  Xóa cứng ở máy mà không xóa trên đám mây tạo ra một vòng lặp không lối
//  thoát: hàng trên mây còn nguyên, lần đồng bộ kế tiếp kéo nó về, BẢN GHI
//  SỐNG LẠI. Người dùng xóa lần nữa, nó lại về. Nhìn từ phía họ thì đó không
//  phải một lỗi đồng bộ — nó giống hệt như ứng dụng bị hỏng.
//
//  Cách chữa hiển nhiên là "nhớ gọi thêm hàm xóa trên mây sau khi xóa ở máy".
//  Đó chính xác là loại quy ước sẽ bị quên: nó đúng ở chỗ gọi hôm nay, và sai
//  ở chỗ gọi thứ ba được thêm vào sáu tháng nữa. Gộp hai việc vào MỘT hàm thì
//  không còn gì để quên.
//
//  ─── TẦNG NÀO ─────────────────────────────────────────────────────────────
//
//  `db/repo/` là CRUD thuần trên Dexie và không được biết gì về mạng.
//  `db/purge.ts` nằm cùng tầng với `db/backup.ts`: điều phối nhiều nguồn, và
//  đó đúng là việc của nó.
//
//  ─── KHÔNG ĐĂNG NHẬP THÌ SAO ──────────────────────────────────────────────
//
//  Xóa ở máy vẫn chạy, phần đám mây bỏ qua và báo `skipped`. Chặn người dùng
//  dọn thùng rác chỉ vì họ chưa đăng nhập là lấy một tính năng cục bộ đem đi
//  cầm cho một tính năng tùy chọn.
//
//  Cái giá: ai dùng đám mây, dọn rác lúc đăng xuất, rồi đăng nhập lại sẽ thấy
//  bản ghi quay về. Giao diện nói rõ điều đó ngay tại nút bấm.
// ═══════════════════════════════════════════════════════════════════════════

import type { BackupTable } from '../core/backup';
import { purgeOlderThan as purgeOlderThanLocal, purgeOne as purgeOneLocal } from './repo/trash';
import type { PurgedRef } from './repo/trash';
import { CloudError, syncTransport, type CloudTransport } from './sync';
import { dropBases } from './syncBase';

/** Phần đám mây đã làm được gì */
export type CloudPurgeState =
  | { kind: 'skipped'; reason: 'notConfigured' | 'notSignedIn' }
  | { kind: 'done'; removed: number }
  | { kind: 'failed'; message: string };

export interface PurgeResult {
  /** Số bản ghi đã xóa cứng ở máy này */
  removed: number;
  cloud: CloudPurgeState;
}

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Xóa những id đó khỏi đám mây, gom theo bảng.
 *
 * KHÔNG ném khi mạng lỗi. Bản ghi ở máy đã bị xóa cứng rồi và không lấy lại
 * được — báo lỗi ra ngoài lúc này chỉ khiến giao diện trông như thao tác đã
 * thất bại, trong khi nửa đầu của nó đã thành công vĩnh viễn. Trạng thái được
 * trả về để màn hình nói đúng chuyện gì đã xảy ra.
 */
async function purgeCloud(refs: PurgedRef[], transport?: CloudTransport): Promise<CloudPurgeState> {
  if (refs.length === 0) return { kind: 'done', removed: 0 };

  let t: CloudTransport;
  try {
    t = transport ?? (await syncTransport());
  } catch (e) {
    if (e instanceof CloudError) return { kind: 'skipped', reason: e.code };
    return { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
  }

  const byTable = new Map<BackupTable, string[]>();
  for (const ref of refs) {
    const list = byTable.get(ref.table) ?? [];
    list.push(ref.id);
    byTable.set(ref.table, list);
  }

  try {
    for (const [table, ids] of byTable) {
      await t.deleteByIds(toSnake(table), ids);
    }
    return { kind: 'done', removed: refs.length };
  } catch (e) {
    return { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Xóa vĩnh viễn một bản ghi ở máy VÀ trên đám mây */
export async function purgeOne(
  table: BackupTable,
  id: string,
  transport?: CloudTransport,
): Promise<PurgeResult> {
  await purgeOneLocal(table, id);
  // Bản gốc của một dòng không còn tồn tại là rác thuần túy — và nó nằm trong
  // bảng không có Thùng rác nào dọn hộ. Xem db/syncBase.ts.
  await dropBases([{ table, id }]);
  return { removed: 1, cloud: await purgeCloud([{ table, id }], transport) };
}

/** Xóa vĩnh viễn mọi bản ghi đã xóa mềm quá `cutoff`, ở máy VÀ trên đám mây */
export async function purgeOlderThan(
  cutoff: string,
  transport?: CloudTransport,
): Promise<PurgeResult> {
  const refs = await purgeOlderThanLocal(cutoff);
  await dropBases(refs);
  return { removed: refs.length, cloud: await purgeCloud(refs, transport) };
}
