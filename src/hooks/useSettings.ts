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
