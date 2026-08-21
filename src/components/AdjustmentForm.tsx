// ═══════════════════════════════════════════════════════════════════════════
//  components/AdjustmentForm.tsx — thưởng / phạt / phụ cấp / khấu trừ
//
//  ⚠️ SỐ TIỀN LUÔN DƯƠNG. DẤU DO `kind` QUYẾT ĐỊNH.
//
//  Ô nhập ở đây lọc bỏ mọi ký tự không phải chữ số, nên không có cách nào gõ
//  được dấu trừ. Nếu cho phép, sẽ có ngày ai đó nhập −50.000 cho một khoản
//  PENALTY; hệ thống trừ đi số âm và thành CỘNG THÊM 50 nghìn. Con số vẫn
//  trông hợp lý nên gần như không thể phát hiện bằng mắt.
//
//  Form hiển thị luôn dấu +/− bên cạnh ô nhập để người dùng thấy khoản này
//  sẽ đi về phía nào, thay vì phải nhớ loại nào cộng loại nào trừ.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdjustmentKind, Category, PayrollAdjustment } from '../types';
import { createAdjustment, updateAdjustment } from '../db/repo/salary';
import { formatMoney } from '../i18n';
import { Button, Field, Modal, inputClass } from './ui';

const KINDS: AdjustmentKind[] = ['BONUS', 'ALLOWANCE', 'PENALTY', 'DEDUCTION'];

/** Khoản này cộng vào hay trừ ra khỏi lương */
export function signOf(kind: AdjustmentKind): 1 | -1 {
  return kind === 'BONUS' || kind === 'ALLOWANCE' ? 1 : -1;
}

const KIND_LABEL: Record<AdjustmentKind, string> = {
  BONUS: 'adjustment.bonus',
  ALLOWANCE: 'adjustment.allowance',
  PENALTY: 'adjustment.penalty',
  DEDUCTION: 'adjustment.deduction',
};

export function AdjustmentForm({
  adjustment,
  categories,
  defaultCategoryId,
  month,
  currency,
  onClose,
}: {
  adjustment: PayrollAdjustment | null;
  categories: Category[];
  defaultCategoryId: string;
  month: string;
  currency: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [categoryId, setCategoryId] = useState(adjustment?.categoryId ?? defaultCategoryId);
  const [kind, setKind] = useState<AdjustmentKind>(adjustment?.kind ?? 'BONUS');
  const [label, setLabel] = useState(adjustment?.label ?? '');
  // Giữ nguyên dạng chuỗi để người dùng gõ thoải mái; lọc chữ số lúc dùng.
  const [amount, setAmount] = useState(
    adjustment?.amount != null ? String(adjustment.amount) : '',
  );
  const [date, setDate] = useState(adjustment?.date ?? '');
  const [note, setNote] = useState(adjustment?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const digits = amount.replace(/\D/g, '');
  const value = digits ? Number(digits) : 0;
  const sign = signOf(kind);
  const valid = !!categoryId && !!label.trim() && value > 0;

  const save = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        categoryId,
        month,
        kind,
        label: label.trim(),
        amount: value,
        date: date || undefined,
        note: note.trim() || undefined,
      };
      if (adjustment) await updateAdjustment(adjustment.id, payload);
      else await createAdjustment(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const eligible = categories.filter((c) => c.isIncomeEligible);

  return (
    <Modal
      title={t(adjustment ? 'adjustment.editTitle' : 'adjustment.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="block text-xs font-medium text-slate-500">
            {t('adjustment.kind')}
          </span>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {KINDS.map((k) => {
              const positive = signOf(k) === 1;
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-lg px-2 py-2 text-sm font-medium transition ${
                    active
                      ? positive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="mr-1 tabular-nums">{positive ? '+' : '−'}</span>
                  {t(KIND_LABEL[k])}
                </button>
              );
            })}
          </div>
        </div>

        <Field label={t('category.title')}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">—</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label={t('adjustment.label')}
          hint={t('adjustment.labelHint')}
          error={touched && !label.trim() ? t('validation.required') : undefined}
        >
          {(id) => (
            <input
              id={id}
              autoFocus
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('adjustment.labelPlaceholder')}
            />
          )}
        </Field>

        <Field
          label={t('adjustment.amount')}
          hint={t('adjustment.amountHint')}
          error={touched && value <= 0 ? t('validation.amountPositive') : undefined}
        >
          {(id) => (
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-semibold tabular-nums ${
                  sign === 1 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {sign === 1 ? '+' : '−'}
              </span>
              <input
                id={id}
                inputMode="numeric"
                className={`${inputClass} max-w-52`}
                value={amount}
                // Chặn dấu trừ ngay tại nguồn — xem chú thích đầu file.
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
              {value > 0 && (
                <span
                  className={`text-sm tabular-nums ${
                    sign === 1 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {sign === 1 ? '+' : '−'}
                  {formatMoney(value, currency)}
                </span>
              )}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('adjustment.date')} hint={t('adjustment.dateHint')}>
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('adjustment.month')} hint={t('adjustment.monthHint')}>
            {(id) => (
              <input id={id} className={inputClass} value={month} disabled readOnly />
            )}
          </Field>
        </div>

        <Field label={t('event.notes')}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
