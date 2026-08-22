// ═══════════════════════════════════════════════════════════════════════════
//  components/PaymentForm.tsx — ghi nhận một khoản đã thu
//
//  ⚠️ Ô số tiền lọc bỏ mọi ký tự không phải chữ số, nên không gõ được dấu
//  trừ. Cùng lý do với form điều chỉnh lương: một khoản âm lọt vào sẽ làm
//  "đã thu" giảm đi và dòng đó hiện nợ nhiều hơn thực tế — con số vẫn trông
//  hợp lý nên gần như không phát hiện được bằng mắt.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientDues } from '../core/payment';
import { todayKey } from '../core/calendar';
import { createPayment } from '../db/repo/payments';
import { formatMoney } from '../i18n';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

/** Gợi ý sẵn, người dùng vẫn gõ được thứ khác */
const METHODS = ['dues.methodCash', 'dues.methodTransfer', 'dues.methodEwallet'];

export function PaymentForm({
  row,
  month,
  currency,
  onClose,
}: {
  row: ClientDues;
  month: string;
  currency: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // Điền sẵn số còn thiếu — trường hợp thường gặp nhất là thu nốt cho đủ.
  const [amount, setAmount] = useState(row.remaining ? String(row.remaining) : '');
  const [paidAt, setPaidAt] = useState(todayKey());
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const digits = amount.replace(/\D/g, '');
  const value = digits ? Number(digits) : 0;
  const valid = value > 0;

  const save = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createPayment({
        clientKey: row.clientKey,
        clientLabel: row.clientLabel,
        categoryId: row.categoryId,
        month,
        amount: value,
        paidAt: paidAt || undefined,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('dues.recordFor', { name: row.clientLabel })}
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
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-slate-500">{t('dues.due')}</dt>
          <dd className="text-right tabular-nums text-slate-800">
            {row.due == null ? t('payroll.notApplicable') : formatMoney(row.due, currency)}
          </dd>
          <dt className="text-slate-500">{t('dues.paid')}</dt>
          <dd className="text-right tabular-nums text-emerald-600">
            {formatMoney(row.paid, currency)}
          </dd>
        </dl>

        <Field
          label={t('dues.amount')}
          hint={value > 0 ? formatMoney(value, currency) : t('dues.amountHint')}
          error={touched && !valid ? t('validation.amountPositive') : undefined}
        >
          {(id) => (
            <input
              id={id}
              autoFocus
              inputMode="numeric"
              className={`${inputClass} max-w-52`}
              value={amount}
              // Chặn dấu trừ ngay tại nguồn — xem chú thích đầu file.
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('dues.paidAt')}>
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputClass}
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            )}
          </Field>

          <Field label={t('dues.method')}>
            {(id) => (
              <input
                id={id}
                list={`${id}-methods`}
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
            )}
          </Field>
        </div>

        <datalist id="methods">
          {METHODS.map((key) => (
            <option key={key} value={t(key)} />
          ))}
        </datalist>

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
