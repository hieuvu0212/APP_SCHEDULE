// ═══════════════════════════════════════════════════════════════════════════
//  core/fieldMerge.ts — gộp ba bên theo từng trường
//
//  Hàm thuần. Mỗi bài tương ứng một cách cụ thể mà dữ liệu người dùng MẤT đi
//  nếu phép gộp sai. Bài đầu tiên là lý do cả tính năng tồn tại.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { isNewer } from '../backup';
import { mergeRecords, sameValue, stampAfter } from '../fieldMerge';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-02-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';
const NOW = '2026-04-01T00:00:00.000Z';

const base = {
  id: 'ev-1',
  title: 'Toán lớp 9',
  startTime: '18:00',
  notes: 'Mang sách',
  createdAt: T0,
  updatedAt: T0,
};

describe('mergeRecords — hai máy sửa hai trường khác nhau', () => {
  it('CẢ HAI thay đổi đều sống sót', () => {
    // ⚠️ ĐÂY LÀ LỖI MÀ CẢ TÍNH NĂNG SINH RA ĐỂ SỬA.
    //
    // Máy A dời giờ, máy B sửa ghi chú. Luật cũ "cả bản ghi nào mới hơn thì
    // thắng" giữ nguyên bản của B và vứt giờ mới của A — không lỗi, không cảnh
    // báo. Gộp đúng thì cả hai thay đổi phải nằm trong kết quả, bất kể bên nào
    // sửa sau.
    const local = { ...base, startTime: '19:30', updatedAt: T1 };
    const remote = { ...base, notes: 'Ôn chương 3', updatedAt: T2 };

    const { merged, conflicts } = mergeRecords(base, local, remote, NOW);

    expect(merged.startTime).toBe('19:30');
    expect(merged.notes).toBe('Ôn chương 3');
    expect(merged.title).toBe('Toán lớp 9');
    expect(conflicts).toEqual([]);
  });

  it('đối xứng: đảo vai local và đám mây vẫn ra cùng nội dung', () => {
    // Máy nào đồng bộ trước không được phép quyết định thay đổi nào sống.
    const a = { ...base, startTime: '19:30', updatedAt: T1 };
    const b = { ...base, notes: 'Ôn chương 3', updatedAt: T2 };

    const ab = mergeRecords(base, a, b, NOW).merged;
    const ba = mergeRecords(base, b, a, NOW).merged;

    expect(ab).toEqual(ba);
  });
});

describe('mergeRecords — cùng một trường bị sửa ở cả hai phía', () => {
  it('bên có updatedAt muộn hơn thắng — khi đó là đám mây', () => {
    const local = { ...base, title: 'Toán (A)', updatedAt: T1 };
    const remote = { ...base, title: 'Toán (B)', updatedAt: T2 };

    const { merged, conflicts } = mergeRecords(base, local, remote, NOW);

    expect(merged.title).toBe('Toán (B)');
    expect(conflicts).toEqual(['title']);
  });

  it('bên có updatedAt muộn hơn thắng — khi đó là local', () => {
    // Bài đối xứng của bài trên. Thiếu nó thì "luôn lấy đám mây" cũng xanh.
    const local = { ...base, title: 'Toán (A)', updatedAt: T2 };
    const remote = { ...base, title: 'Toán (B)', updatedAt: T1 };

    expect(mergeRecords(base, local, remote, NOW).merged.title).toBe('Toán (A)');
  });

  it('xung đột ở một trường không kéo theo trường khác', () => {
    // Bên thua ở `title` vẫn phải giữ được `notes` mà chỉ mình nó sửa.
    const local = { ...base, title: 'Toán (A)', notes: 'Chỉ A sửa', updatedAt: T1 };
    const remote = { ...base, title: 'Toán (B)', updatedAt: T2 };

    const { merged } = mergeRecords(base, local, remote, NOW);

    expect(merged.title).toBe('Toán (B)');
    expect(merged.notes).toBe('Chỉ A sửa');
  });

  it('hai bên sửa thành CÙNG giá trị thì không phải xung đột', () => {
    const local = { ...base, title: 'Toán 9A', updatedAt: T1 };
    const remote = { ...base, title: 'Toán 9A', updatedAt: T2 };

    const { merged, conflicts } = mergeRecords(base, local, remote, NOW);

    expect(merged.title).toBe('Toán 9A');
    expect(conflicts).toEqual([]);
  });
});

describe('mergeRecords — Thùng rác', () => {
  it('khôi phục ở máy này + sửa ở máy kia → bản ghi SỐNG, giữ cả bản sửa', () => {
    // Khôi phục XÓA HẲN thuộc tính `deletedAt` (Dexie hiểu `undefined` là lệnh
    // xóa). Máy kia vẫn mang tombstone y như bản gốc, chỉ sửa tiêu đề.
    // `deletedAt` chỉ đổi ở local → lấy local (vắng mặt). Luật cũ sẽ để bên
    // mới hơn thắng nguyên khối, và nếu đó là máy kia thì bản ghi vừa khôi
    // phục BỊ XÓA LẠI.
    const trashed = { ...base, deletedAt: T0 };
    const restored = { ...base, updatedAt: T1 }; // không có `deletedAt`
    const edited = { ...trashed, title: 'Toán (sửa)', updatedAt: T2 };

    const { merged } = mergeRecords(trashed, restored, edited, NOW);

    expect('deletedAt' in merged).toBe(false);
    expect(merged.title).toBe('Toán (sửa)');
  });

  it('vắng mặt, undefined và null cùng một nghĩa — không đẻ ra xung đột giả', () => {
    // Bản gốc không có `deletedAt`; local mang `deletedAt: undefined` (bản ghi
    // cũ); đám mây kéo về thì `null` đã thành vắng mặt, nhưng bản gốc có thể
    // được ghi từ một bản mang `null`. So bằng `===` thì cả ba đều "đã đổi".
    const b = { ...base, deletedAt: null as unknown as string | undefined };
    const local = { ...base, deletedAt: undefined, notes: 'A', updatedAt: T2 };
    const remote = { ...base, title: 'B', updatedAt: T1 };

    const { merged, conflicts } = mergeRecords(b, local, remote, NOW);

    expect(conflicts).toEqual([]);
    expect('deletedAt' in merged).toBe(false);
    expect(merged.title).toBe('B');
    expect(merged.notes).toBe('A');
  });
});

describe('mergeRecords — mảng', () => {
  it('mảng giống nội dung nhưng khác tham chiếu không bị coi là đã sửa', () => {
    // `tags`, `daysOfWeek` là mảng. Đọc từ IndexedDB ra là một mảng MỚI mỗi
    // lần, nên so tham chiếu thì local "đã đổi" ở mọi trường mảng — và thay
    // đổi thật của đám mây thua oan khi local mới hơn.
    const b = { ...base, daysOfWeek: [1, 3] };
    const local = { ...base, daysOfWeek: [1, 3], notes: 'A', updatedAt: T2 };
    const remote = { ...base, daysOfWeek: [1, 3, 5], updatedAt: T1 };

    expect(mergeRecords(b, local, remote, NOW).merged.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('sameValue so sâu, và thứ tự trong mảng có nghĩa', () => {
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue({ a: [1] }, { a: [1] })).toBe(true);
    expect(sameValue(0, null)).toBe(false); // 0 là giá trị, không phải vắng mặt
    expect(sameValue(false, undefined)).toBe(false);
  });
});

describe('mergeRecords — updatedAt của bản gộp', () => {
  it('muộn hơn HẲN cả hai đầu vào', () => {
    // Bằng một trong hai thì máy đang giữ bản đó so `updatedAt`, thấy "bằng
    // nhau", và không bao giờ kéo bản gộp về.
    const local = { ...base, startTime: '19:30', updatedAt: T1 };
    const remote = { ...base, notes: 'x', updatedAt: T2 };

    const { merged } = mergeRecords(base, local, remote, NOW);

    expect(isNewer(merged.updatedAt, T1)).toBe(true);
    expect(isNewer(merged.updatedAt, T2)).toBe(true);
  });

  it('vẫn muộn hơn hẳn khi đồng hồ máy này chạy CHẬM hơn máy kia', () => {
    // Lệch đồng hồ: máy kia sửa lúc T2, đồng hồ máy này mới chỉ tới T1. Tin
    // `now` thì bản gộp mang dấu cũ hơn bản trên mây.
    const local = { ...base, startTime: '19:30', updatedAt: T0 };
    const remote = { ...base, notes: 'x', updatedAt: T2 };

    const { merged } = mergeRecords(base, local, remote, T1);

    expect(isNewer(merged.updatedAt, T2)).toBe(true);
  });

  it('id không đổi, createdAt không đổi', () => {
    const local = { ...base, startTime: '19:30', updatedAt: T1 };
    const remote = { ...base, notes: 'x', updatedAt: T2 };

    const { merged } = mergeRecords(base, local, remote, NOW);

    expect(merged.id).toBe('ev-1');
    expect(merged.createdAt).toBe(T0);
  });
});

describe('stampAfter', () => {
  it('dùng `now` khi nó đã muộn hơn', () => {
    expect(stampAfter(NOW, T1, T2)).toBe(NOW);
  });

  it('dấu thiếu mili-giây: +1 ms thì SO CHUỖI lại nhỏ hơn, phải nhảy tiếp', () => {
    // '…:00.001Z' < '…:00Z' vì '.' (0x2E) < 'Z' (0x5A). Đúng loại bẫy so chuỗi
    // mà README cảnh báo ở mục "Ai thắng".
    const noMillis = '2026-03-01T00:00:00Z';
    const out = stampAfter(T0, noMillis);
    expect(isNewer(out, noMillis)).toBe(true);
  });
});
