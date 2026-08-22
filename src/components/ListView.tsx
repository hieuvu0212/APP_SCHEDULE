// ═══════════════════════════════════════════════════════════════════════════
//  components/ListView.tsx — danh sách phẳng, có lọc và tìm kiếm
//
//  Lưới tuần trả lời "thứ Ba tôi làm gì", danh sách trả lời "tôi đã dạy Minh
//  bao nhiêu buổi tháng này" — hai câu hỏi khác nhau nên cần hai màn hình.
//
//  Toàn bộ việc lọc nằm ở core/filter.ts và có test riêng. Component này chỉ
//  giữ trạng thái của mấy cái nút.
//
//  Cột thu nhập hiện "—" cho lương khoán tháng. Đó là TẦNG 1 và nó không quy
//  đổi được về từng buổi — con số chính thức nằm ở màn hình Thu nhập.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence, OccurrenceStatus } from '../types';
import { filterOccurrences, totalMinutes } from '../core/filter';
import { endTimeOf, hoursOf } from '../core/time';
import { formatDate, formatHours, formatMoney } from '../i18n';
import { inputClass } from './styles';
import { ColorDot } from './ui';

const STATUSES: OccurrenceStatus[] = ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const STATUS_KEY: Record<OccurrenceStatus, string> = {
  SCHEDULED: 'occurrence.scheduled',
  COMPLETED: 'occurrence.completed',
  CANCELLED: 'occurrence.cancelled',
  NO_SHOW: 'occurrence.noShow',
};

export function ListView({
  occurrences,
  categories,
  from,
  to,
  showConflicts,
  onRangeChange,
  onPick,
  incomeOf,
}: {
  occurrences: Occurrence[];
  categories: Category[];
  from: string;
  to: string;
  showConflicts: boolean;
  onRangeChange: (from: string, to: string) => void;
  onPick: (o: Occurrence) => void;
  incomeOf: (o: Occurrence) => number | null;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<OccurrenceStatus[]>([]);
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const results = useMemo(
    () => filterOccurrences(occurrences, { query, categoryIds, statuses, onlyConflicts }),
    [occurrences, query, categoryIds, statuses, onlyConflicts],
  );

  // Gom theo ngày để danh sách có mốc chứ không trôi thành một dải liền.
  const groups = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of results) {
      const list = map.get(o.date);
      if (list) list.push(o);
      else map.set(o.date, [o]);
    }
    return [...map.entries()];
  }, [results]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const hasFilter =
    !!query || categoryIds.length > 0 || statuses.length > 0 || onlyConflicts;

  return (
    <div className="space-y-4">
      {/* ── Bộ lọc ── */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-xs font-medium text-slate-500">
              {t('list.from')}
            </span>
            <input
              type="date"
              className={`${inputClass} mt-1 max-w-44`}
              value={from}
              onChange={(e) => onRangeChange(e.target.value, to)}
            />
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-500">{t('list.to')}</span>
            <input
              type="date"
              className={`${inputClass} mt-1 max-w-44`}
              value={to}
              onChange={(e) => onRangeChange(from, e.target.value)}
            />
          </div>
          <div className="min-w-52 flex-1">
            <span className="block text-xs font-medium text-slate-500">
              {t('list.search')}
            </span>
            <input
              className={`${inputClass} mt-1`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('list.searchPlaceholder')}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = categoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryIds((l) => toggle(l, c.id))}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                  on
                    ? 'bg-primary text-primary-fg'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ColorDot color={c.color} />
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((s) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatuses((l) => toggle(l, s))}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  on
                    ? 'bg-primary text-primary-fg'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t(STATUS_KEY[s])}
              </button>
            );
          })}

          {showConflicts && (
            <button
              type="button"
              onClick={() => setOnlyConflicts((v) => !v)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                onlyConflicts
                  ? 'bg-red-600 text-white'
                  : 'border border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              ⚠ {t('occurrence.conflict')}
            </button>
          )}

          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryIds([]);
                setStatuses([]);
                setOnlyConflicts(false);
              }}
              className="ml-auto rounded-full px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
            >
              {t('list.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {/* ── Tóm tắt ── */}
      <p className="text-sm text-slate-500">
        {t('list.summary', {
          n: results.length,
          hours: formatHours(hoursOf(totalMinutes(results))),
        })}
      </p>

      {/* ── Kết quả ── */}
      {groups.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
          {t('list.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(([date, items]) => (
            <section
              key={date}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                {formatDate(date)}
              </h3>
              <ul className="divide-y divide-slate-50">
                {items.map((o) => {
                  const income = incomeOf(o);
                  const cancelled = o.status === 'CANCELLED';
                  return (
                    <li key={o.key}>
                      <button
                        type="button"
                        onClick={() => onPick(o)}
                        className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50"
                      >
                        <span className="w-28 shrink-0 tabular-nums text-slate-500">
                          {o.startTime}–{endTimeOf(o.startTime, o.durationMinutes)}
                        </span>
                        <ColorDot color={catMap.get(o.categoryId)?.color ?? '#94a3b8'} />
                        <span
                          className={`min-w-0 flex-1 truncate font-medium text-slate-800 ${
                            cancelled || o.status === 'NO_SHOW' ? 'line-through' : ''
                          }`}
                        >
                          {o.title}
                        </span>
                        {o.clientName && (
                          <span className="text-xs text-slate-400">{o.clientName}</span>
                        )}
                        {o.hasConflict && showConflicts && !cancelled && (
                          <span className="text-red-500" title={t('occurrence.conflict')}>
                            ⚠
                          </span>
                        )}
                        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
                          {formatHours(hoursOf(o.durationMinutes))}
                          {t('common.hourShort')}
                        </span>
                        <span className="w-28 shrink-0 text-right tabular-nums text-slate-600">
                          {income == null ? (
                            <span
                              className="text-slate-300"
                              title={t('detail.fixedMonthlyHint')}
                            >
                              {t('payroll.notApplicable')}
                            </span>
                          ) : (
                            formatMoney(income)
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
