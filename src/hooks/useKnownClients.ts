import { useLiveQuery } from 'dexie-react-hooks';
import { normalizeText } from '../core/filter';
import { db } from '../db/schema';

/**
 * Mọi Đối tượng đã từng xuất hiện trong dữ liệu.
 *
 * Đây là thứ khiến Thêm nhanh nhận ra được "Gia" là một người còn "Toán" thì
 * không — hai chuỗi đó không phân biệt được bằng ngữ pháp, chỉ phân biệt được
 * bằng việc bạn ĐÃ từng dùng cái nào làm Đối tượng. Xem `findClient()` trong
 * core/quickAdd.ts.
 *
 * ⚠️ ĐỌC TỪ `rules` VÀ `events`, KHÔNG PHẢI TỪ `occurrences` ĐANG HIỂN THỊ.
 *
 * `distinctClients()` trong core/filter.ts nhận Occurrence, và Occurrence chỉ
 * tồn tại cho cửa sổ thời gian đang xem. Dùng nó ở đây thì một học sinh dạy từ
 * ba tháng trước sẽ không được nhận ra, và tệ hơn — nó được nhận ra hay không
 * tùy vào việc người dùng đang mở tuần nào. Hành vi phụ thuộc màn hình đang
 * xem là loại lỗi không ai tái hiện nổi khi đi báo.
 *
 * Bản ghi đã xóa mềm vẫn tính: xóa một buổi dạy không có nghĩa là học sinh đó
 * không còn tồn tại, và gõ lại tên cũ vẫn nên được nhận ra.
 */
export function useKnownClients(): string[] {
  return (
    useLiveQuery(async () => {
      const [rules, events] = await Promise.all([
        db.rules.toArray(),
        db.events.toArray(),
      ]);

      // Gộp biến thể hoa thường và khoảng trắng thừa, giữ lại DẠNG ĐÃ LƯU đầu
      // tiên gặp được — trả về dạng chuẩn hóa sẽ khiến Thêm nhanh điền vào
      // form một cái tên viết thường, và thế là sinh ra đối tượng thứ hai.
      const seen = new Map<string, string>();
      for (const row of [...rules, ...events]) {
        const raw = row.clientName?.trim();
        if (!raw) continue;
        const key = normalizeText(raw);
        if (key && !seen.has(key)) seen.set(key, raw);
      }
      return [...seen.values()];
    }, []) ?? []
  );
}
