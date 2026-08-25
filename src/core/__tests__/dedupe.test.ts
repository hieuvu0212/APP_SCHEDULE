import { describe, expect, it } from 'vitest';
import type { Category } from '../../types';
import { SEEDED_CATEGORY_IDS, UNCATEGORIZED_ID } from '../../types';
import { findDuplicateCategories, unusedSeedDuplicates } from '../dedupe';

const cat = (id: string, name: string, over: Partial<Category> = {}): Category => ({
  id,
  name,
  color: '#000',
  isIncomeEligible: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('findDuplicateCategories — phát hiện', () => {
  it('tên khác nhau thì không có nhóm nào', () => {
    const out = findDuplicateCategories([cat('a', 'Gia sư'), cat('b', 'Đi làm')], {});
    expect(out).toEqual([]);
  });

  it('cùng tên thì thành một nhóm', () => {
    const out = findDuplicateCategories([cat('a', 'Gia sư'), cat('b', 'Gia sư')], {});
    expect(out).toHaveLength(1);
    expect(out[0].merge).toHaveLength(1);
  });

  it('bỏ dấu và không phân biệt hoa thường', () => {
    const out = findDuplicateCategories([cat('a', 'Gia sư'), cat('b', 'GIA SU')], {});
    expect(out).toHaveLength(1);
  });

  it('bỏ qua bản ghi đã xóa mềm', () => {
    // Chúng không hiện trong dropdown nên không phải thứ người dùng thấy trùng.
    const out = findDuplicateCategories(
      [cat('a', 'Gia sư'), cat('b', 'Gia sư', { deletedAt: '2026-02-01T00:00:00.000Z' })],
      {},
    );
    expect(out).toEqual([]);
  });

  it('ba bản trùng thì giữ một, gộp hai', () => {
    const out = findDuplicateCategories(
      [cat('a', 'Gia sư'), cat('b', 'Gia sư'), cat('c', 'Gia sư')],
      {},
    );
    expect(out[0].merge).toHaveLength(2);
  });
});

describe('findDuplicateCategories — chọn bản giữ lại', () => {
  it('danh mục hệ thống luôn thắng', () => {
    const out = findDuplicateCategories(
      [cat('x', 'Chưa phân loại', { isSystem: true }), cat('y', 'Chưa phân loại')],
      { y: 99 },
    );
    expect(out[0].keep.category.id).toBe('x');
  });

  it('ID CỐ ĐỊNH của seed thắng id ngẫu nhiên', () => {
    // ⚠️ Bài quan trọng nhất của nhóm này.
    //
    // Giữ bản có id ngẫu nhiên thì máy tiếp theo vẫn seed ra `sys-tutor` và
    // người dùng lại có hai "Gia sư" — gộp xong rồi vẫn hỏng lại.
    const out = findDuplicateCategories(
      [cat('uuid-ngau-nhien', 'Gia sư'), cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư')],
      {},
    );
    expect(out[0].keep.category.id).toBe(SEEDED_CATEGORY_IDS.tutor);
  });

  it('id cố định thắng KỂ CẢ khi bản kia nhiều tham chiếu hơn', () => {
    const out = findDuplicateCategories(
      [cat('uuid-ngau-nhien', 'Gia sư'), cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư')],
      { 'uuid-ngau-nhien': 500 },
    );
    expect(out[0].keep.category.id).toBe(SEEDED_CATEGORY_IDS.tutor);
  });

  it('cùng hạng thì bản nhiều tham chiếu nhất thắng — ít phải trỏ lại nhất', () => {
    const out = findDuplicateCategories([cat('a', 'Gia sư'), cat('b', 'Gia sư')], { a: 2, b: 40 });
    expect(out[0].keep.category.id).toBe('b');
  });

  it('hòa tham chiếu thì bản tạo sớm nhất thắng', () => {
    const out = findDuplicateCategories(
      [
        cat('moi', 'Gia sư', { createdAt: '2026-06-01T00:00:00.000Z' }),
        cat('cu', 'Gia sư', { createdAt: '2026-01-01T00:00:00.000Z' }),
      ],
      {},
    );
    expect(out[0].keep.category.id).toBe('cu');
  });
});

describe('findDuplicateCategories — con số hiển thị cho người dùng', () => {
  it('movingRefs là tổng tham chiếu của các bản BỊ GỘP, không gồm bản giữ lại', () => {
    // Con số này là thứ người dùng nhìn để quyết định. Tính nhầm cả bản giữ
    // lại vào thì nó nói "sẽ chuyển 45 mục" trong khi thật ra chỉ chuyển 5.
    const out = findDuplicateCategories([cat('a', 'Gia sư'), cat('b', 'Gia sư')], { a: 40, b: 5 });
    expect(out[0].keep.category.id).toBe('a');
    expect(out[0].movingRefs).toBe(5);
  });

  it('nhóm phải chuyển nhiều nhất xếp lên đầu', () => {
    const out = findDuplicateCategories(
      [cat('a', 'Gia sư'), cat('b', 'Gia sư'), cat('c', 'Đi làm'), cat('d', 'Đi làm')],
      { b: 1, d: 30 },
    );
    expect(out[0].label).toBe('Đi làm');
  });
});

describe('unusedSeedDuplicates — dọn tự động, phạm vi rất hẹp', () => {
  it('bản seed chưa dùng, trùng tên → dọn', () => {
    const doomed = unusedSeedDuplicates(
      [cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư'), cat('cua-toi', 'Gia sư')],
      { 'cua-toi': 12 },
    );
    expect(doomed).toEqual([SEEDED_CATEGORY_IDS.tutor]);
  });

  it('bản seed ĐÃ DÙNG thì KHÔNG đụng tới', () => {
    // ⚠️ Đây là ranh giới an toàn của việc dọn tự động. Có tham chiếu nghĩa là
    // xóa nó sẽ làm mồ côi dữ liệu, và lúc đó phải để người dùng tự quyết.
    const doomed = unusedSeedDuplicates(
      [cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư'), cat('cua-toi', 'Gia sư')],
      { [SEEDED_CATEGORY_IDS.tutor]: 1, 'cua-toi': 12 },
    );
    expect(doomed).toEqual([]);
  });

  it('không trùng tên thì KHÔNG đụng tới, dù chưa dùng', () => {
    const doomed = unusedSeedDuplicates([cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư')], {});
    expect(doomed).toEqual([]);
  });

  it('id ngẫu nhiên KHÔNG bị dọn tự động, dù chưa dùng và trùng tên', () => {
    // Chỉ danh mục do seed tạo mới được dọn tự động. Danh mục người dùng tự
    // tạo là ý định của họ, kể cả khi nó trùng tên và chưa dùng tới.
    const doomed = unusedSeedDuplicates([cat('a', 'Gia sư'), cat('b', 'Gia sư')], {});
    expect(doomed).toEqual([]);
  });

  it('KHÔNG BAO GIỜ dọn danh mục hệ thống', () => {
    // "Chưa phân loại" là nơi gom lịch khi xóa danh mục khác. Xóa nó là làm
    // vỡ chính cơ chế đó.
    const doomed = unusedSeedDuplicates(
      [cat(UNCATEGORIZED_ID, 'Chưa phân loại', { isSystem: true }), cat('x', 'Chưa phân loại')],
      {},
    );
    expect(doomed).toEqual([]);
  });

  it('không dọn hết sạch một nhóm — luôn còn lại một bản', () => {
    // Hai bản seed cùng tên, cả hai chưa dùng: bỏ cả hai thì danh mục biến
    // mất hoàn toàn khỏi giao diện.
    const doomed = unusedSeedDuplicates(
      [cat(SEEDED_CATEGORY_IDS.tutor, 'Gia sư'), cat(SEEDED_CATEGORY_IDS.work, 'Gia sư')],
      {},
    );
    expect(doomed).toHaveLength(1);
  });
});
