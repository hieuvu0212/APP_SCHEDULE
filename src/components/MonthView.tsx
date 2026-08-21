// ═══════════════════════════════════════════════════════════════════════════
//  components/MonthView.tsx — lưới tháng
//
//  Ô ngày cao cố định nên số chip hiển thị được là hữu hạn. Phần tràn KHÔNG
//  bị giấu im lặng — hiện "+N" và bấm được để nhảy sang Week View của ngày đó.
//
//  Số hàng do core/calendar.ts quyết định, không ép cứng 6.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence } from '../types';
import { isInMonth, todayKey, weekdayOrder } from '../core/calendar';
import { groupByDate } from '../hooks/useSchedule';
import { tint } from './color';

/** Số chip tối đa mỗi ô trước khi gộp thành "+N" */
const MAX_CHIPS = 3;

export interface MonthViewProps {
  month: string;
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  weekStartsOn: 0 | 1;
  showConflicts: boolean;
  onPick: (occurrence: Occurrence) => void;
  onOpenDay: (date: string) => void;
}

export function MonthView({
  month,
  dates,
  occurrences,
  categories,
  weekStartsOn,
  showConflicts,
  onPick,
  onOpenDay,
}: MonthViewProps) {
  const { t } = useTranslation();
  const today = todayKey();
  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekdayOrder(weekStartsOn).map((dow) => (
          <div
            key={dow}
            className="px-2 py-2 text-center text-[11px] uppercase tracking-wide text-slate-400"
          >
            {t(`weekday.s${dow}`)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dates.map((d) => {
          const list = byDate.get(d) ?? [];
          const outside = !isInMonth(d, month);
          const isToday = d === today;
          const overflow = list.length - MAX_CHIPS;

          return (
            <div
              key={d}
              className={`min-h-24 border-b border-l border-slate-100 p-1 first:border-l-0 ${
                outside ? 'bg-slate-50/60' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition hover:bg-slate-200 ${
                  isToday
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : outside
                      ? 'text-slate-300'
                      : 'text-slate-600'
                }`}
                title={t('month.openDay')}
              >
                {Number(d.slice(8))}
              </button>

              <div className="space-y-0.5">
                {list.slice(0, MAX_CHIPS).map((o) => (
                  <Chip
                    key={o.key}
                    occurrence={o}
                    category={categories.get(o.categoryId)}
                    showConflicts={showConflicts}
                    onPick={onPick}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(d)}
                    className="w-full rounded px-1 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
                  >
                    {t('month.more', { n: overflow })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  occurrence: o,
  category,
  showConflicts,
  onPick,
}: {
  occurrence: Occurrence;
  category: Category | undefined;
  showConflicts: boolean;
  onPick: (o: Occurrence) => void;
}) {
  const color = category?.color ?? '#94a3b8';
  const cancelled = o.status === 'CANCELLED';

  return (
    <button
      type="button"
      onClick={() => onPick(o)}
      style={{ backgroundColor: cancelled ? undefined : tint(color, '1f') }}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition hover:brightness-95 ${
        cancelled ? 'opacity-50' : ''
      }`}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="shrink-0 tabular-nums text-slate-500">{o.startTime}</span>
      <span
        className={`min-w-0 flex-1 truncate text-slate-800 ${
          cancelled || o.status === 'NO_SHOW' ? 'line-through' : ''
        }`}
      >
        {o.title}
      </span>
      {o.hasConflict && showConflicts && !cancelled && (
        <span className="shrink-0 text-red-500">⚠</span>
      )}
    </button>
  );
}
