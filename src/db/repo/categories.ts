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
  if (id === UNCATEGORIZED_ID) {
    throw new Error('Không thể xóa danh mục hệ thống "Chưa phân loại".');
  }

  const t = nowISO();
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
      await db.salaryRules.where('categoryId').equals(id)
        .modify({ deletedAt: t, updatedAt: t });
      await db.adjustments.where('categoryId').equals(id)
        .modify({ deletedAt: t, updatedAt: t });

      await db.categories.update(id, { deletedAt: t, updatedAt: t });
    },
  );
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
