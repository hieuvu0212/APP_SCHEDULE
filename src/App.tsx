// ═══════════════════════════════════════════════════════════════════════════
//  App.tsx — vỏ ứng dụng
//
//  Giữ đúng bốn thứ trạng thái: đang xem màn hình nào, neo vào ngày/tháng nào,
//  khoảng thời gian của màn hình Danh sách, và đang mở hộp thoại gì. Mọi thứ
//  khác đọc từ DB qua useLiveQuery, nên sửa dữ liệu ở bất kỳ đâu là màn hình
//  tự cập nhật.
//
//  ⚠️ Cửa sổ truy vấn phải khớp với màn hình đang mở:
//     · Tuần    → bảy ngày của lưới
//     · Tháng   → CẢ LƯỚI, kể cả ngày đệm của tháng trước/sau. Lấy đúng tháng
//                 thì hàng đầu và hàng cuối trống trơn dù thực tế có lịch.
//     · Danh sách → khoảng người dùng tự chọn
//     · Thu nhập  → màn hình đó tự nạp trọn tháng qua usePayroll
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import type { DialogTarget, EditScope, SubmitPayload } from './components/EventDialog';
import type { Occurrence, OccurrenceStatus, RecurringRule } from './types';
import { addMonths, monthGridDates, todayKey, weekDates } from './core/calendar';
import { calcOccurrenceIncome, resolveSalaryRule } from './core/income';
import { addDays, dayOfWeek, monthBounds, monthOf } from './core/time';
import { CategoryManager } from './components/CategoryManager';
import { RuleManager } from './components/RuleManager';
import { EventDialog } from './components/EventDialog';
import { ListView } from './components/ListView';
import { MonthView } from './components/MonthView';
import { OccurrenceDetail } from './components/OccurrenceDetail';
import { PayrollView } from './components/PayrollView';
import { SettingsView } from './components/SettingsView';
import { StatsView } from './components/StatsView';
import { WeekView } from './components/WeekView';
import { Button } from './components/ui';
import { listSalaryRules } from './db/repo/salary';
import { getRule } from './db/repo/rules';
import { getEvent } from './db/repo/events';
import { categoryMap, useCategories, useSchedule } from './hooks/useSchedule';
import { useReminders } from './hooks/useReminders';
import { useApplyLanguage, useApplyTheme, useSettings } from './hooks/useSettings';
import { formatDate, formatDayMonth, formatHours, formatMoney, formatMonthLabel } from './i18n';
import {
  applySubmit,
  deleteSeries,
  moveOccurrence,
  removeOccurrence,
  resizeOccurrence,
  setStatus,
} from './actions/schedule';
import { useUndo } from './undo/UndoProvider';

type View =
  | 'week'
  | 'month'
  | 'list'
  | 'payroll'
  | 'stats'
  | 'manage'
  | 'settings';

const VIEWS: View[] = ['week', 'month', 'list', 'payroll', 'stats', 'manage', 'settings'];
/** Màn hình có thanh điều hướng thời gian */
const TIME_VIEWS: View[] = ['week', 'month', 'payroll'];

export default function App() {
  const { t } = useTranslation();
  const { pushUndo } = useUndo();
  const settings = useSettings();
  useApplyTheme(settings.theme);
  useApplyLanguage(settings.language);
  useReminders();

  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(() => todayKey());
  const [month, setMonth] = useState<string>(() => monthOf(todayKey()));
  const [listRange, setListRange] = useState(() => monthBounds(monthOf(todayKey())));
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [dialogScope, setDialogScope] = useState<EditScope>('OCCURRENCE');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const [windowStart, windowEnd] = useMemo((): [string, string] => {
    if (view === 'list') return [listRange.start, listRange.end];
    if (view === 'month') return [monthGrid[0], monthGrid[monthGrid.length - 1]];
    if (view === 'payroll') {
      const b = monthBounds(month);
      return [b.start, b.end];
    }
    return [weekGrid[0], weekGrid[6]];
  }, [view, listRange, monthGrid, month, weekGrid]);

  const occurrences = useSchedule(windowStart, windowEnd);
  const selected = occurrences?.find((o) => o.key === selectedKey) ?? null;

  // ── Điều hướng ──────────────────────────────────────────────────────────

  // useCallback ở ba hàm dưới không phải để tối ưu mà để chúng KHAI BÁO ĐƯỢC
  // trong mảng phụ thuộc của effect phím tắt. Không có nó, effect hoặc phải
  // bỏ sót phụ thuộc (thao tác trên `view` cũ) hoặc phải đăng ký lại sau mỗi
  // lần render.
  const step = useCallback(
    (delta: number) => {
      if (view === 'month' || view === 'payroll') setMonth((m) => addMonths(m, delta));
      else setAnchor((a) => addDays(a, delta * 7));
    },
    [view],
  );

  const goToday = useCallback(() => {
    const today = todayKey();
    setAnchor(today);
    setMonth(monthOf(today));
  }, []);

  const openDay = (date: string) => {
    setAnchor(date);
    setView('week');
  };

  const rangeLabel =
    view === 'month' || view === 'payroll'
      ? formatMonthLabel(month)
      : `${formatDayMonth(weekGrid[0])} – ${formatDayMonth(weekGrid[6])}`;

  const openCreate = useCallback(
    () =>
      setDialog({
        kind: 'create',
        // Ở lịch tháng, `anchor` vẫn nằm ở tuần đang xem chứ không theo tháng
        // đang lật, nên phải lấy ngày đầu tháng đang hiển thị.
        date: view === 'month' ? `${month}-01` : anchor,
        startTime: '08:00',
      }),
    [view, month, anchor],
  );

  // ── Phím tắt ────────────────────────────────────────────────────────────
  //
  // Ba lớp bảo vệ, thiếu lớp nào cũng thành phiền toái:
  //   · đang mở hộp thoại → không cướp phím của form
  //   · con trỏ đang trong ô nhập → gõ chữ "n" trong tiêu đề không được mở
  //     thêm một hộp thoại nữa
  //   · có phím bổ trợ → Ctrl+N, Cmd+← là của trình duyệt, không đụng vào
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || selectedKey) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          step(-1);
          break;
        case 'ArrowRight':
          step(1);
          break;
        case 't':
        case 'T':
          goToday();
          break;
        case 'n':
        case 'N':
          if (view === 'week' || view === 'month') openCreate();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, selectedKey, view, step, goToday, openCreate]);

  // ── Thao tác ────────────────────────────────────────────────────────────

  /**
   * Mở form sửa. Buổi sinh từ rule cần chính bản ghi rule để hiện đúng phần
   * lặp — Occurrence chỉ là bản đã materialize, nó không mang freq/interval.
   */
  const openEdit = async (o: Occurrence) => {
    setSelectedKey(null); // đóng bảng chi tiết, tránh hai lớp modal chồng nhau
    setDialogScope('OCCURRENCE'); // mở từ lịch → mặc định ít phá hoại nhất
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

  const toast = (
    messageKey: string,
    params: Record<string, unknown>,
    undo: () => Promise<void>,
  ) => pushUndo(t(messageKey, params), undo);

  const submit = async (payload: SubmitPayload) => {
    if (!dialog) return;
    const { messageKey, undo } = await applySubmit(payload, dialog);
    setDialog(null);
    setSelectedKey(null);
    toast(messageKey, { title: payload.title }, undo);
  };

  const handleRemove = async (o: Occurrence) => {
    setSelectedKey(null);
    const { messageKey, undo } = await removeOccurrence(o);
    toast(messageKey, { title: o.title }, undo);
  };

  const handleDeleteSeries = async (o: Occurrence) => {
    setSelectedKey(null);
    const { messageKey, undo } = await deleteSeries(o.sourceId);
    toast(messageKey, { title: o.title }, undo);
  };

  const handleDeleteRule = async (rule: RecurringRule) => {
    const { messageKey, undo } = await deleteSeries(rule.id);
    toast(messageKey, { title: rule.title }, undo);
  };

  const handleMove = async (o: Occurrence, date: string, startTime: string) => {
    const { messageKey, undo } = await moveOccurrence(o, date, startTime);
    toast(messageKey, { title: o.title }, undo);
  };

  const handleResize = async (o: Occurrence, durationMinutes: number) => {
    const { messageKey, undo } = await resizeOccurrence(o, durationMinutes);
    toast(messageKey, { title: o.title }, undo);
  };

  /** Thu nhập TẦNG 1 của một buổi — `null` với lương khoán tháng */
  const incomeOf = (o: Occurrence): number | null =>
    calcOccurrenceIncome(
      o,
      catMap.get(o.categoryId),
      resolveSalaryRule(salaryRules ?? [], o.categoryId, monthOf(o.date)),
    );

  /**
   * Xuất PDF cho tuần đang xem.
   *
   * Mọi chuỗi được dịch Ở ĐÂY rồi truyền xuống, vì tài liệu PDF render trong
   * cây riêng của @react-pdf và không thấy Provider của i18next.
   */
  const handleExportPdf = async () => {
    if (exporting || !occurrences) return;
    setExporting(true);
    setExportError(null);
    try {
      const { exportSchedulePdf, MissingFontError, FontFormatError } = await import(
        './pdf/exportSchedulePdf'
      );
      try {
        await exportSchedulePdf({
          dates: weekGrid,
          occurrences,
          categories: catMap,
          salaryRules: salaryRules ?? [],
          labels: {
            appName: t('app.name'),
            rangeLabel: `${formatDate(weekGrid[0])} — ${formatDate(weekGrid[6])}`,
            exportedLabel: t('print.exportedOn', { date: formatDate(todayKey()) }),
            summary: t('print.summary'),
            plannedHours: t('print.plannedHours'),
            completedHours: t('print.completedHours'),
            estimatedIncome: t('print.estimatedIncome'),
            fixedMonthlyExcluded: t('print.fixedMonthlyExcluded'),
            weekdays: [0, 1, 2, 3, 4, 5, 6].map((d) => t(`weekday.s${d}`)),
          },
          format: {
            dayLabel: formatDayMonth,
            hours: (h) => `${formatHours(h)} ${t('common.hours')}`,
            money: (amount) => formatMoney(amount, settings.currency),
            dayOfWeek,
          },
        });
      } catch (e) {
        // Thiếu font nào thì chỉ đúng font đó, vì hai bộ có cách lấy khác
        // nhau: bộ Latin bắt buộc, bộ CJK chỉ cần khi lịch có chữ Hán.
        if (e instanceof MissingFontError) {
          throw new Error(
            t(e.family === 'NotoSansSC' ? 'print.cjkFontMissing' : 'print.fontMissing'),
          );
        }
        // File có ở đó nhưng không phải font. fontkit chỉ nói "Unknown font
        // format"; ở đây ta biết nó đã đọc phải cái gì nên nói ra được.
        if (e instanceof FontFormatError) {
          throw new Error(t('print.fontFormat', { url: e.url, found: e.found }));
        }
        throw e;
      }
    } catch (e) {
      setExportError(
        t('print.failed', { message: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      setExporting(false);
    }
  };

  const ready = categories != null && occurrences != null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Tiêu đề chỉ xuất hiện trên bản in — trên màn hình đã có thanh
            điều hướng, nhưng thanh đó bị ẩn lúc in nên bản in sẽ không còn
            gì cho biết đây là lịch của khoảng thời gian nào. */}
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-semibold">{t('app.name')}</h1>
          <p className="text-sm capitalize text-slate-600">{rangeLabel}</p>
        </div>

        <header className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
          <h1 className="text-lg font-semibold">{t('app.name')}</h1>

          {/* Bảy tab không vừa màn hình điện thoại. Cuộn ngang thay vì xuống
              dòng: xuống dòng làm header cao gấp đôi và đẩy cả lịch xuống. */}
          <nav className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-200/60 p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`shrink-0 rounded-md px-3 py-1 text-sm font-medium transition ${
                  view === v
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t(`nav.${v}`)}
              </button>
            ))}
          </nav>

          {TIME_VIEWS.includes(view) && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={() => step(-1)}
                aria-label={t('nav.previous')}
                title={t('shortcut.previous')}
              >
                ‹
              </Button>
              <Button variant="outline" onClick={goToday} title={t('shortcut.today')}>
                {t('nav.today')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => step(1)}
                aria-label={t('nav.next')}
                title={t('shortcut.next')}
              >
                ›
              </Button>
              <span className="ml-2 text-sm font-medium capitalize text-slate-600">
                {rangeLabel}
              </span>
            </div>
          )}

          {(view === 'week' || view === 'month') && (
            <span className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                {t('common.print')}
              </Button>
              {view === 'week' && (
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={() => void handleExportPdf()}
                >
                  {exporting ? t('print.generating') : t('print.exportPdf')}
                </Button>
              )}
              <Button variant="primary" onClick={openCreate} title={t('shortcut.new')}>
                + {t('event.add')}
              </Button>
            </span>
          )}
        </header>

        {exportError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 print:hidden">
            {exportError}
          </p>
        )}

        {!ready || !categories || !occurrences ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
            {t('common.loading')}
          </p>
        ) : view === 'manage' ? (
          <div className="space-y-8">
            <CategoryManager categories={categories} />
            <RuleManager
              categories={categories}
              onOpenDate={openDay}
              onEditRule={(rule, sample) => {
                // Mở từ đây thì ý định là sửa CẢ CHUỖI, không phải một buổi.
                setDialogScope('SERIES');
                setDialog({ kind: 'rule', rule, occurrence: sample });
              }}
              onDeleteRule={(rule) => void handleDeleteRule(rule)}
            />
          </div>
        ) : view === 'settings' ? (
          <SettingsView />
        ) : view === 'stats' ? (
          <StatsView />
        ) : view === 'payroll' ? (
          <PayrollView month={month} />
        ) : view === 'list' ? (
          <ListView
            occurrences={occurrences}
            categories={categories}
            from={listRange.start}
            to={listRange.end}
            showConflicts={settings.showConflictAlerts}
            onRangeChange={(start, end) => setListRange({ start, end })}
            onPick={(o) => setSelectedKey(o.key)}
            incomeOf={incomeOf}
          />
        ) : view === 'week' ? (
          <WeekView
            dates={weekGrid}
            occurrences={occurrences}
            categories={catMap}
            salaryRules={salaryRules ?? []}
            showConflicts={settings.showConflictAlerts}
            onPick={(o) => setSelectedKey(o.key)}
            onCreateAt={(date, startTime) => setDialog({ kind: 'create', date, startTime })}
            onMove={(o, date, startTime) => void handleMove(o, date, startTime)}
            onResize={(o, duration) => void handleResize(o, duration)}
          />
        ) : (
          <MonthView
            month={month}
            dates={monthGrid}
            occurrences={occurrences}
            categories={catMap}
            weekStartsOn={settings.weekStartsOn}
            showConflicts={settings.showConflictAlerts}
            onPick={(o) => setSelectedKey(o.key)}
            onOpenDay={openDay}
          />
        )}

        {ready && (view === 'week' || view === 'month') && occurrences?.length === 0 && (
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
          onSetStatus={(s: OccurrenceStatus) => void setStatus(selected, s)}
          onRemoveOccurrence={() => void handleRemove(selected)}
          onDeleteSeries={() => void handleDeleteSeries(selected)}
        />
      )}

      {dialog && categories && (
        <EventDialog
          target={dialog}
          categories={categories}
          defaultScope={dialogScope}
          onSubmit={submit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
