// ═══════════════════════════════════════════════════════════════════════════
//  components/CategoryManager.tsx — CRUD danh mục
//
//  `isIncomeEligible` là cờ GATING, không phải một tùy chọn trang trí. Tắt nó
//  đi thì MỌI buổi thuộc danh mục này có thu nhập bằng 0, kể cả buổi đã nhập
//  đơn giá riêng, và mọi khoản thưởng/phạt của tháng cũng bị bỏ qua.
//
//  Vì thế lúc tắt phải ĐẾM xem có bao nhiêu bản ghi đang mang đơn giá rồi báo
//  cho người dùng — nhưng KHÔNG tự xóa dữ liệu đó (mục 8.1). Bật lại là số
//  liệu quay về nguyên vẹn.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category } from '../types';
import { UNCATEGORIZED_ID } from '../types';
import {
  countRatedItems,
  createCategory,
  softDeleteCategoryUndoable,
  updateCategory,
} from '../db/repo/categories';
import { formatMoney } from '../i18n';
import { useUndo } from '../undo/context';
import { inputClass } from './styles';
import { Button, ColorDot, ConfirmDialog, Field, Modal } from './ui';

const PRESET_COLORS = [
  '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899',
  '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#94a3b8',
];

export function CategoryManager({ categories }: { categories: Category[] }) {
  const { t } = useTranslation();
  const { pushUndo } = useUndo();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [confirming, setConfirming] = useState<Category | null>(null);

  const remove = async (category: Category) => {
    setConfirming(null);
    const undo = await softDeleteCategoryUndoable(category.id);
    pushUndo(t('toast.categoryDeleted', { name: category.name }), undo);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t('category.manage')}</h2>
          <p className="text-xs text-slate-500">{t('category.manageHint')}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          + {t('category.add')}
        </Button>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ColorDot color={c.color} className="size-3.5" />
            <span className="font-medium text-slate-800">{c.name}</span>

            {c.isSystem && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                {t('category.system')}
              </span>
            )}

            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                c.isIncomeEligible
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {t(c.isIncomeEligible ? 'category.incomeEligible' : 'category.notIncomeEligible')}
            </span>

            {c.isIncomeEligible && c.defaultRatePerHour != null && (
              <span className="text-xs tabular-nums text-slate-500">
                {formatMoney(c.defaultRatePerHour)}/{t('common.hour')}
              </span>
            )}

            <span className="ml-auto flex gap-1">
              <Button variant="ghost" onClick={() => setEditing(c)}>
                {t('common.edit')}
              </Button>
              <Button
                variant="ghost"
                disabled={c.id === UNCATEGORIZED_ID}
                title={c.id === UNCATEGORIZED_ID ? t('category.cannotDeleteSystem') : undefined}
                onClick={() => setConfirming(c)}
                className="text-red-600 hover:bg-red-50"
              >
                {t('common.delete')}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={t('category.deleteTitle')}
          confirmLabel={t('common.delete')}
          message={t('category.deleteMessage', { name: confirming.name })}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void remove(confirming)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function CategoryForm({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[0]);
  const [eligible, setEligible] = useState(category?.isIncomeEligible ?? false);
  const [rate, setRate] = useState(
    category?.defaultRatePerHour != null ? String(category.defaultRatePerHour) : '',
  );
  const [rated, setRated] = useState<{ categoryId: string; n: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Chỉ đếm khi người dùng ĐANG TẮT một danh mục vốn đang bật — lúc khác con
  // số này không nói lên điều gì.
  const turningOff = !!category?.isIncomeEligible && !eligible;
  useEffect(() => {
    if (!turningOff || !category) return;
    let alive = true;
    void countRatedItems(category.id).then((n) => {
      if (alive) setRated({ categoryId: category.id, n });
    });
    return () => {
      alive = false;
    };
  }, [turningOff, category]);

  /**
   * Con số chỉ đúng cho danh mục đã đếm, nên gắn kèm id rồi đối chiếu lúc đọc.
   *
   * Cách cũ là đặt lại `null` ngay trong effect. Nó vừa là setState trong
   * effect (một vòng render thừa), vừa để lọt một nhịp hiển thị số ĐẾM CỦA
   * DANH MỤC TRƯỚC khi người dùng mở sang danh mục khác — effect chạy sau khi
   * đã vẽ xong.
   */
  const ratedCount =
    turningOff && rated?.categoryId === category?.id ? rated.n : null;

  const trimmed = name.trim();
  const parsedRate = rate.replace(/\D/g, '');

  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const patch = {
        name: trimmed,
        color,
        isIncomeEligible: eligible,
        defaultRatePerHour: eligible && parsedRate ? Number(parsedRate) : undefined,
      };
      if (category) await updateCategory(category.id, patch);
      else await createCategory({ ...patch, sortOrder: 100 });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t(category ? 'category.editTitle' : 'category.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!trimmed || saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('category.name')}>
          {(id) => (
            <input
              id={id}
              autoFocus
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <div>
          <span className="block text-xs font-medium text-slate-500">
            {t('category.color')}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`size-7 rounded-full transition ${
                  color === c ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-110'
                }`}
              />
            ))}
            <input
              type="color"
              aria-label={t('category.customColor')}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-7 cursor-pointer rounded-full border border-slate-300 bg-transparent p-0"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={eligible}
            onChange={(e) => setEligible(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium text-slate-800">
              {t('category.incomeEligible')}
            </span>
            <span className="block text-xs text-slate-500">
              {t('category.incomeEligibleHint')}
            </span>
          </span>
        </label>

        {turningOff && ratedCount != null && ratedCount > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('category.turningOffWarning', { n: ratedCount })}
          </p>
        )}

        {eligible && (
          <Field
            label={t('category.defaultRate')}
            hint={parsedRate ? formatMoney(Number(parsedRate)) : t('category.defaultRateHint')}
          >
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={`${inputClass} max-w-52`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
