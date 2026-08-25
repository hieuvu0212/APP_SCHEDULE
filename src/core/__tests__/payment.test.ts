import { describe, expect, it } from 'vitest';
import type { Category, Occurrence, OccurrenceStatus, Payment, SalaryRule } from '../../types';
import { computeDues, duesTotals } from '../payment';
import { toAbsolute } from '../time';

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const MONTH = '2026-08';

const tutoring: Category = {
  ...meta,
  id: 'giasu',
  name: 'Gia sư',
  color: '#10b981',
  isIncomeEligible: true,
  sortOrder: 1,
};

function occ(
  over: Partial<Occurrence> & { status?: OccurrenceStatus } = {},
): Occurrence {
  const date = over.date ?? '2026-08-05';
  const startTime = over.startTime ?? '18:00';
  const durationMinutes = over.durationMinutes ?? 120;
  const startAbs = toAbsolute(date, startTime);
  return {
    key: over.key ?? `k-${Math.random()}`,
    sourceType: 'RULE',
    sourceId: 'r1',
    title: 'Dạy',
    categoryId: 'giasu',
    date,
    startTime,
    durationMinutes,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + durationMinutes * 60_000,
    status: 'SCHEDULED',
    clientName: 'Minh',
    ratePerHour: 100_000,
    hasConflict: false,
    conflictWith: [],
    ...over,
  };
}

function pay(over: Partial<Payment> = {}): Payment {
  return {
    ...meta,
    id: `p-${Math.random()}`,
    clientId: 'minh',
    clientLabel: 'Minh',
    categoryId: 'giasu',
    month: MONTH,
    amount: 100_000,
    ...over,
  };
}

const build = (
  occurrences: Occurrence[],
  payments: Payment[] = [],
  salaryRules: SalaryRule[] = [],
) =>
  computeDues({
    occurrences,
    payments,
    categories: new Map([[tutoring.id, tutoring]]),
    salaryRules,
    month: MONTH,
  });

// ───────────────────────────────────────────────────────────────────────────

describe('computeDues — gộp theo đối tượng', () => {
  it('gộp biến thể hoa thường và khoảng trắng thành một dòng', () => {
    const rows = build([
      occ({ clientName: 'Minh' }),
      occ({ clientName: ' minh ' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessions).toBe(2);
    // Giữ dạng gõ đầu tiên để hiển thị.
    expect(rows[0].clientLabel).toBe('Minh');
  });

  it('bỏ qua buổi KHÔNG có tên đối tượng', () => {
    // Chúng vẫn nằm trong bảng lương tổng, chỉ là không quy được cho ai.
    expect(build([occ({ clientName: undefined })])).toEqual([]);
  });

  it('buổi đã hủy và vắng mặt không được đếm', () => {
    // Đếm chúng sẽ cho ra dòng "2 buổi · 0đ", trông như một lỗi tính tiền.
    const rows = build([
      occ({ status: 'CANCELLED' }),
      occ({ status: 'NO_SHOW' }),
      occ({ durationMinutes: 60 }),
    ]);
    expect(rows[0].sessions).toBe(1);
    expect(rows[0].hours).toBe(1);
    expect(rows[0].due).toBe(100_000);
  });

  it('xếp dòng còn nợ nhiều nhất lên đầu', () => {
    const rows = build([
      occ({ clientName: 'An', durationMinutes: 60 }),
      occ({ clientName: 'Bình', durationMinutes: 240 }),
    ]);
    expect(rows.map((r) => r.clientLabel)).toEqual(['Bình', 'An']);
  });
});

describe('computeDues — trạng thái được TÍNH RA', () => {
  it('chưa thu đồng nào', () => {
    const [row] = build([occ({ durationMinutes: 120 })]);
    expect(row.due).toBe(200_000);
    expect(row.paid).toBe(0);
    expect(row.remaining).toBe(200_000);
    expect(row.status).toBe('unpaid');
  });

  it('thu một phần', () => {
    const [row] = build([occ({ durationMinutes: 120 })], [pay({ amount: 50_000 })]);
    expect(row.paid).toBe(50_000);
    expect(row.remaining).toBe(150_000);
    expect(row.status).toBe('partial');
  });

  it('thu đủ', () => {
    const [row] = build([occ({ durationMinutes: 120 })], [pay({ amount: 200_000 })]);
    expect(row.remaining).toBe(0);
    expect(row.status).toBe('paid');
  });

  it('thu thừa vẫn là đã thu đủ, và còn thiếu KHÔNG âm', () => {
    const [row] = build([occ({ durationMinutes: 60 })], [pay({ amount: 500_000 })]);
    expect(row.status).toBe('paid');
    expect(row.remaining).toBe(0);
  });

  it('cộng dồn nhiều lần thu của cùng một đối tượng', () => {
    const [row] = build(
      [occ({ durationMinutes: 120 })],
      [pay({ amount: 80_000 }), pay({ amount: 120_000 })],
    );
    expect(row.paid).toBe(200_000);
    expect(row.status).toBe('paid');
  });

  it('bỏ qua khoản thu đã xóa mềm và khoản của THÁNG KHÁC', () => {
    const [row] = build(
      [occ({ durationMinutes: 120 })],
      [
        pay({ amount: 200_000, deletedAt: '2026-08-10T00:00:00Z' }),
        pay({ amount: 200_000, month: '2026-07' }),
      ],
    );
    expect(row.paid).toBe(0);
    expect(row.status).toBe('unpaid');
  });

  it('số lẻ do nhân giờ với đơn giá vẫn tính là thu đủ', () => {
    // 1,5 giờ × 37.037 = 55.555,5 — so dấu bằng trên số thực sẽ báo còn
    // thiếu 0đ. Làm tròn về đồng rồi so.
    const [row] = build(
      [occ({ durationMinutes: 90, ratePerHour: 37_037 })],
      [pay({ amount: 55_556 })],
    );
    expect(row.due).toBe(55_556);
    expect(row.status).toBe('paid');
  });
});

describe('computeDues — lương khoán tháng', () => {
  const fixed: SalaryRule = {
    ...meta,
    id: 's1',
    categoryId: 'giasu',
    mode: 'FIXED_MONTHLY',
    baseSalary: 8_000_000,
    shortfallPolicy: 'NONE',
    currency: 'VND',
    effectiveFrom: '2026-08',
  };

  it('KHÔNG quy đổi được cho từng đối tượng', () => {
    // 8 triệu một tháng không phải tổng tiền của từng học sinh cộng lại.
    const [row] = build([occ()], [], [fixed]);
    expect(row.due).toBeNull();
    expect(row.remaining).toBeNull();
    expect(row.status).toBe('notApplicable');
  });

  it('giờ và số buổi vẫn được đếm bình thường', () => {
    const [row] = build([occ({ durationMinutes: 120 })], [], [fixed]);
    expect(row.sessions).toBe(1);
    expect(row.hours).toBe(2);
  });

  it('một buổi khoán tháng làm CẢ DÒNG thành không quy đổi được', () => {
    // Cộng phần còn lại rồi hiện ra sẽ là con số đúng một nửa — tệ hơn là
    // không hiện gì.
    const [row] = build(
      [occ({ key: 'a', categoryId: 'giasu' }), occ({ key: 'b', categoryId: 'giasu' })],
      [],
      [fixed],
    );
    expect(row.due).toBeNull();
  });

  it('vẫn ghi nhận được tiền đã thu thật', () => {
    const [row] = build([occ()], [pay({ amount: 300_000 })], [fixed]);
    expect(row.paid).toBe(300_000);
    expect(row.due).toBeNull();
  });
});

describe('duesTotals', () => {
  it('cộng dồn qua mọi đối tượng', () => {
    const rows = build(
      [
        occ({ clientName: 'An', durationMinutes: 60 }),
        occ({ clientName: 'Bình', durationMinutes: 120 }),
      ],
      [pay({ clientId: 'an', amount: 50_000 })],
    );
    const totals = duesTotals(rows);
    expect(totals.due).toBe(300_000);
    expect(totals.paid).toBe(50_000);
    expect(totals.remaining).toBe(250_000);
    expect(totals.hasUnattributable).toBe(false);
  });

  it('dòng không quy đổi được KHÔNG vào tổng phải thu, nhưng tiền đã thu thì có', () => {
    const rows: Parameters<typeof duesTotals>[0] = [
      {
        clientId: 'a',
        clientLabel: 'A',
        categoryId: 'x',
        sessions: 1,
        hours: 2,
        due: 100_000,
        paid: 40_000,
        remaining: 60_000,
        status: 'partial',
      },
      {
        clientId: 'b',
        clientLabel: 'B',
        categoryId: 'x',
        sessions: 1,
        hours: 2,
        due: null,
        paid: 300_000,
        remaining: null,
        status: 'notApplicable',
      },
    ];
    const totals = duesTotals(rows);
    expect(totals.due).toBe(100_000);
    expect(totals.paid).toBe(340_000);
    expect(totals.hasUnattributable).toBe(true);
  });

  it('danh sách rỗng ra toàn số 0, không NaN', () => {
    expect(duesTotals([])).toEqual({
      due: 0,
      paid: 0,
      remaining: 0,
      hasUnattributable: false,
    });
  });
});
