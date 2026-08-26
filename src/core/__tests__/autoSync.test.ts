import { describe, expect, it } from 'vitest';
import {
  MAX_BACKOFF_MS,
  MIN_INTERVAL_MS,
  backoffMs,
  shouldAutoSync,
  type AutoSyncState,
} from '../autoSync';

const NOW = 1_700_000_000_000;

const ready = (over: Partial<AutoSyncState> = {}): AutoSyncState => ({
  enabled: true,
  signedIn: true,
  online: true,
  running: false,
  lastAttemptAt: null,
  consecutiveFailures: 0,
  ...over,
});

describe('shouldAutoSync — điều kiện cần', () => {
  it('chạy khi mọi điều kiện đủ và chưa từng thử', () => {
    expect(shouldAutoSync(ready(), 'startup', NOW)).toBe(true);
  });

  it('không chạy khi người dùng chưa bật', () => {
    expect(shouldAutoSync(ready({ enabled: false }), 'startup', NOW)).toBe(false);
  });

  it('không chạy khi chưa đăng nhập', () => {
    expect(shouldAutoSync(ready({ signedIn: false }), 'startup', NOW)).toBe(false);
  });

  it('không chạy khi mất mạng', () => {
    // Thử lúc offline chỉ tạo ra một lần hỏng, rồi tính vào backoff và làm
    // lần thử ĐẦU TIÊN sau khi có mạng lại bị hoãn.
    expect(shouldAutoSync(ready({ online: false }), 'interval', NOW)).toBe(false);
  });
});

describe('shouldAutoSync — không bao giờ chạy chồng', () => {
  it('đang chạy thì mọi kích hoạt tự động đều bị chặn', () => {
    for (const trigger of ['startup', 'visible', 'online', 'interval'] as const) {
      expect(shouldAutoSync(ready({ running: true }), trigger, NOW)).toBe(false);
    }
  });

  it('đang chạy thì kể cả bấm tay cũng bị chặn', () => {
    // ⚠️ Hai lượt cùng lúc đọc chung một ảnh chụp rồi ghi đè lẫn nhau ở phía
    // đám mây. Đây là ràng buộc mạnh hơn cả "người dùng vừa bấm nút".
    expect(shouldAutoSync(ready({ running: true }), 'manual', NOW)).toBe(false);
  });
});

describe('shouldAutoSync — bấm tay bỏ qua mọi phép chờ', () => {
  it('chạy ngay dù vừa thử một giây trước', () => {
    const state = ready({ lastAttemptAt: NOW - 1000, consecutiveFailures: 5 });
    expect(shouldAutoSync(state, 'manual', NOW)).toBe(true);
  });

  it('chạy ngay cả khi người dùng tắt tự đồng bộ', () => {
    // Tắt TỰ đồng bộ không có nghĩa là cấm đồng bộ — nút bấm vẫn phải chạy.
    expect(shouldAutoSync(ready({ enabled: false }), 'manual', NOW)).toBe(true);
  });

  it('vẫn cần đăng nhập', () => {
    expect(shouldAutoSync(ready({ signedIn: false }), 'manual', NOW)).toBe(false);
  });
});

describe('shouldAutoSync — khoảng chờ tối thiểu', () => {
  it('chưa đủ một phút thì không chạy lại', () => {
    const state = ready({ lastAttemptAt: NOW - MIN_INTERVAL_MS + 1 });
    expect(shouldAutoSync(state, 'visible', NOW)).toBe(false);
  });

  it('đủ một phút thì chạy', () => {
    const state = ready({ lastAttemptAt: NOW - MIN_INTERVAL_MS });
    expect(shouldAutoSync(state, 'visible', NOW)).toBe(true);
  });

  it('chuyển tab liên tục không bắn nhiều lượt đồng bộ', () => {
    // Người ta chuyển qua lại giữa các tab hàng chục lần một phút.
    let state = ready();
    let syncs = 0;
    for (let i = 0; i < 20; i++) {
      const t = NOW + i * 1000; // mỗi giây một lần chuyển tab
      if (shouldAutoSync(state, 'visible', t)) {
        syncs++;
        state = { ...state, lastAttemptAt: t };
      }
    }
    expect(syncs).toBe(1);
  });
});

describe('backoffMs — giãn dần khi hỏng liên tiếp', () => {
  it('chưa hỏng lần nào thì dùng khoảng chờ tối thiểu', () => {
    expect(backoffMs(0)).toBe(MIN_INTERVAL_MS);
  });

  it('nhân đôi sau mỗi lần hỏng', () => {
    expect(backoffMs(1)).toBe(2 * MIN_INTERVAL_MS);
    expect(backoffMs(2)).toBe(4 * MIN_INTERVAL_MS);
    expect(backoffMs(3)).toBe(8 * MIN_INTERVAL_MS);
  });

  it('chạm trần rồi thì dừng ở đó, không tăng vô hạn', () => {
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
    expect(Number.isFinite(backoffMs(1000))).toBe(true);
  });

  it('hỏng nhiều thì hoãn thật, không thử lại mỗi phút', () => {
    // Tài khoản hết hạn mà vẫn thử mỗi phút thì tới lúc người dùng đóng tab đã
    // là hàng trăm request hỏng, không ai được lợi gì.
    const state = ready({ lastAttemptAt: NOW - 5 * 60_000, consecutiveFailures: 4 });
    expect(shouldAutoSync(state, 'interval', NOW)).toBe(false);

    const later = ready({ lastAttemptAt: NOW - 20 * 60_000, consecutiveFailures: 4 });
    expect(shouldAutoSync(later, 'interval', NOW)).toBe(true);
  });
});
