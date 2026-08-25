import type { Category } from '../types';
import { SEEDED_CATEGORY_IDS, UNCATEGORIZED_ID } from '../types';
import { db, nowISO } from './schema';

/**
 * Seed danh mục ban đầu. Chạy đúng một lần, khi DB còn rỗng.
 *
 * Danh mục "Chưa phân loại" là BẮT BUỘC: mục 8.1 yêu cầu xóa Category thì
 * đưa sự kiện về danh mục mặc định — nhưng bản kế hoạch gốc không định nghĩa
 * danh mục đó ở đâu cả.
 *
 * Chú ý cờ isIncomeEligible:
 *   Đại học, Nghiên cứu  → false  (đi học không tính thu nhập)
 *   Đi làm, Gia sư       → true   (đi làm mới tính thu nhập)
 *
 * ⚠️ MỖI NGUỒN THU NHẬP MỘT DANH MỤC RIÊNG — đừng gộp.
 *
 * `SalaryRule` gắn vào `categoryId`, và mỗi danh mục chỉ có MỘT chế độ lương
 * tại một thời điểm. Gộp một chỗ trả khoán tháng với một chỗ trả theo giờ vào
 * chung "Đi làm" thì `calcMonthlyPayroll` không còn cách nào phân biệt, và bạn
 * buộc phải chọn một chế độ cho cả hai — con số ra sai cả hai chiều.
 *
 * Vì thế "Đi làm" ở đây là MỘT chỗ làm, không phải nhóm gộp mọi chỗ làm. Có
 * chỗ làm thứ hai thì tạo danh mục thứ hai.
 *
 * ⚠️ ID PHẢI LÀ HẰNG SỐ, TUYỆT ĐỐI KHÔNG DÙNG `newId()`.
 *
 * Bản trước dùng `newId()` cho năm danh mục dưới, và đó là một lỗi mất dữ
 * liệu thật: mỗi IndexedDB mới sinh một bộ id khác cho cùng năm khái niệm,
 * rồi đồng bộ đẩy chúng lên như bản ghi mới. "Gia sư" nhân thành ba. Chi tiết
 * ở `SEEDED_CATEGORY_IDS` trong types/index.ts.
 *
 * Với id cố định, hai máy cùng seed ra cùng một bộ id, và `planSync` coi
 * chúng là MỘT bản ghi. Khóa chính ghép `(user_id, id)` bên Supabase lo phần
 * hai người dùng khác nhau cùng có `sys-tutor`.
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
    { ...base, id: SEEDED_CATEGORY_IDS.university, name: 'Đại học', color: '#3b82f6', isIncomeEligible: false, sortOrder: 1 },
    { ...base, id: SEEDED_CATEGORY_IDS.work, name: 'Đi làm', color: '#f59e0b', isIncomeEligible: true, sortOrder: 2 },
    { ...base, id: SEEDED_CATEGORY_IDS.tutor, name: 'Gia sư', color: '#10b981', isIncomeEligible: true, sortOrder: 3 },
    { ...base, id: SEEDED_CATEGORY_IDS.research, name: 'Nghiên cứu', color: '#8b5cf6', isIncomeEligible: false, sortOrder: 4 },
    { ...base, id: SEEDED_CATEGORY_IDS.personal, name: 'Cá nhân', color: '#ec4899', isIncomeEligible: false, sortOrder: 5 },
  ];

  await db.categories.bulkAdd(categories);
  return true;
}
