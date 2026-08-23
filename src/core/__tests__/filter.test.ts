import { describe, expect, it } from 'vitest';
import type { Occurrence } from '../../types';
import {
  distinctClients,
  filterOccurrences,
  normalizeText,
  totalMinutes,
} from '../filter';
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

  it('trả chữ Hán, Kana, Hangul về nguyên dạng', () => {
    // Chữ Hán không tách được nên qua thẳng. Hangul và kana có dakuten thì
    // NFD CÓ tách — `한` thành ba jamo, `が` thành `か` + U+3099 — và bước NFC
    // cuối hàm là thứ ghép chúng lại. Thiếu bước đó, chuỗi trả về trông y hệt
    // trên màn hình nhưng không bằng nhau khi so bằng `===`.
    expect(normalizeText('中文课')).toBe('中文课');
    expect(normalizeText('日本語')).toBe('日本語');
    expect(normalizeText('한국어')).toBe('한국어');
    expect(normalizeText('がぎ')).toBe('がぎ');
  });

  it('chuỗi NFC và NFD của cùng một nội dung cho ra kết quả giống nhau', () => {
    // Dữ liệu dán từ nơi khác vào có thể ở dạng đã tách sẵn. Hai dạng phải
    // quy về một, nếu không tìm kiếm sẽ trượt mà không ai hiểu vì sao.
    expect(normalizeText('한국'.normalize('NFD'))).toBe(normalizeText('한국'));
    expect(normalizeText('Đại'.normalize('NFD'))).toBe(normalizeText('Đại'));
  });

  it('giữ nguyên emoji', () => {
    expect(normalizeText('Họp 📌')).toBe('hop 📌');
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

  it('tìm được tiêu đề tiếng Trung, và lẫn lộn Việt–Trung', () => {
    // Tiếng Trung không có khoảng trắng nên cả cụm là MỘT từ khóa; phép tách
    // theo khoảng trắng vẫn cho kết quả đúng.
    const mixed = [
      occ({ key: 'zh', title: '中文课 HSK4', clientName: '王老师' }),
      occ({ key: 'vi', title: 'Học tiếng Trung' }),
    ];
    expect(filterOccurrences(mixed, { query: '中文' }).map((o) => o.key)).toEqual(['zh']);
    expect(filterOccurrences(mixed, { query: '王老师' }).map((o) => o.key)).toEqual(['zh']);
    // Bỏ dấu vẫn hoạt động trên phần tiếng Việt của cùng tập dữ liệu
    expect(filterOccurrences(mixed, { query: 'hoc tieng' }).map((o) => o.key)).toEqual([
      'vi',
    ]);
    // Chữ Latin trong tiêu đề tiếng Trung vẫn hạ chữ thường bình thường
    expect(filterOccurrences(mixed, { query: 'hsk4' }).map((o) => o.key)).toEqual(['zh']);
  });
});

describe('lọc theo clientName — không riêng học sinh', () => {
  // Trường này trả lời "buổi này dành cho ai / ở đâu": học sinh với gia sư,
  // chỗ làm với đi làm, môn học với đại học.
  const list = [
    occ({ key: 'a', clientName: 'Minh' }),
    occ({ key: 'b', clientName: 'PULLMAN' }),
    occ({ key: 'c', clientName: ' minh ' }),
    occ({ key: 'd' }),
  ];

  it('gom cả biến thể hoa thường và khoảng trắng thừa', () => {
    expect(filterOccurrences(list, { clientNames: ['Minh'] }).map((o) => o.key)).toEqual([
      'a',
      'c',
    ]);
  });

  it('bỏ trống thì không lọc gì', () => {
    expect(filterOccurrences(list, { clientNames: [] })).toHaveLength(4);
  });

  it('kết hợp được với bộ lọc khác', () => {
    const out = filterOccurrences(list, {
      clientNames: ['PULLMAN'],
      statuses: ['SCHEDULED'],
    });
    expect(out.map((o) => o.key)).toEqual(['b']);
  });
});

describe('distinctClients', () => {
  it('gộp biến thể về một mục, giữ dạng gõ đầu tiên', () => {
    const out = distinctClients([
      occ({ clientName: 'Minh' }),
      occ({ clientName: ' minh ' }),
      occ({ clientName: 'PULLMAN' }),
    ]);
    expect(out).toEqual(['Minh', 'PULLMAN']);
  });

  it('bỏ qua buổi không có tên đối tượng', () => {
    expect(distinctClients([occ(), occ({ clientName: '   ' })])).toEqual([]);
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
