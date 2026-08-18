import Dexie, { type Table } from 'dexie';
import type {
  AdjustmentTemplate,
  Category,
  PayrollAdjustment,
  RecurringRule,
  SalaryRule,
  ScheduleException,
  SingleEvent,
} from '../types';

/** Tăng số này mỗi lần schema đổi, và ghi kèm vào file backup JSON */
export const SCHEMA_VERSION = 1;

export class ScheduleDB extends Dexie {
  categories!: Table<Category, string>;
  rules!: Table<RecurringRule, string>;
  exceptions!: Table<ScheduleException, string>;
  events!: Table<SingleEvent, string>;
  salaryRules!: Table<SalaryRule, string>;
  adjustments!: Table<PayrollAdjustment, string>;
  adjustmentTemplates!: Table<AdjustmentTemplate, string>;
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
    // CÁC PHASE SAU: CHỈ ĐƯỢC THÊM version MỚI. KHÔNG BAO GIỜ SỬA version(1).
    // Sửa version cũ sẽ làm hỏng DB của những máy đã cài bản trước.
    //
    // this.version(2).stores({ ... }).upgrade(async (tx) => {
    //   await tx.table('rules').toCollection().modify((r) => { ... });
    // });
    // ─────────────────────────────────────────────────────────────────────
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
