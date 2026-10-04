import Dexie, { type Table } from 'dexie';
import type {
  AdjustmentTemplate,
  Category,
  Client,
  Payment,
  PayrollAdjustment,
  RecurringRule,
  SalaryRule,
  ScheduleException,
  SingleEvent,
} from '../types';
import { clientIdFromName } from '../core/clientId';

/**
 * Phiên bản HÌNH DẠNG DỮ LIỆU SAO LƯU — ghi kèm vào file backup JSON.
 *
 * Tăng số này khi dữ liệu nằm trong file sao lưu đổi hình dạng. Nó KHÔNG phải
 * số `version(n)` của Dexie: `version(4)` chỉ thêm `syncBase`, một bảng dẫn
 * xuất không nằm trong sao lưu, nên số này đứng yên ở 3. Tăng nó lên chỉ để
 * khớp Dexie thì bản ứng dụng cũ sẽ từ chối (`newerSchema`) một file sao lưu
 * mà nó đọc được hoàn toàn bình thường.
 */
export const SCHEMA_VERSION = 3;

/**
 * Bản gốc của một dòng cho phép gộp ba bên khi đồng bộ — xem db/syncBase.ts.
 *
 * `userId` nằm trong dòng vì bản gốc là "điều máy này và TÀI KHOẢN NÀY đã
 * thống nhất". Đăng xuất rồi đăng nhập tài khoản khác thì bản gốc cũ không còn
 * nghĩa gì, và dùng nó sẽ so dữ liệu của người này với lịch sử của người kia.
 */
export interface SyncBaseRow {
  table: string;
  id: string;
  userId: string;
  row: Record<string, unknown> & { id: string; updatedAt?: string };
}

export class ScheduleDB extends Dexie {
  categories!: Table<Category, string>;
  clients!: Table<Client, string>;
  rules!: Table<RecurringRule, string>;
  exceptions!: Table<ScheduleException, string>;
  events!: Table<SingleEvent, string>;
  salaryRules!: Table<SalaryRule, string>;
  adjustments!: Table<PayrollAdjustment, string>;
  adjustmentTemplates!: Table<AdjustmentTemplate, string>;
  payments!: Table<Payment, string>;
  settings!: Table<{ key: string; value: unknown }, string>;
  syncBase!: Table<SyncBaseRow, [string, string]>;

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

    // ─────────────────────────────────────────────────────────────────────
    //  version(3) — Đưa Client thành thực thể độc lập
    // ─────────────────────────────────────────────────────────────────────
    this.version(3).stores({
      clients: 'id, name, deletedAt',
      payments: 'id, [clientId+month], clientId, month, categoryId, deletedAt',
    }).upgrade(async (tx) => {
      // 1. Quét toàn bộ rules và events để tìm các clientName độc nhất
      const rules = await tx.table('rules').toArray();
      const events = await tx.table('events').toArray();
      const payments = await tx.table('payments').toArray();

      const uniqueNames = new Set<string>();
      rules.forEach(r => { if (r.clientName) uniqueNames.add(r.clientName); });
      events.forEach(e => { if (e.clientName) uniqueNames.add(e.clientName); });
      payments.forEach(p => { if (p.clientLabel) uniqueNames.add(p.clientLabel); });
      
      const t = new Date().toISOString();
      const nameToId = new Map<string, string>();
      const createdIds = new Set<string>();
      
      const newClients: any[] = [];

      uniqueNames.forEach(name => {
        let id = clientIdFromName(name);
        if (!id) id = newId();
        
        nameToId.set(name, id);
        if (!createdIds.has(id)) {
          createdIds.add(id);
          newClients.push({ id, name, createdAt: t, updatedAt: t });
        }
      });

      // Tạo bảng clients
      await tx.table('clients').bulkAdd(newClients);

      // Cập nhật rules
      for (const r of rules) {
        if (r.clientName) {
          r.clientId = nameToId.get(r.clientName);
          delete r.clientName;
          r.updatedAt = t;
          await tx.table('rules').put(r);
        }
      }

      // Cập nhật events
      for (const e of events) {
        if (e.clientName) {
          e.clientId = nameToId.get(e.clientName);
          delete e.clientName;
          e.updatedAt = t;
          await tx.table('events').put(e);
        }
      }

      // Cập nhật payments (giữ clientLabel, bỏ clientKey)
      for (const p of payments) {
        if (p.clientLabel) {
          p.clientId = nameToId.get(p.clientLabel);
          delete p.clientKey;
          p.updatedAt = t;
          await tx.table('payments').put(p);
        }
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    //  version(4) — bản gốc cho gộp xung đột theo từng trường
    //
    //  CHỈ THÊM MỘT BẢNG RỖNG, KHÔNG CÓ upgrade() — cùng mức rủi ro gần bằng
    //  không như version(2). Bảng tự đầy dần: lần đồng bộ đầu tiên sau khi
    //  nâng cấp ghi bản gốc cho mọi dòng đang khớp với đám mây (`toRebase`).
    //
    //  Khóa chính GHÉP `[table+id]`: id chỉ duy nhất TRONG một bảng, và
    //  `sys-uncategorized` hay id tất định của đối tượng có thể trùng chuỗi
    //  với id ở bảng khác. Index `table` để đọc bản gốc của một bảng một lượt.
    //
    //  ⚠️ KHÔNG nằm trong BACKUP_TABLES, KHÔNG nằm trong supabase_schema.sql.
    //  Nó là trạng thái của MỘT máy với đám mây, dẫn xuất được — mất nó thì
    //  chỉ lùi về luật "bên mới hơn thắng" cho tới lần đồng bộ kế tiếp. README
    //  mục "Gộp xung đột theo từng trường" giải thích vì sao.
    // ─────────────────────────────────────────────────────────────────────
    this.version(4).stores({
      syncBase: '[table+id], table',
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
