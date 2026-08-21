// ═══════════════════════════════════════════════════════════════════════════
//  core/stats.ts — thống kê KẾ HOẠCH vs THỰC TẾ
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Đây là nơi trả nợ cho một quyết định từ Phase 0. Bản kế hoạch gốc không có
//  cách nào đánh dấu một buổi LẶP là "đã đi làm" (lỗi B1), nên `ExceptionType`
//  được thêm giá trị 'STATUS'. Từ đó tới giờ trường `status` chỉ dùng để gạch
//  ngang chữ trên lịch — module này mới là lý do nó tồn tại.
//
//  ⚠️ ĐỊNH NGHĨA PHẢI RÕ, vì "tôi làm bao nhiêu giờ tháng này" có bốn đáp án
//  khác nhau và trộn lẫn chúng là ra số vô nghĩa:
//
//      planned    mọi buổi trên lịch, BẤT KỂ trạng thái — thứ bạn định làm
//      completed  chỉ buổi đã đánh dấu hoàn thành — thứ bạn thật sự đã làm
//      cancelled  buổi bị hủy
//      noShow     buổi vắng mặt
//      scheduled  buổi chưa xảy ra hoặc chưa đánh dấu
//
//  Bất biến: completed + cancelled + noShow + scheduled === planned.
//  Có test cho bất biến này, vì nếu thêm một trạng thái mới mà quên cập nhật
//  ở đây thì số liệu sẽ lệch âm thầm.
//
//  Lưu ý: `completed` ở đây KHÁC với `hoursActual` trong core/payroll.ts.
//  Bảng lương tính tiền trên mọi buổi không bị hủy (kể cả buổi chưa tới, vì
//  lương phải dự tính được); thống kê thì chỉ đếm cái đã thật sự xảy ra.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence } from '../types';
import { dayOfWeek, hoursOf, monthOf } from './time';

export interface CategoryStat {
  categoryId: string;
  plannedHours: number;
  completedHours: number;
  cancelledHours: number;
  noShowHours: number;
  scheduledHours: number;
  plannedCount: number;
  completedCount: number;
}

function emptyStat(categoryId: string): CategoryStat {
  return {
    categoryId,
    plannedHours: 0,
    completedHours: 0,
    cancelledHours: 0,
    noShowHours: 0,
    scheduledHours: 0,
    plannedCount: 0,
    completedCount: 0,
  };
}

/** Gom giờ theo danh mục, tách theo trạng thái */
export function statsByCategory(occurrences: Occurrence[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const o of occurrences) {
    let stat = map.get(o.categoryId);
    if (!stat) {
      stat = emptyStat(o.categoryId);
      map.set(o.categoryId, stat);
    }

    const hours = hoursOf(o.durationMinutes);
    stat.plannedHours += hours;
    stat.plannedCount += 1;

    switch (o.status) {
      case 'COMPLETED':
        stat.completedHours += hours;
        stat.completedCount += 1;
        break;
      case 'CANCELLED':
        stat.cancelledHours += hours;
        break;
      case 'NO_SHOW':
        stat.noShowHours += hours;
        break;
      case 'SCHEDULED':
        stat.scheduledHours += hours;
        break;
    }
  }

  return [...map.values()].sort((a, b) => b.plannedHours - a.plannedHours);
}

/**
 * Tỷ lệ thực hiện: giờ đã hoàn thành / giờ đã lên kế hoạch.
 *
 * Trả về `null` khi chưa có buổi nào — KHÔNG phải 0. Chia 0 cho 0 ra NaN, mà
 * "chưa lên lịch buổi nào" với "lên lịch rồi nhưng chưa làm buổi nào" là hai
 * chuyện khác hẳn. UI phải hiện "—" cho null.
 */
export function completionRate(stat: CategoryStat): number | null {
  if (stat.plannedHours <= 0) return null;
  return stat.completedHours / stat.plannedHours;
}

/** Gộp nhiều CategoryStat thành một dòng tổng */
export function totalStat(stats: CategoryStat[]): CategoryStat {
  const total = emptyStat('*');
  for (const s of stats) {
    total.plannedHours += s.plannedHours;
    total.completedHours += s.completedHours;
    total.cancelledHours += s.cancelledHours;
    total.noShowHours += s.noShowHours;
    total.scheduledHours += s.scheduledHours;
    total.plannedCount += s.plannedCount;
    total.completedCount += s.completedCount;
  }
  return total;
}

/**
 * Tổng giờ theo THỨ trong tuần — mảng 7 phần tử, chỉ số theo Date.getDay()
 * (0 = Chủ nhật). Bỏ qua buổi đã hủy và vắng mặt vì chúng không tốn thời gian
 * thật của ai cả.
 *
 * Chỉ số LUÔN theo getDay(), độc lập với `weekStartsOn`. Tầng hiển thị tự
 * xoay lại thứ tự cột — trộn hai chuyện đó vào nhau là nguồn của lỗi lệch
 * một ngày rất khó tìm.
 */
export function hoursByWeekday(occurrences: Occurrence[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const o of occurrences) {
    if (o.status === 'CANCELLED' || o.status === 'NO_SHOW') continue;
    out[dayOfWeek(o.date)] += hoursOf(o.durationMinutes);
  }
  return out;
}

/** Tổng giờ theo tháng "YYYY-MM", chỉ tính buổi thật sự diễn ra */
export function hoursByMonth(occurrences: Occurrence[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of occurrences) {
    if (o.status === 'CANCELLED' || o.status === 'NO_SHOW') continue;
    const key = monthOf(o.date);
    out.set(key, (out.get(key) ?? 0) + hoursOf(o.durationMinutes));
  }
  return out;
}

/**
 * Danh sách tháng liên tiếp từ `from` tới `to`, bao gồm cả hai đầu.
 *
 * Cần thiết vì biểu đồ phải có cả tháng KHÔNG có dữ liệu. Chỉ vẽ các tháng
 * có bản ghi sẽ làm hai tháng cách nhau nửa năm đứng cạnh nhau trên trục,
 * và người xem đọc ra một xu hướng không hề tồn tại.
 */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let year = fy;
  let month = fm;
  let guard = 0;

  while ((year < ty || (year === ty && month <= tm)) && guard++ < 600) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
