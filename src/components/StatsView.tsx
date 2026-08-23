// ═══════════════════════════════════════════════════════════════════════════
//  components/StatsView.tsx — màn hình Thống kê
//
//  Biểu đồ vẽ bằng SVG thuần, KHÔNG kéo thư viện nào vào. Ba loại biểu đồ ở
//  đây đều là hình chữ nhật xếp cạnh nhau — nhập recharts hay chart.js cho
//  việc đó là thêm vài trăm KB và một lớp API phải học, đổi lại không được gì.
//
//  Số liệu do core/stats.ts và core/payroll.ts tính, component chỉ quy đổi
//  sang chiều cao pixel.
//
//  ⚠️ Thanh "kế hoạch vs thực tế" là thứ đáng nhìn nhất ở đây. Nó chỉ có
//  nghĩa nếu bạn thật sự đánh dấu buổi là đã hoàn thành — nếu bật "tự đánh
//  dấu buổi đã qua" trong Cài đặt thì mọi buổi quá khứ tự thành COMPLETED và
//  tỷ lệ luôn đẹp, cái đẹp đó không nói lên điều gì. Màn hình có nhắc chuyện
//  này ngay dưới biểu đồ.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OccurrenceStatus } from '../types';
import type { CategoryStat } from '../core/stats';
import { completionRate, totalStat } from '../core/stats';
import { addMonths, todayKey, weekdayOrder } from '../core/calendar';
import { monthOf } from '../core/time';
import { useStats, type MonthIncome } from '../hooks/useStats';
import { useSettings } from '../hooks/useSettings';
import { formatHours, formatMoney, formatMonthLabel } from '../i18n';
import { ColorDot } from './ui';

const SPANS = [3, 6, 12] as const;

/**
 * Chiều cao vùng cột, tính bằng PIXEL chứ không phải phần trăm.
 *
 * Phần trăm chỉ phân giải được khi thẻ cha có chiều cao XÁC ĐỊNH. Cột ở đây
 * nằm trong một `flex-col` chiều cao tự động, nên `height: 47%` rơi về 0 và
 * biểu đồ ra trống trơn — nhãn số vẫn hiện, chỉ mất mỗi cột, nên nhìn lướt
 * rất dễ tưởng là chưa có dữ liệu.
 */
const INCOME_BAR_PX = 120;
const WEEKDAY_BAR_PX = 90;
/** Giá trị dương nhưng quá nhỏ vẫn phải thấy được một vạch */
const MIN_BAR_PX = 2;

function barHeight(value: number, max: number, area: number): number {
  if (value <= 0) return 0;
  return Math.max(MIN_BAR_PX, Math.round((value / max) * area));
}

export function StatsView() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [span, setSpan] = useState<number>(6);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<OccurrenceStatus[]>([]);

  const toMonth = monthOf(todayKey());
  const fromMonth = addMonths(toMonth, -(span - 1));

  // Dựng lại object mỗi lần render là được: useStats rút nó thành chuỗi để so
  // sánh, chứ không so theo tham chiếu.
  const data = useStats(fromMonth, toMonth, { categoryIds, clientNames, statuses });

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

  const total = totalStat(data.categoryStats);
  const rate = completionRate(total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('nav.stats')}</h2>
        <span className="flex gap-1 rounded-lg bg-slate-200/60 p-1">
          {SPANS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpan(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                span === s
                  ? 'bg-primary text-primary-fg shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('stats.lastMonths', { n: s })}
            </button>
          ))}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {formatMonthLabel(fromMonth)} – {formatMonthLabel(toMonth)}
        </span>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <Chips
          title={t('stats.filterCategory')}
          items={data.categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
          selected={categoryIds}
          onToggle={(v) => setCategoryIds((l) => toggle(l, v))}
        />
        {data.clients.length > 0 && (
          <Chips
            title={t('stats.filterClient')}
            items={data.clients.map((name) => ({ value: name, label: name }))}
            selected={clientNames}
            onToggle={(v) => setClientNames((l) => toggle(l, v))}
          />
        )}
        <Chips
          title={t('stats.filterStatus')}
          items={STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))}
          selected={statuses}
          onToggle={(v) => setStatuses((l) => toggle(l, v as OccurrenceStatus))}
        />
        {(categoryIds.length > 0 || clientNames.length > 0 || statuses.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setCategoryIds([]);
              setClientNames([]);
              setStatuses([]);
            }}
            className="text-xs text-slate-500 transition hover:text-slate-900"
          >
            {t('list.clearFilters')}
          </button>
        )}
      </div>

      {/* ── Bốn con số tóm tắt ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t('stats.totalIncome')}
          value={
            data.mixedCurrency
              ? t('payroll.notApplicable')
              : formatMoney(data.totalNet, data.income[0]?.currency)
          }
          hint={data.mixedCurrency ? t('payroll.mixedCurrency') : undefined}
        />
        <Kpi
          label={t('stats.completedHours')}
          value={`${formatHours(total.completedHours)} ${t('common.hours')}`}
          hint={t('stats.ofPlanned', { hours: formatHours(total.plannedHours) })}
        />
        <Kpi
          label={t('stats.completionRate')}
          value={rate == null ? t('payroll.notApplicable') : `${Math.round(rate * 100)}%`}
          hint={t('stats.sessionsDone', {
            done: total.completedCount,
            planned: total.plannedCount,
          })}
        />
        <Kpi
          label={t('stats.conflicts')}
          value={String(data.conflictCount)}
          hint={data.conflictCount > 0 ? t('stats.conflictsHint') : undefined}
        />
      </div>

      {/* ── Thu nhập theo tháng ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800">{t('stats.incomeByMonth')}</h3>
        {data.incomeIgnoresFilter && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            {t('stats.incomeFilterNote')}
          </p>
        )}
        <IncomeChart income={data.income} hoursPerMonth={data.hoursPerMonth} />
      </section>

      {/* ── Kế hoạch vs thực tế ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800">
          {t('stats.plannedVsActual')}
        </h3>

        {data.categoryStats.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t('stats.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.categoryStats.map((stat) => (
              <CategoryBar
                key={stat.categoryId}
                stat={stat}
                color={catMap.get(stat.categoryId)?.color ?? '#94a3b8'}
                name={catMap.get(stat.categoryId)?.name ?? t('category.uncategorized')}
              />
            ))}
          </ul>
        )}

        {settings.autoCompletePastOccurrences && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            {t('stats.autoCompleteCaveat')}
          </p>
        )}
      </section>

      {/* ── Giờ theo thứ ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800">{t('stats.byWeekday')}</h3>
        <WeekdayChart hours={data.hoursPerWeekday} weekStartsOn={settings.weekStartsOn} />
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

const STATUSES: OccurrenceStatus[] = ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const STATUS_KEY: Record<OccurrenceStatus, string> = {
  SCHEDULED: 'occurrence.scheduled',
  COMPLETED: 'occurrence.completed',
  CANCELLED: 'occurrence.cancelled',
  NO_SHOW: 'occurrence.noShow',
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Một hàng chip bật/tắt. Dùng lại cho danh mục, đối tượng và trạng thái. */
function Chips({
  title,
  items,
  selected,
  onToggle,
}: {
  /**
   * Nhãn của hàng.
   *
   * Ba hàng chip xếp chồng nhau mà không có nhãn thì không đọc ra được hàng nào
   * lọc theo gì — nhất là hàng Đối tượng, vì nội dung của nó là tên do người
   * dùng tự gõ nên trông y hệt dữ liệu bình thường.
   */
  title: string;
  items: Array<{ value: string; label: string; color?: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs text-slate-400">{title}</span>
      {items.map((item) => {
        const on = selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onToggle(item.value)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
              on
                ? 'bg-primary text-primary-fg'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.color && <ColorDot color={item.color} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

function IncomeChart({
  income,
  hoursPerMonth,
}: {
  income: MonthIncome[];
  hoursPerMonth: Map<string, number>;
}) {
  const { t } = useTranslation();
  // Chia cho 0 khi mọi tháng đều bằng 0 — kẹp mẫu số ở 1.
  const max = Math.max(1, ...income.map((m) => m.net));

  return (
    <div className="mt-3">
      <div className="flex items-end gap-1.5">
        {income.map((m) => {
          const hours = hoursPerMonth.get(m.month) ?? 0;
          return (
            <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-slate-400">
                {m.net > 0 ? compact(m.net) : ''}
              </span>
              <div
                className="w-full rounded-t bg-primary"
                style={{ height: barHeight(m.net, max, INCOME_BAR_PX) }}
                title={`${formatMoney(m.net, m.currency)} · ${formatHours(hours)} ${t('common.hours')}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {income.map((m) => (
          <span
            key={m.month}
            className="min-w-0 flex-1 truncate text-center text-[10px] tabular-nums text-slate-400"
          >
            {m.month.slice(5)}/{m.month.slice(2, 4)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryBar({
  stat,
  color,
  name,
}: {
  stat: CategoryStat;
  color: string;
  name: string;
}) {
  const { t } = useTranslation();
  const rate = completionRate(stat);
  const planned = Math.max(stat.plannedHours, 0.0001);
  const pct = (hours: number) => `${(hours / planned) * 100}%`;

  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <ColorDot color={color} />
        <span className="font-medium text-slate-800">{name}</span>
        <span className="text-xs tabular-nums text-slate-400">
          {formatHours(stat.completedHours)} / {formatHours(stat.plannedHours)}{' '}
          {t('common.hours')}
        </span>
        <span className="ml-auto text-xs font-medium tabular-nums text-slate-600">
          {rate == null ? t('payroll.notApplicable') : `${Math.round(rate * 100)}%`}
        </span>
      </div>

      {/* Một thanh, bốn đoạn. Xếp chồng thay vì bốn thanh riêng để nhìn ra
          ngay tỷ lệ giữa chúng. */}
      <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <span
          style={{ width: pct(stat.completedHours), backgroundColor: color }}
          title={t('occurrence.completed')}
        />
        <span
          className="bg-slate-300"
          style={{ width: pct(stat.scheduledHours) }}
          title={t('occurrence.scheduled')}
        />
        <span
          className="bg-red-300"
          style={{ width: pct(stat.noShowHours) }}
          title={t('occurrence.noShow')}
        />
        <span
          className="bg-slate-200"
          style={{ width: pct(stat.cancelledHours) }}
          title={t('occurrence.cancelled')}
        />
      </div>
    </li>
  );
}

function WeekdayChart({
  hours,
  weekStartsOn,
}: {
  hours: number[];
  weekStartsOn: 0 | 1;
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...hours);
  // core/stats trả về mảng theo Date.getDay(); tầng hiển thị tự xoay lại.
  const order = weekdayOrder(weekStartsOn);

  return (
    <div className="mt-3 flex items-end gap-2">
      {order.map((dow) => {
        const value = hours[dow];
        return (
          <div key={dow} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-slate-400">
              {value > 0 ? formatHours(value) : ''}
            </span>
            <div
              className="w-full rounded-t bg-slate-400"
              style={{ height: barHeight(value, max, WEEKDAY_BAR_PX) }}
              title={`${formatHours(value)} ${t('common.hours')}`}
            />
            <span className="text-[10px] text-slate-500">{t(`weekday.s${dow}`)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 2296294 → "2,3tr" — nhãn trên đầu cột phải ngắn hơn bề rộng cột */
function compact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(Math.round(amount));
}
