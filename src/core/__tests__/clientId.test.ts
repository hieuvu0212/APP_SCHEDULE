import { describe, it, expect } from 'vitest';
import { clientIdFromName } from '../clientId';

describe('clientIdFromName', () => {
  it('generates the same id for the same name', () => {
    expect(clientIdFromName('Gia')).toBe('client-gia');
    expect(clientIdFromName('Gia Bảo')).toBe('client-gia-bao');
  });

  it('normalizes casing, accents, and extra spaces', () => {
    const expected = 'client-gia-bao';
    expect(clientIdFromName('Gia Bảo')).toBe(expected);
    expect(clientIdFromName('gia bảo')).toBe(expected);
    expect(clientIdFromName('  Gia   BẢO ')).toBe(expected);
    expect(clientIdFromName('Gia Bão')).toBe(expected);
  });

  it('returns null for empty or punctuation-only names', () => {
    expect(clientIdFromName('')).toBeNull();
    expect(clientIdFromName('   ')).toBeNull();
    expect(clientIdFromName('???')).toBeNull();
    expect(clientIdFromName('---')).toBeNull();
    expect(clientIdFromName('- ')).toBeNull();
  });

  it('simulates migration on two different machines (deterministic)', () => {
    const listMachineA = ['Gia', 'Minh', 'Nguyệt Nga'].map(clientIdFromName);
    const listMachineB = ['  Gia ', 'MINH', 'nguyệt nga'].map(clientIdFromName);

    expect(listMachineA).toEqual(listMachineB);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Nhánh Latin ĐÃ ĐÓNG BĂNG
//
//  `db.version(3)` đã chạy trên máy thật và neo `rules`, `events`, `payments`
//  vào đúng những id dưới đây. Test này đỏ nghĩa là bản cập nhật sắp làm mồ
//  côi dữ liệu của người đang dùng — và `version(4)` KHÔNG vá lại được, vì máy
//  đã qua v3 không chạy lại upgrade lần nữa. Sửa mã, đừng sửa test.
// ═══════════════════════════════════════════════════════════════════════════

describe('clientIdFromName — nhánh Latin không được đổi một byte', () => {
  it('giữ nguyên từng id mà bản trước đã sinh ra', () => {
    expect(clientIdFromName('Minh')).toBe('client-minh');
    expect(clientIdFromName('Gia Bảo')).toBe('client-gia-bao');
    expect(clientIdFromName('Nguyệt Nga')).toBe('client-nguyet-nga');
    expect(clientIdFromName('Đại học')).toBe('client-dai-hoc');
    expect(clientIdFromName('Lớp 12A1')).toBe('client-lop-12a1');
    expect(clientIdFromName('Minh!')).toBe('client-minh');
  });

  it('tên trộn Hán–Latin vẫn đi nhánh Latin, y như trước', () => {
    // Phần chữ Hán bị lọc bỏ, phần Latin còn lại đủ để làm id — nên nhánh băm
    // KHÔNG được chạm vào những tên này. Dấu `-` đôi trông như lỗi nhưng đó là
    // khoảng trắng giữa `小明` và `A` sau khi `小明` bị xóa; nó đã nằm trong DB
    // của người dùng từ v3 nên phải giữ.
    expect(clientIdFromName('小明 A')).toBe('client--a');
    expect(clientIdFromName('小明A')).toBe('client-a');
    expect(clientIdFromName('小明 minh')).toBe('client--minh');
  });

  it('tên chỉ có dấu câu hoặc emoji vẫn trả null', () => {
    // Nhánh băm chỉ dành cho tên có CHỮ. `???` không phải tên ai cả, và cho nó
    // một id là tạo ra một đối tượng ma mà người dùng không gõ nổi lần thứ hai.
    expect(clientIdFromName('???')).toBeNull();
    expect(clientIdFromName('---')).toBeNull();
    expect(clientIdFromName('・・・')).toBeNull();
    expect(clientIdFromName('😀')).toBeNull();
  });
});

describe('clientIdFromName — tên không viết được bằng [a-z0-9]', () => {
  it('tên thuần chữ Hán ra id tất định, không còn null', () => {
    // Đây là chính lỗi cần sửa: trước bản này `小明` cho ra `null`, rồi
    // `ensureClient()` rơi về `newId()` và đẻ thêm một đối tượng MỚI mỗi lần
    // người dùng gõ lại đúng cái tên đó.
    expect(clientIdFromName('小明')).not.toBeNull();
    expect(clientIdFromName('小明')).toBe(clientIdFromName('小明'));
  });

  it('GIÁ TRỊ CHỐT — id băm không được đổi sau khi đã phát hành', () => {
    // Cùng lý do với nhánh Latin ở trên: một khi bản này ra tay người dùng,
    // `client-h_1b5a3bd0` nằm trong `rules`, `events`, `payments` của họ. Đổi
    // hàm băm, đổi hằng số FNV, hay đổi chuỗi đầu vào của phép băm đều làm test
    // này đỏ — và đó là lúc phải dừng lại, không phải lúc cập nhật con số.
    expect(clientIdFromName('小明')).toBe('client-h_1b5a3bd0');
  });

  it('mọi hệ chữ viết ngoài Latin đều đi vào nhánh băm', () => {
    for (const name of ['中文', '田中', '한지민', 'ハノイ', 'Минск', 'مريم']) {
      expect(clientIdFromName(name)).toMatch(/^client-h_[0-9a-f]{8}$/);
    }
  });

  it('hai tên khác nhau ra hai id khác nhau', () => {
    const ids = ['小明', '大明', '李小明', '王老师', '中文'].map(clientIdFromName);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gộp khoảng trắng và hạ chữ thường y như nhánh Latin', () => {
    const expected = clientIdFromName('小 明');
    expect(clientIdFromName('  小   明 ')).toBe(expected);
    expect(clientIdFromName('小 明 ')).toBe(expected);
    // Nhưng có khoảng trắng ở giữa vẫn là một tên KHÁC với không có — đúng như
    // `client-gia-bao` khác `client-giabao`.
    expect(clientIdFromName('小明')).not.toBe(expected);
  });

  it('gõ liền và gõ tách dấu ra cùng một id (nhờ bước NFC)', () => {
    // NFD tách `が` thành `か` + U+3099 và `한` thành ba jamo. Hai dạng trông y
    // hệt nhau trên màn hình nhưng là hai chuỗi khác nhau, và băm hai chuỗi
    // khác nhau ra hai id khác nhau. Bàn phím iOS, bàn phím Android và văn bản
    // dán từ nơi khác không hứa hẹn dùng cùng một dạng.
    //
    // Bỏ `.normalize('NFC')` ở cuối `normalizeText()` là làm test này đỏ.
    expect(clientIdFromName('がぎ'.normalize('NFD'))).toBe(clientIdFromName('がぎ'));
    expect(clientIdFromName('한지민'.normalize('NFD'))).toBe(clientIdFromName('한지민'));
  });

  it('id băm không thể đụng vào không gian id của nhánh Latin', () => {
    // `H12345678` là nhãn hoàn toàn hợp lệ ở trường này — mã phòng, mã nhân
    // viên, mã học phần. Không có dấu `_` ngăn giữa thì nó mang đúng hình dạng
    // `client-h` + 8 ký tự hex của một id băm và có thể cướp bản ghi của người
    // khác. Nhánh Latin lọc bỏ `_`, nên nó không bao giờ sinh được id có `_`.
    expect(clientIdFromName('H12345678')).toBe('client-h12345678');
    expect(clientIdFromName('H12345678')).not.toContain('_');
    expect(clientIdFromName('小明')).toContain('_');
  });

  it('hai máy migrate độc lập cho ra cùng một bộ id', () => {
    // Cùng phép thử với test tiếng Anh ở trên, lần này cho tên tiếng Trung —
    // đây là điều kiện để đồng bộ không đẻ ra hai đối tượng cho một người.
    const names = ['小明', '王老师', '中文课'];
    const machineA = names.map(clientIdFromName);
    const machineB = names.map((n) => clientIdFromName(` ${n} `));

    expect(machineA).toEqual(machineB);
    expect(machineA.every((id) => id !== null)).toBe(true);
  });
});
