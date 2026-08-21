// ═══════════════════════════════════════════════════════════════════════════
//  db/repo/salary.ts — chỉ ĐỌC ở Phase 1
//
//  CRUD SalaryRule và PayrollAdjustment thuộc Phase 3 (Thu nhập). Phase 1 cần
//  đọc được SalaryRule vì bảng chi tiết một buổi phải biết công việc đó trả
//  theo GIỜ hay KHOÁN THÁNG — khoán tháng thì thu nhập một buổi không quy đổi
//  được và phải hiện "—" thay vì một con số bịa ra.
// ═══════════════════════════════════════════════════════════════════════════

import type { SalaryRule } from '../../types';
import { db } from '../schema';

export async function listSalaryRules(): Promise<SalaryRule[]> {
  const rows = await db.salaryRules.toArray();
  return rows.filter((r) => !r.deletedAt);
}
