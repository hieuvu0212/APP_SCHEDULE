# Nghiệm thu Web Push — việc chỉ người thật làm được

> Viết ngày 2026-11-02. Đây là checklist, không phải đặc tả: đặc tả nằm ở README, mục
> "Nhắc lịch và Web Push". Mọi thứ máy làm được (sáu cổng chặn, 600 test dưới 4 múi giờ,
> build) đã xanh. **Điều 1–3 của ["Định nghĩa xong cho tính năng này"](README.md#định-nghĩa-xong-cho-tính-năng-này)
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

- [ ] **SQL Editor:** dán **toàn bộ** `supabase_schema.sql` rồi Run. Chạy lại an toàn. Bắt buộc dán lại kể cả khi đã dán trước đây: file mang các câu `ALTER … SET DEFAULT` mà bảng cũ cần.
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
- [ ] **SQL Editor:** dán câu `cron.schedule` ở README mục "Bộ lập lịch" (mục 5), thay `<PROJECT_REF>` và `<CRON_SECRET>`. **Không commit câu này** — nó chứa secret thật.

### A4. Thử hàm bằng tay trước khi chờ cron

```powershell
curl.exe -X POST https://<PROJECT_REF>.supabase.co/functions/v1/push-reminder -H "x-cron-secret: <CRON_SECRET>"
```

| Kết quả | Nghĩa là |
|---|---|
| JSON có `"success":true` | Hàm sống, secret đúng |
| `401` | Sai `CRON_SECRET` |
| `500` + `VAPID keys not configured` | Chưa xong `supabase secrets set` |
| `404` | Chưa deploy hàm |

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

Làm **hai lần**, vì lần hai kiểm chứng đúng khe hở đã biết (README, Known Issues):

**Lần 1 — hủy rồi đồng bộ (kỳ vọng: không bắn)**

1. [ ] Tạo buổi bắt đầu sau ~30 phút, bấm **Đồng bộ ngay**, xác nhận hàng có trong `reminder_queue`.
2. [ ] Hủy buổi đó trong app. Bấm **Đồng bộ ngay** một lần nữa.
3. [ ] Hàng đó phải có `deleted_at` khác rỗng.
4. [ ] Đóng hẳn trình duyệt (như B1.4), chờ qua `fire_at` + 5 phút. **Không được có thông báo.**

**Lần 2 — hủy rồi đóng app ngay, không đồng bộ (đang nghi là lỗi thật)**

1. [ ] Tạo buổi mới, **Đồng bộ ngay**, xác nhận hàng có trong hàng đợi.
2. [ ] Hủy buổi, **đóng app ngay** (đừng bấm đồng bộ, đừng đợi).
3. [ ] Chờ qua `fire_at` + 5 phút. **Ghi lại có thông báo hay không**, và `deleted_at` của hàng. Có thông báo = xác nhận khe hở đã mô tả; hãy báo lại để quyết định hướng sửa (README → Next Tasks mục 3).

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
