// ═══════════════════════════════════════════════════════════════════════════
//  ensureClient — gõ lại cùng một tên phải trỏ về cùng một đối tượng
//
//  Chạy trên IndexedDB thật (fake-indexeddb). Mỗi bài ứng với lỗi "Tên TRỘN
//  Hán–Latin có thể trùng id" từng ghi ở Known Issues của README.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ensureClient } from '../repo/clients';

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.clients.clear();
});

describe('ensureClient — tên trùng id chính', () => {
  it('gõ lại tên của người thứ hai KHÔNG đẻ thêm đối tượng', async () => {
    // `小明 minh` và `大明 minh` cùng ra `client--minh`. Bản trước cho người
    // thứ hai một `newId()` ngẫu nhiên mỗi lần gõ — ba lần gõ, ba đối tượng.
    const first = await ensureClient('小明 minh');
    const second = await ensureClient('大明 minh');
    const again = await ensureClient('大明 minh');

    expect(first.id).toBe('client--minh');
    expect(second.id).not.toBe(first.id);
    expect(again.id).toBe(second.id);
    expect(await db.clients.count()).toBe(2);
  });

  it('hai máy gõ cùng tên trùng cho ra CÙNG một id', async () => {
    // Đồng bộ ghép theo id. Id ngẫu nhiên ở nhánh trùng nghĩa là hai máy có
    // hai "大明 minh" khác nhau sau lần đồng bộ đầu tiên.
    await ensureClient('小明 minh');
    const machineA = await ensureClient('大明 minh');

    await db.clients.clear();
    await ensureClient('小明 minh');
    const machineB = await ensureClient(' 大明  minh ');

    expect(machineB.id).toBe(machineA.id);
    expect(machineA.id).toMatch(/^client-c_[0-9a-f]{8}$/);
  });

  it('người thứ hai tạo bằng id ngẫu nhiên từ trước vẫn được tìm thấy', async () => {
    // Dữ liệu từ trước bản này: người thứ hai mang `newId()`. Gõ lại tên đó
    // phải trỏ về bản cũ, không phải sinh thêm một bản `client-c_…` song song.
    await ensureClient('Minh');
    await db.clients.put({
      id: 'legacy-random-id',
      name: 'Minh!',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const found = await ensureClient('Minh!');
    expect(found.id).toBe('legacy-random-id');
    expect(await db.clients.count()).toBe(2);
  });

  it('cùng tên chuẩn hóa vẫn trỏ về id chính như trước', async () => {
    const a = await ensureClient('Minh');
    const b = await ensureClient('  minh ');
    expect(b.id).toBe(a.id);
    expect(await db.clients.count()).toBe(1);
  });
});
