// ═══════════════════════════════════════════════════════════════════════════
//  components/RuleManager.tsx — danh sách mọi lịch lặp
//
//  ⚠️ ĐÂY LÀ MÀN HÌNH VÁ MỘT LỖ HỔNG THẬT, không phải tiện ích thêm cho vui.
//
//  Trước khi có nó, đường DUY NHẤT để chạm tới một RecurringRule là bấm vào
//  một buổi do nó sinh ra trên lịch. Nghĩa là:
//
//    · rule đã hết hạn (`endDate` tháng trước) → không sinh buổi nào trong
//      tuần đang xem → không sửa được, không xóa được
//    · rule dùng hết `count` → y hệt, mà lại còn không có `endDate` nên nhìn
//      vào dữ liệu cũng không thấy nó đã hết
//    · rule bắt đầu từ năm sau → phải bấm mũi tên vài chục lần mới tới
//
//  Tức là người dùng có thể tạo ra một lịch lặp rồi vĩnh viễn không quản lý
//  được nó nữa. Màn hình này liệt kê tất cả, kèm trạng thái và ngày buổi kế
//  tiếp, nên không rule nào còn lẩn được.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useClientNames } from '../hooks/useClientNames';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence, RecurringRule } from '../types';
import type { RuleStatus } from '../core/expand';
import { nextOccurrenceDate, ruleStatus } from '../core/expand';
import { todayKey } from '../core/calendar';
import { endTimeOf, hoursOf, toAbsolute } from '../core/time';
import { listRules } from '../db/repo/rules';
import { formatDate, formatHours } from '../i18n';
import { Button, ColorDot } from './ui';

const STATUS_STYLE: Record<RuleStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  upcoming: 'bg-amber-50 text-amber-800',
  ended: 'bg-slate-100 text-slate-500',
};

const STATUS_KEY: Record<RuleStatus, string> = {
  active: 'rules.statusActive',
  upcoming: 'rules.statusUpcoming',
  ended: 'rules.statusEnded',
};

export function RuleManager({
  categories,
  onEditRule,
  onDeleteRule,
  onOpenDate,
}: {
  categories: Category[];
  onEditRule: (rule: RecurringRule, sample: Occurrence) => void;
  onDeleteRule: (rule: RecurringRule) => void;
  onOpenDate: (date: string) => void;
}) {
  const { t } = useTranslation();
  const rules = useLiveQuery(() => listRules(), []);
  const clientNames = useClientNames();
  const [showEnded, setShowEnded] = useState(false);
  const today = todayKey();

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const rows = useMemo(() => {
    if (!rules) return [];
    return rules
      .map((rule) => ({
        rule,
        status: ruleStatus(rule, today),
        next: nextOccurrenceDate(rule, today),
      }))
      // Đang chạy lên trước, rồi sắp tới, rồi đã kết thúc.
      .sort((a, b) => {
        const order: Record<RuleStatus, number> = { active: 0, upcoming: 1, ended: 2 };
        return (
          order[a.status] - order[b.status] ||
          (a.next ?? '9999').localeCompare(b.next ?? '9999') ||
          a.rule.title.localeCompare(b.rule.title)
        );
      });
  }, [rules, today]);

  const visible = showEnded ? rows : rows.filter((r) => r.status !== 'ended');
  const endedCount = rows.filter((r) => r.status === 'ended').length;

  if (!rules) {
    return <p className="text-sm text-slate-400">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t('rules.title')}</h2>
          <p className="text-xs text-slate-500">{t('rules.hint')}</p>
        </div>
        {endedCount > 0 && (
          <Button variant="outline" onClick={() => setShowEnded((v) => !v)}>
            {showEnded ? t('rules.hideEnded') : t('rules.showEnded', { n: endedCount })}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          {t('rules.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {visible.map(({ rule, status, next }) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <ColorDot color={catMap.get(rule.categoryId)?.color ?? '#94a3b8'} />
              <span className="font-medium text-slate-800">{rule.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[status]}`}>
                {t(STATUS_KEY[status])}
              </span>

              <RuleSummary rule={rule} />

              {next ? (
                <button
                  type="button"
                  onClick={() => onOpenDate(next)}
                  className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline"
                  title={t('rules.openNext')}
                >
                  {t('rules.next', { date: formatDate(next) })}
                </button>
              ) : (
                <span className="text-xs text-slate-400">{t('rules.noNext')}</span>
              )}

              <span className="ml-auto flex gap-1">
                <Button variant="ghost" onClick={() => onEditRule(rule, sampleOf(rule, clientNames))}>
                  {t('common.edit')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onDeleteRule(rule)}
                  className="text-red-600 hover:bg-red-50"
                >
                  {t('common.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * Buổi ĐẠI DIỆN, dựng ra chỉ để EventDialog có chỗ đọc.
 *
 * Form được thiết kế quanh một Occurrence chứ không phải quanh rule, vì trên
 * lịch người dùng luôn bấm vào một buổi cụ thể. Ở đây neo vào `startDate` —
 * buổi đầu tiên của chuỗi — và mở form với phạm vi mặc định là CẢ CHUỖI, nên
 * ngày cụ thể không ảnh hưởng gì tới kết quả.
 */
function sampleOf(rule: RecurringRule, clientNames: Map<string, string>): Occurrence {
  const startAbs = toAbsolute(rule.startDate, rule.startTime);
  return {
    key: `rule:${rule.id}:${rule.startDate}`,
    sourceType: 'RULE',
    sourceId: rule.id,
    ruleOriginalDate: rule.startDate,
    title: rule.title,
    categoryId: rule.categoryId,
    date: rule.startDate,
    startTime: rule.startTime,
    durationMinutes: rule.durationMinutes,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + rule.durationMinutes * 60_000,
    status: 'SCHEDULED',
    ratePerHour: rule.ratePerHour,
    fixedAmount: rule.fixedAmount,
    location: rule.location,
    clientName: rule.clientId ? clientNames.get(rule.clientId) : undefined,
    clientId: rule.clientId,
    notes: rule.notes,
    hasConflict: false,
    conflictWith: [],
  };
}

/**
 * Câu mô tả quy tắc lặp, ghép từ các mảnh i18n đã có.
 *
 * Viết thành component riêng thay vì hàm nhận `t` làm tham số: kiểu TFunction
 * của i18next có nhiều overload, truyền nó xuyên qua ranh giới hàm rất dễ
 * sinh lỗi kiểu mà chẳng được gì.
 */
function RuleSummary({ rule }: { rule: RecurringRule }) {
  const { t } = useTranslation();
  const every = rule.interval > 1 ? `${rule.interval} ` : '';

  let recurrence: string;
  if (rule.freq === 'DAILY') {
    recurrence = t('rules.everyDay', { every });
  } else if (rule.freq === 'MONTHLY') {
    recurrence = t('rules.everyMonth', { every, day: rule.dayOfMonth ?? '?' });
  } else {
    const days = (rule.daysOfWeek ?? [])
      .slice()
      // Thứ Hai trước, Chủ nhật cuối — khớp thói quen đọc lịch, không theo
      // thứ tự thô của Date.getDay() vốn để Chủ nhật lên đầu.
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map((d) => t(`weekday.s${d}`))
      .join(', ');
    recurrence = t('rules.everyWeek', { every, days: days || '—' });
  }

  return (
    <span className="w-full text-xs text-slate-500 sm:w-auto">
      {recurrence} · {rule.startTime}–{endTimeOf(rule.startTime, rule.durationMinutes)} ·{' '}
      {formatHours(hoursOf(rule.durationMinutes))} {t('common.hours')}
      {rule.endDate && ` · ${t('rules.until', { date: formatDate(rule.endDate) })}`}
      {rule.count != null && ` · ${t('rules.countLimit', { n: rule.count })}`}
    </span>
  );
}
