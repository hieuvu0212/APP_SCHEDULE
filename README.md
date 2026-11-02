# Personal Schedule System

Ứng dụng web quản lý lịch cá nhân: https://hieuvu0212.github.io/APP_SCHEDULE/

Lịch học, làm ca, gia sư và nghiên cứu nằm chung một chỗ, kèm theo dõi thu nhập. Ứng dụng chạy hoàn toàn trong trình duyệt và lưu dữ liệu ở IndexedDB. Đồng bộ nhiều thiết bị qua Supabase là tùy chọn, không cấu hình thì ứng dụng vẫn chạy như bình thường.

Mỗi buổi gắn với một "đối tượng": học sinh, chỗ làm, môn học hoặc đề tài, tùy loại lịch.

## Tính năng

- Lịch tuần có kéo thả, lịch tháng, danh sách có lọc và tìm kiếm bỏ dấu tiếng Việt.
- Lịch lặp với ngoại lệ cho từng buổi, thêm nhanh bằng một câu tiếng Việt, nhân bản tuần.
- Bảng lương theo tháng (trả theo giờ hoặc khoán tháng), thu tiền, thống kê kế hoạch so với thực tế.
- Hoàn tác thao tác ghi, thùng rác, sao lưu và nhập từ file.
- Xuất PDF, PNG và .ics, in lịch tuần.
- Nhắc lịch trong trang, và Web Push khi đã đăng nhập và cấu hình.
- Đồng bộ Supabase, gộp xung đột theo từng trường.
- Cài như ứng dụng (PWA), chạy offline, bọc Capacitor cho Android và iOS.
- Giao diện tiếng Việt, tiếng Anh và tiếng Trung, có chế độ tối.

Phím tắt: `←` `→` đổi tuần hoặc tháng, `T` về hôm nay, `N` thêm sự kiện.

## Chạy

Cần Node 22.

```bash
npm install
npm run dev
```

Ứng dụng mở ở http://localhost:5173.

| Lệnh | Việc |
|---|---|
| `npm run verify` | Chạy cả sáu cổng chặn bên dưới, theo thứ tự CI chạy |
| `npm test` | Bộ test (Vitest) |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm run check:core` | `core/` không được import React hay Dexie |
| `npm run check:cloud` | `supabase_schema.sql` khớp `types/index.ts` và mỗi bảng có `GRANT` |
| `npm run check:i18n` | Mọi khóa `t('...')` có đủ ở vi, en, zh |
| `npm run build` | Build production |

`typecheck` phải là `tsc -b`. `tsconfig.json` chỉ là file trỏ sang các cấu hình con, nên `tsc --noEmit` kiểm tra không file nào và luôn xanh.

## Deploy

Push lên `main` thì `.github/workflows/deploy.yml` chạy: `npm ci`, sáu cổng chặn, build, rồi đẩy `dist/` lên GitHub Pages. Cổng nào đỏ thì không có gì được deploy.

Bật một lần: Settings, Pages, Source, GitHub Actions.

Muốn bản trên Pages dùng được đồng bộ và Web Push, đặt ba biến ở Settings, Secrets and variables, Actions, tab Variables:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_VAPID_PUBLIC_KEY
```

Đặt ở Variables, không đặt ở Secrets. Cả ba đều đi thẳng vào bundle JS. Dữ liệu được bảo vệ bằng RLS, giấu anon key không thêm gì. Khóa VAPID riêng tư, `CRON_SECRET` và các khóa Supabase có quyền cao chỉ nằm ở secret của Edge Function, không bao giờ ở bước build.

Vite nhúng các biến này lúc build, nên phải có trước khi `npm run build` chạy. Đặt xong thì chạy lại workflow. Để trống cũng được: ứng dụng vẫn chạy và mục đồng bộ hiện "chưa cấu hình".

Các bước dựng Supabase, Edge Function, cron và cách thử Web Push nằm ở [ACCEPTANCE_WEB_PUSH.md](ACCEPTANCE_WEB_PUSH.md).

## Dữ liệu và riêng tư

Dữ liệu nằm trong trình duyệt. Repo công khai chỉ chứa mã nguồn, lịch của bạn không bao giờ lên GitHub. IndexedDB tách riêng theo origin, nên bản trên `github.io` bắt đầu trống. Muốn chuyển dữ liệu, dùng Xuất file sao lưu ở Cài đặt trên máy này rồi Nhập từ file trên máy kia.

## Trạng thái

Đã xong: lịch và các màn hình chính, thu tiền, xuất PDF và .ics, thực thể đối tượng với id tất định, thêm nhanh tự chọn danh mục, đồng bộ gộp theo từng trường, Capacitor, Web Push.

Web Push đã được chủ dự án thử trên máy thật ngày 2026-11-02. Không có số liệu kèm theo xác nhận đó.

Việc còn lại:

- Câu `reminder.limitation` ở vi, en, zh vẫn nói ứng dụng chỉ nhắc được khi đang mở. Câu đó cần viết lại cho đúng với người đã đăng nhập, và vẫn đúng với người không cấu hình Supabase.
- Xóa các nhánh đã gộp vào `main`: `test`, `feat/category-inference-push-fixes`, `claude/affectionate-beaver-506d4f` và worktree của nó. `backup/main-pre-phase3` giữ hay bỏ tùy bạn.

Giới hạn đã biết:

- Đóng ứng dụng trong 3 giây đầu sau khi hủy một buổi thì thông báo của buổi đó vẫn có thể bắn. Hàng đợi chỉ được nạp lại sau 3 giây.
- Bấm vào thông báo khi tab đang mở nhưng chưa do service worker kiểm soát thì tab chỉ được đưa lên, không đổi màn hình.
- Chưa kiểm chứng việc trình duyệt thay thông báo của trang bằng thông báo đẩy khi hai thông báo trùng tag.

## Cấu trúc và quy tắc

```
src/
  core/    hàm thuần, không import React hay Dexie
  db/      Dexie, đồng bộ Supabase, hàng đợi Web Push
  hooks/   nối db với core cho giao diện
  components/, i18n/, undo/, sync/
supabase/functions/push-reminder/   Edge Function gửi Web Push (Deno)
supabase_schema.sql                 lược đồ đám mây, RLS và GRANT
public/sw.js                        service worker
```

Bốn quy tắc mà `verify` canh hoặc mà việc bảo trì phụ thuộc vào:

1. `core/` không import React hay Dexie.
2. Chỉ `db/repo/` được gọi thẳng vào Dexie.
3. `supabase_schema.sql` khớp `types/index.ts`, và mỗi bảng mới có `GRANT SELECT, INSERT, UPDATE, DELETE` cho `authenticated` và `service_role` trong cùng lần thay đổi. Từ 30/10/2026 Supabase không còn tự cấp quyền Data API cho bảng mới.
4. Chỉ thêm `db.version(n)` mới vào Dexie, không sửa version cũ.

Id do hệ thống sinh trên nhiều máy phải tất định, và bảng mới phải vào đủ bốn nơi: `schema.ts`, `backup.ts`, `tables.ts`, `supabase_schema.sql`.

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | Nguyên tắc thiết kế, quyết định kiến trúc, định nghĩa "xong", lỗi đã gặp |
| [ACCEPTANCE_WEB_PUSH.md](ACCEPTANCE_WEB_PUSH.md) | Cấu hình Supabase và nghiệm thu Web Push |
| [PHASE0_Dac_ta_thi_cong.md](PHASE0_Dac_ta_thi_cong.md) | Mô hình lương hai chế độ và schema ban đầu |
| [REVIEW_Personal_Schedule_System.md](REVIEW_Personal_Schedule_System.md) | Lỗi tìm được trong kế hoạch gốc |
| [PHASE3_FIX_PLAN.md](PHASE3_FIX_PLAN.md) | Kế hoạch sửa Phase 3 |
| [PRODUCT.md](PRODUCT.md) | Người dùng và mục đích sản phẩm |

Đọc `docs/ENGINEERING.md` trước khi sửa mã.

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
