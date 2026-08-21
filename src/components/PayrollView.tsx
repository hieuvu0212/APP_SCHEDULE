// ═══════════════════════════════════════════════════════════════════════════
//  components/PayrollView.tsx — bảng lương tháng
//
//  ⚠️ MỌI CON SỐ TRÊN MÀN HÌNH NÀY ĐẾN TỪ calcMonthlyPayroll (TẦNG 2).
//     KHÔNG chỗ nào cộng dồn calcOccurrenceIncome (Tầng 1).
//
//  Bảng cố tình hiện BÓC TÁCH chứ không chỉ một con số thực nhận, vì câu hỏi
//  thực tế luôn là "tháng này bị trừ 350k vì cái gì" chứ không phải "tháng này
//  được bao nhiêu".
//
//  Hai chỗ nói thật thay vì làm đẹp số liệu:
//    · net âm KHÔNG bị kẹp về 0 — kẹp là che mất lỗi nhập liệu, mà nhập sai
//      chính là nguyên nhân khả dĩ nhất khi con số ra âm.
//    · giờ đã hoàn thành tách khỏi giờ mới nằm trên lịch — xem bảng lương
//      giữa tháng mà gộp hai thứ này lại là hiểu nhầm ngay.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdjustmentKind, Category, PayrollAdjustment, SalaryRule } from '../types';
import type { PayrollRow } from '../hooks/usePayroll';
import { usePayroll } from '../hooks/usePayroll';
import { softDeleteAdjustment, softDeleteSalaryRule } from '../db/repo/salary';
import { formatHours, formatMoney, formatMonthLabel } from '../i18n';
import { useUndo } from '../undo/UndoProvider';
import { AdjustmentForm, signOf } from './AdjustmentForm';
import { SalaryRuleForm } from './SalaryRuleForm';
import { Button, ColorDot } from './ui';

const KIND_LABEL: Record<AdjustmentKind, string> = {
  BONUS: 'adjustment.bonus',
  ALLOWANCE: 'adjustment.allowance',
  PENALTY: 'adjustment.penalty',
  DEDUCTION: 'adjustment.deduction',
};

export function PayrollView({ month }: { month: string }) {
  const { t } = useTranslation();
  const { pushUndo } = useUndo();
  const data = usePayroll(month);

  const [salaryDialog, setSalaryDialog] = useState<
    { rule: SalaryRule | null; categoryId: string } | null
  >(null);
  const [adjDialog, setAdjDialog] = useState<
    { adjustment: PayrollAdjustment | null; categoryId: string; currency: string } | null
  >(null);

  if (!data) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
        {t('common.loading')}
      </p>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
        <p className="text-slate-500">{t('payroll.noEligibleCategory')}</p>
        <p className="mt-1 text-xs text-slate-400">{t('payroll.noEligibleHint')}</p>
      </div>
    );
  }

  const removeAdjustment = async (a: PayrollAdjustment) => {
    const undo = await softDeleteAdjustment(a.id);
    pushUndo(t('toast.adjustmentDeleted', { label: a.label }), undo);
  };

  const removeSalaryRule = async (rule: SalaryRule, category: Category) => {
    const undo = await softDeleteSalaryRule(rule.id);
    pushUndo(t('toast.salaryRuleDeleted', { name: category.name }), undo);
  };

  return (
    <div className="space-y-4">
      {/* ── Tổng thực nhận ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {t('payroll.totalFor', { month: formatMonthLabel(month) })}
        </p>
        {data.mixedCurrency ? (
          // Cộng đồng với đô không ra con số nào có nghĩa — thà không hiện
          // còn hơn hiện một số sai trông như đúng.
          <p className="mt-1 text-sm text-amber-700">{t('payroll.mixedCurrency')}</p>
        ) : (
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
            {formatMoney(data.totalNet, data.rows[0]?.payroll.currency)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSalaryDialog({ rule: null, categoryId: '' })}>
            + {t('salary.addTitle')}
          </Button>
        </div>
      </div>

      {data.hasUnconfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('payroll.unconfiguredWarning')}
        </p>
      )}

      {data.rows.map((row) => (
        <PayrollCard
          key={row.category.id}
          row={row}
          adjustments={data.adjustments.filter((a) => a.categoryId === row.category.id)}
          onEditSalary={() =>
            setSalaryDialog({ rule: row.salaryRule ?? null, categoryId: row.category.id })
          }
          onDeleteSalary={() =>
            row.salaryRule && void removeSalaryRule(row.salaryRule, row.category)
          }
          onAddAdjustment={() =>
            setAdjDialog({
              adjustment: null,
              categoryId: row.category.id,
              currency: row.payroll.currency,
            })
          }
          onEditAdjustment={(a) =>
            setAdjDialog({
              adjustment: a,
              categoryId: row.category.id,
              currency: row.payroll.currency,
            })
          }
          onDeleteAdjustment={(a) => void removeAdjustment(a)}
        />
      ))}

      {salaryDialog && (
        <SalaryRuleForm
          rule={salaryDialog.rule}
          categories={data.categories}
          defaultCategoryId={salaryDialog.categoryId}
          month={month}
          onClose={() => setSalaryDialog(null)}
        />
      )}

      {adjDialog && (
        <AdjustmentForm
          adjustment={adjDialog.adjustment}
          categories={data.categories}
          defaultCategoryId={adjDialog.categoryId}
          month={month}
          currency={adjDialog.currency}
          onClose={() => setAdjDialog(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function PayrollCard({
  row,
  adjustments,
  onEditSalary,
  onDeleteSalary,
  onAddAdjustment,
  onEditAdjustment,
  onDeleteAdjustment,
}: {
  row: PayrollRow;
  adjustments: PayrollAdjustment[];
  onEditSalary: () => void;
  onDeleteSalary: () => void;
  onAddAdjustment: () => void;
  onEditAdjustment: (a: PayrollAdjustment) => void;
  onDeleteAdjustment: (a: PayrollAdjustment) => void;
}) {
  const { t } = useTranslation();
  const { payroll: p, category, hoursCompleted, hoursScheduled, salaryRule } = row;
  const cur = p.currency;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <ColorDot color={category.color} className="size-3.5" />
        <h3 className="font-semibold text-slate-900">{category.name}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {t(p.mode === 'HOURLY' ? 'salary.modeHourly' : 'salary.modeFixedMonthly')}
        </span>
        {!salaryRule && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
            {t('payroll.noSalaryRule')}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" onClick={onEditSalary}>
            {t(salaryRule ? 'payroll.editSalary' : 'payroll.setupSalary')}
          </Button>
          {salaryRule && (
            <Button variant="ghost" onClick={onDeleteSalary} className="text-red-600 hover:bg-red-50">
              {t('common.delete')}
            </Button>
          )}
        </span>
      </header>

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        {/* ── Giờ ── */}
        <div>
          <p className="text-xs font-medium text-slate-500">{t('payroll.hours')}</p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <Line label={t('payroll.hoursCompleted')}>
              {formatHours(hoursCompleted)} {t('common.hours')}
            </Line>
            {hoursScheduled > 0 && (
              <Line label={t('payroll.hoursScheduled')} muted>
                {formatHours(hoursScheduled)} {t('common.hours')}
              </Line>
            )}
            {p.hoursStandard != null && (
              <Line label={t('payroll.hoursStandard')} muted>
                {formatHours(p.hoursStandard)} {t('common.hours')}
              </Line>
            )}
          </dl>
          {hoursScheduled > 0 && (
            <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
              {t('payroll.projectionNote')}
            </p>
          )}
        </div>

        {/* ── Tiền ── */}
        <div>
          <p className="text-xs font-medium text-slate-500">{t('payroll.breakdown')}</p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <Line label={t('payroll.gross')}>
              <span className="tabular-nums">{formatMoney(p.gross, cur)}</span>
            </Line>
            <Line label={t('payroll.totalBonus')}>
              <span className="tabular-nums text-emerald-600">
                +{formatMoney(p.totalBonus, cur)}
              </span>
            </Line>
            <Line label={t('payroll.totalPenalty')}>
              <span className="tabular-nums text-red-600">
                −{formatMoney(p.totalPenalty, cur)}
              </span>
            </Line>
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-1.5">
              <dt className="font-medium text-slate-700">{t('payroll.net')}</dt>
              <dd
                className={`text-lg font-semibold tabular-nums ${
                  p.isNegative ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {formatMoney(p.net, cur)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {p.isNegative && (
        <p className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {t('payroll.negativeWarning')}
        </p>
      )}

      {/* ── Điều chỉnh ── */}
      <div className="border-t border-slate-100 px-5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">{t('adjustment.title')}</p>
          <Button variant="ghost" onClick={onAddAdjustment}>
            + {t('common.add')}
          </Button>
        </div>

        {adjustments.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">{t('adjustment.empty')}</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-slate-50">
            {adjustments.map((a) => {
              const positive = signOf(a.kind) === 1;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {t(KIND_LABEL[a.kind])}
                  </span>
                  <span className="text-slate-700">{a.label}</span>
                  {a.date && <span className="text-xs text-slate-400">{a.date}</span>}
                  <span
                    className={`ml-auto tabular-nums ${
                      positive ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {positive ? '+' : '−'}
                    {formatMoney(a.amount, cur)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditAdjustment(a)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAdjustment(a)}
                    className="rounded px-1.5 py-0.5 text-xs text-red-600 transition hover:bg-red-50"
                  >
                    {t('common.delete')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Line({
  label,
  children,
  muted = false,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? 'text-slate-400' : 'text-slate-500'}>{label}</dt>
      <dd className={muted ? 'text-slate-400' : 'text-slate-700'}>{children}</dd>
    </div>
  );
}
