// ═══════════════════════════════════════════════════════════════════════════
//  core/payment.ts — TIỀN PHẢI THU của từng đối tượng, và đã thu được bao nhiêu
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  "Đối tượng" ở đây là `clientName`: học sinh với lịch gia sư, chỗ làm với
//  lịch đi làm, lớp với lịch đại học. Không có gì riêng cho việc dạy học.
//
//  ⚠️ TRẠNG THÁI ĐƯỢC TÍNH RA, KHÔNG ĐƯỢC LƯU.
//
//  Đã thu / chưa thu / thu một phần là kết quả so sánh giữa số phải thu và
//  tổng các khoản đã ghi nhận. Lưu nó thành một cột trong DB là tạo nguồn sự
//  thật thứ hai: thêm một buổi vào cuối tháng thì số phải thu đổi, nhưng cột
//  trạng thái không tự biết, và nó sẽ nói dối đúng vào lúc cần nhất.
//
//  ⚠️ LƯƠNG KHOÁN THÁNG KHÔNG CHIA ĐƯỢC CHO TỪNG ĐỐI TƯỢNG.
//
//  `calcOccurrenceIncome` trả về `null` cho chế độ đó, và ở đây `null` được
//  giữ nguyên chứ không quy về 0. Tám triệu một tháng không phải tổng tiền
//  của từng học sinh cộng lại — chia đều ra là bịa số. Những dòng đó mang
//  trạng thái 'notApplicable' và màn hình hiện "—".
// ═══════════════════════════════════════════════════════════════════════════

import type { Category, Occurrence, Payment, SalaryRule } from '../types';
import { normalizeText } from './filter';
import { calcOccurrenceIncome, resolveSalaryRule } from './income';
import { hoursOf, monthOf } from './time';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'notApplicable';

export interface ClientDues {
  clientId: string;
  clientLabel: string;
  categoryId: string;
  sessions: number;
  hours: number;
  /** `null` khi công việc trả khoán tháng — không quy đổi được */
  due: number | null;
  paid: number;
  /** `null` khi `due` là `null` */
  remaining: number | null;
  status: PaymentStatus;
}

/**
 * Ngưỡng coi là đã thu đủ.
 *
 * Số phải thu đến từ phép nhân giờ với đơn giá nên hay ra số lẻ (15,5 giờ ×
 * 37.037đ). So sánh dấu bằng trên số thực sẽ khiến một dòng đã trả đúng số
 * tiền vẫn hiện "còn thiếu 0đ". Làm tròn về đồng rồi so.
 */
const EPSILON = 0.5;

function statusOf(due: number | null, paid: number): PaymentStatus {
  if (due == null) return 'notApplicable';
  if (paid <= EPSILON) return 'unpaid';
  if (paid >= due - EPSILON) return 'paid';
  return 'partial';
}

export interface DuesInput {
  /** Occurrence của THÁNG cần tính, đã hợp nhất rule + exception */
  occurrences: Occurrence[];
  payments: Payment[];
  categories: Map<string, Category>;
  salaryRules: SalaryRule[];
  /** "YYYY-MM" */
  month: string;
}

/**
 * Gộp theo đối tượng: mỗi dòng là một người/nơi trong một tháng.
 *
 * Buổi không có `clientName` bị bỏ qua hoàn toàn — chúng vẫn nằm trong bảng
 * lương tổng, chỉ là không quy được cho ai để đi đòi tiền.
 *
 * Buổi đã hủy và vắng mặt không sinh tiền phải thu (đúng theo
 * `calcOccurrenceIncome`), nhưng vẫn không được đếm vào số buổi — nếu đếm thì
 * dòng "2 buổi · 0đ" sẽ trông như một lỗi tính tiền.
 */
export function computeDues(input: DuesInput): ClientDues[] {
  const rows = new Map<string, ClientDues>();

  for (const occurrence of input.occurrences) {
    if (occurrence.status !== 'COMPLETED' && occurrence.status !== 'NO_SHOW') continue;

    const key = occurrence.clientId;
    if (!key) continue;

    const label = occurrence.clientName?.trim() || 'Unknown';

    let row = rows.get(key);
    if (!row) {
      row = {
        clientId: key,
        clientLabel: label,
        categoryId: occurrence.categoryId,
        sessions: 0,
        hours: 0,
        due: 0,
        paid: 0,
        remaining: 0,
        status: 'unpaid',
      };
      rows.set(key, row);
    }

    row.sessions += 1;
    row.hours += hoursOf(occurrence.durationMinutes);

    const value = calcOccurrenceIncome(
      occurrence,
      input.categories.get(occurrence.categoryId),
      resolveSalaryRule(input.salaryRules, occurrence.categoryId, monthOf(occurrence.date)),
    );
    // Một buổi khoán tháng làm cả dòng thành "không quy đổi được". Cộng phần
    // còn lại vào rồi hiện ra sẽ là một con số đúng một nửa, tệ hơn là không
    // hiện gì.
    if (value == null) row.due = null;
    else if (row.due != null) row.due += value;
  }

  const paidByKey = new Map<string, number>();
  for (const payment of input.payments) {
    if (payment.deletedAt) continue;
    if (payment.month !== input.month) continue;
    paidByKey.set(
      payment.clientId,
      (paidByKey.get(payment.clientId) ?? 0) + Math.abs(payment.amount),
    );
  }

  for (const row of rows.values()) {
    row.due = row.due == null ? null : Math.round(row.due);
    row.paid = Math.round(paidByKey.get(row.clientId) ?? 0);
    row.remaining = row.due == null ? null : Math.max(0, row.due - row.paid);
    row.status = statusOf(row.due, row.paid);
  }

  return [...rows.values()].sort(
    (a, b) => (b.remaining ?? -1) - (a.remaining ?? -1) ||
      a.clientLabel.localeCompare(b.clientLabel),
  );
}

export interface DuesTotals {
  due: number;
  paid: number;
  remaining: number;
  /** Có dòng không quy đổi được — tổng bên trên chưa gồm chúng */
  hasUnattributable: boolean;
}

/**
 * Cộng dồn các dòng. Dòng 'notApplicable' KHÔNG được cộng vào `due`, nhưng
 * tiền đã thu của chúng thì có — người dùng vẫn ghi nhận được khoản tiền
 * thật đã nhận, chỉ là hệ thống không biết đáng lẽ phải thu bao nhiêu.
 */
export function duesTotals(rows: ClientDues[]): DuesTotals {
  let due = 0;
  let paid = 0;
  let remaining = 0;
  let hasUnattributable = false;

  for (const row of rows) {
    paid += row.paid;
    if (row.due == null) {
      hasUnattributable = true;
      continue;
    }
    due += row.due;
    remaining += row.remaining ?? 0;
  }

  return { due, paid, remaining, hasUnattributable };
}
