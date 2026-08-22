// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useDashboard.ts — số liệu cho màn hình Tổng quan
//
//  Mở rộng lịch ĐÚNG MỘT LẦN cho cửa sổ bao trọn cả tháng này lẫn hôm nay và
//  ngày mai, rồi lọc ra hai thứ khác nhau từ cùng một mảng: các con số của
//  tháng, và lịch của hai ngày tới.
//
//  Cửa sổ phải nới tới NGÀY MAI chứ không dừng ở cuối tháng. Ngày 31 mở ứng
//  dụng lên mà mục "ngày mai" trống trơn vì nó đã sang tháng sau là lỗi chỉ
//  xuất hiện một lần mỗi tháng — loại khó phát hiện nhất.
//
//  ⚠️ Thu nhập lấy từ calcAllPayrolls (TẦNG 2), không cộng dồn Tầng 1. Với
//  lương khoán tháng, cộng dồn từng buổi sai cả hai chiều.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import type { Category, Occurrence } from '../types';
import { todayKey } from '../core/calendar';
import { expandSchedule } from '../core/expand';
import { splitHours } from '../core/income';
import { calcAllPayrolls } from '../core/payroll';
import { addDays, monthBounds, monthOf } from '../core/time';
import { listCategories } from '../db/repo/categories';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listRules } from '../db/repo/rules';
import { listAdjustments, listSalaryRules } from '../db/repo/salary';
import { useSettings } from './useSettings';

export interface DashboardData {
  month: string;
  today: string;
  /** Buổi của hôm nay và ngày mai, đã sắp theo giờ */
  todayList: Occurrence[];
  tomorrowList: Occurrence[];
  /** Số buổi trong tháng, không tính buổi đã hủy */
  sessionCount: number;
  hoursCompleted: number;
  hoursPlanned: number;
  netIncome: number;
  currency: string;
  mixedCurrency: boolean;
  /**
   * Số "đối tượng" khác nhau trong tháng — học sinh, chỗ làm, lớp học.
   *
   * ⚠️ Đếm theo CHUỖI `clientName` gõ tay, nên "Minh" và "minh" là hai. Con
   * số này chỉ đáng tin khi nào clientName trở thành một thực thể có id.
   */
  clientCount: number;
  categories: Category[];
}

export function useDashboard(): DashboardData | undefined {
  const settings = useSettings();
  const currency = settings.currency;
  const autoComplete = settings.autoCompletePastOccurrences;

  return useLiveQuery(async () => {
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    const month = monthOf(today);
    const bounds = monthBounds(month);

    const start = today < bounds.start ? today : bounds.start;
    const end = tomorrow > bounds.end ? tomorrow : bounds.end;

    const [categories, rules, exceptions, events, salaryRules, adjustments] =
      await Promise.all([
        listCategories(),
        listRules(),
        getExceptionsInWindow(start, end),
        listEventsInWindow(start, end),
        listSalaryRules(),
        listAdjustments(month),
      ]);

    const occurrences = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: start,
      windowEnd: end,
      now: new Date(),
      autoCompletePast: autoComplete,
    });

    const inMonth = occurrences.filter(
      (o) => o.date.startsWith(month) && o.status !== 'CANCELLED',
    );
    const { completed, scheduled } = splitHours(inMonth);

    const payrolls = calcAllPayrolls(
      categories,
      month,
      occurrences,
      salaryRules,
      adjustments,
      currency,
    );

    const onDay = (date: string) =>
      occurrences
        .filter((o) => o.date === date && o.status !== 'CANCELLED')
        .sort((a, b) => a.startAbs - b.startAbs);

    return {
      month,
      today,
      todayList: onDay(today),
      tomorrowList: onDay(tomorrow),
      sessionCount: inMonth.length,
      hoursCompleted: completed,
      hoursPlanned: completed + scheduled,
      netIncome: payrolls.reduce((sum, p) => sum + p.net, 0),
      currency: payrolls[0]?.currency ?? currency,
      // Nhiều loại tiền thì tổng không có nghĩa — cộng đồng với đô không ra
      // con số nào cả.
      mixedCurrency: new Set(payrolls.map((p) => p.currency)).size > 1,
      clientCount: new Set(
        inMonth.map((o) => o.clientName?.trim()).filter((name): name is string => !!name),
      ).size,
      categories,
    };
  }, [currency, autoComplete]);
}
