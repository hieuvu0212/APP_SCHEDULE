// ═══════════════════════════════════════════════════════════════════════════
//  sync/context.ts — context và hook của tầng đồng bộ
//
//  Tách khỏi SyncProvider.tsx để file đó CHỈ export component — cùng lý do với
//  undo/context.ts, xem chú thích ở đó.
//
//  ⚠️ VÌ SAO PHẢI CÓ CONTEXT CHO VIỆC NÀY.
//
//  `useAutoSync` chỉ được chạy ĐÚNG MỘT LẦN trong cả ứng dụng: mỗi lần gọi là
//  một bộ hẹn giờ, một bộ lắng nghe sự kiện, và một cờ `running` riêng. Hai
//  bản sao không thấy nhau, nên phép chặn chạy chồng — thứ ngăn hai lượt cùng
//  đọc một ảnh chụp rồi ghi đè lẫn nhau trên đám mây — mất tác dụng.
//
//  Nhưng màn hình Tài khoản cần cả nút bấm lẫn trạng thái. Không có context
//  thì nó buộc phải tự gọi `useAutoSync` lần thứ hai, và đó chính là trạng
//  thái hỏng ở trên.
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext } from 'react';
import type { UseAutoSync } from '../hooks/useAutoSync';

export const SyncContext = createContext<UseAutoSync | null>(null);

export function useSync(): UseAutoSync {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync phải nằm trong <SyncProvider>');
  return ctx;
}
