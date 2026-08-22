// ═══════════════════════════════════════════════════════════════════════════
//  components/eventValidation.ts — kiểm tra form sự kiện
//
//  Tách khỏi EventDialog.tsx để file đó CHỈ export component: Fast Refresh
//  của Vite chỉ giữ được state khi module không export gì ngoài component, và
//  EventDialog là đúng cái form mà mất state lúc đang gõ thì khó chịu nhất.
//
//  Trả về KHÓA i18n, không phải câu chữ. Nhờ vậy hàm thuần, test được bằng
//  cách so khóa, và tầng hiển thị giữ độc quyền việc dịch.
// ═══════════════════════════════════════════════════════════════════════════

import type { Frequency } from '../types';

export type RepeatChoice = 'NONE' | Frequency;
export type EndMode = 'never' | 'until' | 'count';

/**
 * Phần của form mà việc kiểm tra thật sự đọc tới.
 *
 * Cố ý KHÔNG nhận nguyên `FormState`: liệt kê đúng những trường cần dùng làm
 * chữ ký nói ra được phạm vi của hàm, và giữ được nó không âm thầm phình ra
 * theo form.
 */
export interface ValidatableEventForm {
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  endTime: string;
  repeat: RepeatChoice;
  daysOfWeek: number[];
  dayOfMonth: string;
  endMode: EndMode;
  endDate: string;
  count: string;
}

export function validate(
  form: ValidatableEventForm,
  durationMinutes: number,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.title.trim()) errors.title = 'validation.required';
  if (!form.categoryId) errors.categoryId = 'validation.required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = 'validation.dateRequired';
  if (!/^\d{2}:\d{2}$/.test(form.startTime)) errors.startTime = 'validation.timeRequired';
  if (!/^\d{2}:\d{2}$/.test(form.endTime)) errors.endTime = 'validation.timeRequired';
  else if (durationMinutes <= 0) errors.endTime = 'validation.durationPositive';

  if (form.repeat === 'WEEKLY' && form.daysOfWeek.length === 0) {
    errors.recurrence = 'validation.pickWeekday';
  }
  if (form.repeat === 'MONTHLY') {
    const d = Number(form.dayOfMonth);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      errors.recurrence = 'validation.dayOfMonthRange';
    }
  }
  if (form.repeat !== 'NONE' && form.endMode === 'until') {
    if (!form.endDate) errors.recurrence = 'validation.endDateRequired';
    // endDate BAO GỒM, nên bằng ngày bắt đầu là hợp lệ — chuỗi chỉ có một buổi.
    else if (form.endDate < form.date) errors.recurrence = 'validation.endDateAfterStart';
  }
  if (form.repeat !== 'NONE' && form.endMode === 'count') {
    const c = Number(form.count);
    if (!Number.isInteger(c) || c < 1) errors.recurrence = 'validation.countPositive';
  }

  return errors;
}
