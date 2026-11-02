// ═══════════════════════════════════════════════════════════════════════════
//  sw.js — service worker tự viết, không dùng thư viện
//
//  Mục tiêu duy nhất: mở được ứng dụng khi không có mạng. Toàn bộ dữ liệu đã
//  nằm trong IndexedDB rồi, thứ còn thiếu chỉ là mấy file HTML/JS/CSS.
//
//  KHÔNG dùng vite-plugin-pwa vì nó cần đọc danh sách tài nguyên đã băm tên
//  lúc build để precache. Ở đây dùng cache lúc chạy: lần mở đầu tiên có mạng
//  sẽ tự lưu lại đúng những file thật sự được yêu cầu. Đổi lại là lần đầu
//  bắt buộc phải online — chấp nhận được, và ít thứ có thể hỏng hơn hẳn.
//
//  ⚠️ HAI CHIẾN LƯỢC KHÁC NHAU, KHÔNG ĐƯỢC GỘP:
//
//    · Điều hướng (mở trang)  → ƯU TIÊN MẠNG
//      index.html trỏ tới các file JS đã băm tên. Nếu phục vụ bản HTML cũ từ
//      cache, nó sẽ đòi những file JS không còn tồn tại sau khi deploy bản
//      mới — ứng dụng trắng màn hình và người dùng không có cách nào thoát.
//
//    · Tài nguyên (JS/CSS/ảnh) → ƯU TIÊN CACHE
//      Tên đã chứa mã băm nội dung nên một URL luôn ứng với một nội dung.
//      Lấy từ cache là an toàn tuyệt đối và nhanh hơn nhiều.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE = 'personal-schedule-v1';

self.addEventListener('install', () => {
  // Không đợi tab cũ đóng hết mới kích hoạt.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Dọn cache của phiên bản trước, nếu không chúng nằm lại vĩnh viễn.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Chỉ đụng vào GET cùng nguồn. POST và request sang miền khác đi thẳng ra
  // mạng — chặn chúng lại chỉ tổ sinh lỗi khó hiểu.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

/** Mở trang: thử mạng trước, mất mạng thì lấy bản đã lưu */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    // `?? await caches.match('./')` để bắt cả trường hợp URL có tham số truy
    // vấn khác với lần đã lưu.
    return cached ?? (await caches.match('./')) ?? Response.error();
  }
}

/** Tài nguyên đã băm tên: cache trước, đồng thời làm mới ngầm */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// ─── Web Push ──────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    // Cùng `tag` với nhắc lịch trong trang (`useReminders` đặt `tag: r.key`,
    // Edge Function gửi `reminder_queue.id` = `Occurrence.key`). Khi app đang mở
    // cả hai tầng cùng bắn cho một buổi; trùng tag thì cái sau THAY cái trước
    // thay vì xếp chồng. Không bịa tag mặc định khi payload thiếu: hai buổi khác
    // nhau mà chung tag sẽ thay thế nhau và một lời nhắc biến mất.
    tag: data.tag,
    data: { url: data.url || './' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const options = event.oldSubscription
          ? event.oldSubscription.options
          : { userVisibleOnly: true };
        const newSub =
          event.newSubscription || (await self.registration.pushManager.subscribe(options));
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windowClients) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGE',
            newSubscription: newSub ? newSub.toJSON() : null,
          });
        }
      } catch (err) {
        console.error('Error handling pushsubscriptionchange:', err);
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.registration.scope).href;

  event.waitUntil(focusAppOrOpen(targetUrl));
});

// ⚠️ KHÔNG so `client.url === targetUrl`.
//
// URL đích mang đoạn `#/week`, còn tab đang mở thì ở bất kỳ màn hình nào
// (`#/stats`, `#/month`…) — router của app nằm hết trong đoạn hash. So cả
// chuỗi thì chỉ tab đang ở đúng Tuần mới khớp, còn lại mở thêm một cửa sổ nữa
// mỗi lần bấm. Cái cần nhận ra là "đây có phải cửa sổ của APP NÀY không", tức
// cùng origin và nằm trong scope của service worker; hash là chuyện của đích
// đến, không phải danh tính cửa sổ.
//
// So `pathname.startsWith(scope.pathname)` chứ không chỉ origin: GitHub Pages
// chia một origin cho mọi repo của tài khoản (`/APP_SCHEDULE/`, `/OTHER_REPO/`),
// và `includeUncontrolled: true` trả về cả cửa sổ của các app kia. Scope luôn
// kết thúc bằng `/` nên `/APP_SCHEDULE2/` không khớp nhầm `/APP_SCHEDULE/`.
async function focusAppOrOpen(targetUrl) {
  const scope = new URL(self.registration.scope);
  const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  // `matchAll` trả về cửa sổ được focus gần nhất trước, nên khớp đầu tiên cũng
  // là cửa sổ người dùng vừa dùng — đúng cái nên đưa lên.
  const appClient = windowClients.find((client) => {
    const url = new URL(client.url);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname) && 'focus' in client;
  });

  if (!appClient) {
    if (clients.openWindow) return clients.openWindow(targetUrl);
    return;
  }

  await appClient.focus();

  // Đã ở đúng đích thì thôi: điều hướng tới URL không có `#` trùng URL hiện tại
  // là nạp lại trang, mất những gì đang gõ dở trong form.
  if (appClient.url === targetUrl || !('navigate' in appClient)) return;

  try {
    await appClient.navigate(targetUrl);
  } catch {
    // `navigate()` từ chối với tab chưa do service worker này kiểm soát (mở
    // trước khi SW kích hoạt). Tab đã được đưa lên rồi; mở thêm cửa sổ ở đây là
    // quay lại đúng lỗi đang sửa, còn để lỗi nổi lên `waitUntil` thì trình
    // duyệt coi cả lần bấm là thất bại.
  }
}
