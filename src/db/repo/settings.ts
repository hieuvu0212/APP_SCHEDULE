// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/settings.ts — cấu hình hệ thống
//
//  Lưu NGUYÊN MỘT BẢN GHI thay vì mỗi khóa một dòng. Cấu hình luôn được đọc
//  trọn gói, và gộp lại thì thêm trường mới ở phase sau chỉ là sửa
//  DEFAULT_SETTINGS — không cần migration.
//
//  Luôn trộn với DEFAULT_SETTINGS khi đọc, nên bản ghi cũ thiếu trường mới
//  vẫn dùng được.
// ═══════════════════════════════════════════════════════════════════════════

import type { SystemSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import { db } from '../schema';

const SETTINGS_KEY = 'system';

export async function loadSettings(): Promise<SystemSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<SystemSettings>) ?? {}) };
}

export async function saveSettings(patch: Partial<SystemSettings>): Promise<void> {
  const current = await loadSettings();
  await db.settings.put({ key: SETTINGS_KEY, value: { ...current, ...patch } });
}
