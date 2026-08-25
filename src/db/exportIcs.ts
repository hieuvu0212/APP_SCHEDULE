// ═══════════════════════════════════════════════════════════════════════════
//  db/exportIcs.ts — đọc DB, dựng file .ics, tải xuống
//
//  Phần dựng nội dung nằm ở core/ics.ts và có test. File này chỉ lo đọc Dexie
//  và tạo link tải — cùng cách chia như db/backup.ts với core/backup.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { buildIcs, countIcsEntries, icsFileName } from '../core/ics';
import { db } from './schema';

/** Đọc toàn bộ dữ liệu lịch còn sống, ở dạng THÔ */
async function readAll() {
  const [rules, exceptions, events, categories] = await Promise.all([
    db.rules.toArray(),
    db.exceptions.toArray(),
    db.events.toArray(),
    db.categories.toArray(),
  ]);
  return { rules, exceptions, events, categories };
}

/**
 * Đếm trước những gì sẽ có trong file, để hộp thoại nói được con số.
 *
 * Cùng tinh thần với `planWeekCopy()`: hiện đúng cái sắp ghi, rồi ghi đúng
 * cái vừa hiện.
 */
export async function previewIcsExport() {
  const { rules, exceptions, events } = await readAll();
  return countIcsEntries({ rules, exceptions, events });
}

/**
 * Xuất toàn bộ lịch ra một file .ics và tải xuống.
 *
 * ⚠️ XUẤT TẤT CẢ, KHÔNG THEO KHOẢNG THỜI GIAN.
 *
 * Xuất "tuần này" nghe hợp lý nhưng sai với định dạng: lịch lặp trong .ics là
 * MỘT mục kèm RRULE, không phải một nhúm buổi. Cắt theo khoảng thời gian sẽ
 * buộc phải hoặc san phẳng chuỗi thành từng buổi rời — mất khả năng sửa hàng
 * loạt ở phía ứng dụng lịch — hoặc viết lại `startDate` của rule, tức là nói
 * dối về chuỗi. Ứng dụng lịch nhận vào vốn đã tự lo việc hiển thị khoảng nào.
 */
export async function exportIcs(now: Date = new Date()): Promise<void> {
  const { rules, exceptions, events, categories } = await readAll();
  const names = new Map(categories.map((c) => [c.id, c.name]));

  const content = buildIcs({
    rules,
    exceptions,
    events,
    categoryName: (id) => names.get(id),
    now: now.toISOString(),
    calendarName: 'Personal Schedule',
  });

  // `text/calendar` để hệ điều hành gợi ý mở bằng ứng dụng lịch. BOM cố ý
  // KHÔNG thêm: một số trình phân tích coi BOM là ký tự đầu của dòng
  // `BEGIN:VCALENDAR` và từ chối cả file.
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = icsFileName(now);
    link.click();
  } finally {
    // Không thu hồi thì blob nằm trong bộ nhớ tới khi đóng tab. Với file vài
    // trăm KB thì không sao, nhưng đây là thói quen rẻ tiền và đúng.
    URL.revokeObjectURL(url);
  }
}
