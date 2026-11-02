// ═══════════════════════════════════════════════════════════════════════════
//  public/sw.js — bấm thông báo và nhận thông báo đẩy
//
//  Service worker là file JS thuần nằm ngoài `src/`, không đi qua bundler, và
//  chạy trong một ngữ cảnh riêng (`self`, `clients`, `registration`) mà Vitest
//  không có. Trước bài này nó KHÔNG có test nào: `verify` xanh trong khi bấm
//  vào thông báo ở màn hình khác ngoài Tuần cứ mở thêm một cửa sổ mới.
//
//  Cách nạp: `?raw` + `new Function`, KHÔNG dùng `node:vm`. `tsconfig.app.json`
//  khai `types: ["vite/client"]` và cố ý không kéo kiểu của Node vào `src/`
//  (cùng lý do như `manifest.test.ts`). Truyền `self`/`clients` làm tham số thì
//  mã trong sw.js, vốn gọi `clients` trần như biến toàn cục, tìm thấy bản giả
//  mà không cần máy ảo nào.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it, vi } from 'vitest';
import swSource from '../../public/sw.js?raw';
// Edge Function là Deno, nằm ngoài sáu cổng và ngoài Vitest: không chạy được ở đây,
// chỉ đọc được mã nguồn. Xem bài "hợp đồng payload" cuối file.
import edgeFunctionSource from '../../supabase/functions/push-reminder/index.ts?raw';

// Scope giống bản deploy thật trên GitHub Pages: app nằm trong thư mục con.
const SCOPE = 'https://hieuvu0212.github.io/APP_SCHEDULE/';
const WEEK = `${SCOPE}#/week`;

interface FakeWindowClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function windowClient(url: string): FakeWindowClient {
  const client: FakeWindowClient = {
    url,
    focus: vi.fn(async () => client),
    navigate: vi.fn(async () => client),
  };
  return client;
}

type Handler = (event: Record<string, unknown>) => void;

interface ShownOptions {
  body: string;
  tag?: string;
  data: { url: string };
}

/** Nạp sw.js vào một `self` giả và trả về cách bắn sự kiện vào nó */
function loadServiceWorker(windowClients: FakeWindowClient[] = []) {
  const handlers = new Map<string, Handler>();
  const showNotification = vi.fn(async (_title: string, _options: ShownOptions) => undefined);
  const openWindow = vi.fn(async () => null);
  const fakeClients = {
    claim: vi.fn(async () => undefined),
    matchAll: vi.fn(async () => windowClients),
    openWindow,
  };
  const fakeSelf = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: fakeClients,
    registration: { scope: SCOPE, showNotification },
    location: { origin: new URL(SCOPE).origin },
  };

  new Function('self', 'clients', swSource)(fakeSelf, fakeClients);

  /** Bắn sự kiện rồi đợi đúng cái promise mà sw.js đưa cho `waitUntil` */
  async function dispatch(type: string, event: Record<string, unknown>): Promise<void> {
    let pending: Promise<unknown> = Promise.resolve();
    const handler = handlers.get(type);
    if (!handler) throw new Error(`sw.js không đăng ký sự kiện ${type}`);
    handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }

  return { dispatch, showNotification, openWindow };
}

function click(url?: string) {
  const close = vi.fn();
  return { notification: { close, data: url === undefined ? undefined : { url } }, close };
}

describe('notificationclick', () => {
  // Lỗi gốc: so cả đoạn `#…` của URL, nên chỉ tái sử dụng tab khi nó đang ở
  // đúng `#/week`. Người dùng đang xem Thống kê bấm thông báo → mở cửa sổ thứ hai.
  it('tab đang ở màn hình khác: dùng lại tab đó và điều hướng, không mở cửa sổ mới', async () => {
    const stats = windowClient(`${SCOPE}#/stats`);
    const sw = loadServiceWorker([stats]);

    await sw.dispatch('notificationclick', click('./#/week'));

    expect(stats.focus).toHaveBeenCalledTimes(1);
    expect(stats.navigate).toHaveBeenCalledWith(WEEK);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('tab mở ở gốc app, chưa có hash: vẫn là cùng một app', async () => {
    const root = windowClient(SCOPE);
    const sw = loadServiceWorker([root]);

    await sw.dispatch('notificationclick', click('./#/week'));

    expect(root.navigate).toHaveBeenCalledWith(WEEK);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  // Điều hướng tới đúng URL đang mở với URL không có `#` là NẠP LẠI trang —
  // mất trạng thái chưa lưu trong form. Đã ở đúng chỗ thì chỉ cần đưa lên trước.
  it('tab đã ở đúng URL đích: chỉ focus, không điều hướng', async () => {
    const week = windowClient(WEEK);
    const sw = loadServiceWorker([week]);

    await sw.dispatch('notificationclick', click('./#/week'));

    expect(week.focus).toHaveBeenCalledTimes(1);
    expect(week.navigate).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  // `matchAll({ includeUncontrolled: true })` trả về MỌI cửa sổ cùng origin,
  // kể cả trang GitHub Pages khác của cùng tài khoản (`/OTHER_REPO/`). Chỉ so
  // origin thì thông báo của app này kéo người dùng sang một app khác.
  it('bỏ qua cửa sổ khác scope hoặc khác origin, chọn đúng cửa sổ của app', async () => {
    const otherOrigin = windowClient('https://example.com/APP_SCHEDULE/#/day');
    const otherApp = windowClient('https://hieuvu0212.github.io/OTHER_REPO/#/day');
    const mine = windowClient(`${SCOPE}#/month`);
    const sw = loadServiceWorker([otherOrigin, otherApp, mine]);

    await sw.dispatch('notificationclick', click('./#/week'));

    expect(otherOrigin.focus).not.toHaveBeenCalled();
    expect(otherApp.focus).not.toHaveBeenCalled();
    expect(mine.focus).toHaveBeenCalledTimes(1);
    expect(mine.navigate).toHaveBeenCalledWith(WEEK);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('không có cửa sổ nào của app: mới mở cửa sổ mới', async () => {
    const otherApp = windowClient('https://hieuvu0212.github.io/OTHER_REPO/');
    const sw = loadServiceWorker([otherApp]);

    await sw.dispatch('notificationclick', click('./#/week'));

    expect(sw.openWindow).toHaveBeenCalledWith(WEEK);
    expect(otherApp.focus).not.toHaveBeenCalled();
  });

  // Tab chưa được service worker kiểm soát (mở trước khi SW kích hoạt) thì
  // `navigate()` bị từ chối. Tab vẫn đã được đưa lên; mở thêm cửa sổ ở đây sẽ
  // quay lại đúng lỗi đang sửa, và một promise bị từ chối trong `waitUntil`
  // còn làm trình duyệt coi lần bấm này là thất bại.
  it('navigate() bị từ chối: không mở cửa sổ mới và không ném lỗi', async () => {
    const stats = windowClient(`${SCOPE}#/stats`);
    stats.navigate.mockRejectedValue(new TypeError('client không do SW kiểm soát'));
    const sw = loadServiceWorker([stats]);

    await expect(sw.dispatch('notificationclick', click('./#/week'))).resolves.toBeUndefined();

    expect(stats.focus).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('đóng thông báo vừa bấm', async () => {
    const event = click('./#/week');
    const sw = loadServiceWorker([]);

    await sw.dispatch('notificationclick', event);

    expect(event.close).toHaveBeenCalledTimes(1);
  });

  it('thông báo không mang url: đích là gốc app', async () => {
    const sw = loadServiceWorker([]);

    await sw.dispatch('notificationclick', click());

    expect(sw.openWindow).toHaveBeenCalledWith(SCOPE);
  });
});

describe('push', () => {
  // Lỗi gốc: tầng 1 (`useReminders`) gắn `tag: Occurrence.key`, còn thông báo
  // đẩy không có tag, nên với app đang mở hai thông báo của cùng một buổi xếp
  // chồng nhau. Có tag trùng thì cái sau thay cái trước.
  it('chuyển tag của payload vào showNotification để thay thế thông báo tầng 1', async () => {
    const sw = loadServiceWorker();
    const payload = {
      title: 'Toán lớp 9',
      body: 'Bắt đầu lúc 18:00, còn 15 phút nữa.',
      url: './#/week',
      tag: 'rule:abc:2026-11-03',
    };

    await sw.dispatch('push', { data: { json: () => payload } });

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0];
    expect(title).toBe('Toán lớp 9');
    expect(options.tag).toBe('rule:abc:2026-11-03');
    expect(options.body).toBe(payload.body);
    expect(options.data.url).toBe('./#/week');
  });

  // Payload của hàng đã nằm sẵn trên hàng đợi trước khi Edge Function biết gửi
  // tag. Bịa ra một tag mặc định (ví dụ chuỗi rỗng đã chuẩn hóa, hay tiêu đề)
  // sẽ làm HAI buổi khác nhau thay thế nhau.
  it('payload không có tag thì không bịa tag', async () => {
    const sw = loadServiceWorker();

    await sw.dispatch('push', { data: { json: () => ({ title: 'A', body: 'B' }) } });

    const options = sw.showNotification.mock.calls[0][1];
    expect(options.tag).toBeUndefined();
  });

  it('push không có dữ liệu: không hiện gì', async () => {
    const sw = loadServiceWorker();

    await sw.dispatch('push', { data: null });

    expect(sw.showNotification).not.toHaveBeenCalled();
  });
});

// `tag` là một sợi dây giữa HAI file không ai nối với nhau: Edge Function (Deno)
// gửi, sw.js nhận. Bài `push` ở trên chứng minh phía nhận; không có gì chứng minh
// phía gửi, nên xóa dòng `tag` khỏi Edge Function thì `verify` vẫn xanh và hai
// tầng lại xếp chồng thông báo. Đây là phép đọc mã nguồn, không phải chạy hàm —
// thô, nhưng là chỗ duy nhất một cổng chặn nhìn thấy được dòng đó.
describe('hợp đồng payload với Edge Function', () => {
  it('Edge Function đưa reminder.id vào payload làm tag', () => {
    expect(edgeFunctionSource).toMatch(/\btag:\s*reminder\.id\b/);
  });
});
