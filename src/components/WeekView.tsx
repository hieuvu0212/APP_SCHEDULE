// ═══════════════════════════════════════════════════════════════════════════
//  components/WeekView.tsx — lưới giờ bảy cột, có kéo–thả
//
//  Định vị tuyệt đối theo phút: top = (startTime − đầu khung) × px/phút.
//  Việc xếp cột khi trùng giờ nằm ở core/layout.ts, không nằm ở đây.
//
//  Ca qua đêm được vẽ cắt ở đáy cột kèm dấu ↧. KHÔNG vẽ tiếp sang cột ngày
//  hôm sau: sự kiện thuộc về ngày bắt đầu, vẽ ở hai chỗ sẽ khiến người dùng
//  tưởng có hai buổi.
//
//  ⚠️ VỀ KÉO–THẢ:
//  Dùng Pointer Events chứ không dùng HTML5 drag-and-drop. HTML5 DnD không
//  cho biết vị trí con trỏ đủ mượt để bám lưới 15 phút, và ảnh kéo mặc định
//  của trình duyệt thì không tài nào tắt sạch trên mọi nền tảng.
//
//  Kéo chỉ KÍCH HOẠT sau khi con trỏ đi quá ngưỡng vài pixel. Không có ngưỡng
//  này thì mọi cú bấm run tay đều biến thành một lần dời buổi.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence } from '../types';
import { layoutDay, visibleHourRange, type PositionedOccurrence } from '../core/layout';
import { dayOfWeek, endTimeOf, toHHMM, toMinutes } from '../core/time';
import { todayKey } from '../core/calendar';
import { tint } from './color';

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
const GUTTER_PX = 56;
/** Bấm vào chỗ trống thì làm tròn xuống bội số này */
const SNAP_CREATE = 30;
/** Kéo thì bám lưới mịn hơn */
const SNAP_DRAG = 15;
/** Đi quá bao nhiêu pixel thì mới tính là kéo chứ không phải bấm */
const DRAG_THRESHOLD_PX = 4;
const MIN_DURATION = 15;

type DragMode = 'move' | 'resize';

interface DragState {
  occurrence: Occurrence;
  mode: DragMode;
  startX: number;
  startY: number;
  originStartMin: number;
  originDuration: number;
  /** Đã vượt ngưỡng chưa — chưa vượt thì pointerup được hiểu là một cú bấm */
  active: boolean;
  previewDate: string;
  previewStartMin: number;
  previewDuration: number;
}

export interface WeekViewProps {
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  showConflicts: boolean;
  onPick: (occurrence: Occurrence) => void;
  onCreateAt: (date: string, startTime: string) => void;
  onMove: (occurrence: Occurrence, date: string, startTime: string) => void;
  onResize: (occurrence: Occurrence, durationMinutes: number) => void;
}

export function WeekView({
  dates,
  occurrences,
  categories,
  showConflicts,
  onPick,
  onCreateAt,
  onMove,
  onResize,
}: WeekViewProps) {
  const { t } = useTranslation();
  const today = todayKey();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const { startHour, endHour } = useMemo(
    () => visibleHourRange(occurrences),
    [occurrences],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, PositionedOccurrence[]>();
    for (const d of dates) {
      map.set(d, layoutDay(occurrences.filter((o) => o.date === d)));
    }
    return map;
  }, [dates, occurrences]);

  const gridHeight = (endHour - startHour) * HOUR_PX;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const nowMinutes = useNowMinutes();
  const todayIndex = dates.indexOf(today);

  // Escape bỏ dở thao tác kéo. Không có đường thoát này thì người dùng lỡ tay
  // kéo một khối đi rồi chỉ còn cách thả bừa xuống đâu đó rồi bấm Hoàn tác.
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragging]);

  // ── Kéo–thả ─────────────────────────────────────────────────────────────

  const beginDrag = (
    e: ReactPointerEvent<HTMLElement>,
    occurrence: Occurrence,
    mode: DragMode,
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      occurrence,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      originStartMin: toMinutes(occurrence.startTime),
      originDuration: occurrence.durationMinutes,
      active: false,
      previewDate: occurrence.date,
      previewStartMin: toMinutes(occurrence.startTime),
      previewDuration: occurrence.durationMinutes,
    });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const active =
      drag.active || Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX;
    if (!active) return;

    const deltaMin = snap(dy / PX_PER_MIN, SNAP_DRAG);

    if (drag.mode === 'resize') {
      setDrag({
        ...drag,
        active,
        previewDuration: clamp(drag.originDuration + deltaMin, MIN_DURATION, 1440),
      });
      return;
    }

    // Cột ngày lấy theo vị trí con trỏ hiện tại, không theo độ lệch — giống
    // cách mọi ứng dụng lịch khác hành xử, và trực giác hơn khi kéo chéo.
    const rect = gridRef.current?.getBoundingClientRect();
    let previewDate = drag.previewDate;
    if (rect) {
      const colWidth = (rect.width - GUTTER_PX) / 7;
      const index = clamp(
        Math.floor((e.clientX - rect.left - GUTTER_PX) / colWidth),
        0,
        6,
      );
      previewDate = dates[index] ?? drag.previewDate;
    }

    setDrag({
      ...drag,
      active,
      previewDate,
      previewStartMin: clamp(drag.originStartMin + deltaMin, 0, 1440 - MIN_DURATION),
    });
  };

  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    // Không cần releasePointerCapture: trình duyệt tự nhả khi pointerup.

    // Chưa vượt ngưỡng → đây là một cú bấm, không phải kéo.
    if (!d.active) {
      onPick(d.occurrence);
      return;
    }

    if (d.mode === 'resize') {
      if (d.previewDuration !== d.originDuration) {
        onResize(d.occurrence, d.previewDuration);
      }
      return;
    }

    const changed =
      d.previewDate !== d.occurrence.date || d.previewStartMin !== d.originStartMin;
    if (changed) {
      onMove(d.occurrence, d.previewDate, toHHMM(d.previewStartMin));
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        className="grid border-b border-slate-200 bg-slate-50"
        style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(7, minmax(0, 1fr))` }}
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

      {/* Khi in phải bỏ giới hạn chiều cao, nếu không bản in chỉ ra đúng phần
          đang nhìn thấy trên màn hình và cắt cụt phần còn lại của ngày. */}
      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto print:max-h-none print:overflow-visible">
        <div
          ref={gridRef}
          className={`relative grid ${drag?.active ? 'select-none' : ''}`}
          style={{
            gridTemplateColumns: `${GUTTER_PX}px repeat(7, minmax(0, 1fr))`,
            height: gridHeight,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={() => setDrag(null)}
        >
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
              showConflicts={showConflicts}
              drag={drag}
              onBeginDrag={beginDrag}
              onCreateAt={onCreateAt}
              onPick={onPick}
            />
          ))}

          {todayIndex >= 0 && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
            <div
              className="pointer-events-none absolute z-20 h-px bg-red-500"
              style={{
                top: (nowMinutes - startHour * 60) * PX_PER_MIN,
                left: `calc(${GUTTER_PX}px + (100% - ${GUTTER_PX}px) * ${todayIndex} / 7)`,
                width: `calc((100% - ${GUTTER_PX}px) / 7)`,
              }}
            >
              <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>

      {drag?.active && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-xs tabular-nums text-slate-600">
          {toHHMM(drag.previewStartMin)}–
          {toHHMM(drag.previewStartMin + drag.previewDuration)}
          <span className="ml-2 text-slate-400">{t('week.dragHint')}</span>
        </div>
      )}
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
  showConflicts,
  drag,
  onBeginDrag,
  onCreateAt,
  onPick,
}: {
  date: string;
  isToday: boolean;
  hours: number[];
  startHour: number;
  positioned: PositionedOccurrence[];
  categories: Map<string, Category>;
  showConflicts: boolean;
  drag: DragState | null;
  onBeginDrag: (
    e: ReactPointerEvent<HTMLElement>,
    o: Occurrence,
    mode: DragMode,
  ) => void;
  onCreateAt: (date: string, startTime: string) => void;
  onPick: (o: Occurrence) => void;
}) {
  const { t } = useTranslation();

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = startHour * 60 + (e.clientY - rect.top) / PX_PER_MIN;
    const snapped = Math.floor(raw / SNAP_CREATE) * SNAP_CREATE;
    onCreateAt(date, toHHMM(clamp(snapped, 0, 1440 - SNAP_CREATE)));
  };

  // Khối đang được kéo TỚI cột này nhưng gốc nằm ở cột khác
  const incoming =
    drag?.active && drag.mode === 'move' && drag.previewDate === date ? drag : null;

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
          showConflicts={showConflicts}
          drag={drag}
          onBeginDrag={onBeginDrag}
          onPick={onPick}
        />
      ))}

      {/* Bóng xem trước khi kéo sang cột khác */}
      {incoming && incoming.occurrence.date !== date && (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed border-slate-400 bg-white/60"
          style={{
            top: (incoming.previewStartMin - startHour * 60) * PX_PER_MIN,
            height: incoming.previewDuration * PX_PER_MIN,
          }}
        />
      )}
    </div>
  );
}

function OccurrenceBlock({
  positioned,
  startHour,
  category,
  showConflicts,
  drag,
  onBeginDrag,
  onPick,
}: {
  positioned: PositionedOccurrence;
  startHour: number;
  category: Category | undefined;
  showConflicts: boolean;
  drag: DragState | null;
  onBeginDrag: (
    e: ReactPointerEvent<HTMLElement>,
    o: Occurrence,
    mode: DragMode,
  ) => void;
  onPick: (o: Occurrence) => void;
}) {
  const { t } = useTranslation();
  const { occurrence: o, topMin, heightMin, col, cols, clipped } = positioned;
  const color = category?.color ?? '#94a3b8';
  const cancelled = o.status === 'CANCELLED';
  const noShow = o.status === 'NO_SHOW';
  const done = o.status === 'COMPLETED';

  const dragging = drag?.active && drag.occurrence.key === o.key;
  const movedAway = dragging && drag.mode === 'move' && drag.previewDate !== o.date;

  // Khi đang kéo, khối bám theo con trỏ; khi không, nó nằm đúng chỗ đã tính.
  const top = dragging && drag.mode === 'move' ? drag.previewStartMin : topMin;
  const height = dragging && drag.mode === 'resize' ? drag.previewDuration : heightMin;

  const width = `calc((100% - 4px) / ${cols})`;
  const left = `calc(2px + (100% - 4px) * ${col} / ${cols})`;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onBeginDrag(e, o, 'move')}
      // Bàn phím đi đường riêng: cú bấm chuột được nhận diện ở pointerup của
      // lưới (để phân biệt với kéo), nên phím Enter không thể mượn đường đó.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(o);
        }
      }}
      style={{
        top: (top - startHour * 60) * PX_PER_MIN,
        height: height * PX_PER_MIN - 2,
        left,
        width,
        backgroundColor: cancelled ? '#f8fafc' : tint(color),
        borderLeftColor: color,
        opacity: movedAway ? 0.25 : undefined,
      }}
      className={`absolute z-10 cursor-grab touch-none overflow-hidden rounded-md border border-slate-200/70 border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:z-30 hover:shadow-md ${
        cancelled ? 'opacity-50' : ''
      } ${done ? 'opacity-80' : ''} ${dragging ? 'z-40 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-1">
        {o.hasConflict && showConflicts && !cancelled && (
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
      {height >= 35 && (
        <div className="truncate tabular-nums text-slate-500">
          {o.startTime}–{endTimeOf(o.startTime, o.durationMinutes)}
          {clipped && <span title={t('occurrence.endsNextDay')}> ↧</span>}
        </div>
      )}
      {height >= 60 && o.clientName && (
        <div className="truncate text-slate-500">{o.clientName}</div>
      )}

      {/* Tay nắm co giãn ở mép dưới. Vùng bắt cao 8px — đủ để trỏ trúng bằng
          chuột mà không nuốt mất cú bấm vào thân khối. */}
      <div
        onPointerDown={(e) => onBeginDrag(e, o, 'resize')}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
        title={t('week.resizeHint')}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snap(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

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
  return d.getHours() * 60 + d.getMinutes();
}
