// ═══════════════════════════════════════════════════════════════════════════
//  core/inferCategory.ts — đoán danh mục cho một buổi vừa gõ ở Thêm nhanh
//
//  HÀM THUẦN. Không đọc DB, không đọc đồng hồ. Lịch sử truyền vào từ ngoài.
//
//  ─── VÌ SAO KHÔNG CÓ DANH SÁCH TỪ KHÓA NÀO Ở ĐÂY ──────────────────────────
//
//  Yêu cầu ban đầu nghe như ba luật riêng biệt:
//
//      tên người   → Gia sư
//      môn học     → Đại học
//      "ROSSI"     → Đi làm
//
//  Nhưng cả ba là CÙNG MỘT luật, và `types/index.ts` đã nói tại sao: `Client`
//  không phải "học sinh", nó trả lời câu "buổi này dành cho ai / ở đâu" —
//  học sinh với lịch gia sư, môn học với lịch đại học, chỗ làm với lịch đi
//  làm. "Minh", "Giải tích" và "ROSSI" đều là Đối tượng. Cái phân biệt chúng
//  không phải hình dạng con chữ, mà là DANH MỤC MÀ CHÍNH BẠN ĐÃ XẾP CHÚNG VÀO
//  những lần trước.
//
//  Nên ở đây không có bảng từ khóa, không có "tên riêng thì là gia sư". Một
//  bảng như thế vỡ ở cái tên thứ nhất nằm ngoài bảng, vỡ với người dùng thứ
//  hai có cách tổ chức khác, và vỡ ngay lập tức với ba bộ ngôn ngữ. Cùng một
//  lý lẽ đã viết ở `findClient()` trong `quickAdd.ts`: KHÔNG suy từ câu chữ,
//  ĐỐI CHIẾU VỚI DỮ LIỆU ĐÃ CÓ.
//
//  ─── VÌ SAO HÒA THÌ TRẢ null ──────────────────────────────────────────────
//
//  Một đối tượng có đúng một buổi Gia sư và một buổi Đại học thì câu trả lời
//  trung thực là "không biết". Đoán đại một trong hai cho ra đúng 50% số lần,
//  và 50% còn lại người dùng phải NHẬN RA rằng nó sai rồi mới sửa — tệ hơn
//  hẳn so với việc để nguyên mặc định mà họ vốn đã quen bấm.
//
//  Đây đúng là quy ước "VÌ SAO KHÔNG ĐOÁN BỪA" của `quickAdd.ts`, áp cho một
//  trường khác.
// ═══════════════════════════════════════════════════════════════════════════

import { normalizeText } from './filter';

/**
 * Một lần dùng danh mục trong quá khứ — bóc ra từ `rules` và `events`.
 *
 * Tầng gọi có trách nhiệm LỌC BỎ bản ghi đã xóa mềm. Tombstone vẫn nằm trong
 * bảng cho tới khi Thùng rác dọn, và đếm cả chúng nghĩa là một chuỗi đã xóa
 * ba tháng trước vẫn lái được kết quả đoán của hôm nay.
 */
export interface CategoryUsage {
  categoryId: string;
  /** Thiếu = buổi đó không gắn với đối tượng nào */
  clientId?: string;
  title: string;
}

export interface CategoryGuess {
  categoryId: string;
  /** Đoán được nhờ đâu — để tầng gọi giải thích được, không phải hộp đen */
  reason: 'client' | 'title';
  /** Bao nhiêu buổi trước đó chống lưng cho phán đoán này */
  matches: number;
}

/**
 * Danh mục hay gặp nhất trong một nhóm, hoặc `null` khi không có ai thắng rõ.
 *
 * ⚠️ HÒA LÀ `null`, KHÔNG PHẢI "LẤY ĐẠI CÁI ĐẦU TIÊN". Lấy đại cái đầu tiên
 * khiến kết quả phụ thuộc vào thứ tự bản ghi trong IndexedDB — cùng một dữ
 * liệu, hai máy có thể đoán khác nhau, và không có cách nào giải thích cho
 * người dùng vì sao. Xem đầu tệp.
 */
function topCategory(entries: CategoryUsage[]): { categoryId: string; matches: number } | null {
  if (entries.length === 0) return null;

  const tally = new Map<string, number>();
  for (const e of entries) {
    tally.set(e.categoryId, (tally.get(e.categoryId) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  let tied = false;

  for (const [categoryId, count] of tally) {
    if (count > bestCount) {
      best = categoryId;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  if (best === null || tied) return null;
  return { categoryId: best, matches: bestCount };
}

/**
 * Danh mục nên chọn sẵn cho buổi đang gõ, hoặc `null` nếu không đủ căn cứ.
 *
 * Hai tầng, thử theo thứ tự:
 *
 *  1. **Theo Đối tượng.** "ROSSI" đã có bốn buổi ở Đi làm thì buổi thứ năm
 *     gần như chắc chắn cũng vậy. Đây là tầng trả lời được cả ba ví dụ trong
 *     yêu cầu gốc, vì cả ba đều là Đối tượng.
 *
 *  2. **Theo tiêu đề trùng khít.** Dùng khi câu không nhắc tới đối tượng nào:
 *     gõ lại "Họp giao ban" thì lấy danh mục của những lần "Họp giao ban"
 *     trước. So khớp qua `normalizeText` nên hoa thường và dấu không cản trở.
 *
 * ⚠️ TẦNG 2 CHỈ NHẬN TRÙNG KHÍT CẢ TIÊU ĐỀ, không phải trùng một từ. Trùng
 * một từ nghĩa là "Dạy Toán" và "Dạy Lý" chung một rổ chỉ vì cùng chữ "Dạy" —
 * mà "dạy", "học", "họp" là đúng những từ xuất hiện ở gần hết mọi tiêu đề.
 * Bộ đoán sẽ tự tin lên trông thấy và sai nhiều hơn hẳn.
 *
 * Không có tầng nào cân theo độ mới. Đếm số lần thì giải thích được bằng một
 * câu ("bốn buổi trước ở Đi làm"); cân theo độ mới thì không, và nó chỉ đáng
 * giá khi người dùng thật sự đổi cách phân loại giữa chừng — chuyện hiếm, và
 * lúc đó vài buổi mới cũng nhanh chóng lật được kết quả đếm.
 */
export function inferCategory(
  input: { clientId: string | null; title: string },
  history: CategoryUsage[],
): CategoryGuess | null {
  if (history.length === 0) return null;

  if (input.clientId) {
    const byClient = topCategory(history.filter((h) => h.clientId === input.clientId));
    if (byClient) return { ...byClient, reason: 'client' };
    // KHÔNG dừng ở đây. Đối tượng mới tinh chưa có buổi nào, hoặc có đúng hai
    // buổi hòa nhau, đều rơi xuống tầng tiêu đề — nó vẫn có thể biết câu này.
  }

  const needle = normalizeText(input.title);
  // Tiêu đề rỗng khớp với mọi bản ghi cũng có tiêu đề rỗng, và "khớp" kiểu đó
  // không mang thông tin gì. Câu chỉ có ngày giờ sẽ đi tới đây.
  if (!needle) return null;

  const byTitle = topCategory(history.filter((h) => normalizeText(h.title) === needle));
  if (byTitle) return { ...byTitle, reason: 'title' };

  return null;
}
