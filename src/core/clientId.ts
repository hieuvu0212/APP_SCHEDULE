// ═══════════════════════════════════════════════════════════════════════════
//  core/clientId.ts — sinh id tất định cho `Client` từ tên gõ tay
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Hai máy gõ cùng một tên phải cho ra CÙNG một id, nếu không `ensureClient()`
//  rơi về `newId()` và mỗi lần gõ lại đẻ thêm một đối tượng mới — đồng bộ xong
//  là hai máy có hai người cho cùng một cái tên.
//
//  ⚠️ NHÁNH LATIN Ở DƯỚI ĐÃ ĐÓNG BĂNG. `db.version(3)` chạy trên máy thật rồi;
//  `rules`, `events` và `payments` đang neo vào đúng những id nó sinh ra. Đổi
//  một byte trong nhánh đó là làm mồ côi dữ liệu của người đang dùng, và không
//  vá lại được bằng `version(4)` — xem README, mục "db.version(3)".
// ═══════════════════════════════════════════════════════════════════════════

import { normalizeText } from './filter';

/**
 * Tên có ít nhất một CHỮ CÁI hoặc CHỮ SỐ của bất kỳ hệ chữ viết nào.
 *
 * Đây là ranh giới giữa "tên không viết được bằng [a-z0-9]" và "tên rỗng
 * nghĩa". `小明` thuộc vế đầu và xứng đáng có id; `???` với `---` thuộc vế sau
 * và vẫn trả `null` như trước.
 *
 * Dựng bằng `new RegExp` cho khớp lối viết ở `filter.ts` — mã nguồn chỉ chứa
 * ASCII, không có ký tự vô hình nào để người sửa sau xóa nhầm.
 */
const HAS_LETTER_OR_DIGIT = new RegExp('\\p{L}|\\p{N}', 'u');

/**
 * FNV-1a 32-bit, in ra 8 chữ số hex.
 *
 * Chọn FNV-1a vì nó **tất định tuyệt đối giữa các máy**: chỉ có xor và nhân số
 * nguyên trên `charCodeAt`, không đụng locale, không đụng `crypto` (thứ không
 * có mặt đồng nhất giữa trình duyệt, WebView Android và iOS), không phụ thuộc
 * phiên bản thư viện. Id này được ghi xuống đĩa và đẩy lên đám mây, nên nó
 * phải cho ra cùng một chuỗi trên mọi máy, mãi mãi.
 *
 * ⚠️ `Math.imul` KHÔNG PHẢI CÁCH VIẾT ĐIỆU. Toán tử `*` thường đưa kết quả qua
 * số thực 64-bit: quá 2^53 là các bit thấp bị làm tròn mất, mà bit thấp chính
 * là phần mang thông tin của phép băm. Đổi về `*` thì hàm vẫn chạy, vẫn trả ra
 * chuỗi hex trông rất hợp lệ — chỉ là băm kém đi rất nhiều và đụng độ sớm hơn
 * nhiều. Không có test nào bắt được kiểu hỏng đó.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Id tất định từ tên đối tượng, hoặc `null` nếu tên không có nghĩa.
 *
 * Hai nhánh:
 *
 *  - **Latin** — `Minh` → `client-minh`. Bỏ dấu, hạ chữ thường, khoảng trắng
 *    thành `-`, bỏ mọi ký tự ngoài `[a-z0-9-]`. ĐÃ ĐÓNG BĂNG (xem đầu tệp).
 *  - **Băm** — `小明` → `client-h_1b5a3bd0`. Dùng khi bước lọc trên xóa sạch
 *    chữ: chữ Hán, kana, Hangul, Cyrillic, Ả Rập đều rơi vào đây.
 *
 * Không có nhánh băm thì `小明` cho ra chuỗi rỗng → `null` → `ensureClient()`
 * dùng `newId()` → **mỗi lần gõ lại tên đó là thêm một đối tượng nữa**. Ứng
 * dụng có tiếng Trung trong i18n và README hứa "gõ 中文 thì hiện 中文", nên
 * đây không phải trường hợp hiếm gặp ở góc màn hình.
 *
 * ⚠️ DẤU `_` TRONG `client-h_` LÀ CÓ CHỦ ĐÍCH. Nhánh Latin lọc bỏ mọi ký tự
 * ngoài `[a-z0-9-]`, nên nó KHÔNG BAO GIỜ sinh được một id chứa `_`. Nhờ vậy
 * hai không gian id rời nhau về mặt cấu trúc, không phải rời nhau nhờ may mắn.
 * Bỏ dấu `_` đi thì một nhãn như `H12345678` — mã phòng, mã nhân viên, mã học
 * phần, đều là thứ hợp lệ trong trường này — sẽ mang đúng hình dạng của một id
 * băm và cướp mất bản ghi của người khác.
 *
 * Băm trên `collapsed` (đã gộp khoảng trắng) chứ không phải trên `normalized`,
 * để `  小   明 ` và `小 明` ra cùng một id — đúng như nhánh Latin gộp `  Gia
 * Bảo ` với `Gia  Bảo` về cùng `client-gia-bao`.
 *
 * Bước `.normalize('NFC')` cuối `normalizeText()` là thứ giữ cho nhánh băm
 * đúng: `が` gõ liền và `か` + dấu dakuten trông y hệt nhau nhưng khác chuỗi,
 * và băm hai chuỗi khác nhau ra hai id khác nhau. NFC ép cả hai về một dạng.
 */
export function clientIdFromName(name: string): string | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;

  const collapsed = normalized.replace(/\s+/g, '-');
  const idStr = collapsed.replace(/[^a-z0-9-]/g, '');

  if (/[a-z0-9]/.test(idStr)) return `client-${idStr}`;

  // Tới đây `idStr` không còn chữ nào: hoặc tên viết bằng hệ chữ khác, hoặc
  // tên chỉ toàn dấu câu. Chỉ vế đầu mới đáng có id.
  if (!HAS_LETTER_OR_DIGIT.test(collapsed)) return null;

  return `client-h_${fnv1a32(collapsed)}`;
}
