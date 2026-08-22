// ═══════════════════════════════════════════════════════════════════════════
//  hooks/useStats.ts — số liệu cho màn hình Thống kê
//
//  MỞ RỘNG LỊCH ĐÚNG MỘT LẦN cho cả khoảng, rồi lọc theo từng tháng.
//
//  Cách ngây thơ là gọi usePayroll cho mỗi tháng, tức là chạy expandSchedule
//  mười hai lần cho biểu đồ một năm — mà mỗi lần lại đi bộ theo ngày từ
//  `startDate` của mọi rule. Với rule bắt đầu từ hai năm trước thì đó là vài
//  chục nghìn vòng lặp lặp lại mười hai lần.
//
//  calcMonthlyPayroll đã tự lọc occurrence theo `o.date.startsWith(month)`,
//  nên truyền cùng một mảng cho mọi tháng là an toàn.
// ═══════════════════════════════════════════════════════════════════════════

import { useLiveQuery } from 'dexie-react-hooks';
import type { Category, Occurrence } from '../types';
import type { CategoryStat } from '../core/stats';
import type { OccurrenceFilter } from '../core/filter';
import { distinctClients, filterOccurrences } from '../core/filter';
import { expandSchedule } from '../core/expand';
import { calcAllPayrolls } from '../core/payroll';
import { hoursByMonth, hoursByWeekday, monthRange, statsByCategory } from '../core/stats';
import { monthBounds } from '../core/time';
import { listCategories } from '../db/repo/categories';
import { getExceptionsInWindow } from '../db/repo/exceptions';
import { listEventsInWindow } from '../db/repo/events';
import { listRules } from '../db/repo/rules';
import { listAdjustments, listSalaryRules } from '../db/repo/salary';
import { useSettings } from './useSettings';

export interface MonthIncome {
  month: string;
  net: number;
  gross: number;
  currency: string;
}

export interface StatsData {
  months: string[];
  income: MonthIncome[];
  categoryStats: CategoryStat[];
  hoursPerWeekday: number[];
  hoursPerMonth: Map<string, number>;
  categories: Category[];
  occurrences: Occurrence[];
  totalNet: number;
  mixedCurrency: boolean;
  conflictCount: number;
  /** Mọi đối tượng có trong khoảng, KHÔNG lọc — để dựng danh sách chọn */
  clients: string[];
  /** Có bộ lọc đang bật mà biểu đồ thu nhập không phản ánh được */
  incomeIgnoresFilter: boolean;
}

/**
 * ⚠️ BỘ LỌC ẢNH HƯỞNG HAI PHẦN THEO HAI CÁCH KHÁC NHAU.
 *
 * Giờ và tỷ lệ thực hiện: lọc thẳng trên danh sách occurrence.
 *
 * Thu nhập: KHÔNG lọc occurrence được. `calcMonthlyPayroll` với chế độ khoán
 * tháng trả về `baseSalary` chứ không cộng từng buổi — bỏ bớt buổi đi không
 * làm con số nhỏ lại, mà bỏ bớt rồi vẫn trả nguyên lương thì lại sai theo
 * chiều ngược. Nên lọc theo DANH MỤC được (chỉ tính lương những danh mục còn
 * lại), còn lọc theo đối tượng, trạng thái hay từ khóa thì biểu đồ thu nhập
 * giữ nguyên và màn hình nói rõ điều đó.
 */
export function useStats(
  fromMonth: string,
  toMonth: string,
  filter: OccurrenceFilter = {},
): StatsData | undefined {
  const settings = useSettings();
  const currency = settings.currency;
  const autoComplete = settings.autoCompletePastOccurrences;

  // useLiveQuery so sánh mảng phụ thuộc theo tham chiếu; object bộ lọc dựng
  // lại mỗi lần render sẽ khiến truy vấn chạy vô tận. Rút thành chuỗi.
  const filterKey = JSON.stringify(filter);

  return useLiveQuery(async () => {
    const months = monthRange(fromMonth, toMonth);
    if (months.length === 0) return undefined;

    const start = monthBounds(months[0]).start;
    const end = monthBounds(months[months.length - 1]).end;

    const [categories, rules, exceptions, events, salaryRules, adjustments] =
      await Promise.all([
        listCategories(),
        listRules(),
        getExceptionsInWindow(start, end),
        listEventsInWindow(start, end),
        listSalaryRules(),
        // Không truyền tháng: cần điều chỉnh của MỌI tháng trong khoảng
        listAdjustments(),
      ]);

    const all = expandSchedule({
      rules,
      exceptions,
      events,
      windowStart: start,
      windowEnd: end,
      now: new Date(),
      autoCompletePast: autoComplete,
    });

    const occurrences = filterOccurrences(all, filter);

    // Chỉ danh mục được truyền vào phép tính lương. Xem chú thích đầu hàm.
    const payrollCategories = filter.categoryIds?.length
      ? categories.filter((c) => filter.categoryIds!.includes(c.id))
      : categories;

    const income: MonthIncome[] = months.map((month) => {
      const payrolls = calcAllPayrolls(
        payrollCategories,
        month,
        all,
        salaryRules,
        adjustments,
        currency,
      );
      return {
        month,
        net: payrolls.reduce((sum, p) => sum + p.net, 0),
        gross: payrolls.reduce((sum, p) => sum + p.gross, 0),
        currency: payrolls[0]?.currency ?? currency,
      };
    });

    return {
      months,
      income,
      categoryStats: statsByCategory(occurrences),
      hoursPerWeekday: hoursByWeekday(occurrences),
      hoursPerMonth: hoursByMonth(occurrences),
      categories,
      occurrences,
      totalNet: income.reduce((sum, m) => sum + m.net, 0),
      mixedCurrency: new Set(salaryRules.map((r) => r.currency)).size > 1,
      // Đếm CẶP chứ không đếm buổi. Đếm buổi mang cờ sẽ ra gấp đôi với hai
      // buổi chồng nhau, và ra 1,5 với ba buổi chồng nhau. `conflictWith` ghi
      // quan hệ hai chiều nên tổng độ dài chia hai là số cặp chính xác.
      conflictCount:
        occurrences.reduce((n, o) => n + o.conflictWith.length, 0) / 2,
      clients: distinctClients(all),
      // Bộ lọc nào KHÔNG phản ánh được vào biểu đồ thu nhập.
      incomeIgnoresFilter:
        !!filter.clientNames?.length || !!filter.statuses?.length || !!filter.query,
    };
  }, [fromMonth, toMonth, currency, autoComplete, filterKey]);
}
