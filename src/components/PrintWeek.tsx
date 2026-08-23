// ═══════════════════════════════════════════════════════════════════════════
//  components/PrintWeek.tsx — bản in / lưu PDF của lịch tuần
//
//  CHỈ hiện khi in (`hidden print:block`). Trên màn hình vẫn là lưới giờ.
//
//  ⚠️ VÌ SAO KHÔNG IN THẲNG LƯỚI GIỜ.
//
//  Lưới trải 06:00–23:00, tức 17 tiếng × 56px = 952px. A4 ngang trừ lề chỉ
//  còn khoảng 718px chiều cao, nên nó luôn tràn sang tờ thứ hai. Thu nhỏ cho
//  vừa thì mỗi giờ còn 35px: một buổi 1 tiếng cao 35px, mà riêng hai dòng
//  chữ tiêu đề và giờ đã cần 26px — vừa giấy nhưng không đọc được.
//
//  Bản in bỏ trục thời gian tuyến tính, đổi lấy bảy cột ngày với các buổi xếp
//  theo giờ. Cột chỉ dài ra khi có thêm buổi, không dài ra theo số giờ trống,
//  nên một tuần bình thường luôn gọn trong một trang.
//
//  Trên giấy, đọc được quan trọng hơn đo được.
//
//  ⚠️ VỀ DÒNG THU NHẬP TRONG SUMMARY.
//
//  Đây là TẦNG 1 (core/income.ts), cộng dồn theo tuần. Với công việc trả
//  khoán tháng, Tầng 1 trả về `null` và KHÔNG được cộng vào — 8 triệu một
//  tháng không chia đều được cho từng tuần. Những buổi đó bị loại khỏi tổng
//  và bản in nói rõ điều đó thay vì âm thầm báo thiếu.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Occurrence, SalaryRule } from '../types';
import { todayKey } from '../core/calendar';
import { calcOccurrenceIncome, resolveSalaryRule } from '../core/income';
import { PRINT_BANDS, groupByBand } from '../core/layout';
import { statsByCategory, totalStat } from '../core/stats';
import { dayOfWeek, endTimeOf, monthOf } from '../core/time';
import { formatDate, formatDayMonth, formatHours, formatMoney } from '../i18n';
import { tint } from './color';

export function PrintWeek({
  dates,
  occurrences,
  categories,
  salaryRules,
}: {
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  salaryRules: SalaryRule[];
}) {
  const { t } = useTranslation();

  // Buổi đã hủy không lên giấy: bản in là thứ mang theo để làm việc, không
  // phải nhật ký.
  const visible = useMemo(
    () => occurrences.filter((o) => o.status !== 'CANCELLED'),
    [occurrences],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of visible) {
      const list = map.get(o.date);
      if (list) list.push(o);
      else map.set(o.date, [o]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startAbs - b.startAbs);
    return map;
  }, [visible]);

  const summary = useMemo(() => {
    const total = totalStat(statsByCategory(visible));

    let income = 0;
    let hasFixedMonthly = false;
    for (const o of visible) {
      const value = calcOccurrenceIncome(
        o,
        categories.get(o.categoryId),
        resolveSalaryRule(salaryRules, o.categoryId, monthOf(o.date)),
      );
      // `null` = lương khoán tháng, không quy đổi được về một tuần. Cộng vào
      // là bịa số; bỏ qua rồi im lặng là báo thiếu. Nên đánh dấu và nói ra.
      if (value == null) hasFixedMonthly = true;
      else income += value;
    }

    return { total, income, hasFixedMonthly };
  }, [visible, categories, salaryRules]);

  // Chỉ chú thích những danh mục THẬT SỰ có mặt trong tuần này.
  const usedCategories = useMemo(() => {
    const ids = new Set(visible.map((o) => o.categoryId));
    return [...ids].map((id) => categories.get(id)).filter((c): c is Category => !!c);
  }, [visible, categories]);

  return (
    <div className="hidden print:block">
      <header className="mb-2 flex items-baseline justify-between border-b-2 border-slate-800 pb-1.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('app.name')}</h1>
          <p className="text-[11px] text-slate-600">
            {formatDate(dates[0])} — {formatDate(dates[6])}
          </p>
        </div>
        <p className="text-[9px] text-slate-500">
          {t('print.exportedOn', { date: formatDate(todayKey()) })}
        </p>
      </header>

      <table className="w-full table-fixed border-collapse text-[9px]">
        <thead>
          <tr>
            {dates.map((d) => (
              <th
                key={d}
                className="border border-slate-300 bg-slate-100 px-1 py-1 text-center"
              >
                <span className="block font-bold text-slate-800">
                  {t(`weekday.s${dayOfWeek(d)}`)}
                </span>
                <span className="block font-normal tabular-nums text-slate-500">
                  {formatDayMonth(d)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {dates.map((d) => {
              const list = byDate.get(d) ?? [];
              return (
                <td
                  key={d}
                  className="border border-slate-300 p-1 align-top"
                  style={{ height: '1px' }}
                >
                  {list.length === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    // Chia Sáng/Chiều/Tối. Một ngày bốn ca liền nhau in ra
                    // thành cột chữ dài không có mốc nào để mắt bám vào; nhãn
                    // buổi trả lại cấu trúc mà bố cục in đã bỏ trục thời gian.
                    groupByBand(list).map((group, i) =>
                      group.length === 0 ? null : (
                        <div key={PRINT_BANDS[i].key} className="mb-1.5 last:mb-0">
                          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                            {t(PRINT_BANDS[i].key)}
                          </p>
                          <ul className="space-y-1">
                            {group.map((o) => (
                              <PrintEvent
                                key={o.key}
                                occurrence={o}
                                category={categories.get(o.categoryId)}
                              />
                            ))}
                          </ul>
                        </div>
                      ),
                    )
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      <footer className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-300 pt-1.5 text-[9px]">
        <span className="font-semibold text-slate-800">{t('print.summary')}</span>

        <span className="text-slate-700">
          {t('print.plannedHours')}:{' '}
          <strong className="tabular-nums">
            {formatHours(summary.total.plannedHours)}
          </strong>
        </span>

        <span className="text-slate-700">
          {t('print.completedHours')}:{' '}
          <strong className="tabular-nums">
            {formatHours(summary.total.completedHours)}
          </strong>
        </span>

        {summary.income > 0 && (
          <span className="text-slate-700">
            {t('print.estimatedIncome')}:{' '}
            <strong className="tabular-nums">{formatMoney(summary.income)}</strong>
            {summary.hasFixedMonthly && (
              <em className="ml-1 not-italic text-slate-500">
                ({t('print.fixedMonthlyExcluded')})
              </em>
            )}
          </span>
        )}

        {usedCategories.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {usedCategories.map((c) => (
              <span key={c.id} className="flex items-center gap-1 text-slate-600">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </span>
            ))}
          </span>
        )}
      </footer>
    </div>
  );
}

function PrintEvent({
  occurrence: o,
  category,
}: {
  occurrence: Occurrence;
  category: Category | undefined;
}) {
  const color = category?.color ?? '#94a3b8';

  return (
    <li
      // `break-inside: avoid` để một buổi không bị cắt đôi giữa hai trang khi
      // tuần quá dày và bảng buộc phải tràn sang tờ thứ hai.
      className="overflow-hidden rounded border-l-2 px-1 py-0.5 leading-tight [break-inside:avoid]"
      style={{ backgroundColor: tint(color, '26'), borderLeftColor: color }}
    >
      <span className="block tabular-nums font-semibold text-slate-900">
        {o.startTime}–{endTimeOf(o.startTime, o.durationMinutes)}
      </span>
      {/* `break-words` chặn tiêu đề dài tràn ra khỏi ô — cột chỉ rộng
          khoảng 38mm trên giấy A4 ngang. */}
      <span className="block break-words font-medium text-slate-800">{o.title}</span>
      {category && <span className="block text-slate-500">{category.name}</span>}
      {o.location && <span className="block break-words text-slate-500">{o.location}</span>}
      {/* Đánh dấu trạng thái bằng ký hiệu chứ không bằng màu: bản in có thể
          ra máy in đen trắng, và lúc đó màu là thông tin bị mất. */}
      {o.status === 'COMPLETED' && <span className="text-slate-500">✓</span>}
      {o.status === 'NO_SHOW' && <span className="text-slate-500">✗</span>}
    </li>
  );
}
