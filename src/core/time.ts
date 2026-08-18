// ═══════════════════════════════════════════════════════════════════════════
//  core/time.ts — viên gạch nền của toàn hệ thống
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Mọi thứ khác dựng trên module này, nên nó phải đúng trước tiên.
//  Đặc biệt: ca qua đêm (22:00 → 02:00) không được tạo ra thời lượng âm.
// ═══════════════════════════════════════════════════════════════════════════

export const MINUTES_PER_DAY = 1440;

/** "22:00" → 1320 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`Giờ không hợp lệ: "${hhmm}" (cần dạng "HH:mm")`);
  }
  return h * 60 + m;
}

/** 1320 → "22:00". Tự cuộn vòng qua nửa đêm, xử lý cả số âm. */
export function toHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Giờ treo tường → epoch ms.
 * CHỈ dùng để so trùng lịch và sắp xếp. KHÔNG lưu vào DB.
 */
export function toAbsolute(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

/** Ca có vắt qua nửa đêm không */
export function endsNextDay(startTime: string, durationMinutes: number): boolean {
  return toMinutes(startTime) + durationMinutes >= MINUTES_PER_DAY;
}

/** Giờ kết thúc để hiển thị. endTimeOf("22:00", 240) → "02:00" */
export function endTimeOf(startTime: string, durationMinutes: number): string {
  return toHHMM(toMinutes(startTime) + durationMinutes);
}

/**
 * Suy ra durationMinutes từ cặp giờ người dùng nhập.
 * Nếu endTime <= startTime thì hiểu là ca qua đêm và cộng thêm một ngày.
 * Dùng ở tầng nhập liệu; DB chỉ lưu durationMinutes.
 */
export function durationFrom(startTime: string, endTime: string): number {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  return e > s ? e - s : e + MINUTES_PER_DAY - s;
}

export function hoursOf(durationMinutes: number): number {
  return durationMinutes / 60;
}

/**
 * Phát hiện trùng lịch — BẤT ĐẲNG THỨC NGHIÊM NGẶT.
 * 10:00–12:00 và 12:00–14:00 KHÔNG phải trùng (chỉ chạm nhau ở điểm cuối).
 */
export function overlaps(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─── Ngày tháng ────────────────────────────────────────────────────────────

/** Date → "YYYY-MM-DD" theo giờ ĐỊA PHƯƠNG (không dùng toISOString) */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const d = parseDateKey(date);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** "2026-09-15" → "2026-09" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 0=CN, 1=T2 … 6=T7 — LUÔN theo Date.getDay(), độc lập với weekStartsOn */
export function dayOfWeek(date: string): number {
  return parseDateKey(date).getDay();
}

/** Số ngày giữa hai mốc (b − a) */
export function daysBetween(a: string, b: string): number {
  const MS = 86_400_000;
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / MS);
}

/** Ngày đầu và cuối của tháng "YYYY-MM" */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Ngày đầu tuần chứa `date`, tôn trọng weekStartsOn.
 * weekStartsOn: 0 = Chủ nhật, 1 = Thứ hai.
 */
export function startOfWeek(date: string, weekStartsOn: 0 | 1 = 1): string {
  const dow = dayOfWeek(date);
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

/**
 * Số phút của một khoảng [startTime, +duration) rơi vào khung giờ đêm.
 * Xử lý được cả khung đêm vắt qua nửa đêm (vd 22:00 → 06:00).
 */
export function nightMinutes(
  startTime: string,
  durationMinutes: number,
  nightStart: string,
  nightEnd: string,
): number {
  const s = toMinutes(startTime);
  const ns = toMinutes(nightStart);
  const ne = toMinutes(nightEnd);

  // Trải khung đêm ra thành các khoảng tuyệt đối quanh ngày đang xét
  const windows: Array<[number, number]> = [];
  for (let dayShift = -1; dayShift <= 1; dayShift++) {
    const base = dayShift * MINUTES_PER_DAY;
    if (ne > ns) {
      windows.push([base + ns, base + ne]);
    } else {
      // vắt qua nửa đêm: 22:00 → 06:00 hôm sau
      windows.push([base + ns, base + ne + MINUTES_PER_DAY]);
    }
  }

  const evStart = s;
  const evEnd = s + durationMinutes;
  let total = 0;
  for (const [ws, we] of windows) {
    total += Math.max(0, Math.min(evEnd, we) - Math.max(evStart, ws));
  }
  return total;
}
