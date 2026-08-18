import type { Category } from '../types';
import { UNCATEGORIZED_ID } from '../types';
import { db, newId, nowISO } from './schema';

/**
 * Seed danh mục ban đầu. Chạy đúng một lần, khi DB còn rỗng.
 *
 * Danh mục "Chưa phân loại" là BẮT BUỘC: mục 8.1 yêu cầu xóa Category thì
 * đưa sự kiện về danh mục mặc định — nhưng bản kế hoạch gốc không định nghĩa
 * danh mục đó ở đâu cả.
 *
 * Chú ý cờ isIncomeEligible:
 *   Đại học, Nghiên cứu  → false  (đi học không tính thu nhập)
 *   Rossi, Gia sư        → true   (đi làm mới tính thu nhập)
 */
export async function seedIfEmpty(): Promise<boolean> {
  const count = await db.categories.count();
  if (count > 0) return false;

  const t = nowISO();
  const base = { createdAt: t, updatedAt: t };

  const categories: Category[] = [
    {
      ...base,
      id: UNCATEGORIZED_ID,
      name: 'Chưa phân loại',
      color: '#94a3b8',
      isIncomeEligible: false,
      isSystem: true,
      sortOrder: 999,
    },
    { ...base, id: newId(), name: 'Đại học', color: '#3b82f6', isIncomeEligible: false, sortOrder: 1 },
    { ...base, id: newId(), name: 'Rossi', color: '#f59e0b', isIncomeEligible: true, sortOrder: 2 },
    { ...base, id: newId(), name: 'Gia sư', color: '#10b981', isIncomeEligible: true, sortOrder: 3 },
    { ...base, id: newId(), name: 'Nghiên cứu', color: '#8b5cf6', isIncomeEligible: false, sortOrder: 4 },
    { ...base, id: newId(), name: 'Cá nhân', color: '#ec4899', isIncomeEligible: false, sortOrder: 5 },
  ];

  await db.categories.bulkAdd(categories);
  return true;
}
