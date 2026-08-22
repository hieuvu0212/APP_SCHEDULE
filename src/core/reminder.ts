// ═══════════════════════════════════════════════════════════════════════════
//  core/reminder.ts — chọn buổi nào cần nhắc và nhắc lúc nào
//
//  HÀM THUẦN. Không import React, không import Dexie, không đụng tới
//  Notification API.
//
//  ⚠️ GIỚI HẠN PHẢI NÓI RÕ VỚI NGƯỜI DÙNG:
//
//  Ứng dụng này không có máy chủ. Không có máy chủ thì không có Web Push, và
//  không có Web Push thì KHÔNG CÓ CÁCH NÀO đánh thức trình duyệt để nhắc khi
//  ứng dụng đã đóng. Notification Triggers API làm được việc đó nhưng tới nay
//  vẫn chỉ là bản thử nghiệm sau cờ, không dùng cho việc thật được.
//
//  Nên cơ chế ở đây là hẹn giờ trong trang: chỉ chạy khi tab hoặc ứng dụng
//  đang mở. Màn hình Cài đặt nói thẳng điều này. Hứa hẹn nhiều hơn thực tế
//  với một tính năng nhắc lịch là cách nhanh nhất khiến người ta bỏ lỡ buổi
//  làm rồi mất niềm tin vào cả ứng dụng.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence } from '../types';

export interface PendingReminder {
  key: string;
  title: string;
  /** Giờ bắt đầu buổi, dạng "HH:mm" — để ghép câu thông báo */
  startTime: string;
  /** Còn bao nhiêu mili-giây nữa thì bắn thông báo */
  delayMs: number;
  /** Còn bao nhiêu phút nữa thì tới giờ vào buổi */
  minutesUntilStart: number;
}

/**
 * Những buổi cần đặt hẹn giờ nhắc, tính từ thời điểm `now`.
 *
 * Trả về MỌI buổi còn ở phía trước, kèm khoảng chờ tới lúc bắn. KHÔNG lọc
 * theo `leadMinutes`.
 *
 * ⚠️ Đây từng là chỗ sai, và cái sai rất kín. Bản đầu lọc bỏ những buổi còn
 * xa hơn `leadMinutes`, với lý lẽ "chưa tới lúc, lần gọi sau sẽ bắt được".
 * Nhưng không có lần gọi sau: hook chỉ chạy lại khi dữ liệu đổi, không có bộ
 * đếm giờ nào gọi lại nó. Mở ứng dụng lúc 9 giờ với buổi 10 giờ và báo trước
 * 30 phút thì buổi đó bị lọc ra ngay, tới 9 rưỡi không ai đánh thức hàm này,
 * và thông báo KHÔNG BAO GIỜ bắn.
 *
 * Bộ lọc đó còn tự mâu thuẫn với chính dòng tính `delayMs` ngay dưới: nếu
 * buổi đã nằm trong khoảng báo trước thì `delayMs` luôn bằng 0 — hàm hóa ra
 * chỉ biết bắn tức thì.
 *
 * Ba điều kiện loại trừ còn lại, mỗi cái một lý do:
 *  · đã hủy hoặc vắng mặt → không còn gì để nhắc
 *  · đã đánh dấu hoàn thành → buổi đã xong, nhắc là phiền
 *  · đã qua giờ bắt đầu → nhắc sau khi vào ca thì vô nghĩa
 *
 * `setTimeout` chịu được khoảng chờ tới ~24 ngày, mà hook chỉ nạp hôm nay và
 * ngày mai, nên hẹn dài nhất khoảng 48 tiếng — thừa an toàn.
 */
export function pendingReminders(
  occurrences: Occurrence[],
  leadMinutes: number,
  now: Date = new Date(),
): PendingReminder[] {
  const nowMs = now.getTime();
  const leadMs = Math.max(0, leadMinutes) * 60_000;

  return occurrences
    .filter((o) => o.status === 'SCHEDULED')
    .filter((o) => o.startAbs > nowMs)
    .map((o) => ({
      key: o.key,
      title: o.title,
      startTime: o.startTime,
      // Kẹp về 0: buổi cách đây ít hơn `leadMinutes` thì phải nhắc NGAY,
      // không phải hẹn một khoảng âm (setTimeout coi số âm như 0 nhưng dựa
      // vào hành vi đó là dựa vào may mắn).
      delayMs: Math.max(0, o.startAbs - leadMs - nowMs),
      minutesUntilStart: Math.round((o.startAbs - nowMs) / 60_000),
    }))
    // Nhiều buổi đã qua mốc bắn thì `delayMs` của chúng đều bằng 0. Phá hòa
    // bằng giờ bắt đầu để thứ tự luôn xác định, không phụ thuộc vào thứ tự
    // đầu vào.
    .sort((a, b) => a.delayMs - b.delayMs || a.startTime.localeCompare(b.startTime));
}
