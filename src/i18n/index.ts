// ═══════════════════════════════════════════════════════════════════════════
//  i18n — CÀI TỪ PHASE 0, KHÔNG ĐỢI TỚI PHASE 5
//
//  Bản kế hoạch gốc xếp i18n vào Phase 5. Nghĩa là qua bốn phase, toàn bộ
//  chuỗi tiếng Việt nằm rải rác hard-code trong mọi component, rồi tới Phase 5
//  phải quét lại từng file bóc từng chuỗi ra — vừa nhàm vừa dễ sót.
//
//  Viết t('...') ngay từ đầu, chỉ điền bộ `vi`. Tới Phase 5 việc còn lại thuần
//  túy là DỊCH, không phải REFACTOR. Chi phí thêm ở lúc này gần như bằng không.
// ═══════════════════════════════════════════════════════════════════════════

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';
import zh from './zh.json';

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: 'vi',
  // Khóa nào thiếu ở bộ đang dùng thì rơi về tiếng Việt — bộ `vi` là bản đầy
  // đủ nhất vì mọi chuỗi mới đều viết ở đó trước. Thà hiện một dòng tiếng
  // Việt lạc lõng còn hơn hiện thô cái khóa `settings.themeHint`.
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

export default i18n;

// ─── Định dạng theo locale ─────────────────────────────────────────────────
// Dùng Intl ngay từ đầu thay vì tự nối chuỗi. VND không có phần thập phân,
// USD/CNY có hai chữ số — Intl xử lý sẵn, tự viết là sai.

const LOCALE: Record<string, string> = { vi: 'vi-VN', en: 'en-US', zh: 'zh-CN' };

/**
 * Ngôn ngữ đang dùng, đọc từ i18next tại THỜI ĐIỂM GỌI.
 *
 * Các hàm dưới đây nhận `lang` với giá trị mặc định là lời gọi hàm này —
 * biểu thức mặc định trong JS được tính mỗi lần gọi, không phải một lần lúc
 * định nghĩa. Nhờ vậy đổi ngôn ngữ là ngày tháng và tiền tệ đổi theo, không
 * cần truyền tham số qua hàng chục chỗ gọi.
 *
 * Trước đây các hàm này mặc định cứng 'vi'. Không ai để ý vì chỉ có một bộ
 * ngôn ngữ — nhưng đó chính là loại trường chết sẽ lộ ra đúng vào lúc thêm
 * bộ thứ hai.
 */
function currentLang(): string {
  return i18n.language || 'vi';
}

export function formatMoney(
  amount: number,
  currency = 'VND',
  lang = currentLang(),
): string {
  return new Intl.NumberFormat(LOCALE[lang] ?? 'vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(amount);
}

export function formatHours(hours: number, lang = currentLang()): string {
  return new Intl.NumberFormat(LOCALE[lang] ?? 'vi-VN', {
    maximumFractionDigits: 1,
  }).format(hours);
}

export function formatDate(date: string, lang = currentLang()): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang] ?? 'vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/** "2026-08-18" → "18/08" — nhãn gọn cho thanh điều hướng */
export function formatDayMonth(date: string, lang = currentLang()): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang] ?? 'vi-VN', {
    day: '2-digit', month: '2-digit',
  }).format(new Date(y, m - 1, d));
}

/** "2026-08" → "tháng 8 năm 2026" */
export function formatMonthLabel(month: string, lang = currentLang()): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang] ?? 'vi-VN', {
    month: 'long', year: 'numeric',
  }).format(new Date(y, m - 1, 1));
}
