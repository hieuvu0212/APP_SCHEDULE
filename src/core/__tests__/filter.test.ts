import { describe, expect, it } from 'vitest';
import type { Occurrence } from '../../types';
import { filterOccurrences, normalizeText, totalMinutes } from '../filter';
import { toAbsolute } from '../time';

function occ(over: Partial<Occurrence> = {}): Occurrence {
  const date = over.date ?? '2026-08-20';
  const startTime = over.startTime ?? '08:00';
  const durationMinutes = over.durationMinutes ?? 60;
  const startAbs = toAbsolute(date, startTime);
  return {
    key: over.key ?? `k-${Math.random()}`,
    sourceType: 'SINGLE',
    sourceId: 'e1',
    title: 'Ca sáng',
    categoryId: 'cat-a',
    date,
    startTime,
    durationMinutes,
    endsNextDay: false,
    startAbs,
    endAbs: startAbs + durationMinutes * 60_000,
    status: 'SCHEDULED',
    hasConflict: false,
    conflictWith: [],
    ...over,
  };
}

describe('normalizeText', () => {
  it('bỏ dấu thanh tiếng Việt', () => {
    expect(normalizeText('Gia sư')).toBe('gia su');
    expect(normalizeText('Nghiên cứu')).toBe('nghien cuu');
    expect(normalizeText('ế ộ ữ ằ')).toBe('e o u a');
  });

  it('xử lý được đ/Đ — chữ cái riêng, NFD không tách ra được', () => {
    expect(normalizeText('Đại học')).toBe('dai hoc');
    expect(normalizeText('đi làm')).toBe('di lam');
  });

  it('hạ chữ thường và cắt khoảng trắng thừa', () => {
    expect(normalizeText('  ROSSI  ')).toBe('rossi');
  });
});

describe('filterOccurrences', () => {
  const list = [
    occ({ key: 'a', title: 'Ca sáng Rossi', categoryId: 'rossi', status: 'COMPLETED' }),
    occ({ key: 'b', title: 'Dạy Toán cho Minh', categoryId: 'giasu', clientName: 'Minh' }),
    occ({ key: 'c', title: 'Đại học — Giải tích 2', categoryId: 'dh', status: 'CANCELLED' }),
    occ({ key: 'd', title: 'Ca chiều Rossi', categoryId: 'rossi', hasConflict: true }),
  ];

  it('bộ lọc rỗng trả về nguyên danh sách, KHÔNG phải rỗng', () => {
    expect(filterOccurrences(list, {})).toHaveLength(4);
    expect(filterOccurrences(list, { categoryIds: [], statuses: [] })).toHaveLength(4);
  });

  it('lọc theo danh mục', () => {
    const out = filterOccurrences(list, { categoryIds: ['rossi'] });
    expect(out.map((o) => o.key)).toEqual(['a', 'd']);
  });

  it('lọc theo nhiều danh mục cùng lúc', () => {
    const out = filterOccurrences(list, { categoryIds: ['rossi', 'giasu'] });
    expect(out).toHaveLength(3);
  });

  it('lọc theo trạng thái', () => {
    const out = filterOccurrences(list, { statuses: ['CANCELLED'] });
    expect(out.map((o) => o.key)).toEqual(['c']);
  });

  it('chỉ lấy buổi trùng lịch', () => {
    const out = filterOccurrences(list, { onlyConflicts: true });
    expect(out.map((o) => o.key)).toEqual(['d']);
  });

  it('tìm không dấu vẫn ra kết quả có dấu', () => {
    expect(filterOccurrences(list, { query: 'day toan' }).map((o) => o.key)).toEqual(['b']);
    expect(filterOccurrences(list, { query: 'dai hoc' }).map((o) => o.key)).toEqual(['c']);
  });

  it('nhiều từ khóa phải khớp HẾT nhưng KHÔNG cần liền nhau', () => {
    expect(filterOccurrences(list, { query: 'minh toan' }).map((o) => o.key)).toEqual(['b']);
    expect(filterOccurrences(list, { query: 'minh rossi' })).toHaveLength(0);
  });

  it('tìm được cả trong tên học sinh, không riêng tiêu đề', () => {
    expect(filterOccurrences(list, { query: 'minh' }).map((o) => o.key)).toEqual(['b']);
  });

  it('các điều kiện là VÀ với nhau', () => {
    const out = filterOccurrences(list, { categoryIds: ['rossi'], query: 'chieu' });
    expect(out.map((o) => o.key)).toEqual(['d']);
  });
});

describe('totalMinutes', () => {
  it('bỏ qua buổi đã hủy và vắng mặt', () => {
    const list = [
      occ({ durationMinutes: 120 }),
      occ({ durationMinutes: 60, status: 'CANCELLED' }),
      occ({ durationMinutes: 30, status: 'NO_SHOW' }),
      occ({ durationMinutes: 90, status: 'COMPLETED' }),
    ];
    expect(totalMinutes(list)).toBe(210);
  });
});
