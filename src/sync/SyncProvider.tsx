import type { ReactNode } from 'react';
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
  const api = useAutoSync(settings.autoSyncEnabled, user !== null);

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}
