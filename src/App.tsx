// ═══════════════════════════════════════════════════════════════════════════
//  App.tsx — vỏ ứng dụng Phase 1
//
//  Giữ đúng ba thứ trạng thái: đang xem gì, đang neo vào ngày nào, và đang
//  mở hộp thoại nào. Mọi thứ khác đọc từ DB qua useLiveQuery, nên sửa dữ liệu
//  ở bất kỳ đâu là màn hình tự cập nhật — không cần refresh thủ công.
//
//  Cửa sổ truy vấn của Month View là CẢ LƯỚI (kể cả ngày đệm của tháng trước
//  / tháng sau), không phải chỉ trong tháng. Lấy đúng tháng thì hàng đầu và
//  hàng cuối sẽ trống trơn dù thực tế có lịch.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import type { DialogTarget, SubmitPayload } from './components/EventDialog';
import type { Occurrence, OccurrenceStatus, RecurringRule } from './types';
import { addMonths, monthGridDates, todayKey, weekDates } from './core/calendar';
import { resolveSalaryRule } from './core/income';
import { addDays, monthOf } from './core/time';
import { CategoryManager } from './components/CategoryManager';
import { EventDialog } from './components/EventDialog';
import { MonthView } from './components/MonthView';
import { OccurrenceDetail } from './components/OccurrenceDetail';
import { WeekView } from './components/WeekView';
import { Button } from './components/ui';
import { listSalaryRules } from './db/repo/salary';
import { getRule } from './db/repo/rules';
import { getEvent } from './db/repo/events';
import { categoryMap, useCategories, useSchedule } from './hooks/useSchedule';
import { useSettings } from './hooks/useSettings';
import { formatDayMonth, formatMonthLabel } from './i18n';
import { applySubmit, deleteSeries, removeOccurrence, setStatus } from './actions/schedule';
import { useUndo } from './undo/UndoProvider';

type View = 'week' | 'month' | 'categories';

export default function App() {
  const { t } = useTranslation();
  const { pushUndo } = useUndo();
  const settings = useSettings();

  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(() => todayKey());
  const [month, setMonth] = useState<string>(() => monthOf(todayKey()));
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const categories = useCategories();
  const catMap = useMemo(() => categoryMap(categories), [categories]);
  const salaryRules = useLiveQuery(() => listSalaryRules(), []);

  const weekGrid = useMemo(
    () => weekDates(anchor, settings.weekStartsOn),
    [anchor, settings.weekStartsOn],
  );
  const monthGrid = useMemo(
    () => monthGridDates(month, settings.weekStartsOn),
    [month, settings.weekStartsOn],
  );

  const grid = view === 'month' ? monthGrid : weekGrid;
  const windowStart = grid[0] ?? anchor;
  const windowEnd = grid[grid.length - 1] ?? anchor;

  const occurrences = useSchedule(windowStart, windowEnd);
  const selected = occurrences?.find((o) => o.key === selectedKey) ?? null;

  // ── Điều hướng ──────────────────────────────────────────────────────────

  const step = (delta: number) => {
    if (view === 'month') setMonth((m) => addMonths(m, delta));
    else setAnchor((a) => addDays(a, delta * 7));
  };

  const goToday = () => {
    const today = todayKey();
    setAnchor(today);
    setMonth(monthOf(today));
  };

  const openDay = (date: string) => {
    setAnchor(date);
    setView('week');
  };

  const rangeLabel =
    view === 'month'
      ? formatMonthLabel(month)
      : `${formatDayMonth(weekGrid[0])} – ${formatDayMonth(weekGrid[6])}`;

  // ── Thao tác ────────────────────────────────────────────────────────────

  /**
   * Mở form sửa. Buổi sinh từ rule cần chính bản ghi rule để hiện đúng phần
   * lặp — Occurrence chỉ là bản đã materialize, nó không mang freq/interval.
   */
  const openEdit = async (o: Occurrence) => {
    setSelectedKey(null); // đóng bảng chi tiết, tránh hai lớp modal chồng nhau
    if (o.sourceType === 'SINGLE') {
      const event = await getEvent(o.sourceId);
      if (event) setDialog({ kind: 'event', event });
      return;
    }
    const rule: RecurringRule | undefined = await getRule(o.sourceId);
    if (rule) setDialog({ kind: 'rule', rule, occurrence: o });
    // Buổi loại ADD không gắn rule nào: dựng một rule giả chỉ để form có chỗ
    // đọc, phần lặp sẽ bị khóa vì phạm vi mặc định là "chỉ buổi này".
    else if (o.exceptionId) {
      setDialog({
        kind: 'rule',
        occurrence: o,
        rule: {
          id: o.sourceId,
          createdAt: '',
          updatedAt: '',
          title: o.title,
          categoryId: o.categoryId,
          freq: 'WEEKLY',
          interval: 1,
          startDate: o.date,
          startTime: o.startTime,
          durationMinutes: o.durationMinutes,
        },
      });
    }
  };

  const submit = async (payload: SubmitPayload) => {
    if (!dialog) return;
    await applySubmit(payload, dialog);
    setDialog(null);
    setSelectedKey(null);
  };

  const handleRemove = async (o: Occurrence) => {
    setSelectedKey(null);
    const { messageKey, undo } = await removeOccurrence(o);
    pushUndo(t(messageKey, { title: o.title }), undo);
  };

  const handleDeleteSeries = async (o: Occurrence) => {
    setSelectedKey(null);
    const { messageKey, undo } = await deleteSeries(o.sourceId);
    pushUndo(t(messageKey, { title: o.title }), undo);
  };

  const handleStatus = async (o: Occurrence, status: OccurrenceStatus) => {
    await setStatus(o, status);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const ready = categories != null && occurrences != null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{t('app.name')}</h1>

          <nav className="flex gap-1 rounded-lg bg-slate-200/60 p-1">
            {(['week', 'month', 'categories'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                  view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t(`nav.${v}`)}
              </button>
            ))}
          </nav>

          {view !== 'categories' && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => step(-1)} aria-label={t('nav.previous')}>
                ‹
              </Button>
              <Button variant="outline" onClick={goToday}>
                {t('nav.today')}
              </Button>
              <Button variant="ghost" onClick={() => step(1)} aria-label={t('nav.next')}>
                ›
              </Button>
              <span className="ml-2 text-sm font-medium capitalize text-slate-600">
                {rangeLabel}
              </span>
            </div>
          )}

          {view !== 'categories' && (
            <Button
              variant="primary"
              className="ml-auto"
              // Ở lịch tháng, `anchor` vẫn nằm ở tuần đang xem chứ không theo
              // tháng đang lật, nên phải lấy ngày đầu tháng đang hiển thị.
              onClick={() =>
                setDialog({
                  kind: 'create',
                  date: view === 'month' ? `${month}-01` : anchor,
                  startTime: '08:00',
                })
              }
            >
              + {t('event.add')}
            </Button>
          )}
        </header>

        {!ready || !categories || !occurrences ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
            {t('common.loading')}
          </p>
        ) : view === 'categories' ? (
          <CategoryManager categories={categories} />
        ) : view === 'week' ? (
          <WeekView
            dates={weekGrid}
            occurrences={occurrences}
            categories={catMap}
            onPick={(o) => setSelectedKey(o.key)}
            onCreateAt={(date, startTime) => setDialog({ kind: 'create', date, startTime })}
          />
        ) : (
          <MonthView
            month={month}
            dates={monthGrid}
            occurrences={occurrences}
            categories={catMap}
            weekStartsOn={settings.weekStartsOn}
            onPick={(o) => setSelectedKey(o.key)}
            onOpenDay={openDay}
          />
        )}

        {ready && view !== 'categories' && occurrences?.length === 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">{t('week.empty')}</p>
        )}
      </div>

      {selected && (
        <OccurrenceDetail
          occurrence={selected}
          category={catMap.get(selected.categoryId)}
          salaryRule={resolveSalaryRule(
            salaryRules ?? [],
            selected.categoryId,
            monthOf(selected.date),
          )}
          conflicts={(occurrences ?? []).filter((o) =>
            selected.conflictWith.includes(o.key),
          )}
          onClose={() => setSelectedKey(null)}
          onEdit={() => void openEdit(selected)}
          onSetStatus={(s) => void handleStatus(selected, s)}
          onRemoveOccurrence={() => void handleRemove(selected)}
          onDeleteSeries={() => void handleDeleteSeries(selected)}
        />
      )}

      {dialog && categories && (
        <EventDialog
          target={dialog}
          categories={categories}
          onSubmit={submit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
