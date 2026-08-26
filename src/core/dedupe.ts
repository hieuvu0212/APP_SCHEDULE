// ═══════════════════════════════════════════════════════════════════════════
//  core/dedupe.ts — tìm danh mục trùng và dựng kế hoạch gộp
//
//  HÀM THUẦN. Không import React, không import Dexie.
//  Phần trỏ lại tham chiếu và ghi DB nằm ở db/dedupe.ts.
//
//  ⚠️ TRÙNG TÊN KHÔNG CÓ NGHĨA LÀ TRÙNG LẶP. ĐỪNG BAO GIỜ GỘP TỰ ĐỘNG.
//
//  Chính chú thích trong db/seed.ts nói: "Đi làm ở đây là MỘT chỗ làm, không
//  phải nhóm gộp mọi chỗ làm. Có chỗ làm thứ hai thì tạo danh mục thứ hai."
//  Hai chỗ làm cùng đặt tên "Đi làm" là chuyện hoàn toàn hợp lệ — và gộp
//  chúng lại sẽ ép hai cấu hình lương khác nhau về làm một, đúng cái mà
//  `calcMonthlyPayroll` không có đường phân biệt.
//
//  Nên chỗ này chỉ PHÁT HIỆN và ĐỀ XUẤT. Người dùng nhìn số lượng tham chiếu
//  của từng bên rồi tự quyết. Cùng nguyên tắc với `planWeekCopy()`: tính
//  trước, hiển thị đúng cái đã tính, rồi ghi đúng cái đã hiển thị.
// ═══════════════════════════════════════════════════════════════════════════

import type { Category } from '../types';
import { isSeededCategoryId } from '../types';
import { normalizeText } from './filter';
import { clientIdFromName } from './clientId';
import type { Client } from '../types';

export function findDuplicateClients(
  clients: Client[],
  refs: RefCounts,
): DuplicateGroup[] {
  const byName = new Map<string, Client[]>();

  for (const c of clients) {
    if (c.deletedAt) continue;
    const key = normalizeText(c.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }

  const groups: DuplicateGroup[] = [];

  for (const [key, members] of byName) {
    if (members.length < 2) continue;

    const ranked = [...members].sort((a, b) => {
      // 1. Khớp clientIdFromName(name)
      const expectedA = clientIdFromName(a.name);
      const expectedB = clientIdFromName(b.name);
      const aIsDeterministic = a.id === expectedA;
      const bIsDeterministic = b.id === expectedB;
      if (aIsDeterministic && !bIsDeterministic) return -1;
      if (!aIsDeterministic && bIsDeterministic) return 1;

      // 2. Nhiều tham chiếu nhất
      const byRefs = (refs[b.id] ?? 0) - (refs[a.id] ?? 0);
      if (byRefs !== 0) return byRefs;

      // 3. createdAt sớm nhất
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });

    const [winner, ...losers] = ranked;

    const withRefs = (c: Client): DuplicateMember => ({ category: c as any, refs: refs[c.id] ?? 0 });
    const merge = losers.map(withRefs).sort((a, b) => b.refs - a.refs);

    groups.push({
      key,
      label: winner.name,
      keep: withRefs(winner),
      merge,
      movingRefs: merge.reduce((n, m) => n + m.refs, 0),
    });
  }

  return groups.sort((a, b) => b.movingRefs - a.movingRefs || a.label.localeCompare(b.label));
}

/** Số bản ghi đang trỏ tới một danh mục, gộp cả bảy nơi tham chiếu */
export type RefCounts = Record<string, number>;

export interface DuplicateMember {
  category: Category;
  /** Bao nhiêu bản ghi sẽ phải trỏ lại nếu danh mục này bị gộp đi */
  refs: number;
}

export interface DuplicateGroup {
  /** Tên đã chuẩn hóa — khóa gộp nhóm */
  key: string;
  /** Tên hiển thị, lấy từ bản sẽ được giữ lại */
  label: string;
  /** Danh mục được đề xuất GIỮ LẠI */
  keep: DuplicateMember;
  /** Các danh mục sẽ bị gộp vào `keep`, đã sắp theo số tham chiếu giảm dần */
  merge: DuplicateMember[];
  /** Tổng số bản ghi sẽ phải trỏ lại */
  movingRefs: number;
}

/**
 * Nhóm các danh mục trùng tên, và chọn sẵn bản nên giữ.
 *
 * Bỏ qua bản ghi đã xóa mềm: chúng không hiện trong dropdown nên không phải
 * là thứ người dùng đang nhìn thấy trùng.
 *
 * ─── THỨ TỰ ƯU TIÊN KHI CHỌN BẢN GIỮ LẠI ─────────────────────────────────
 *
 *  1. Danh mục hệ thống — không bao giờ được xóa.
 *  2. Có ID CỐ ĐỊNH của seed (`sys-*`). Đây là bản mà mọi máy khác cũng sẽ
 *     tạo ra, nên giữ nó là cách duy nhất để lần seed sau không sinh thêm
 *     một bản trùng nữa.
 *  3. Nhiều tham chiếu nhất — ít phải trỏ lại nhất, tức ít rủi ro nhất.
 *  4. `createdAt` sớm nhất — bản gốc.
 *
 * Bước 2 quan trọng hơn vẻ ngoài của nó. Giữ một bản có id ngẫu nhiên thì
 * máy tiếp theo vẫn seed ra `sys-tutor` và bạn lại có hai "Gia sư".
 */
export function findDuplicateCategories(
  categories: Category[],
  refs: RefCounts,
): DuplicateGroup[] {
  const byName = new Map<string, Category[]>();

  for (const c of categories) {
    if (c.deletedAt) continue;
    const key = normalizeText(c.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }

  const groups: DuplicateGroup[] = [];

  for (const [key, members] of byName) {
    if (members.length < 2) continue;

    const ranked = [...members].sort(compareKeepPriority(refs));
    const [winner, ...losers] = ranked;

    const withRefs = (c: Category): DuplicateMember => ({ category: c, refs: refs[c.id] ?? 0 });
    const merge = losers.map(withRefs).sort((a, b) => b.refs - a.refs);

    groups.push({
      key,
      label: winner.name,
      keep: withRefs(winner),
      merge,
      movingRefs: merge.reduce((n, m) => n + m.refs, 0),
    });
  }

  // Nhóm nào phải di chuyển nhiều bản ghi nhất lên đầu — đó là nhóm đáng đọc
  // kỹ nhất trước khi bấm.
  return groups.sort((a, b) => b.movingRefs - a.movingRefs || a.label.localeCompare(b.label));
}

function compareKeepPriority(refs: RefCounts) {
  return (a: Category, b: Category): number => {
    const rank = (c: Category) => (c.isSystem ? 0 : isSeededCategoryId(c.id) ? 1 : 2);
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;

    const byRefs = (refs[b.id] ?? 0) - (refs[a.id] ?? 0);
    if (byRefs !== 0) return byRefs;

    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  };
}

/**
 * Danh mục seed CHƯA DÙNG mà trùng tên với một danh mục khác → bỏ đi được.
 *
 * ⚠️ Đây là trường hợp DUY NHẤT được xử lý tự động, và nó an toàn vì lý do
 * rất hẹp: KHÔNG tham chiếu nào trỏ tới nó. Không buổi học, không cấu hình
 * lương, không khoản thu. Bỏ nó đi thì về mặt dữ liệu không mất gì cả.
 *
 * Tình huống sinh ra nó: máy mới cài app → seed tạo năm danh mục mẫu → người
 * dùng đăng nhập → đồng bộ kéo về năm danh mục thật của họ. Không có bước dọn
 * này thì mỗi máy mới lại đẻ ra một bộ trùng, kể cả sau khi đã sửa id cố định.
 *
 * Danh mục hệ thống ("Chưa phân loại") KHÔNG bao giờ bị đụng tới — nó là nơi
 * gom lịch khi xóa danh mục khác, xóa nó là làm vỡ chính cơ chế đó.
 */
export function unusedSeedDuplicates(categories: Category[], refs: RefCounts): string[] {
  const live = categories.filter((c) => !c.deletedAt);
  const doomed: string[] = [];

  for (const c of live) {
    if (c.isSystem || !isSeededCategoryId(c.id)) continue;
    if ((refs[c.id] ?? 0) > 0) continue;

    const key = normalizeText(c.name);
    const hasTwin = live.some(
      (other) => other.id !== c.id && !doomed.includes(other.id) && normalizeText(other.name) === key,
    );
    if (hasTwin) doomed.push(c.id);
  }

  return doomed;
}
