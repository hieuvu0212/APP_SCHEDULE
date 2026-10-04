// ═══════════════════════════════════════════════════════════════════════════
//  core/sync.ts — phép quyết định ai thắng
//
//  Hàm thuần, mảng vào mảng ra. Phần nói chuyện với mạng và Dexie được test
//  riêng ở src/db/__tests__/sync.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { planSync, summarize } from '../sync';

const row = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  updatedAt,
  ...extra,
});

describe('planSync', () => {
  it('chỉ có ở local thì đẩy lên', () => {
    const plan = planSync([row('a', '2026-01-01T00:00:00.000Z')], []);
    expect(plan.toPush.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPull).toEqual([]);
  });

  it('chỉ có trên đám mây thì kéo về', () => {
    const plan = planSync([], [row('a', '2026-01-01T00:00:00.000Z')]);
    expect(plan.toPull.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPush).toEqual([]);
  });

  it('local mới hơn thì đẩy lên', () => {
    const plan = planSync(
      [row('a', '2026-02-01T00:00:00.000Z')],
      [row('a', '2026-01-01T00:00:00.000Z')],
    );
    expect(plan.toPush.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPull).toEqual([]);
  });

  it('đám mây mới hơn thì kéo về', () => {
    const plan = planSync(
      [row('a', '2026-01-01T00:00:00.000Z')],
      [row('a', '2026-02-01T00:00:00.000Z')],
    );
    expect(plan.toPull.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPush).toEqual([]);
  });

  it('bằng nhau thì không làm gì', () => {
    const plan = planSync(
      [row('a', '2026-01-01T00:00:00.000Z')],
      [row('a', '2026-01-01T00:00:00.000Z')],
    );
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
    expect(plan.inSync).toBe(1);
  });

  it('đồng bộ hai lần liên tiếp thì lần hai không đổi gì', () => {
    // Đồng bộ phải là phép LŨY ĐẲNG. Nếu lần hai vẫn còn việc để làm thì hai
    // máy sẽ đẩy qua đẩy lại vô tận, mỗi lần một chuyến mạng.
    const local = [row('a', '2026-02-01T00:00:00.000Z')];
    const cloud = [row('a', '2026-01-01T00:00:00.000Z')];

    const first = planSync(local, cloud);
    expect(first.toPush).toHaveLength(1);

    const after = planSync(local, first.toPush);
    expect(after.toPush).toEqual([]);
    expect(after.toPull).toEqual([]);
  });

  it('bản ghi thiếu updatedAt bị coi là cũ nhất', () => {
    const plan = planSync<{ id: string; updatedAt?: string }>(
      [{ id: 'a' }],
      [row('a', '2026-01-01T00:00:00.000Z')],
    );
    expect(plan.toPull.map((r) => r.id)).toEqual(['a']);
  });
});

describe('planSync — tombstone', () => {
  it('bản ghi đã xóa mềm vẫn được đẩy lên như mọi bản ghi khác', () => {
    // ⚠️ Lọc bỏ chúng là biến "hãy xóa bản ghi này ở mọi máy" thành "máy này
    // không biết gì về bản ghi này" — và phía kia sẽ đẩy nó SỐNG LẠI.
    const plan = planSync(
      [row('a', '2026-02-01T00:00:00.000Z', { deletedAt: '2026-02-01T00:00:00.000Z' })],
      [row('a', '2026-01-01T00:00:00.000Z')],
    );
    expect(plan.toPush).toHaveLength(1);
    expect(plan.toPush[0]).toHaveProperty('deletedAt');
  });

  it('lệnh xóa từ đám mây được kéo về', () => {
    const plan = planSync(
      [row('a', '2026-01-01T00:00:00.000Z')],
      [row('a', '2026-02-01T00:00:00.000Z', { deletedAt: '2026-02-01T00:00:00.000Z' })],
    );
    expect(plan.toPull).toHaveLength(1);
    expect(plan.toPull[0]).toHaveProperty('deletedAt');
  });

  it('khôi phục sau khi xóa thì bản khôi phục thắng', () => {
    // Máy A xóa lúc 10:00 rồi đổi ý khôi phục lúc 11:00. Đám mây còn giữ bản
    // đã xóa. Bản 11:00 phải thắng, và nó KHÔNG có `deletedAt`.
    const plan = planSync(
      [row('a', '2026-01-01T11:00:00.000Z')],
      [row('a', '2026-01-01T10:00:00.000Z', { deletedAt: '2026-01-01T10:00:00.000Z' })],
    );
    expect(plan.toPush).toHaveLength(1);
    expect(plan.toPush[0]).not.toHaveProperty('deletedAt');
  });
});

describe('planSync — có bản gốc', () => {
  const T0 = '2026-01-01T00:00:00.000Z';
  const T1 = '2026-02-01T00:00:00.000Z';
  const T2 = '2026-03-01T00:00:00.000Z';

  it('không có bản gốc thì y hệt luật cũ: bên mới hơn thắng', () => {
    // Dòng đồng bộ từ trước khi có tính năng, hoặc vừa khôi phục sao lưu kiểu
    // ghi đè. Không biết ai đã sửa gì thì không được đoán.
    const push = planSync([row('a', T2)], [row('a', T1)], []);
    const pull = planSync([row('a', T1)], [row('a', T2)], []);
    expect(push.toPush.map((r) => r.id)).toEqual(['a']);
    expect(pull.toPull.map((r) => r.id)).toEqual(['a']);
    expect([...push.toMerge, ...pull.toMerge]).toEqual([]);
  });

  it('cả hai phía đã sửa kể từ bản gốc → gộp, KHÔNG đẩy, KHÔNG kéo', () => {
    // Luật cũ chọn một bên rồi đè nguyên khối lên bên kia.
    const plan = planSync([row('a', T1)], [row('a', T2)], [row('a', T0)]);
    expect(plan.toMerge.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
  });

  it('chỉ local sửa → đẩy lên, KỂ CẢ khi đồng hồ máy này chậm hơn', () => {
    // Máy này chạy chậm nên bản vừa sửa mang dấu T0 < T1 của bản gốc. Luật
    // cũ thấy đám mây "mới hơn" và KÉO ĐÈ lên đúng thay đổi vừa làm.
    const plan = planSync([row('a', T0)], [row('a', T1)], [row('a', T1)]);
    expect(plan.toPush.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPull).toEqual([]);
  });

  it('chỉ đám mây sửa → kéo về, kể cả khi dấu của nó cũ hơn', () => {
    const plan = planSync([row('a', T1)], [row('a', T0)], [row('a', T1)]);
    expect(plan.toPull.map((r) => r.id)).toEqual(['a']);
    expect(plan.toPush).toEqual([]);
  });

  it('đã khớp mà thiếu bản gốc → ghi bản gốc, không tải gì', () => {
    // Đường để dữ liệu cũ có bản gốc ngay lần đồng bộ đầu tiên sau nâng cấp.
    const plan = planSync([row('a', T1)], [row('a', T1)], []);
    expect(plan.inSync).toBe(1);
    expect(plan.toRebase.map((r) => r.id)).toEqual(['a']);
    expect(plan.toMerge).toEqual([]);
  });

  it('đã khớp và bản gốc đúng → không ghi lại bản gốc', () => {
    // Ghi lại mỗi lần là hàng nghìn lệnh ghi IndexedDB cho một lần bấm
    // Đồng bộ không đổi gì.
    const plan = planSync([row('a', T1)], [row('a', T1)], [row('a', T1)]);
    expect(plan.toRebase).toEqual([]);
  });
});

describe('summarize', () => {
  it('cộng dồn theo bảng và đếm số bảng lỗi', () => {
    const report = summarize([
      { table: 'categories', pushed: 2, pulled: 1, merged: 1, inSync: 5 },
      { table: 'rules', pushed: 0, pulled: 3, merged: 0, inSync: 0 },
      { table: 'salaryRules', pushed: 0, pulled: 0, merged: 0, inSync: 0, error: 'PGRST204' },
    ]);
    expect(report.merged).toBe(1);
    expect(report.pushed).toBe(2);
    expect(report.pulled).toBe(4);
    expect(report.failed).toBe(1);
  });
});
