import { describe, expect, it } from 'vitest';
import type { Category, Occurrence, OccurrenceStatus, SalaryRule } from '../../types';
import { toAbsolute } from '../../core/time';
import {
  buildPdfModel,
  findUnsupportedText,
  pdfFileName,
  type PdfModelInput,
} from '../model';

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

const DATES = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
  '2026-08-23',
];

function cat(over: Partial<Category> = {}): Category {
  return {
    ...meta,
    id: 'rossi',
    name: 'Rossi',
    color: '#f59e0b',
    isIncomeEligible: true,
    sortOrder: 1,
    ...over,
  };
}

function occ(over: Partial<Occurrence> & { status?: OccurrenceStatus } = {}): Occurrence {
  const date = over.date ?? '2026-08-17';
  const startTime = over.startTime ?? '08:00';
  const durationMinutes = over.durationMinutes ?? 120;
  const startAbs = toAbsolute(date, startTime);
  return {
    key: over.key ?? `k-${date}-${startTime}`,
    sourceType: 'RULE',
    sourceId: 'r1',
    title: 'Ca sáng',
    categoryId: 'rossi',
    date,
    startTime,
    durationMinutes,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + durationMinutes * 60_000,
    status: 'SCHEDULED',
    ratePerHour: 100_000,
    hasConflict: false,
    conflictWith: [],
    ...over,
  };
}

function build(
  occurrences: Occurrence[],
  categories: Category[] = [cat()],
  salaryRules: SalaryRule[] = [],
) {
  const input: PdfModelInput = {
    dates: DATES,
    occurrences,
    categories: new Map(categories.map((c) => [c.id, c])),
    salaryRules,
    labels: {
      appName: 'App',
      rangeLabel: 'Tuần',
      exportedLabel: 'Xuất',
      summary: 'Tổng kết',
      plannedHours: 'Kế hoạch',
      completedHours: 'Đã làm',
      estimatedIncome: 'Thu nhập',
      fixedMonthlyExcluded: 'chưa gồm khoán tháng',
      weekdays: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      bands: ['Sáng', 'Chiều', 'Tối'],
    },
    format: {
      dayLabel: (d) => d.slice(8),
      hours: (h) => `${h}h`,
      money: (a) => `${a}đ`,
      dayOfWeek: () => 1,
    },
  };
  return buildPdfModel(input);
}

// ───────────────────────────────────────────────────────────────────────────

describe('buildPdfModel — cột ngày', () => {
  it('luôn sinh đủ bảy cột, kể cả ngày trống', () => {
    const model = build([occ()]);
    expect(model.columns).toHaveLength(7);
    expect(model.columns[1].events).toEqual([]);
  });

  it('sắp xếp buổi trong ngày theo giờ bắt đầu', () => {
    const model = build([
      occ({ key: 'b', startTime: '14:00' }),
      occ({ key: 'a', startTime: '08:00' }),
    ]);
    expect(model.columns[0].events.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('ghép chuỗi giờ từ thời lượng, không đọc endTime', () => {
    const model = build([occ({ startTime: '22:00', durationMinutes: 240 })]);
    // Ca qua đêm: 22:00 + 4 giờ = 02:00, KHÔNG phải giờ âm.
    expect(model.columns[0].events[0].time).toBe('22:00–02:00');
  });

  it('đánh dấu trạng thái bằng KÝ HIỆU, không bằng màu', () => {
    // Bản in có thể ra máy in đen trắng, lúc đó màu là thông tin bị mất.
    const model = build([
      occ({ key: 'a', status: 'COMPLETED' }),
      occ({ key: 'b', startTime: '10:00', status: 'NO_SHOW' }),
      occ({ key: 'c', startTime: '12:00', status: 'SCHEDULED' }),
    ]);
    expect(model.columns[0].events.map((e) => e.mark)).toEqual(['✓', '✗', '']);
  });
});

describe('buildPdfModel — chia buổi Sáng/Chiều/Tối', () => {
  it('xếp đúng nhóm theo giờ bắt đầu', () => {
    const model = build([
      occ({ key: 'toi', startTime: '19:00' }),
      occ({ key: 'sang', startTime: '08:00' }),
      occ({ key: 'chieu', startTime: '14:00' }),
    ]);
    const bands = model.columns[0].bands;
    expect(bands.map((b) => b.label)).toEqual(['Sáng', 'Chiều', 'Tối']);
    expect(bands.map((b) => b.events.map((e) => e.key))).toEqual([
      ['sang'],
      ['chieu'],
      ['toi'],
    ]);
  });

  it('`bands` và `events` là CÙNG một tập dữ liệu', () => {
    // `events` phẳng dùng để đếm và dò ký tự, `bands` dùng để vẽ. Lệch nhau
    // là số liệu tổng kết sẽ không khớp với thứ in ra.
    const model = build([
      occ({ key: 'a', startTime: '08:00' }),
      occ({ key: 'b', startTime: '20:00' }),
    ]);
    const flat = model.columns[0].bands.flatMap((b) => b.events.map((e) => e.key));
    expect(flat.sort()).toEqual(model.columns[0].events.map((e) => e.key).sort());
  });

  it('nhóm rỗng vẫn tồn tại để tầng hiển thị tự quyết định ẩn hay hiện', () => {
    const model = build([occ({ startTime: '08:00' })]);
    expect(model.columns[0].bands).toHaveLength(3);
    expect(model.columns[0].bands[1].events).toEqual([]);
  });
});

describe('buildPdfModel — buổi đã hủy', () => {
  const list = [
    occ({ key: 'live', durationMinutes: 120 }),
    occ({ key: 'dead', startTime: '14:00', durationMinutes: 180, status: 'CANCELLED' }),
  ];

  it('không lên giấy', () => {
    // Bản in là thứ mang theo để làm việc, không phải nhật ký.
    expect(build(list).columns[0].events.map((e) => e.key)).toEqual(['live']);
  });

  it('cũng không tính vào giờ kế hoạch', () => {
    expect(build(list).summary.plannedValue).toBe('2h');
  });
});

describe('buildPdfModel — thu nhập', () => {
  it('cộng dồn Tầng 1 cho công việc trả theo giờ', () => {
    const model = build([occ({ durationMinutes: 120, ratePerHour: 100_000 })]);
    expect(model.summary.incomeValue).toBe('200000đ');
    expect(model.summary.incomeNote).toBeNull();
  });

  it('LOẠI công việc khoán tháng khỏi tổng và nói rõ ra', () => {
    // 8 triệu một tháng không chia đều được cho từng tuần. calcOccurrenceIncome
    // trả về `null` cho chế độ này, và cộng `null` vào là bịa số.
    const fixed: SalaryRule = {
      ...meta,
      id: 's1',
      categoryId: 'rossi',
      mode: 'FIXED_MONTHLY',
      baseSalary: 8_000_000,
      shortfallPolicy: 'NONE',
      currency: 'VND',
      effectiveFrom: '2026-08',
    };
    const model = build([occ({ durationMinutes: 120 })], [cat()], [fixed]);

    expect(model.summary.incomeValue).toBeNull();
    // Giờ vẫn được đếm — chỉ tiền là không quy đổi được.
    expect(model.summary.plannedValue).toBe('2h');
  });

  it('trộn hai chế độ thì chỉ cộng phần theo giờ, kèm ghi chú', () => {
    const fixed: SalaryRule = {
      ...meta,
      id: 's1',
      categoryId: 'rossi',
      mode: 'FIXED_MONTHLY',
      baseSalary: 8_000_000,
      shortfallPolicy: 'NONE',
      currency: 'VND',
      effectiveFrom: '2026-08',
    };
    const model = build(
      [
        occ({ key: 'a', categoryId: 'rossi', durationMinutes: 60 }),
        occ({ key: 'b', categoryId: 'giasu', startTime: '10:00', durationMinutes: 60 }),
      ],
      [cat(), cat({ id: 'giasu', name: 'Gia sư', color: '#10b981' })],
      [fixed],
    );

    expect(model.summary.incomeValue).toBe('100000đ');
    expect(model.summary.incomeNote).toBe('chưa gồm khoán tháng');
  });

  it('không hiện dòng thu nhập khi tổng bằng 0', () => {
    const model = build([occ()], [cat({ isIncomeEligible: false })]);
    expect(model.summary.incomeLabel).toBeNull();
  });
});

describe('buildPdfModel — chú thích màu', () => {
  it('chỉ gồm danh mục THẬT SỰ có mặt trong tuần', () => {
    const model = build(
      [occ({ categoryId: 'rossi' })],
      [cat(), cat({ id: 'giasu', name: 'Gia sư' }), cat({ id: 'dh', name: 'Đại học' })],
    );
    expect(model.legend.map((l) => l.name)).toEqual(['Rossi']);
  });

  it('không lặp khi một danh mục có nhiều buổi', () => {
    const model = build([occ({ key: 'a' }), occ({ key: 'b', startTime: '14:00' })]);
    expect(model.legend).toHaveLength(1);
  });

  it('tuần trống thì không có chú thích nào', () => {
    expect(build([]).legend).toEqual([]);
  });
});

describe('findUnsupportedText — chặn PDF ra ký tự sai', () => {
  // Font Latin thiếu glyph thì PDF KHÔNG bỏ trống, nó lấy glyph ở chỉ số
  // tương ứng: `中文` ra `-‡`. Ký tự sai trông như thật nguy hiểm hơn ô vuông
  // báo thiếu, vì người dùng có thể gửi file đi mà không nhận ra.

  it('bắt chữ Hán trong tiêu đề', () => {
    const model = build([occ({ title: 'học tiếng Trung 中文' })]);
    expect(findUnsupportedText(model)).toBe('học tiếng Trung 中文');
  });

  it('bắt kana, Hangul và emoji', () => {
    expect(findUnsupportedText(build([occ({ title: '日本語' })]))).toBe('日本語');
    expect(findUnsupportedText(build([occ({ title: '한국어' })]))).toBe('한국어');
    expect(findUnsupportedText(build([occ({ title: 'Họp 📌' })]))).toBe('Họp 📌');
  });

  it('bắt cả trong tên danh mục và địa điểm', () => {
    expect(
      findUnsupportedText(build([occ()], [cat({ name: '中文课' })])),
    ).toBe('中文课');
    expect(findUnsupportedText(build([occ({ location: '北京' })]))).toBe('北京');
  });

  it('KHÔNG chặn tiếng Việt có dấu — font đã nạp vẽ được', () => {
    // Chặn nhầm ở đây là chặn đúng trường hợp thông dụng nhất của người dùng.
    const model = build([
      occ({ title: 'Đại học — Giải tích 2', location: 'Tòa nhà B1' }),
    ]);
    expect(findUnsupportedText(model)).toBeNull();
  });

  it('tuần trống thì không có gì để chặn', () => {
    expect(findUnsupportedText(build([]))).toBeNull();
  });
});

describe('pdfFileName', () => {
  it('mang khoảng ngày của tuần, không phải ngày hôm nay', () => {
    // Xuất lịch tuần khác mà file trùng tên thì trình duyệt đặt (1), (2)…
    // và vài hôm sau không ai biết file nào là tuần nào.
    expect(pdfFileName(DATES)).toBe('Personal-Schedule-2026-08-17-to-2026-08-23.pdf');
  });
});
