// ═══════════════════════════════════════════════════════════════════════════
//  components/ui.tsx — mấy viên gạch dùng lại khắp nơi
//
//  Cố ý KHÔNG kéo thư viện UI vào. Phase 1 chỉ cần modal, nút, ô nhập và hộp
//  xác nhận; thêm một phụ thuộc chỉ để có bốn thứ đó là không đáng.
// ═══════════════════════════════════════════════════════════════════════════

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

// ─── Nút ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline';

const BUTTON_STYLE: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  outline: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'border border-red-200 text-red-600 hover:bg-red-50',
};

export function Button({
  variant = 'outline',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_STYLE[variant]} ${className}`}
    />
  );
}

// ─── Ô nhập có nhãn ────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-500">
        {label}
      </label>
      <div className="mt-1">{children(id)}</div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900';

// ─── Modal ─────────────────────────────────────────────────────────────────

/**
 * Modal tối giản: khóa cuộn nền, đóng bằng Escape, bấm ra ngoài thì đóng,
 * và ĐƯA TIÊU ĐIỂM VÀO TRONG khi mở — thiếu bước cuối là người dùng bàn phím
 * bị bỏ lại ở nền phía sau.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      // `bg-black/50` chứ KHÔNG phải `bg-slate-900/40`: ở chế độ tối, biến
      // --color-slate-900 bị đảo thành màu sáng nên lớp phủ sẽ biến thành một
      // màn sương trắng. --color-black cố ý không bị đảo.
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:hidden sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto w-full rounded-2xl bg-white shadow-xl outline-none ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Hộp xác nhận ──────────────────────────────────────────────────────────

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-slate-600">{message}</div>
    </Modal>
  );
}

// ─── Chấm màu danh mục ─────────────────────────────────────────────────────

export function ColorDot({ color, className = '' }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}
