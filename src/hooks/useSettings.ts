import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
