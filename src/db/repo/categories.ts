import type { Category } from '../../types';
import { UNCATEGORIZED_ID } from '../../types';
import { db, newId, nowISO } from '../schema';

export async function listCategories(): Promise<Category[]> {
  const all = await db.categories.toArray();
  return all
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function createCategory(
  input: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const t = nowISO();
  const id = newId();
  await db.categories.add({ ...input, id, createdAt: t, updatedAt: t });
  return id;
}

export async function updateCategory(
  id: string,
  patch: Partial<Category>,
): Promise<void> {
  await db.categories.update(id, { ...patch, updatedAt: nowISO() });
}

/**
 * Xóa Category — yêu cầu ở mục 8.1: đưa các sự kiện liên quan về danh mục
 * mặc định, KHÔNG được làm hỏng DB.
 *
 * Danh mục hệ thống ("Chưa phân loại") không cho xóa, vì nó chính là nơi
 * nhận các sự kiện mồ côi.
 */
export async function softDeleteCategory(id: string): Promise<void> {
  await softDeleteCategoryAt(id, nowISO());
}

/** Như softDeleteCategory nhưng đóng dấu thời gian do người gọi chỉ định */
async function softDeleteCategoryAt(id: string, t: string): Promise<void> {
  if (id === UNCATEGORIZED_ID) {
    throw new Error('Không thể xóa danh mục hệ thống "Chưa phân loại".');
  }

  await db.transaction(
    'rw',
    [db.categories, db.rules, db.events, db.salaryRules, db.adjustments],
    async () => {
      await db.rules.where('categoryId').equals(id)
        .modify({ categoryId: UNCATEGORIZED_ID, updatedAt: t });
      await db.events.where('categoryId').equals(id)
        .modify({ categoryId: UNCATEGORIZED_ID, updatedAt: t });

      // SalaryRule và adjustment gắn chặt với công việc cụ thể — chuyển sang
      // "Chưa phân loại" là vô nghĩa (danh mục đó isIncomeEligible=false).
      // Xóa mềm để còn khôi phục được nếu người dùng lỡ tay.
      //
      // Bỏ qua bản ghi ĐÃ xóa từ trước: đóng lại dấu `t` lên chúng sẽ khiến
      // thao tác hoàn tác kéo cả những thứ người dùng đã cố ý xóa quay lại.
      await db.salaryRules.where('categoryId').equals(id)
        .filter((r) => !r.deletedAt)
        .modify({ deletedAt: t, updatedAt: t });
      await db.adjustments.where('categoryId').equals(id)
        .filter((a) => !a.deletedAt)
        .modify({ deletedAt: t, updatedAt: t });

      await db.categories.update(id, { deletedAt: t, updatedAt: t });
    },
  );
}

/**
 * Xóa Category kèm cách HOÀN NGUYÊN chính xác.
 *
 * Xóa danh mục không phải một phép gán `deletedAt` đơn giản: nó còn dời rule
 * và event sang "Chưa phân loại", và xóa mềm SalaryRule lẫn adjustment. Hoàn
 * tác mà chỉ gỡ `deletedAt` của danh mục thì mọi lịch vẫn nằm lại ở "Chưa
 * phân loại" — người dùng bấm "Hoàn tác" xong vẫn mất dữ liệu, chỉ khác là
 * bây giờ họ tưởng mình đã lấy lại được.
 *
 * Nên phải chụp danh sách bản ghi bị dời TRƯỚC khi xóa.
 */
export async function softDeleteCategoryUndoable(
  id: string,
): Promise<() => Promise<void>> {
  const [rules, events] = await Promise.all([
    db.rules.where('categoryId').equals(id).toArray(),
    db.events.where('categoryId').equals(id).toArray(),
  ]);
  const ruleIds = rules.filter((r) => !r.deletedAt).map((r) => r.id);
  const eventIds = events.filter((e) => !e.deletedAt).map((e) => e.id);

  const at = nowISO();
  await softDeleteCategoryAt(id, at);

  return async () => {
    const t = nowISO();
    await db.transaction(
      'rw',
      [db.categories, db.rules, db.events, db.salaryRules, db.adjustments],
      async () => {
        await db.categories.update(id, { deletedAt: undefined, updatedAt: t });
        await db.rules.where('id').anyOf(ruleIds).modify({ categoryId: id, updatedAt: t });
        await db.events.where('id').anyOf(eventIds).modify({ categoryId: id, updatedAt: t });
        // Chỉ khôi phục thứ bị xóa CÙNG LÚC, không đụng bản ghi đã xóa từ trước.
        await db.salaryRules
          .where('categoryId')
          .equals(id)
          .filter((r) => r.deletedAt === at)
          .modify({ deletedAt: undefined, updatedAt: t });
        await db.adjustments
          .where('categoryId')
          .equals(id)
          .filter((a) => a.deletedAt === at)
          .modify({ deletedAt: undefined, updatedAt: t });
      },
    );
  };
}

/**
 * Đếm số sự kiện đang mang rate/fixedAmount trong một Category.
 * Dùng cho cảnh báo ở mục 8.1 khi người dùng tắt isIncomeEligible:
 * cảnh báo, KHÔNG tự động xóa dữ liệu rate đã nhập.
 */
export async function countRatedItems(categoryId: string): Promise<number> {
  const [rules, events] = await Promise.all([
    db.rules.where('categoryId').equals(categoryId).toArray(),
    db.events.where('categoryId').equals(categoryId).toArray(),
  ]);
  const hasRate = (x: { ratePerHour?: number; fixedAmount?: number; deletedAt?: string }) =>
    !x.deletedAt && (x.ratePerHour != null || x.fixedAmount != null);
  return rules.filter(hasRate).length + events.filter(hasRate).length;
}
