// ═══════════════════════════════════════════════════════════════════════════
//  core/fieldMerge.ts — gộp hai bản sửa của CÙNG MỘT bản ghi, theo từng trường
//
//  HÀM THUẦN. Không import React, không import Dexie, không chạm mạng.
//
//  ─── LỖI MÀ FILE NÀY SỬA ──────────────────────────────────────────────────
//
//  Trước đây đồng bộ chỉ biết "cả bản ghi nào có `updatedAt` muộn hơn thì
//  thắng". Máy A sửa GIỜ của một buổi, máy B sửa GHI CHÚ của chính buổi đó,
//  rồi cả hai đồng bộ: bên đồng bộ sau đè nguyên bản ghi lên bên kia, và một
//  trong hai thay đổi BIẾN MẤT — không lỗi, không cảnh báo, báo cáo vẫn xanh.
//
//  ─── GỘP BA BÊN ───────────────────────────────────────────────────────────
//
//  Hai bản ghi thôi thì không đủ để biết ai đã sửa trường nào: thấy `title`
//  khác nhau không nói được là A đổi hay B đổi. Cần bản thứ ba — BẢN GỐC, tức
//  nội dung mà hai bên cùng giữ ngay sau lần đồng bộ thành công gần nhất (xem
//  db/syncBase.ts). So từng trường với bản gốc:
//
//    chỉ local đổi         → lấy local
//    chỉ đám mây đổi       → lấy đám mây
//    cả hai đổi, giống nhau → lấy giá trị đó
//    cả hai đổi, khác nhau → XUNG ĐỘT THẬT: bên `updatedAt` muộn hơn thắng,
//                            đúng phép so chuỗi của cả dự án (`isNewer`)
//
//  ⚠️ VẮNG MẶT, `undefined` VÀ `null` LÀ MỘT.
//
//  Khôi phục từ Thùng rác XÓA HẲN thuộc tính `deletedAt` (phép biến đổi thứ
//  tư trong README); bản kéo từ đám mây thì đã đổi `null` thành vắng mặt; còn
//  bản ghi cũ có thể mang `deletedAt: undefined`. Ba hình dạng, một ý nghĩa.
//  So bằng `===` thì "khôi phục" trông như một thay đổi ở cả hai phía, xung
//  đột giả nổ ra, và bên `updatedAt` muộn hơn có thể XÓA LẠI bản ghi vừa được
//  khôi phục.
// ═══════════════════════════════════════════════════════════════════════════

import { isNewer } from './backup';

/** Hình dạng tối thiểu để gộp: có id, có dấu thời gian, còn lại là trường tự do */
export interface MergeableRecord {
  id: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Hai trường này không gộp theo luật chung: `id` là danh tính, `updatedAt` tính riêng */
const NOT_MERGED = new Set(['id', 'updatedAt']);

const isAbsent = (v: unknown) => v === undefined || v === null;

/**
 * Hai giá trị có cùng NGHĨA không.
 *
 * So sâu vì `tags`, `daysOfWeek` là mảng: `[1, 3] !== [1, 3]` theo tham chiếu,
 * và so tham chiếu thì MỌI mảng đều trông như vừa bị sửa ở cả hai phía.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isAbsent(a) || isAbsent(b)) return isAbsent(a) && isAbsent(b);
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }

  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) {
    if (!sameValue(ra[key], rb[key])) return false;
  }
  return true;
}

/**
 * Một dấu thời gian MUỘN HƠN HẲN mọi dấu đã cho.
 *
 * Bản gộp phải có `updatedAt` lớn hơn cả hai đầu vào — nếu không thì máy kia
 * (hoặc một máy chưa có bản gốc, đang dùng luật cũ) so `updatedAt` và thấy
 * bản của nó "mới hơn hoặc bằng", rồi không kéo bản gộp về.
 *
 * ⚠️ `now` CHƯA CHẮC đã lớn hơn. Đồng hồ máy này có thể chạy chậm hơn máy vừa
 * sửa bên kia. Khi đó cộng 1 ms vào dấu lớn nhất thay vì tin đồng hồ.
 *
 * ⚠️ VÀ CỘNG 1 ms CHƯA CHẮC ĐÃ LỚN HƠN KHI SO CHUỖI. `'…:00Z'` (thiếu phần
 * mili-giây) cộng 1 ms thành `'…:00.001Z'`, mà `'.'` (0x2E) < `'Z'` (0x5A) —
 * chuỗi mới NHỎ HƠN chuỗi cũ. Nên thử thêm bước 1 giây, và lần nào cũng KIỂM
 * bằng chính `isNewer` chứ không tin phép cộng.
 */
export function stampAfter(now: string, ...stamps: (string | undefined)[]): string {
  const max = stamps.reduce<string>((m, s) => (isNewer(s, m) ? (s as string) : m), '');
  if (isNewer(now, max)) return now;

  const ms = Date.parse(max);
  if (!Number.isNaN(ms)) {
    for (const step of [1, 1000]) {
      const candidate = new Date(ms + step).toISOString();
      if (isNewer(candidate, max)) return candidate;
    }
  }
  // Chỉ tới được đây khi dấu thời gian không phải ISO — ứng dụng không bao giờ
  // tự ghi ra loại đó. Không bịa được gì tốt hơn đồng hồ của máy.
  return now;
}

export interface FieldMergeResult<T> {
  merged: T;
  /** Những trường bị sửa ở CẢ HAI phía thành hai giá trị khác nhau */
  conflicts: string[];
}

/**
 * Gộp ba bên: `base` là bản cả hai cùng giữ sau lần đồng bộ trước, `local` và
 * `remote` là hai bản đã đi hai ngả từ đó.
 *
 * Hòa `updatedAt` ở một trường xung đột thì GIỮ BẢN LOCAL — cùng tinh thần
 * với `mergeById` ("hòa thì giữ bản đang có"). Thực tế `planSync` không gọi
 * tới đây khi hai `updatedAt` bằng nhau, nhưng hàm thuần phải tất định với
 * mọi đầu vào.
 *
 * Trường mang giá trị vắng mặt/`null` trong bản gộp bị BỎ HẲN chứ không ghi
 * `undefined` — cùng hình dạng với bản ghi tạo tại máy và bản kéo từ mây.
 */
export function mergeRecords<T extends MergeableRecord>(
  base: T,
  local: T,
  remote: T,
  now: string,
): FieldMergeResult<T> {
  const out: Record<string, unknown> = {};
  const conflicts: string[] = [];
  const remoteWins = isNewer(remote.updatedAt, local.updatedAt);

  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    if (NOT_MERGED.has(key)) continue;

    const localChanged = !sameValue(local[key], base[key]);
    const remoteChanged = !sameValue(remote[key], base[key]);

    let value: unknown;
    if (!remoteChanged) {
      value = local[key];
    } else if (!localChanged) {
      value = remote[key];
    } else if (sameValue(local[key], remote[key])) {
      value = local[key];
    } else {
      conflicts.push(key);
      value = remoteWins ? remote[key] : local[key];
    }

    if (!isAbsent(value)) out[key] = value;
  }

  out.id = local.id;
  out.updatedAt = stampAfter(now, local.updatedAt, remote.updatedAt);
  return { merged: out as T, conflicts };
}
