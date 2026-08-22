import { describe, expect, it } from 'vitest';
import type { Occurrence, OccurrenceStatus } from '../../types';
import { pendingReminders } from '../reminder';
import { toAbsolute } from '../time';

const NOW = new Date(2026, 7, 21, 9, 0); // 09:00 ngày 21/08/2026, giờ địa phương

function occ(startTime: string, status: OccurrenceStatus = 'SCHEDULED'): Occurrence {
  const date = '2026-08-21';
  const startAbs = toAbsolute(date, startTime);
  return {
    key: `k-${startTime}-${status}`,
    sourceType: 'RULE',
    sourceId: 'r1',
    title: `Buổi ${startTime}`,
    categoryId: 'a',
    date,
    startTime,
    durationMinutes: 60,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + 3_600_000,
    status,
    hasConflict: false,
    conflictWith: [],
  };
}

describe('pendingReminders', () => {
  it('ĐẶT HẸN CHO CẢ BUỔI CÒN XA, không lọc bỏ theo khoảng báo trước', () => {
    // Bài chống lỗi tái phát. Bản đầu lọc bỏ buổi xa hơn leadMinutes với lý
    // lẽ "lần gọi sau sẽ bắt được" — nhưng không có lần gọi sau nào cả, hook
    // chỉ chạy lại khi dữ liệu đổi. Buổi 11:00 sẽ không bao giờ được nhắc.
    const out = pendingReminders([occ('09:20'), occ('11:00')], 30, NOW);
    expect(out.map((r) => r.startTime)).toEqual(['09:20', '11:00']);
    // 11:00 trừ 30 phút báo trước = bắn lúc 10:30, tức 90 phút nữa.
    expect(out[1].delayMs).toBe(90 * 60_000);
  });

  it('bỏ qua buổi đã qua giờ bắt đầu', () => {
    // Nhắc sau khi đã vào ca thì vô nghĩa, và còn gây hoang mang.
    expect(pendingReminders([occ('08:30')], 30, NOW)).toEqual([]);
  });

  it('bỏ qua buổi đã hủy, vắng mặt, hoặc đã hoàn thành', () => {
    const list = [
      occ('09:20', 'CANCELLED'),
      occ('09:20', 'NO_SHOW'),
      occ('09:20', 'COMPLETED'),
    ];
    expect(pendingReminders(list, 30, NOW)).toEqual([]);
  });

  it('tính đúng thời điểm bắn: trước giờ vào ca đúng leadMinutes', () => {
    // Buổi 10:00, báo trước 30 phút → bắn lúc 09:30 → còn 30 phút nữa.
    const [r] = pendingReminders([occ('10:00')], 30, NOW);
    expect(r.delayMs).toBe(30 * 60_000);
    expect(r.minutesUntilStart).toBe(60);
  });

  it('buổi sắp bắt đầu hơn cả khoảng báo trước thì bắn NGAY, không hẹn số âm', () => {
    // 09:10 với báo trước 30 phút: mốc bắn lẽ ra là 08:40, đã qua rồi.
    // Kẹp về 0 thay vì dựa vào việc setTimeout coi số âm như 0.
    const [r] = pendingReminders([occ('09:10')], 30, NOW);
    expect(r.delayMs).toBe(0);
    expect(r.minutesUntilStart).toBe(10);
  });

  it('sắp xếp theo thời điểm bắn, gần nhất lên trước', () => {
    const out = pendingReminders([occ('11:00'), occ('09:50'), occ('10:20')], 15, NOW);
    expect(out.map((r) => r.startTime)).toEqual(['09:50', '10:20', '11:00']);
  });

  it('nhiều buổi cùng bắn ngay thì thứ tự vẫn xác định theo giờ vào ca', () => {
    // Cả hai đã qua mốc bắn nên delayMs đều bằng 0; không có phép phá hòa
    // thì thứ tự phụ thuộc vào thứ tự đầu vào, tức là không xác định.
    const out = pendingReminders([occ('09:25'), occ('09:05')], 30, NOW);
    expect(out.map((r) => r.delayMs)).toEqual([0, 0]);
    expect(out.map((r) => r.startTime)).toEqual(['09:05', '09:25']);
  });

  it('leadMinutes = 0 nghĩa là nhắc ĐÚNG LÚC vào ca', () => {
    const [r] = pendingReminders([occ('09:20')], 0, NOW);
    expect(r.delayMs).toBe(20 * 60_000);
    expect(r.minutesUntilStart).toBe(20);
  });

  it('leadMinutes âm được kẹp về 0, không bắn sau giờ vào ca', () => {
    // Không kẹp thì lead = −30 sẽ cho delayMs = 50 phút, tức nhắc lúc 09:50
    // cho một buổi bắt đầu từ 09:20.
    const [r] = pendingReminders([occ('09:20')], -30, NOW);
    expect(r.delayMs).toBe(20 * 60_000);
  });

  it('danh sách rỗng không ném lỗi', () => {
    expect(pendingReminders([], 30, NOW)).toEqual([]);
  });
});
