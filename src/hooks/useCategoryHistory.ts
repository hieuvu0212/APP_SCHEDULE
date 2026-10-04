// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useCategoryHistory.ts — nạp lịch sử phân loại cho Thêm nhanh
//
//  Nối `db/repo/` với `core/inferCategory.ts`. Phần quyết định nằm ở core và
//  có test; ở đây chỉ còn việc đọc bảng và ghép tên với id.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import { clientIdFromName } from '../core/clientId';
import { normalizeText } from '../core/filter';
import type { CategoryUsage } from '../core/inferCategory';
import { listClients } from '../db/repo/clients';
import { listAllEvents } from '../db/repo/events';
import { listRules } from '../db/repo/rules';

export interface CategoryHistory {
  usage: CategoryUsage[];
  /**
   * Tên Đối tượng → `clientId`.
   *
   * `parseQuickAdd` trả về TÊN, còn lịch sử neo vào ID. Không có bước ghép này
   * thì tầng đoán theo Đối tượng không bao giờ khớp được cái gì.
   */
  resolveClientId: (name: string | null) => string | null;
}

const EMPTY: CategoryHistory = { usage: [], resolveClientId: () => null };

export function useCategoryHistory(): CategoryHistory {
  return (
    useLiveQuery(async () => {
      const [rules, events, clients] = await Promise.all([
        listRules(),
        listAllEvents(),
        listClients(),
      ]);

      // Lịch lặp và buổi đơn lẻ đều là bằng chứng như nhau về thói quen phân
      // loại. Một chuỗi "Dạy Minh" hàng tuần đếm MỘT lần chứ không phải 52 —
      // nó là một quyết định phân loại của người dùng, không phải 52 quyết
      // định. Đếm theo số buổi đã mở rộng sẽ làm mọi lịch lặp áp đảo hoàn toàn
      // các buổi lẻ.
      const usage: CategoryUsage[] = [
        ...rules.map((r) => ({ categoryId: r.categoryId, clientId: r.clientId, title: r.title })),
        ...events.map((e) => ({ categoryId: e.categoryId, clientId: e.clientId, title: e.title })),
      ];

      const byName = new Map<string, string>();
      for (const c of clients) {
        const key = normalizeText(c.name);
        if (key) byName.set(key, c.id);
      }

      const resolveClientId = (name: string | null): string | null => {
        if (!name) return null;
        const key = normalizeText(name);
        if (!key) return null;
        // Đối tượng đã có thì lấy đúng id của nó. Chưa có — trường hợp "cho
        // Nam" với một cái tên mới tinh — thì suy ra id mà `ensureClient()`
        // sắp tạo, để lần gõ thứ hai khớp được ngay cả khi lần đầu chưa lưu.
        return byName.get(key) ?? clientIdFromName(name);
      };

      return { usage, resolveClientId };
    }, []) ?? EMPTY
  );
}
