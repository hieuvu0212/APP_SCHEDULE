import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import i18n from '../i18n';
import type { SystemSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { loadSettings, saveSettings } from '../db/repo/settings';

/**
 * Cấu hình hệ thống. KHÔNG trả về undefined — lần chạy đầu dùng mặc định.
 *
 * Khác với useSchedule ở chỗ này là cố ý: "đang tải cấu hình" không phải
 * trạng thái đáng cho component phải xử lý, và mặc định luôn hợp lệ.
 */
export function useSettings(): SystemSettings {
  return useLiveQuery(() => loadSettings(), [], DEFAULT_SETTINGS);
}

export function useUpdateSettings(): (patch: Partial<SystemSettings>) => Promise<void> {
  return saveSettings;
}

/**
 * Gắn/gỡ lớp `.dark` trên thẻ <html>.
 *
 * Bảng màu tối được định nghĩa bằng biến CSS trong index.css, nên chỗ này chỉ
 * việc bật một lớp là xong — không component nào phải biết đang ở chế độ nào.
 *
 * Với 'system', phải THEO DÕI `prefers-color-scheme` chứ không chỉ đọc một
 * lần lúc khởi động: máy đổi sang chế độ tối lúc chiều tối thì ứng dụng đang
 * mở cũng phải đổi theo, không đợi tải lại trang.
 */
/**
 * Gắn màu nhấn lên thẻ <html> qua `data-theme`.
 *
 * Dùng thuộc tính chứ không phải lớp, để nó ghép được với lớp `.dark`:
 * `.dark[data-theme='blue']` cần màu nhấn sáng hơn bản nền sáng. Hai trục
 * độc lập nên phải ở hai cơ chế khác nhau.
 */
export function useApplyColorTheme(colorTheme: SystemSettings['colorTheme']): void {
  useEffect(() => {
    document.documentElement.dataset.theme = colorTheme;
  }, [colorTheme]);
}

export function useApplyTheme(theme: SystemSettings['theme']): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle('dark', dark);

    if (theme !== 'system') {
      apply(theme === 'dark');
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    apply(query.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);
}

/**
 * Đồng bộ ngôn ngữ đã lưu sang i18next.
 *
 * Cấu hình là nguồn sự thật, không phải trạng thái bên trong i18next: mở lại
 * ứng dụng phải ra đúng ngôn ngữ đã chọn lần trước, mà i18next thì khởi tạo
 * với `lng: 'vi'` cứng và không biết gì về IndexedDB.
 *
 * Cũng đặt `lang` trên thẻ <html> — trình duyệt dùng nó để chọn quy tắc ngắt
 * dòng và bộ font phù hợp.
 */
export function useApplyLanguage(language: SystemSettings['language']): void {
  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);
}
