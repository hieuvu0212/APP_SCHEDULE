import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { todayKey } from '../core/calendar';
import { inferCategory } from '../core/inferCategory';
import { parseQuickAdd, type QuickAddResult } from '../core/quickAdd';
import { useCategoryHistory } from '../hooks/useCategoryHistory';
import { useKnownClients } from '../hooks/useKnownClients';
import { Button } from './ui';

interface QuickAddProps {
  /**
   * Nhận kết quả đã bóc tách. Trường nào không tìm thấy là `null`.
   *
   * `categoryId` là danh mục đoán được từ lịch sử — `null` khi không đủ căn
   * cứ, và khi đó tầng gọi giữ nguyên mặc định cũ. Xem `core/inferCategory.ts`.
   */
  onAdd: (parsed: QuickAddResult, categoryId: string | null) => void;
}

/**
 * Ô gõ một dòng để tạo buổi mà không phải mở form.
 *
 * KHÔNG tự lưu. Nó điền sẵn hộp thoại tạo buổi rồi để người dùng xác nhận —
 * bộ phân tích đoán từ ngôn ngữ tự nhiên nên nó sẽ đoán sai, và ghi thẳng vào
 * DB một thứ vừa đoán sai là cách nhanh nhất làm hỏng niềm tin vào tính năng.
 * Hộp thoại hiện đúng những gì nó hiểu, sai thì sửa ngay tại chỗ.
 */
export function QuickAdd({ onAdd }: QuickAddProps) {
  const { t } = useTranslation();
  const knownClients = useKnownClients();
  const { usage, resolveClientId } = useCategoryHistory();
  const [text, setText] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    // `todayKey()` đọc đồng hồ và `knownClients` đọc DB — cả hai đều là thứ
    // core/quickAdd.ts không được phép chạm tới, nên chúng được truyền vào.
    const parsed = parseQuickAdd(text, todayKey(), knownClients);

    // Đoán danh mục từ lịch sử, KHÔNG từ hình dạng con chữ: "Minh" là Gia sư
    // vì những buổi trước của Minh là Gia sư, không phải vì nó trông giống
    // tên người. Xem đầu core/inferCategory.ts.
    const guess = inferCategory(
      { clientId: resolveClientId(parsed.clientName), title: parsed.title },
      usage,
    );

    onAdd(parsed, guess?.categoryId ?? null);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full max-w-2xl items-center print:hidden">
      <input
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        placeholder={t('quickAdd.placeholder')}
        aria-label={t('quickAdd.placeholder')}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 pr-24 text-base font-medium text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
      />
      <Button type="submit" variant="primary" className="absolute right-2 px-4 py-1.5 text-sm font-bold shadow-sm">
        {t('common.add')}
      </Button>
    </form>
  );
}
