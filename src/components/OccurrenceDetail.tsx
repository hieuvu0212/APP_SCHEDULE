// ═══════════════════════════════════════════════════════════════════════════
//  components/OccurrenceDetail.tsx — bảng chi tiết một buổi
//
//  Chỗ hiển thị thu nhập ở đây là TẦNG 1 (core/income.ts) và nó có thể trả
//  về `null` với lương khoán tháng. `null` phải hiện "—", KHÔNG hiện "0đ":
//  "không quy đổi được" và "không có tiền" là hai chuyện khác nhau, gộp lại
//  là nói dối người dùng.
//
//  Con số thu nhập CHÍNH THỨC không nằm ở màn hình này mà ở bảng lương tháng
//  (core/payroll.ts). Ở đây chỉ là ước lượng cho một buổi.
// ═══════════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence, OccurrenceStatus, SalaryRule } from '../types';
import { calcOccurrenceIncome } from '../core/income';
import { endTimeOf, hoursOf } from '../core/time';
import { formatDate, formatHours, formatMoney } from '../i18n';
import { Button, ColorDot, Modal } from './ui';

const STATUS_OPTIONS: OccurrenceStatus[] = ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const STATUS_KEY: Record<OccurrenceStatus, string> = {
  SCHEDULED: 'occurrence.scheduled',
  COMPLETED: 'occurrence.completed',
  CANCELLED: 'occurrence.cancelled',
  NO_SHOW: 'occurrence.noShow',
};

export function OccurrenceDetail({
  occurrence: o,
  category,
  salaryRule,
  conflicts,
  onEdit,
  onSetStatus,
  onRemoveOccurrence,
  onDeleteSeries,
  onClose,
}: {
  occurrence: Occurrence;
  category: Category | undefined;
  salaryRule: SalaryRule | undefined;
  conflicts: Occurrence[];
  onEdit: () => void;
  onSetStatus: (status: OccurrenceStatus) => void;
  onRemoveOccurrence: () => void;
  onDeleteSeries: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const income = calcOccurrenceIncome(o, category, salaryRule);
  const isSeries = o.sourceType === 'RULE' && !o.exceptionId;

  return (
    <Modal
      title={o.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onRemoveOccurrence}>
            {t(isSeries ? 'detail.removeOccurrence' : 'common.delete')}
          </Button>
          {isSeries && (
            <Button variant="danger" onClick={onDeleteSeries}>
              {t('detail.deleteSeries')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" onClick={onEdit}>
            {t('common.edit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
              <ColorDot color={category.color} />
              {category.name}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {t(isSeries ? 'detail.fromSeries' : 'detail.singleEvent')}
          </span>
          {o.hasConflict && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
              ⚠ {t('occurrence.conflict')}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2">
          <Row label={t('event.date')}>{formatDate(o.date)}</Row>
          <Row label={t('detail.time')}>
            <span className="tabular-nums">
              {o.startTime}–{endTimeOf(o.startTime, o.durationMinutes)}
            </span>
            {o.endsNextDay && (
              <span className="ml-2 text-xs text-amber-600">
                ({t('occurrence.endsNextDay')})
              </span>
            )}
          </Row>
          <Row label={t('detail.duration')}>
            {formatHours(hoursOf(o.durationMinutes))} {t('common.hours')}
          </Row>
          <Row label={t('detail.estimatedIncome')}>
            {income == null ? (
              <span title={t('detail.fixedMonthlyHint')} className="text-slate-400">
                {t('payroll.notApplicable')}
              </span>
            ) : (
              <span className="font-medium tabular-nums">{formatMoney(income)}</span>
            )}
          </Row>
          {o.location && <Row label={t('event.location')}>{o.location}</Row>}
          {o.clientName && <Row label={t('event.clientName')}>{o.clientName}</Row>}
          {o.notes && <Row label={t('event.notes')}>{o.notes}</Row>}
        </dl>

        {income == null && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {t('detail.fixedMonthlyHint')}
          </p>
        )}

        <div>
          <span className="block text-xs font-medium text-slate-500">
            {t('event.status')}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  o.status === s
                    ? 'bg-primary text-primary-fg'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t(STATUS_KEY[s])}
              </button>
            ))}
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-semibold text-red-700">
              {t('detail.conflictsWith')}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-red-600">
              {conflicts.map((c) => (
                <li key={c.key}>
                  <span className="tabular-nums">
                    {c.startTime}–{endTimeOf(c.startTime, c.durationMinutes)}
                  </span>{' '}
                  {c.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </>
  );
}
