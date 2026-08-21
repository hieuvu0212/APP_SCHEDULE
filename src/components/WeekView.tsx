// ═══════════════════════════════════════════════════════════════════════════
//  components/WeekView.tsx — lưới giờ bảy cột
//
//  Định vị tuyệt đối theo phút: top = (startTime − đầu khung) × px/phút.
//  Việc xếp cột khi trùng giờ nằm ở core/layout.ts, không nằm ở đây.
//
//  Ca qua đêm được vẽ cắt ở đáy cột kèm dấu ↧. KHÔNG vẽ tiếp sang cột ngày
//  hôm sau: sự kiện thuộc về ngày bắt đầu, vẽ ở hai chỗ sẽ khiến người dùng
//  tưởng có hai buổi.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence } from '../types';
import { layoutDay, visibleHourRange } from '../core/layout';
import { dayOfWeek, endTimeOf, toHHMM, toMinutes } from '../core/time';
import { todayKey } from '../core/calendar';
import { tint } from './color';

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
/** Bấm vào chỗ trống thì làm tròn xuống bội số này */
const SNAP_MINUTES = 30;

export interface WeekViewProps {
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  onPick: (occurrence: Occurrence) => void;
  onCreateAt: (date: string, startTime: string) => void;
}

export function WeekView({
  dates,
  occurrences,
  categories,
  onPick,
  onCreateAt,
}: WeekViewProps) {
  const { t } = useTranslation();
  const today = todayKey();

  const { startHour, endHour } = useMemo(
    () => visibleHourRange(occurrences),
    [occurrences],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDay>>();
    for (const d of dates) {
      map.set(d, layoutDay(occurrences.filter((o) => o.date === d)));
    }
    return map;
  }, [dates, occurrences]);

  const gridHeight = (endHour - startHour) * HOUR_PX;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const nowMinutes = useNowMinutes();
  const todayIndex = dates.indexOf(today);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Hàng tiêu đề — dính khi cuộn dọc */}
      <div
        className="grid border-b border-slate-200 bg-slate-50"
        style={{ gridTemplateColumns: `3.5rem repeat(7, minmax(0, 1fr))` }}
      >
        <div />
        {dates.map((d) => {
          const isToday = d === today;
          return (
            <div
              key={d}
              className={`border-l border-slate-200 px-2 py-2 text-center ${isToday ? 'bg-amber-50' : ''}`}
            >
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {t(`weekday.s${dayOfWeek(d)}`)}
              </div>
              <div
                className={`text-sm font-semibold tabular-nums ${isToday ? 'text-amber-700' : 'text-slate-800'}`}
              >
                {Number(d.slice(8))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `3.5rem repeat(7, minmax(0, 1fr))`, height: gridHeight }}
        >
          {/* Cột nhãn giờ */}
          <div className="relative">
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {dates.map((d) => (
            <DayColumn
              key={d}
              date={d}
              isToday={d === today}
              hours={hours}
              startHour={startHour}
              positioned={byDate.get(d) ?? []}
              categories={categories}
              onPick={onPick}
              onCreateAt={onCreateAt}
            />
          ))}

          {/* Vạch "bây giờ" — chỉ vẽ khi hôm nay nằm trong tuần đang xem */}
          {todayIndex >= 0 &&
            nowMinutes >= startHour * 60 &&
            nowMinutes <= endHour * 60 && (
              <div
                className="pointer-events-none absolute z-20 h-px bg-red-500"
                style={{
                  top: (nowMinutes - startHour * 60) * PX_PER_MIN,
                  left: `calc(3.5rem + (100% - 3.5rem) * ${todayIndex} / 7)`,
                  width: `calc((100% - 3.5rem) / 7)`,
                }}
              >
                <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-red-500" />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function DayColumn({
  date,
  isToday,
  hours,
  startHour,
  positioned,
  categories,
  onPick,
  onCreateAt,
}: {
  date: string;
  isToday: boolean;
  hours: number[];
  startHour: number;
  positioned: ReturnType<typeof layoutDay>;
  categories: Map<string, Category>;
  onPick: (o: Occurrence) => void;
  onCreateAt: (date: string, startTime: string) => void;
}) {
  const { t } = useTranslation();

  // Chỉ nhận cú bấm rơi vào NỀN cột. Khối sự kiện là con của thẻ này nên
  // e.target sẽ khác e.currentTarget khi bấm trúng khối.
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = startHour * 60 + (e.clientY - rect.top) / PX_PER_MIN;
    const snapped = Math.floor(raw / SNAP_MINUTES) * SNAP_MINUTES;
    onCreateAt(date, toHHMM(Math.max(0, Math.min(1440 - SNAP_MINUTES, snapped))));
  };

  return (
    <div
      onClick={handleClick}
      className={`relative border-l border-slate-200 ${isToday ? 'bg-amber-50/40' : ''}`}
      title={t('week.clickToAdd')}
    >
      {hours.map((h, i) => (
        <div
          key={h}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
          style={{ top: i * HOUR_PX }}
        />
      ))}

      {positioned.map((p) => (
        <OccurrenceBlock
          key={p.occurrence.key}
          positioned={p}
          startHour={startHour}
          category={categories.get(p.occurrence.categoryId)}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function OccurrenceBlock({
  positioned,
  startHour,
  category,
  onPick,
}: {
  positioned: ReturnType<typeof layoutDay>[number];
  startHour: number;
  category: Category | undefined;
  onPick: (o: Occurrence) => void;
}) {
  const { t } = useTranslation();
  const { occurrence: o, topMin, heightMin, col, cols, clipped } = positioned;
  const color = category?.color ?? '#94a3b8';
  const cancelled = o.status === 'CANCELLED';
  const noShow = o.status === 'NO_SHOW';
  const done = o.status === 'COMPLETED';

  const width = `calc((100% - 4px) / ${cols})`;
  const left = `calc(2px + (100% - 4px) * ${col} / ${cols})`;

  return (
    <button
      type="button"
      onClick={() => onPick(o)}
      style={{
        top: (topMin - startHour * 60) * PX_PER_MIN,
        height: heightMin * PX_PER_MIN - 2,
        left,
        width,
        backgroundColor: cancelled ? '#f8fafc' : tint(color),
        borderLeftColor: color,
      }}
      className={`absolute z-10 overflow-hidden rounded-md border border-slate-200/70 border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight transition hover:z-30 hover:shadow-md ${
        cancelled ? 'opacity-50' : ''
      } ${done ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start gap-1">
        {o.hasConflict && !cancelled && (
          <span className="shrink-0 text-red-500" title={t('occurrence.conflict')}>
            ⚠
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate font-semibold text-slate-800 ${
            cancelled || noShow ? 'line-through' : ''
          }`}
        >
          {o.title}
        </span>
      </div>
      {heightMin >= 35 && (
        <div className="truncate tabular-nums text-slate-500">
          {o.startTime}–{endTimeOf(o.startTime, o.durationMinutes)}
          {clipped && <span title={t('occurrence.endsNextDay')}> ↧</span>}
        </div>
      )}
      {heightMin >= 60 && o.clientName && (
        <div className="truncate text-slate-500">{o.clientName}</div>
      )}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/** Số phút kể từ 00:00, cập nhật mỗi phút. Chỉ dùng cho vạch "bây giờ". */
function useNowMinutes(): number {
  const [minutes, setMinutes] = useState(() => currentMinutes());
  useEffect(() => {
    const timer = setInterval(() => setMinutes(currentMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return minutes;
}

function currentMinutes(): number {
  const d = new Date();
  return toMinutes(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}
