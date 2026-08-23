// ═══════════════════════════════════════════════════════════════════════════
//  components/DashboardView.tsx — màn hình mở đầu
//
//  Trả lời đúng hai câu hỏi người ta hỏi khi mở ứng dụng lịch:
//  "hôm nay tôi phải làm gì" và "tháng này đang ra sao".
//
//  Mọi con số đến từ core/ qua useDashboard. Component này không tự tính gì.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence } from '../types';
import { addDays } from '../core/time';
import { endTimeOf, hoursOf } from '../core/time';
import { formatDate, formatHours, formatMoney } from '../i18n';
import { useDashboard } from '../hooks/useDashboard';
import { tint } from './color';

export function DashboardView({
  onPick,
  onOpenDate,
}: {
  onPick: (o: Occurrence) => void;
  onOpenDate: (date: string) => void;
}) {
  const { t } = useTranslation();
  const data = useDashboard();

  const catMap = useMemo(
    () => new Map((data?.categories ?? []).map((c) => [c.id, c])),
    [data?.categories],
  );

  if (!data) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
        {t('common.loading')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('dashboard.sessions')} value={String(data.sessionCount)} />
        <Kpi
          label={t('dashboard.hours')}
          value={`${formatHours(data.hoursCompleted)}`}
          hint={t('dashboard.ofPlanned', { hours: formatHours(data.hoursPlanned) })}
        />
        <Kpi
          label={t('dashboard.income')}
          value={
            data.mixedCurrency
              ? t('payroll.notApplicable')
              : formatMoney(data.netIncome, data.currency)
          }
          hint={data.mixedCurrency ? t('payroll.mixedCurrency') : undefined}
        />
        <Kpi
          label={t('dashboard.clients')}
          value={String(data.clientCount)}
          hint={t('dashboard.clientsHint')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DayPanel
          title={t('dashboard.today')}
          date={data.today}
          list={data.todayList}
          categories={catMap}
          onPick={onPick}
          onOpenDate={onOpenDate}
        />
        <DayPanel
          title={t('dashboard.tomorrow')}
          date={addDays(data.today, 1)}
          list={data.tomorrowList}
          categories={catMap}
          onPick={onPick}
          onOpenDate={onOpenDate}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

function DayPanel({
  title,
  date,
  list,
  categories,
  onPick,
  onOpenDate,
}: {
  title: string;
  date: string;
  list: Occurrence[];
  categories: Map<string, Category>;
  onPick: (o: Occurrence) => void;
  onOpenDate: (date: string) => void;
}) {
  const { t } = useTranslation();
  const totalHours = list.reduce((sum, o) => sum + hoursOf(o.durationMinutes), 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={() => onOpenDate(date)}
          className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline"
        >
          {formatDate(date)}
        </button>
        {list.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-slate-400">
            {list.length} · {formatHours(totalHours)} {t('common.hours')}
          </span>
        )}
      </header>

      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">
          {t('dashboard.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {list.map((o) => {
            const color = categories.get(o.categoryId)?.color ?? '#94a3b8';
            const done = o.status === 'COMPLETED';
            return (
              <li key={o.key}>
                <button
                  type="button"
                  onClick={() => onPick(o)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span
                    aria-hidden
                    className="h-9 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
                    {o.startTime}
                    <span className="block text-slate-400">
                      {endTimeOf(o.startTime, o.durationMinutes)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium text-slate-800 ${
                        o.status === 'NO_SHOW' ? 'line-through' : ''
                      }`}
                    >
                      {o.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{ backgroundColor: tint(color, '26') }}
                      >
                        {categories.get(o.categoryId)?.name ?? ''}
                      </span>
                      {o.clientName && <span>{o.clientName}</span>}
                      {o.location && <span>· {o.location}</span>}
                    </span>
                  </span>
                  {done && <span className="shrink-0 text-emerald-600">✓</span>}
                  {o.hasConflict && !done && (
                    <span className="shrink-0 text-red-500" title={t('occurrence.conflict')}>
                      ⚠
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
