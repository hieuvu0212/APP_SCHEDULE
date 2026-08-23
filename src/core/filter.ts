// ═══════════════════════════════════════════════════════════════════════════
//  core/filter.ts — lọc và tìm kiếm trong danh sách buổi
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Tìm kiếm BỎ QUA DẤU TIẾNG VIỆT. Gõ "gia su" phải ra "Gia sư", gõ "dai hoc"
//  phải ra "Đại học". Bắt người dùng gõ đúng dấu để tìm được thứ họ đã tự tay
//  nhập là một kiểu tra tấn nhỏ mà rất nhiều ứng dụng mắc phải.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence, OccurrenceStatus } from '../types';

/**
 * Dấu thanh kết hợp (combining diacritical marks), U+0300–U+036F.
 *
 * Dựng bằng `new RegExp` từ chuỗi ASCII chứ KHÔNG viết literal `/[...]/`.
 * Các ký tự này không hiển thị trong trình soạn thảo — dán thẳng vào mã nguồn
 * là để lại một khoảng trắng vô hình mà người sửa sau rất dễ xóa nhầm hoặc
 * bị công cụ định dạng bóp méo.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036F]', 'g');

/**
 * Chuẩn hóa chuỗi để so khớp: bỏ dấu, hạ chữ thường, cắt khoảng trắng thừa.
 *
 * NFD tách nguyên âm khỏi dấu thanh rồi ta xóa các dấu kết hợp. Riêng đ/Đ
 * phải xử lý tay: đó là một chữ cái riêng (U+0111 / U+0110) chứ không phải
 * "d + dấu", nên NFD không đụng tới nó.
 *
 * Thứ tự quan trọng: hạ chữ thường TRƯỚC rồi mới đổi đ→d, nhờ vậy chỉ cần
 * xử lý một dạng chữ.
 *
 * ⚠️ BƯỚC NFC CUỐI CÙNG KHÔNG THỪA.
 *
 * NFD không chỉ tách dấu thanh Latin. Âm tiết Hangul cũng tách: `한` (U+D55C)
 * thành ba jamo `ᄒ` + `ᅡ` + `ᆫ` ở dải U+1100–U+11FF. Kana có dakuten cũng
 * vậy: `が` thành `か` + U+3099. Cả hai dải đó KHÔNG nằm trong U+0300–U+036F
 * nên bộ lọc phía trên không đụng tới, và chuỗi trả về sẽ ở dạng đã tách —
 * trông y hệt trên màn hình nhưng khác hẳn khi so bằng `===`.
 *
 * Tìm kiếm vẫn chạy đúng vì hai vế đều đi qua đây nên cùng bị tách. Nhưng
 * hàm sẽ trả về thứ khác với thứ nó hứa, và người dùng nó cho việc gì ngoài
 * `includes` sẽ dính bẫy. NFC ghép lại, và là phép rỗng với tiếng Việt đã bỏ
 * dấu lẫn với chữ Hán.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFC')
    .trim();
}

export interface OccurrenceFilter {
  /** Rỗng hoặc bỏ trống = lấy tất cả */
  categoryIds?: string[];
  statuses?: OccurrenceStatus[];
  /**
   * Lọc theo `clientName`.
   *
   * ⚠️ Trường này KHÔNG chỉ là "học sinh". Nó trả lời câu "buổi này dành cho
   * ai / ở đâu": học sinh với lịch gia sư, chỗ làm với lịch đi làm, môn học
   * với lịch đại học. Đặt tên chung từ đầu để không phải đổi khi dùng cho
   * loại lịch khác.
   */
  clientNames?: string[];
  /** Tìm trong tiêu đề, ghi chú, địa điểm, tên đối tượng */
  query?: string;
  /** Chỉ lấy buổi đang bị trùng lịch */
  onlyConflicts?: boolean;
}

/**
 * Các giá trị `clientName` khác nhau, đã sắp xếp — dùng để dựng bộ lọc.
 *
 * So khớp theo chuỗi ĐÃ CHUẨN HÓA nhưng trả về dạng người dùng gõ đầu tiên,
 * nên "Minh" và "minh " gộp làm một mục thay vì thành hai dòng trong danh
 * sách chọn. Đây là biện pháp che tạm: chừng nào `clientName` còn là chuỗi
 * gõ tay chứ chưa phải thực thể có id thì "Minh" và "Mình" vẫn là hai người.
 */
export function distinctClients(occurrences: Occurrence[]): string[] {
  const seen = new Map<string, string>();
  for (const o of occurrences) {
    const raw = o.clientName?.trim();
    if (!raw) continue;
    const key = normalizeText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Gom các trường có thể tìm kiếm của một buổi thành một chuỗi đã chuẩn hóa */
function searchableText(o: Occurrence): string {
  return normalizeText(
    [o.title, o.notes, o.location, o.clientName].filter(Boolean).join(' '),
  );
}

/**
 * Lọc danh sách buổi.
 *
 * Các điều kiện là VÀ với nhau. Điều kiện bỏ trống thì không lọc gì — như vậy
 * bộ lọc rỗng trả về nguyên danh sách, thay vì trả về rỗng.
 *
 * Từ khóa nhiều chữ được tách ra và phải khớp TẤT CẢ, không cần liền nhau:
 * "minh toan" tìm được "Dạy Toán cho Minh".
 */
export function filterOccurrences(
  occurrences: Occurrence[],
  filter: OccurrenceFilter,
): Occurrence[] {
  const categories = filter.categoryIds?.length ? new Set(filter.categoryIds) : null;
  const statuses = filter.statuses?.length ? new Set(filter.statuses) : null;
  // So khớp qua chuỗi đã chuẩn hóa để "Minh" chọn trúng cả " minh ".
  const clients = filter.clientNames?.length
    ? new Set(filter.clientNames.map(normalizeText))
    : null;
  const terms = filter.query ? normalizeText(filter.query).split(/\s+/).filter(Boolean) : [];

  return occurrences.filter((o) => {
    if (categories && !categories.has(o.categoryId)) return false;
    if (statuses && !statuses.has(o.status)) return false;
    if (clients && !clients.has(normalizeText(o.clientName ?? ''))) return false;
    if (filter.onlyConflicts && !o.hasConflict) return false;

    if (terms.length) {
      const haystack = searchableText(o);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}

/** Tổng số phút của một danh sách buổi, bỏ qua buổi đã hủy / vắng mặt */
export function totalMinutes(occurrences: Occurrence[]): number {
  return occurrences
    .filter((o) => o.status !== 'CANCELLED' && o.status !== 'NO_SHOW')
    .reduce((sum, o) => sum + o.durationMinutes, 0);
}
