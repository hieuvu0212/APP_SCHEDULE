// ═══════════════════════════════════════════════════════════════════════════
//  undo/UndoProvider.tsx — "Hoàn tác" cho thao tác xóa
//
//  Xóa mềm đã có sẵn trong BaseEntity, nên hoàn tác chỉ là gỡ `deletedAt`.
//  Không cần undo stack, không cần lớp command — chỉ cần giữ lại đúng một
//  hàm khôi phục và cho người dùng một khoảng thời gian để đổi ý.
//
//  PHẠM VI: chỉ phủ thao tác XÓA. Sửa không hoàn tác được — sửa còn nhìn
//  thấy kết quả ngay trên màn hình nên tự sửa lại được, còn xóa thì thứ vừa
//  mất đi không còn ở đâu để mà chỉnh.
// ═══════════════════════════════════════════════════════════════════════════

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

/** Bao lâu thì toast tự biến mất */
const UNDO_TIMEOUT_MS = 8000;

interface UndoEntry {
  id: number;
  message: string;
  undo: () => Promise<void> | void;
}

interface UndoApi {
  /** Ghi nhận một thao tác vừa xóa, kèm cách khôi phục */
  pushUndo: (message: string, undo: () => Promise<void> | void) => void;
}

const UndoContext = createContext<UndoApi | null>(null);

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo phải nằm trong <UndoProvider>');
  return ctx;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  const pushUndo = useCallback((message: string, undo: () => Promise<void> | void) => {
    nextId.current += 1;
    setEntry({ id: nextId.current, message, undo });
  }, []);

  // Hết giờ thì toast tự đóng. Phụ thuộc vào entry.id chứ không phải entry,
  // để lần xóa thứ hai làm mới đồng hồ thay vì kế thừa đồng hồ cũ.
  const entryId = entry?.id;
  useEffect(() => {
    if (entryId == null) return;
    const timer = setTimeout(() => setEntry(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [entryId]);

  const api = useMemo(() => ({ pushUndo }), [pushUndo]);

  const runUndo = async () => {
    if (!entry || busy) return;
    setBusy(true);
    try {
      await entry.undo();
      setEntry(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <UndoContext.Provider value={api}>
      {children}
      {entry && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-md items-center gap-4 rounded-xl bg-slate-900 py-3 pl-4 pr-2 text-sm text-white shadow-lg">
            <span className="min-w-0 flex-1 truncate">{entry.message}</span>
            <button
              type="button"
              onClick={() => void runUndo()}
              disabled={busy}
              className="shrink-0 rounded-lg px-3 py-1.5 font-semibold text-amber-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t('common.undo')}
            </button>
            <button
              type="button"
              onClick={() => setEntry(null)}
              aria-label={t('common.dismiss')}
              className="shrink-0 rounded-lg px-2 py-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </UndoContext.Provider>
  );
}
