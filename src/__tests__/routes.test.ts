import { describe, expect, it } from 'vitest';
import {
  ALL_VIEWS,
  DEFAULT_VIEW,
  NAV_VIEWS,
  hashOfView,
  viewFromHash,
  type View,
} from '../routes';

describe('viewFromHash', () => {
  it('đọc được mọi màn hình đi tới được bằng URL', () => {
    for (const view of ALL_VIEWS) {
      expect(viewFromHash(hashOfView(view))).toBe(view);
    }
  });

  it('chấp nhận cả dạng thiếu dấu gạch chéo', () => {
    // Người ta gõ tay vào thanh địa chỉ, và một số ứng dụng chat cắt mất dấu.
    expect(viewFromHash('#week')).toBe('week');
    expect(viewFromHash('#/week')).toBe('week');
  });

  it('hash rỗng trả null, không phải màn hình mặc định', () => {
    // Trả null để nơi gọi phân biệt được "không có hash" với "hash sai".
    expect(viewFromHash('')).toBeNull();
    expect(viewFromHash('#')).toBeNull();
  });

  it('tên màn hình không tồn tại trả null', () => {
    expect(viewFromHash('#/khong-co-that')).toBeNull();
    expect(viewFromHash('#/../etc/passwd')).toBeNull();
  });
});

describe('khứ hồi hash', () => {
  it('hashOfView rồi viewFromHash trả lại chính nó', () => {
    for (const view of ALL_VIEWS) {
      expect(viewFromHash(hashOfView(view))).toBe(view);
    }
  });

  it('mọi màn hình đều có hash riêng biệt', () => {
    const hashes = ALL_VIEWS.map(hashOfView);
    expect(new Set(hashes).size).toBe(ALL_VIEWS.length);
  });
});

describe('danh sách màn hình', () => {
  it('màn hình mặc định nằm trên thanh điều hướng', () => {
    expect(NAV_VIEWS).toContain(DEFAULT_VIEW);
  });

  it('mọi màn hình trên thanh điều hướng đều đi tới được bằng URL', () => {
    for (const view of NAV_VIEWS) expect(ALL_VIEWS).toContain(view);
  });

  it('privacy đi tới được nhưng KHÔNG chiếm ô trên thanh tab', () => {
    // Trang pháp lý đọc một lần rồi thôi. Chiếm một ô trên thanh tab của công
    // cụ dùng hằng ngày là sai tỉ lệ.
    expect(ALL_VIEWS).toContain('privacy' as View);
    expect(NAV_VIEWS).not.toContain('privacy' as View);
  });
});
