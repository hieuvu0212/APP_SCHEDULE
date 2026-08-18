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

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    // Phase 5: bổ sung en, zh — chỉ cần thêm file JSON, không đụng component
    // en: { translation: en },
    // zh: { translation: zh },
  },
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

export default i18n;

// ─── Định dạng theo locale ─────────────────────────────────────────────────
// Dùng Intl ngay từ đầu thay vì tự nối chuỗi. VND không có phần thập phân,
// USD/CNY có hai chữ số — Intl xử lý sẵn, tự viết là sai.

const LOCALE: Record<string, string> = { vi: 'vi-VN', en: 'en-US', zh: 'zh-CN' };

export function formatMoney(amount: number, currency = 'VND', lang = 'vi'): string {
  return new Intl.NumberFormat(LOCALE[lang] ?? 'vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(amount);
}

export function formatHours(hours: number, lang = 'vi'): string {
  return new Intl.NumberFormat(LOCALE[lang] ?? 'vi-VN', {
    maximumFractionDigits: 1,
  }).format(hours);
}

export function formatDate(date: string, lang = 'vi'): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang] ?? 'vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}
