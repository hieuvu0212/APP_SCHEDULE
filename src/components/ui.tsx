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
  primary: 'bg-primary text-primary-fg hover:opacity-90',
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

// ─── Modal ─────────────────────────────────────────────────────────────────

/** Những gì trình duyệt cho phép dừng tiêu điểm vào, theo thứ tự tài liệu */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal tối giản: khóa cuộn nền, đóng bằng Escape, bấm ra ngoài thì đóng,
 * đưa tiêu điểm vào trong khi mở, GIỮ tiêu điểm ở trong, và TRẢ nó về chỗ cũ
 * khi đóng.
 *
 * Ba việc cuối là ba việc khác nhau, và thiếu bất kỳ việc nào cũng bỏ rơi
 * người dùng bàn phím ở một chỗ khác nhau:
 *
 *  · Không đưa vào  → họ vẫn ở nền phía sau, gõ Tab vào một form bị che khuất.
 *  · Không giữ lại  → Tab vài lần là ra khỏi hộp thoại và họ thao tác trên
 *                     nền mà không thấy, trong khi `aria-modal` đã nói với
 *                     trình đọc màn hình rằng phần đó không tồn tại.
 *  · Không trả về   → đóng xong tiêu điểm rơi về <body>, và Tab tiếp theo bắt
 *                     đầu lại từ đầu trang. Với người chỉ dùng bàn phím thì
 *                     đó là mất chỗ hoàn toàn.
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
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Nhớ nơi tiêu điểm đang đứng TRƯỚC khi cướp nó đi.
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        // Hộp thoại không có gì bấm được: giữ tiêu điểm ở chính khung.
        e.preventDefault();
        panel.current.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Cuộn vòng ở hai đầu. Tiêu điểm đang ở NGOÀI khung (vd người dùng vừa
      // bấm chuột ra nền) cũng kéo về đầu danh sách.
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // `isConnected` vì nút mở có thể đã bị gỡ khỏi DOM trong lúc hộp thoại
      // mở — gọi focus() trên node mồ côi thì tiêu điểm rơi về <body>, đúng
      // cái ta đang tránh.
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  return (
    <div
      // `bg-black/50` chứ KHÔNG phải `bg-slate-900/40`: ở chế độ tối, biến
      // --color-slate-900 bị đảo thành màu sáng nên lớp phủ sẽ biến thành một
      // màn sương trắng. --color-black cố ý không bị đảo.
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-2 print:hidden sm:items-center sm:p-4"
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
            aria-label={t('common.close')}
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {/* `aria-hidden` để trình đọc màn hình không đọc cả tên Unicode
                của ký tự sau khi đã đọc nhãn "Đóng" — nghe thành hai lần. */}
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        {/* Trên điện thoại lấy nhiều chiều cao hơn: bàn phím ảo đã nuốt mất
            gần nửa màn hình khi đang gõ vào form. */}
        <div className="max-h-[78vh] overflow-y-auto px-4 py-4 sm:max-h-[70vh] sm:px-5">
          {children}
        </div>
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

// ─── Công tắc bật/tắt ──────────────────────────────────────────────────────

/**
 * Ô đánh dấu kèm nhãn và câu giải thích.
 *
 * Ô nhập nằm TRONG thẻ `<label>` nên bấm vào chữ cũng bật/tắt được, và trình
 * đọc màn hình đọc đúng nhãn mà không cần `htmlFor`. Đây là một trong ba lỗi
 * lọt lưới mà bộ test component sinh ra để canh — xem EventDialog.test.tsx.
 *
 * `hint` là bắt buộc, không phải tùy chọn: mọi công tắc trong ứng dụng này
 * đều đổi một hành vi mà tên gọi không nói hết được.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="block text-xs leading-snug text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
