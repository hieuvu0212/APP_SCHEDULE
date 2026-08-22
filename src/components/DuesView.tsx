// ═══════════════════════════════════════════════════════════════════════════
//  components/DuesView.tsx — Thu tiền
//
//  Trả lời câu "ai còn nợ mình bao nhiêu". Dùng được cho học phí gia sư, tiền
//  công theo buổi, hay bất cứ khoản nào gắn với một đối tượng cụ thể.
//
//  ⚠️ Cột "Phải thu" hiện "—" với công việc trả khoán tháng. Đó KHÔNG phải
//  lỗi thiếu dữ liệu: 8 triệu một tháng không tách được cho từng học sinh, và
//  chia đều ra là bịa số. Tiền đã thu vẫn ghi nhận bình thường.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientDues, PaymentStatus } from '../core/payment';
import { formatHours, formatMoney, formatMonthLabel } from '../i18n';
import { useDues } from '../hooks/useDues';
import { softDeletePayment } from '../db/repo/payments';
import { useUndo } from '../undo/context';
import { PaymentForm } from './PaymentForm';
import { Button, ColorDot } from './ui';

const STATUS_STYLE: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-800',
  unpaid: 'bg-red-50 text-red-700',
  notApplicable: 'bg-slate-100 text-slate-500',
};

const STATUS_KEY: Record<PaymentStatus, string> = {
  paid: 'dues.statusPaid',
  partial: 'dues.statusPartial',
  unpaid: 'dues.statusUnpaid',
  notApplicable: 'dues.statusNotApplicable',
};

export function DuesView({ month }: { month: string }) {
  const { t } = useTranslation();
  const { pushUndo } = useUndo();
  const data = useDues(month);
  const [adding, setAdding] = useState<ClientDues | null>(null);

  if (!data) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
        {t('common.loading')}
      </p>
    );
  }

  const catMap = new Map(data.categories.map((c) => [c.id, c]));

  const removePayment = async (id: string, label: string) => {
    const undo = await softDeletePayment(id);
    pushUndo(t('toast.paymentDeleted', { label }), undo);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Total
          label={t('dues.collected')}
          value={formatMoney(data.totals.paid, data.currency)}
          tone="text-emerald-600"
        />
        <Total
          label={t('dues.outstanding')}
          value={formatMoney(data.totals.remaining, data.currency)}
          tone={data.totals.remaining > 0 ? 'text-red-600' : 'text-slate-900'}
        />
        <Total
          label={t('dues.total')}
          value={formatMoney(data.totals.due, data.currency)}
          hint={data.totals.hasUnattributable ? t('dues.excludesFixed') : undefined}
        />
      </div>

      <p className="text-xs text-slate-400">
        {t('dues.forMonth', { month: formatMonthLabel(month) })}
      </p>

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-slate-500">{t('dues.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('dues.emptyHint')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">{t('dues.client')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('dues.sessions')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('payroll.hours')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('dues.due')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('dues.paid')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('dues.remaining')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((row) => (
                <tr key={row.clientKey}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <ColorDot color={catMap.get(row.categoryId)?.color ?? '#94a3b8'} />
                      <span className="font-medium text-slate-800">{row.clientLabel}</span>
                    </span>
                    <span
                      className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[row.status]}`}
                    >
                      {t(STATUS_KEY[row.status])}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    {row.sessions}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    {formatHours(row.hours)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                    {row.due == null ? (
                      <span className="text-slate-300" title={t('dues.excludesFixed')}>
                        {t('payroll.notApplicable')}
                      </span>
                    ) : (
                      formatMoney(row.due, data.currency)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                    {row.paid > 0 ? formatMoney(row.paid, data.currency) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    {row.remaining == null ? (
                      <span className="text-slate-300">—</span>
                    ) : row.remaining > 0 ? (
                      <span className="text-red-600">
                        {formatMoney(row.remaining, data.currency)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" onClick={() => setAdding(row)}>
                      + {t('dues.record')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.payments.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">{t('dues.history')}</h3>
          <ul className="mt-2 divide-y divide-slate-50">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="font-medium text-slate-700">{p.clientLabel}</span>
                {p.paidAt && <span className="text-xs text-slate-400">{p.paidAt}</span>}
                {p.method && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                    {p.method}
                  </span>
                )}
                {p.note && <span className="text-xs text-slate-400">{p.note}</span>}
                <span className="ml-auto tabular-nums text-emerald-600">
                  +{formatMoney(p.amount, data.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => void removePayment(p.id, p.clientLabel)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-600 transition hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && (
        <PaymentForm
          row={adding}
          month={month}
          currency={data.currency}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

function Total({
  label,
  value,
  tone = 'text-slate-900',
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}
