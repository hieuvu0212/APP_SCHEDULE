import Dexie, { type Table } from 'dexie';
import type {
  AdjustmentTemplate,
  Category,
  Payment,
  PayrollAdjustment,
  RecurringRule,
  SalaryRule,
  ScheduleException,
  SingleEvent,
} from '../types';

/** Tăng số này mỗi lần schema đổi, và ghi kèm vào file backup JSON */
export const SCHEMA_VERSION = 2;

export class ScheduleDB extends Dexie {
  categories!: Table<Category, string>;
  rules!: Table<RecurringRule, string>;
  exceptions!: Table<ScheduleException, string>;
  events!: Table<SingleEvent, string>;
  salaryRules!: Table<SalaryRule, string>;
  adjustments!: Table<PayrollAdjustment, string>;
  adjustmentTemplates!: Table<AdjustmentTemplate, string>;
  payments!: Table<Payment, string>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('PersonalScheduleDB');

    this.version(1).stores({
      categories: 'id, name, sortOrder, deletedAt',
      rules: 'id, categoryId, startDate, endDate, deletedAt',

      // ⚠️ HAI INDEX DƯỚI ĐÂY LÀ THỨ KHIẾN MOVE VÀ ADD HOẠT ĐỘNG ĐÚNG.
      //
      // &[recurringRuleId+originalDate] — UNIQUE, chặn hai exception chọi
      //   nhau trên cùng một buổi (vd vừa CANCEL vừa MOVE).
      // newDate — thiếu index này thì buổi dời sang tuần khác BIẾN MẤT,
      //   và loại ADD không bao giờ hiển thị.
      exceptions:
        'id, &[recurringRuleId+originalDate], newDate, recurringRuleId, originalDate, type, deletedAt',

      events: 'id, date, categoryId, [date+categoryId], deletedAt',
      salaryRules: 'id, categoryId, effectiveFrom, [categoryId+effectiveFrom], deletedAt',
      adjustments: 'id, [categoryId+month], month, categoryId, deletedAt',
      adjustmentTemplates: 'id, categoryId, deletedAt',
      settings: 'key',
    });

    // ─────────────────────────────────────────────────────────────────────
    //  version(2) — bảng thu tiền
    //
    //  ⚠️ CHỈ THÊM MỘT BẢNG RỖNG, KHÔNG CÓ upgrade().
    //
    //  Đó là lựa chọn có chủ đích. Cách "đúng" hơn về mặt mô hình là dựng một
    //  thực thể Client có id rồi migrate mọi `clientName` cũ sang `clientId`.
    //  Nhưng migration đó phải đọc và ghi lại toàn bộ rules lẫn events, và
    //  nâng cấp schema là thao tác KHÔNG HOÀN TÁC ĐƯỢC — máy nào đã lên
    //  version(2) thì không quay về version(1) được nữa.
    //
    //  Thêm một bảng rỗng thì Dexie chỉ tạo object store mới, không đụng vào
    //  một byte dữ liệu cũ nào. Rủi ro gần bằng không.
    //
    //  Cái giá phải trả: Payment neo vào `clientKey` (chuỗi tên đã chuẩn hóa)
    //  chứ không phải id, nên đổi tên một đối tượng sẽ làm các khoản thu cũ
    //  mồ côi. Chấp nhận được cho tới khi việc đổi tên trở thành nhu cầu thật.
    //
    //  KHÔNG BAO GIỜ SỬA version(1) ở trên. Sửa version cũ làm hỏng DB của
    //  những máy đã cài bản trước.
    // ─────────────────────────────────────────────────────────────────────
    this.version(2).stores({
      payments: 'id, [clientKey+month], clientKey, month, categoryId, deletedAt',
    });
  }
}

export const db = new ScheduleDB();

// ─── Tiện ích dùng chung ───────────────────────────────────────────────────

export function nowISO(): string {
  return new Date().toISOString();
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Gắn id + dấu thời gian cho bản ghi mới */
export function stamp<T extends object>(data: T): T & {
  id: string; createdAt: string; updatedAt: string;
} {
  const t = nowISO();
  return { id: newId(), createdAt: t, updatedAt: t, ...data };
}

/** Cập nhật updatedAt cho bản ghi đã có */
export function touch<T extends object>(data: T): T & { updatedAt: string } {
  return { ...data, updatedAt: nowISO() };
}
