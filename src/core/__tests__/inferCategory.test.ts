import { describe, it, expect } from 'vitest';
import { inferCategory, type CategoryUsage } from '../inferCategory';

/**
 * Lịch sử mẫu, dựng theo đúng ba ví dụ trong yêu cầu gốc:
 *  · client-minh   → Gia sư   (học sinh)
 *  · client-rossi  → Đi làm   (chỗ làm)
 *  · client-giai-tich → Đại học (môn học)
 *
 * Cả ba đều là `Client`. Xem đầu `core/inferCategory.ts`.
 */
const history: CategoryUsage[] = [
  { clientId: 'client-minh', categoryId: 'gia-su', title: 'Dạy Minh' },
  { clientId: 'client-minh', categoryId: 'gia-su', title: 'Dạy Minh' },
  { clientId: 'client-minh', categoryId: 'gia-su', title: 'Dạy Minh' },
  { clientId: 'client-rossi', categoryId: 'di-lam', title: 'Ca tối' },
  { clientId: 'client-rossi', categoryId: 'di-lam', title: 'Ca sáng' },
  { clientId: 'client-giai-tich', categoryId: 'dai-hoc', title: 'Giải tích 2' },
  { categoryId: 'di-lam', title: 'Họp giao ban' },
  { categoryId: 'di-lam', title: 'Họp giao ban' },
];

describe('inferCategory — theo Đối tượng', () => {
  it('ba ví dụ gốc đều ra đúng danh mục', () => {
    const minh = inferCategory({ clientId: 'client-minh', title: 'Dạy Minh' }, history);
    const rossi = inferCategory({ clientId: 'client-rossi', title: 'Ca chiều' }, history);
    const mon = inferCategory({ clientId: 'client-giai-tich', title: 'Giải tích 2' }, history);

    expect(minh?.categoryId).toBe('gia-su');
    expect(rossi?.categoryId).toBe('di-lam');
    expect(mon?.categoryId).toBe('dai-hoc');
  });

  it('nói rõ dựa vào đâu và có bao nhiêu buổi chống lưng', () => {
    // `reason` và `matches` tồn tại để tầng gọi giải thích được phán đoán.
    // Sai số đếm ở đây nghĩa là giao diện sẽ nói dối về căn cứ của nó.
    const guess = inferCategory({ clientId: 'client-minh', title: 'Dạy Minh' }, history);
    expect(guess).toEqual({ categoryId: 'gia-su', reason: 'client', matches: 3 });
  });

  it('tầng Đối tượng thắng tầng tiêu đề khi cả hai cùng nói được', () => {
    // "Họp giao ban" có hai buổi ở `di-lam` qua tiêu đề, nhưng đối tượng đang
    // gõ lại thuộc `gia-su`. Đối tượng cụ thể hơn tiêu đề chung chung.
    const mixed: CategoryUsage[] = [
      ...history,
      { clientId: 'client-minh', categoryId: 'gia-su', title: 'Họp giao ban' },
    ];
    const guess = inferCategory({ clientId: 'client-minh', title: 'Họp giao ban' }, mixed);
    expect(guess?.reason).toBe('client');
    expect(guess?.categoryId).toBe('gia-su');
  });
});

describe('inferCategory — hòa thì KHÔNG đoán', () => {
  it('một buổi mỗi bên trả null thay vì bốc đại', () => {
    // Đây là quy tắc trung tâm của tệp. Bỏ nhánh `tied` trong `topCategory()`
    // sẽ làm bài này đỏ — và bản bị hỏng đó cho ra kết quả phụ thuộc thứ tự
    // bản ghi trong IndexedDB, tức hai máy cùng dữ liệu đoán khác nhau.
    const tie: CategoryUsage[] = [
      { clientId: 'client-an', categoryId: 'gia-su', title: 'Buổi 1' },
      { clientId: 'client-an', categoryId: 'dai-hoc', title: 'Buổi 2' },
    ];
    expect(inferCategory({ clientId: 'client-an', title: 'Buổi 3' }, tie)).toBeNull();
  });

  it('đảo thứ tự đầu vào không đổi kết quả', () => {
    const tie: CategoryUsage[] = [
      { clientId: 'client-an', categoryId: 'gia-su', title: 'Buổi 1' },
      { clientId: 'client-an', categoryId: 'dai-hoc', title: 'Buổi 2' },
    ];
    const forward = inferCategory({ clientId: 'client-an', title: 'x' }, tie);
    const backward = inferCategory({ clientId: 'client-an', title: 'x' }, [...tie].reverse());
    expect(forward).toEqual(backward);
  });

  it('đa số rõ ràng thì vẫn đoán, dù có phiếu thiểu số', () => {
    const lean: CategoryUsage[] = [
      { clientId: 'client-an', categoryId: 'gia-su', title: 'a' },
      { clientId: 'client-an', categoryId: 'gia-su', title: 'b' },
      { clientId: 'client-an', categoryId: 'dai-hoc', title: 'c' },
    ];
    expect(inferCategory({ clientId: 'client-an', title: 'd' }, lean)?.categoryId).toBe('gia-su');
  });
});

describe('inferCategory — theo tiêu đề', () => {
  it('câu không có đối tượng vẫn đoán được nhờ tiêu đề đã gặp', () => {
    const guess = inferCategory({ clientId: null, title: 'Họp giao ban' }, history);
    expect(guess).toEqual({ categoryId: 'di-lam', reason: 'title', matches: 2 });
  });

  it('bỏ dấu và không phân biệt hoa thường', () => {
    // Gõ vội không dấu là chuyện thường ở một ô Thêm nhanh.
    const guess = inferCategory({ clientId: null, title: 'hop giao ban' }, history);
    expect(guess?.categoryId).toBe('di-lam');
  });

  it('đối tượng chưa có lịch sử vẫn RƠI XUỐNG tầng tiêu đề', () => {
    // Bản hỏng dễ mắc: thấy `clientId` là `return` luôn kết quả của tầng 1,
    // kể cả khi nó null. Đối tượng vừa tạo lần đầu sẽ mất luôn cơ hội đoán
    // theo tiêu đề — đúng lúc người dùng cần nhất.
    const guess = inferCategory({ clientId: 'client-moi-tinh', title: 'Họp giao ban' }, history);
    expect(guess?.categoryId).toBe('di-lam');
    expect(guess?.reason).toBe('title');
  });

  it('chỉ nhận trùng KHÍT cả tiêu đề, không trùng một từ', () => {
    // "Dạy Minh" trùng chữ "Dạy" với "Dạy Lý" nhưng không phải cùng một việc.
    // Nới thành trùng-một-từ sẽ gom hết mọi tiêu đề bắt đầu bằng "Dạy"/"Họp".
    expect(inferCategory({ clientId: null, title: 'Họp phụ huynh' }, history)).toBeNull();
    expect(inferCategory({ clientId: null, title: 'Dạy Lý' }, history)).toBeNull();
  });
});

describe('inferCategory — không đủ căn cứ', () => {
  it('lịch sử rỗng trả null', () => {
    expect(inferCategory({ clientId: 'client-minh', title: 'Dạy Minh' }, [])).toBeNull();
  });

  it('tiêu đề rỗng không khớp vào bản ghi cũng rỗng', () => {
    // Câu chỉ có ngày giờ ("mai 8h") cho ra tiêu đề rỗng. Không chặn thì nó
    // khớp với mọi buổi từng được lưu mà thiếu tiêu đề, và đoán bừa từ đó.
    const blanks: CategoryUsage[] = [
      { categoryId: 'gia-su', title: '' },
      { categoryId: 'gia-su', title: '   ' },
    ];
    expect(inferCategory({ clientId: null, title: '' }, blanks)).toBeNull();
    expect(inferCategory({ clientId: null, title: '   ' }, blanks)).toBeNull();
  });

  it('tiêu đề chưa từng gặp và không có đối tượng thì trả null', () => {
    expect(inferCategory({ clientId: null, title: 'Đi khám răng' }, history)).toBeNull();
  });
});
