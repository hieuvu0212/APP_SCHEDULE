// ═══════════════════════════════════════════════════════════════════════════
//  pdf/model.ts — chuyển lịch tuần thành dữ liệu PHẲNG cho tài liệu PDF
//
//  HÀM THUẦN. Không import React, không import @react-pdf/renderer.
//
//  Vì sao tách ra: `@react-pdf/renderer` render trong cây riêng của nó, ngoài
//  cây React của ứng dụng. Nghĩa là nó KHÔNG thấy Provider của i18next, và
//  gọi `useTranslation()` bên trong tài liệu PDF sẽ nổ hoặc trả về khóa thô.
//
//  Nên mọi chuỗi đã dịch và mọi số đã định dạng được nạp sẵn vào mô hình này
//  ở phía ứng dụng. Component PDF chỉ còn việc vẽ, không tự tra cứu gì.
//
//  ⚠️ DÒNG THU NHẬP dùng TẦNG 1 (core/income.ts) cộng dồn theo tuần. Với công
//  việc trả khoán tháng, Tầng 1 trả về `null` và KHÔNG được cộng — 8 triệu
//  một tháng không chia đều được cho từng tuần. Những buổi đó bị loại khỏi
//  tổng, và cờ `hasFixedMonthly` để bản in nói rõ điều đó ra.
// ═══════════════════════════════════════════════════════════════════════════

import type { Category, Occurrence, SalaryRule } from '../types';
import { calcOccurrenceIncome, resolveSalaryRule } from '../core/income';
import { groupByBand } from '../core/layout';
import { statsByCategory, totalStat } from '../core/stats';
import { endTimeOf, monthOf } from '../core/time';

export interface PdfEvent {
  key: string;
  /** "08:00" — giữ riêng để gom nhóm theo buổi */
  startTime: string;
  /** "08:00–12:00" */
  time: string;
  title: string;
  categoryName: string;
  color: string;
  location?: string;
  /** "✓" đã hoàn thành · "✗" vắng mặt · rỗng nếu chưa tới */
  mark: string;
}

export interface PdfBand {
  /** Nhãn đã dịch: "Sáng" / "Chiều" / "Tối" */
  label: string;
  events: PdfEvent[];
}

export interface PdfColumn {
  date: string;
  /** "T2" / "Mon" / "一" */
  weekday: string;
  /** "17/08" */
  dayLabel: string;
  /** Danh sách phẳng, đã sắp theo giờ — dùng để đếm và dò ký tự */
  events: PdfEvent[];
  /**
   * Cùng dữ liệu với `events`, gom theo buổi Sáng/Chiều/Tối.
   *
   * Một ngày dạy bốn ca liền nhau in ra thành một cột chữ dài không có mốc
   * nào để mắt bám vào. Chia buổi cho lại cấu trúc mà trục thời gian của lưới
   * đã phải bỏ đi khi chuyển sang bố cục in.
   */
  bands: PdfBand[];
}

export interface PdfModel {
  appName: string;
  rangeLabel: string;
  exportedLabel: string;
  columns: PdfColumn[];
  summary: {
    label: string;
    plannedLabel: string;
    plannedValue: string;
    completedLabel: string;
    completedValue: string;
    incomeLabel: string | null;
    incomeValue: string | null;
    incomeNote: string | null;
  };
  legend: Array<{ name: string; color: string }>;
}

export interface PdfModelInput {
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  salaryRules: SalaryRule[];
  /** Mọi chuỗi đã dịch sẵn — xem chú thích đầu file */
  labels: {
    appName: string;
    rangeLabel: string;
    exportedLabel: string;
    summary: string;
    plannedHours: string;
    completedHours: string;
    estimatedIncome: string;
    fixedMonthlyExcluded: string;
    /** Bảy nhãn thứ, chỉ số theo Date.getDay() */
    weekdays: string[];
    /** Ba nhãn buổi, cùng thứ tự với PRINT_BANDS */
    bands: string[];
  };
  format: {
    dayLabel: (date: string) => string;
    hours: (hours: number) => string;
    money: (amount: number) => string;
    dayOfWeek: (date: string) => number;
  };
}

export function buildPdfModel(input: PdfModelInput): PdfModel {
  const { dates, categories, salaryRules, labels, format } = input;

  // Buổi đã hủy không lên giấy: bản in là thứ mang theo để làm việc, không
  // phải nhật ký.
  const visible = input.occurrences.filter((o) => o.status !== 'CANCELLED');

  const columns: PdfColumn[] = dates.map((date) => {
    const events: PdfEvent[] = visible
      .filter((o) => o.date === date)
      .sort((a, b) => a.startAbs - b.startAbs)
      .map((o) => ({
        key: o.key,
        startTime: o.startTime,
        time: `${o.startTime}–${endTimeOf(o.startTime, o.durationMinutes)}`,
        title: o.title,
        categoryName: categories.get(o.categoryId)?.name ?? '',
        color: categories.get(o.categoryId)?.color ?? '#94a3b8',
        location: o.location,
        // Ký hiệu chứ không phải màu: bản in có thể ra máy in đen trắng, và
        // lúc đó màu là thông tin bị mất hoàn toàn.
        mark: o.status === 'COMPLETED' ? '✓' : o.status === 'NO_SHOW' ? '✗' : '',
      }));

    return {
      date,
      weekday: labels.weekdays[format.dayOfWeek(date)] ?? '',
      dayLabel: format.dayLabel(date),
      events,
      bands: groupByBand(events).map((group, i) => ({
        label: labels.bands[i] ?? '',
        events: group,
      })),
    };
  });

  const total = totalStat(statsByCategory(visible));

  let income = 0;
  let hasFixedMonthly = false;
  for (const o of visible) {
    const value = calcOccurrenceIncome(
      o,
      categories.get(o.categoryId),
      resolveSalaryRule(salaryRules, o.categoryId, monthOf(o.date)),
    );
    if (value == null) hasFixedMonthly = true;
    else income += value;
  }

  // Chỉ chú thích những danh mục THẬT SỰ có mặt trong tuần này.
  const usedIds = new Set(visible.map((o) => o.categoryId));
  const legend = [...usedIds]
    .map((id) => categories.get(id))
    .filter((c): c is Category => !!c)
    .map((c) => ({ name: c.name, color: c.color }));

  return {
    appName: labels.appName,
    rangeLabel: labels.rangeLabel,
    exportedLabel: labels.exportedLabel,
    columns,
    summary: {
      label: labels.summary,
      plannedLabel: labels.plannedHours,
      plannedValue: format.hours(total.plannedHours),
      completedLabel: labels.completedHours,
      completedValue: format.hours(total.completedHours),
      incomeLabel: income > 0 ? labels.estimatedIncome : null,
      incomeValue: income > 0 ? format.money(income) : null,
      incomeNote: income > 0 && hasFixedMonthly ? labels.fixedMonthlyExcluded : null,
    },
    legend,
  };
}

/**
 * Ký tự mà font Latin đang nạp KHÔNG vẽ được: chữ Hán, kana, Hangul, dạng
 * toàn rộng, và emoji.
 *
 * ⚠️ VÌ SAO PHẢI CHẶN THAY VÌ CHỈ CẢNH BÁO.
 *
 * Khi font thiếu glyph, PDF không bỏ trống mà lấy glyph nằm ở chỉ số tương
 * ứng trong bảng của font. `中文` ra `-‡`. Đó KHÔNG phải ô vuông báo thiếu —
 * đó là ký tự sai trông y như thật, và người dùng có thể gửi file đó đi mà
 * không nhận ra dữ liệu đã hỏng.
 *
 * Hỏng lặng lẽ nguy hiểm hơn hỏng ồn ào. Nút "In" xử lý được mọi thứ này vì
 * trình duyệt dùng font hệ thống, nên chặn ở đây và chỉ người dùng sang đó.
 */
const UNSUPPORTED_GLYPHS =
  /[⺀-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]|[\u{1F000}-\u{1FAFF}]/u;

/** Đoạn chữ đầu tiên mà PDF không vẽ đúng được, hoặc `null` nếu an toàn */
export function findUnsupportedText(model: PdfModel): string | null {
  const candidates: string[] = [];
  for (const column of model.columns) {
    for (const event of column.events) {
      candidates.push(event.title, event.categoryName, event.location ?? '');
    }
  }
  for (const item of model.legend) candidates.push(item.name);

  return candidates.find((text) => UNSUPPORTED_GLYPHS.test(text)) ?? null;
}

/** Personal-Schedule-2026-08-24-to-2026-08-30.pdf */
export function pdfFileName(dates: string[]): string {
  return `Personal-Schedule-${dates[0]}-to-${dates[dates.length - 1]}.pdf`;
}
