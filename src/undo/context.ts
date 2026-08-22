// ═══════════════════════════════════════════════════════════════════════════
//  undo/context.ts — context và hook của "Hoàn tác"
//
//  Tách khỏi UndoProvider.tsx để file đó CHỈ export component.
//
//  Fast Refresh của Vite chỉ giữ được state của một module khi module đó
//  không export gì ngoài component. Để `useUndo` nằm chung nghĩa là mỗi lần
//  sửa provider là cả cây bị nạp lại — mọi hộp thoại đang mở và mọi thứ đang
//  gõ dở đều mất. Đây là chỗ quy tắc lint đó thật sự có ích, không phải luật
//  cho có.
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext } from 'react';

export interface UndoApi {
  /** Ghi nhận một thao tác vừa xóa, kèm cách khôi phục */
  pushUndo: (message: string, undo: () => Promise<void> | void) => void;
}

export const UndoContext = createContext<UndoApi | null>(null);

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo phải nằm trong <UndoProvider>');
  return ctx;
}
