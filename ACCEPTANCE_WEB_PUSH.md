# Nghiệm thu Web Push — việc chỉ người thật làm được

> Viết ngày 2026-11-02. Đây là checklist, không phải đặc tả: đặc tả nằm ở docs/ENGINEERING.md, mục
> "Nhắc lịch và Web Push". Mọi thứ máy làm được (sáu cổng chặn, 600 test dưới 4 múi giờ,
> build) đã xanh. **Điều 1–3 của ["Định nghĩa xong cho tính năng này"](docs/ENGINEERING.md#định-nghĩa-xong-cho-tính-năng-này)
> chưa ai làm, và không cổng chặn nào làm thay được.**
>
> Đừng dán khóa riêng tư, `CRON_SECRET` hay anon key vào chat, issue hay commit.

---

## A. Cấu hình một lần (bạn làm, ở GitHub và Supabase)

### A1. GitHub — repo `hieuvu0212/APP_SCHEDULE`

- [ ] **Settings → Pages → Source → GitHub Actions.** Không bật thì bước deploy báo lỗi xác thực.
- [ ] **Settings → Secrets and variables → Actions → tab *Variables*** (không phải *Secrets*), tạo ba biến:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_VAPID_PUBLIC_KEY` — khóa **công khai**, đúng 87 ký tự (`isPushConfigured()` từ chối chuỗi khác độ dài).
- [ ] Biến chỉ có tác dụng ở **lần build kế tiếp**: sau khi đặt, push một commit lên `main` hoặc chạy lại workflow *Deploy*. Vite nhúng chúng lúc biên dịch.
- [ ] Mở tab *Actions*, xác nhận run deploy xanh.

### A2. Sinh khóa VAPID (một lần, trên máy bạn)

```bash
npx web-push generate-vapid-keys
```

- Khóa **công khai** → biến `VITE_VAPID_PUBLIC_KEY` ở A1, và `VAPID_PUBLIC_KEY` ở A3.
- Khóa **riêng tư** → chỉ vào Supabase secret `VAPID_PRIVATE_KEY` ở A3. Không vào GitHub Variables, không vào `.env`, không vào repo. Lẫn hai khóa là cách làm lộ khóa riêng nhanh nhất.

### A3. Supabase — dự án của bạn

- [ ] **SQL Editor:** dán **toàn bộ** `supabase_schema.sql` rồi Run. Chạy lại an toàn. Bắt buộc dán lại kể cả khi đã dán trước đây: file mang các câu `ALTER … SET DEFAULT` và `ADD COLUMN IF NOT EXISTS start_at` mà bảng cũ cần. **Làm bước này TRƯỚC khi deploy hàm:** hàm mới `SELECT` cột `start_at`, thiếu cột thì mọi lượt chạy trả `500`, và app cũng không nạp được hàng đợi.
- [ ] **Database → Extensions:** bật `pg_cron` và `pg_net`.
- [ ] Đặt secret cho Edge Function (Supabase CLI đã `supabase link`). Chuỗi `CRON_SECRET` sinh ngẫu nhiên, dài (ví dụ 40+ ký tự), tự bạn tạo:

  ```bash
  supabase secrets set VAPID_PUBLIC_KEY=<công khai> VAPID_PRIVATE_KEY=<riêng tư> CRON_SECRET=<chuỗi ngẫu nhiên> VAPID_SUBJECT=mailto:<email thật của bạn>
  ```

  `VAPID_SUBJECT` nên là email liên lạc được: dịch vụ push của Apple từ chối subject không liên lạc được.
- [ ] Deploy hàm:

  ```bash
  supabase functions deploy push-reminder
  ```

  `supabase/config.toml` đã đặt `verify_jwt = false`; bảo vệ thật là header `x-cron-secret`.
- [ ] **SQL Editor:** dán câu `cron.schedule` ở docs/ENGINEERING.md mục "Bộ lập lịch" (mục 5), thay `<PROJECT_REF>` và `<CRON_SECRET>`. **Không commit câu này** — nó chứa secret thật.

### A4. Thử hàm bằng tay trước khi chờ cron

```powershell
curl.exe -X POST https://<PROJECT_REF>.supabase.co/functions/v1/push-reminder -H "x-cron-secret: <CRON_SECRET>"
```

| Kết quả | Nghĩa là |
|---|---|
| JSON có `"success":true` | Hàm sống, secret đúng |
| `401` | Sai `CRON_SECRET` |
| `500` + `VAPID keys not configured` | Chưa xong `supabase secrets set` |
| `500` + `VAPID configuration invalid: …` | Khóa hoặc `VAPID_SUBJECT` sai định dạng — thường do dán thừa dấu nháy/khoảng trắng, hoặc subject không bắt đầu bằng `mailto:`/`https:`. Câu sau dấu `:` là của web-push, không chứa giá trị khóa |
| `404` | Chưa deploy hàm |
| `500` nhắc tới `start_at` | Chưa dán lại schema (A3, bước đầu) |
| `"retried": N` | N hàng để lại cho lượt sau vì lỗi tạm thời (429/5xx/mạng) |
| `"expired": N` | N hàng bỏ, không gửi, vì đã qua hạn chót = sớm hơn trong hai mốc: giờ vào buổi và `fire_at` + 10 phút |
| `"failures": {"403": N}` (hoặc `401`) | Khóa VAPID trên Supabase **khác** khóa `VITE_VAPID_PUBLIC_KEY` đã build vào app. Sửa cho khớp, rồi tắt/bật lại thông báo trong app để trình duyệt đăng ký lại |
| `"failures": {"410": N}` (hoặc `404`) | Đăng ký push của trình duyệt đã chết; hàm tự xóa mềm nó. Bật lại thông báo trong app để đăng ký mới |
| `"failures": {"network": N}` | Hàm không tới được dịch vụ push (mạng, timeout); hàng được thử lại ở lượt sau nếu còn trong hạn |
| `"dbErrors": N` | Ghi vào CSDL lỗi (đánh `sent_at`, xóa subscription) — xem log |

Chi tiết từng lỗi (mã HTTP, id hàng, id đăng ký — **không** có endpoint) nằm ở Supabase → *Edge Functions → push-reminder → Logs*.

Kiểm cron có chạy không (SQL Editor), sau khi qua ít nhất 5 phút:

```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, created from net._http_response order by created desc limit 5;
```

`status_code` phải là `200`. `401` ở đây nghĩa là secret trong câu `cron.schedule` khác secret của hàm.

---

## B. Nghiệm thu trên máy thật

Chuẩn bị chung:

- [ ] Mở **bản đã deploy trên GitHub Pages** (không phải `localhost`): push chỉ hoạt động trên HTTPS.
- [ ] Đăng nhập tài khoản Supabase trong màn hình *Tài khoản*, bật *Đồng bộ đám mây*.
- [ ] *Cài đặt → Nhắc trước giờ:* bấm **Bật nhắc lịch**, **Cho phép thông báo** (chọn *Allow*), đặt **Báo trước = 15 phút** cho dễ chờ.
- [ ] Cài app như PWA (menu trình duyệt → *Cài đặt ứng dụng*). iOS chỉ nhận push khi app đã *Thêm vào Màn hình chính* (iOS 16.4+).
- [ ] Supabase *Table Editor → `push_subscriptions`*: thấy một hàng của bạn, `deleted_at` rỗng. Không thấy = đăng ký push chưa lưu được; dừng ở đây và báo lại.

### B1. Điều 1 — đóng hẳn trình duyệt và nhận thông báo đúng giờ

1. [ ] Lấy giờ hiện tại, tạo một buổi bắt đầu sau **~25 phút** (với báo trước 15 phút, thông báo phải tới sau ~10 phút).
2. [ ] Bấm **Đồng bộ ngay**. Mở *Table Editor → `reminder_queue`*: phải có đúng một hàng cho buổi đó.
3. [ ] **Kiểm `fire_at` bằng tay:** phải kết thúc bằng `Z` và bằng *giờ bắt đầu trừ 15 phút, quy ra UTC*. Ví dụ ở UTC+7: buổi 18:00, báo trước 15' → `fire_at` = `…T10:45:00.000Z`. Sai lệch bao nhiêu giờ thì ghi lại — đây chính là lỗi múi giờ mà bản đầu mắc.
4. [ ] **Đóng hẳn:** đóng mọi cửa sổ trình duyệt *và* cửa sổ PWA. Mở Task Manager, xác nhận không còn tiến trình `chrome.exe`/`msedge.exe` (Chrome/Edge có thể chạy nền: tắt cả ở khay hệ thống, hoặc *Settings → System → “Continue running background apps” = off*). Trên điện thoại: vuốt tắt app khỏi danh sách gần đây.
5. [ ] Để máy yên và **đừng chạm vào**. Chờ tới `fire_at` cộng tối đa 5 phút (cron chạy mỗi 5 phút).
6. [ ] **Kết quả:** thông báo hiện ra với đúng tiêu đề buổi và câu “Bắt đầu lúc …, còn … phút nữa.” Ghi lại: giờ `fire_at`, giờ thông báo thật sự hiện ra, độ trễ.
7. [ ] Bấm vào thông báo: app mở ra màn hình Tuần.
8. [ ] Trong `reminder_queue`, hàng đó có `sent_at` khác rỗng.

Không thấy thông báo thì tra theo thứ tự: hàng trong `reminder_queue` có không → `fire_at` đã qua chưa → `cron.job_run_details` / `net._http_response` (A4) → `push_subscriptions` có hàng chưa bị xóa mềm không → quyền thông báo của OS/trình duyệt (Focus Assist/Không làm phiền trên Windows, tiết kiệm pin trên Android).

### B2. Điều 2 — máy không đặt UTC

Máy này của bạn đang báo múi giờ UTC+7, nên B1 *đã là* một lần thử không-UTC nếu bạn làm trên chính máy này. Cần thêm một lần **đổi múi giờ** để chắc giờ trôi nổi được quy đổi theo múi giờ hiện tại:

1. [ ] Đổi múi giờ hệ điều hành sang một múi giờ khác xa (ví dụ *Eastern Time*, UTC−5/−4). Mở lại app.
2. [ ] Tạo buổi bắt đầu sau ~25 phút **theo đồng hồ mới**, bấm **Đồng bộ ngay**.
3. [ ] `fire_at` mới phải bằng *giờ bắt đầu theo múi giờ mới, trừ 15 phút, quy ra UTC*. Buổi “18:00” mang nghĩa 18:00 ở đâu bạn đang đứng.
4. [ ] Lặp lại B1 bước 4–8.
5. [ ] Trả múi giờ về như cũ.

### B3. Điều 3 — hủy buổi đã nằm trong hàng đợi

Làm **hai lần**, vì lần hai kiểm chứng bản vá cho khe hở "hủy rồi đóng app" (docs/ENGINEERING.md, mục "Lỗi đã đóng"):

**Lần 1 — hủy rồi đồng bộ (kỳ vọng: không bắn)**

1. [ ] Tạo buổi bắt đầu sau ~30 phút, bấm **Đồng bộ ngay**, xác nhận hàng có trong `reminder_queue`.
2. [ ] Hủy buổi đó trong app. Bấm **Đồng bộ ngay** một lần nữa.
3. [ ] Hàng đó phải có `deleted_at` khác rỗng.
4. [ ] Đóng hẳn trình duyệt (như B1.4), chờ qua `fire_at` + 5 phút. **Không được có thông báo.**

**Lần 2 — hủy rồi đóng app, không bấm đồng bộ (kỳ vọng: không bắn)**

Đây là khe hở đã vá bằng `watchReminderQueue()` (hàng đợi tự rút lại **3 giây** sau khi lịch đổi). Bước này xác nhận bản vá chạy với Supabase thật.

1. [ ] Tạo buổi mới, **Đồng bộ ngay**, xác nhận hàng có trong hàng đợi.
2. [ ] Hủy buổi, **đừng bấm đồng bộ**. Đợi **10 giây** rồi mới đóng app (3 giây debounce cộng thời gian mạng).
3. [ ] Trong `reminder_queue`, hàng đó phải có `deleted_at` khác rỗng dù bạn không bấm gì.
4. [ ] Chờ qua `fire_at` + 5 phút. **Không được có thông báo.** Nếu có, ghi lại `deleted_at` của hàng và báo lại.
5. [ ] *(Tùy chọn, để biết giới hạn)* Lặp lại nhưng đóng app trong vòng 1 giây sau khi hủy. Thông báo có thể bắn, vì app đóng trước khi kịp gọi mạng — khoảng hở này không vá được ở client.

### B4. Kiểm lại sau cùng

- [ ] Khi mọi mục B1–B3 đạt: sửa `reminder.limitation` ở `vi`/`en`/`zh` (câu mới phải nói cả giới hạn nạp hàng đợi 7 ngày, và đúng với cả người không cấu hình Supabase), chuyển dòng Web Push từ *Awaiting acceptance* sang *Completed* trong README.
- [ ] Nếu có mục nào không đạt, đừng chuyển: ghi kết quả vào Known Issues.

---

## C. Ghi kết quả

| Mục | Đạt / Không | Giờ `fire_at` | Giờ thông báo hiện | Ghi chú |
|---|---|---|---|---|
| B1 (múi giờ máy: …) | | | | |
| B2 (múi giờ thử: …) | | | | |
| B3 lần 1 | | | | |
| B3 lần 2 | | | | |
