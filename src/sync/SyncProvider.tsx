import { useEffect, type ReactNode } from 'react';
import { watchReminderQueue } from '../db/pushQueue';
import { useAutoSync } from '../hooks/useAutoSync';
import { useSettings } from '../hooks/useSettings';
import { useSupabaseUser } from '../hooks/useSupabaseUser';
import { SyncContext } from './context';

/**
 * Nơi DUY NHẤT gọi `useAutoSync`.
 *
 * Đặt ở ngoài cùng cây React chứ không trong màn hình Tài khoản: tự đồng bộ
 * phải chạy kể cả khi người dùng chưa bao giờ mở màn hình đó. Gắn nó vào một
 * màn hình nạp theo yêu cầu (`React.lazy`) nghĩa là tính năng chỉ bật lên sau
 * lần đầu ai đó bấm vào tab — một trạng thái không ai đoán được từ giao diện.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const { user } = useSupabaseUser();
  const signedIn = user !== null;
  const api = useAutoSync(settings.autoSyncEnabled, signedIn);

  // Hàng đợi push phải theo kịp lịch ngay khi lịch đổi, không đợi đồng bộ đầy
  // đủ — xem `watchReminderQueue`. Không phụ thuộc `autoSyncEnabled`: tắt tự
  // đồng bộ không có nghĩa là muốn nhận thông báo của buổi đã hủy.
  useEffect(() => {
    if (!signedIn) return;
    return watchReminderQueue();
  }, [signedIn]);

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}
