# Personal Schedule System

Quản lý lịch cá nhân đa loại (học, làm ca, gia sư, nghiên cứu) kèm theo dõi thu nhập. Chạy hoàn toàn ở client, dữ liệu trong IndexedDB.

Bảy màn hình: lịch tuần có kéo–thả, lịch tháng, danh sách có lọc và tìm kiếm, bảng lương tháng, thống kê, quản lý (danh mục + lịch lặp), cài đặt.

Phím tắt: `←` `→` đổi tuần/tháng, `T` về hôm nay, `N` thêm sự kiện.

Tiêu đề và ghi chú là **dữ liệu người dùng**, không đi qua i18n — gõ 中文 thì hiện 中文. Font stack khai báo sẵn CJK để không rơi vào font dự phòng tùy máy, và tìm kiếm bỏ dấu vẫn hoạt động trên chuỗi trộn Việt–Trung (có test).

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
```

## Deploy

Push lên `main` là `.github/workflows/deploy.yml` tự chạy: `npm ci` → test → typecheck → build → đẩy `dist/` lên GitHub Pages. **Test đỏ thì không có gì được deploy** — đó là toàn bộ lý do bộ test tồn tại.

Bật một lần trong repo: Settings → Pages → Source → **GitHub Actions**.

`vite.config.ts` đặt `base: './'` (đường dẫn tương đối) thay vì viết cứng tên repo. Nhờ vậy không phải sửa file khi đổi tên repo, và mở thẳng thư mục `dist` bằng `file://` cũng chạy. An toàn vì ứng dụng chỉ có một trang, không có router lồng nhiều cấp.

**Dữ liệu KHÔNG đi theo.** IndexedDB tách riêng theo origin, nên bản trên `github.io` khởi đầu trống trơn — dữ liệu ở `localhost` vẫn nằm nguyên chỗ cũ. Muốn chuyển thì Cài đặt → Xuất file sao lưu ở máy này, rồi Nhập từ file ở máy kia. Cũng vì thế mà **repo công khai không làm lộ lịch của bạn**: chỉ có mã nguồn được đẩy lên, dữ liệu chưa bao giờ rời khỏi trình duyệt.

## Cài như ứng dụng

Có `manifest.webmanifest` và service worker tự viết (`public/sw.js`), không thêm phụ thuộc nào. Mở bản đã deploy trên Chrome/Edge → menu → "Cài đặt ứng dụng"; trên Android là "Thêm vào màn hình chính". Sau lần mở đầu tiên, app chạy được cả khi không có mạng — dữ liệu vốn đã nằm trong IndexedDB, thứ duy nhất cần cache là mấy file HTML/JS/CSS.

Service worker dùng **hai chiến lược khác nhau, không được gộp**: yêu cầu điều hướng thì ưu tiên mạng, tài nguyên thì ưu tiên cache. `index.html` trỏ tới các file JS đã băm tên, nên phục vụ bản HTML cũ từ cache sau khi deploy bản mới sẽ khiến nó đòi những file không còn tồn tại — trắng màn hình và người dùng không có đường thoát.

## In — vì sao bản in KHÁC màn hình

Lưới giờ không in vừa một trang A4 và sẽ không bao giờ vừa. Nó trải 06:00–23:00, tức 17 tiếng × 56px = **952px**, trong khi A4 ngang trừ lề 10mm chỉ còn khoảng **718px** chiều cao. Thu nhỏ cho vừa thì mỗi giờ còn 35px, một buổi 1 tiếng cao 35px, chữ tiêu đề và giờ chồng lên nhau — vừa giấy nhưng không đọc được.

Nên `Ctrl+P` ở lịch tuần in ra một **bảng ba hàng buổi × bảy cột ngày** (`PrintWeek.tsx`), không phải lưới giờ. Bỏ vị trí chính xác theo phút, đổi lấy việc luôn vừa một trang: thêm buổi chỉ làm ô cao thêm chứ không kéo dài bảng theo trục thời gian.

Ba hàng phủ **trọn 24 giờ** chứ không đúng theo nhãn — "Sáng" bắt đầu từ 00:00, "Tối" kéo tới 24:00. Ca 05:00 hay 23:30 là chuyện có thật, và hở một khoảng là buổi rơi vào đó biến mất khỏi bản in mà không báo gì. Có test cho chuyện này.

Buổi đã hủy không lên giấy: bản in là thứ mang theo để làm việc, không phải nhật ký.

### Hai nút, hai cơ chế khác hẳn nhau

| | **In** | **Xuất PDF** |
|---|---|---|
| Cách làm | `window.print()` + `@media print` | `@react-pdf/renderer` |
| Thao tác | Hộp thoại in → chọn "Lưu dưới dạng PDF" | Tải file thẳng xuống |
| Unicode | **Hoàn hảo** — dùng font hệ thống, tiếng Việt, 中文, emoji đều đúng | Tùy font đã cài, xem bên dưới |
| Dung lượng | 0 | ~456 KB thư viện + font, **nạp động** |
| Offline | Có | Lần đầu cần mạng để tải chunk |

Trình duyệt không cho trang web tự ghi file PDF qua đường in — đó là ràng buộc bảo mật. Khác biệt thật giữa hai nút chỉ là một cú bấm.

### Cài font cho Xuất PDF

Font mặc định của định dạng PDF (Helvetica) mã hóa WinAnsi và **không có glyph tiếng Việt có dấu**. Tệ hơn: khi thiếu glyph, PDF không bỏ trống mà lấy glyph nằm ở **chỉ số tương ứng** trong bảng của font. `中文` ra `-‡` — ký tự sai trông như thật, không phải ô vuông báo thiếu. Người dùng hoàn toàn có thể gửi file hỏng đi mà không nhận ra.

Vì thế `pdf/fonts.ts` kiểm tra sự tồn tại của file **trước** khi đăng ký, và báo lỗi rõ ràng nếu thiếu — @react-pdf nuốt lỗi tải font rồi lặng lẽ quay về Helvetica.

**Bắt buộc** — đặt vào `public/fonts/`:

```
NotoSans-Regular.ttf      ~500 KB   Latin + tiếng Việt
NotoSans-Bold.ttf                    (thiếu thì chữ đậm dùng bản thường)
```

Tải ở [Google Fonts — Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans): "Get font" → "Download all" → lấy hai file trong thư mục `static`.

**Chỉ khi lịch có tiếng Trung / Nhật / Hàn / emoji:**

```
NotoSansSC-Regular.ttf    ~10 MB    có SẴN cả glyph Latin
NotoSansSC-Bold.ttf
```

Tải ở [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC).

### Chọn font theo nội dung

`findUnsupportedText()` dò tiêu đề, tên danh mục và địa điểm của cả tuần. Có chữ Hán, kana, Hangul hay emoji thì dùng bộ CJK cho **toàn bộ** tài liệu; không thì dùng bộ Latin.

Hai điều khiến cách này gọn:

Noto Sans SC **đã chứa glyph Latin**, nên khi cần CJK thì một font lo hết — không phải dựng cơ chế font dự phòng, thứ mà @react-pdf hỗ trợ không đồng nhất giữa các phiên bản.

Và font 10 MB **chỉ tải khi thật sự cần**. Lịch toàn tiếng Việt không bao giờ chạm tới nó. Thiếu file CJK thì lỗi chỉ ra đúng file đó và gợi ý dùng nút "In" trong lúc chờ.

Biểu tượng hiện là SVG. Chrome chấp nhận, nhưng muốn Lighthouse hài lòng hoàn toàn thì nên bổ sung PNG 192px và 512px.

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy bộ test (Vitest) |
| `npm run test:watch` | Test ở chế độ theo dõi |
| `npm run typecheck` | `tsc -b` — **phải là `-b`**, xem bên dưới |
| `npm run lint` | oxlint |
| `npm run check:core` | Kiểm tra ranh giới `core/` (chạy bằng Node, không cần bash) |
| `npm run build` | Build production |

### ⚠️ `typecheck` phải chạy `tsc -b`, không phải `tsc --noEmit`

`tsconfig.json` là một **solution file**: `"files": []` cộng với `references` trỏ sang `tsconfig.app.json` và `tsconfig.node.json`.

Chạy `tsc --noEmit` trên cấu hình đó sẽ kiểm tra đúng **không file nào** rồi thoát với mã 0. Lệnh luôn xanh, và nó xanh vì chẳng làm gì cả. Chỉ chế độ build `-b` mới đi theo các reference.

Lỗi này im lặng theo cách tệ nhất: nó không báo gì, chỉ đơn giản là không bảo vệ. Bốn lỗi kiểu thật đã lọt qua nhiều phiên làm việc và chỉ lộ ra khi chạy `npm run build`.

## Cấu trúc

```
src/
├── types/index.ts       Toàn bộ schema. Đọc phần đầu file trước khi sửa gì.
│
├── core/                HÀM THUẦN — KHÔNG import React, KHÔNG import Dexie
│   ├── time.ts          Nền thời gian; xử lý ca qua đêm
│   ├── calendar.ts      Khung ngày tháng cho lưới tuần / lưới tháng
│   ├── layout.ts        Xếp cột cho khối chồng lấn trong Week View
│   ├── expand.ts        Mở rộng lịch lặp + hợp nhất ngoại lệ
│   ├── conflict.ts      Phát hiện trùng lịch
│   ├── filter.ts        Lọc và tìm kiếm (bỏ dấu tiếng Việt)
│   ├── stats.ts         Thống kê kế hoạch vs thực tế
│   ├── backup.ts        Kiểm tra file sao lưu + quy tắc trộn theo updatedAt
│   ├── trash.ts         Mốc thời gian cho việc dọn tombstone
│   ├── reminder.ts      Chọn buổi cần nhắc và thời điểm bắn
│   ├── income.ts        TẦNG 1 — tiền của một buổi
│   ├── payroll.ts       TẦNG 2 — tiền của một tháng (con số chính thức)
│   └── __tests__/
│
├── db/
│   ├── schema.ts        Lớp Dexie + chuỗi version()
│   ├── seed.ts          Danh mục mặc định
│   ├── backup.ts        Xuất/nhập toàn bộ DB
│   └── repo/            CRUD — nơi DUY NHẤT được đụng vào db
│
├── hooks/
│   ├── useSchedule.ts   Nối db/ với core/ cho các màn hình lịch
│   ├── usePayroll.ts    Nối db/ với core/ cho màn hình thu nhập
│   └── useSettings.ts
│
├── actions/schedule.ts  Dịch thao tác người dùng thành lệnh ghi DB
├── undo/                Toast "Hoàn tác"
├── components/
├── i18n/                i18next + bộ vi (en/zh thêm sau)
└── App.tsx
```

### Luồng dữ liệu

```
db/repo ─► useSchedule() ─► expandSchedule() ─► detectConflicts() ─► lịch tuần/tháng/danh sách
db/repo ─► usePayroll()  ─► expandSchedule() ─► calcAllPayrolls() ─► bảng lương
```

Component KHÔNG tự gọi `expandSchedule`. Chúng nhận Occurrence đã hợp nhất và đã gắn cờ trùng lịch.

`core/` chỉ nhận mảng vào, trả mảng ra. Không import `react`, không import `dexie`. Nhờ đó test chạy trong mili-giây không cần DOM, và lúc lên Cloud DB chỉ phải viết lại `db/`. `npm run check:core` canh ranh giới này — chạy trước mỗi lần commit.

## Hai chế độ lương — chỗ dễ hiểu sai nhất

```
calcOccurrenceIncome()   TẦNG 1 — tiền MỘT buổi
                         FIXED_MONTHLY trả về null, KHÔNG phải 0.
                         UI hiện "—" cho null, "0đ" cho 0.

calcMonthlyPayroll()     TẦNG 2 — CON SỐ CHÍNH THỨC
                         Mọi màn hình thống kê phải đọc từ đây.
                         KHÔNG được tự cộng dồn kết quả Tầng 1.
```

Với lương khoán tháng, "buổi thứ Ba kiếm được bao nhiêu?" **không có đáp án** — 8 triệu/tháng không phải tổng của 22 buổi chia đều. Cộng dồn Tầng 1 sai cả hai chiều: tháng thiếu buổi ra thấp hơn lương thật, tháng thừa buổi ra cao hơn.

Cùng dữ liệu 160 giờ (chuẩn 176), phạt 100k, thưởng 300k:

| Chế độ | Thực nhận |
|---|---|
| `HOURLY` 45.000đ/giờ | 7.400.000 |
| `FIXED_MONTHLY` 8tr, `NONE` | 8.200.000 |
| `FIXED_MONTHLY` 8tr, `PRO_RATA` | 7.472.727 |

Ba con số khác nhau, nên `mode` và `shortfallPolicy` **không có mặc định an toàn**. Form cấu hình lương bắt chọn rõ cả hai trước khi cho lưu.

Mỗi nguồn thu nhập một danh mục riêng: `SalaryRule` gắn vào `categoryId` và mỗi danh mục chỉ mang một chế độ lương tại một thời điểm. Gộp chỗ trả khoán tháng với chỗ trả theo giờ vào chung một danh mục là `calcMonthlyPayroll` hết đường phân biệt.

## Ba phạm vi khi sửa một buổi của lịch lặp

| Phạm vi | Ghi gì | Hệ quả |
|---|---|---|
| Chỉ buổi này | Một `ScheduleException` (`MOVE` nếu đổi ngày, `REPLACE` nếu không) | Các buổi khác giữ nguyên |
| Buổi này và các buổi sau | Đặt `endDate` cho rule cũ + tạo rule mới từ mốc cắt | Buổi đã qua giữ nguyên → bảng lương tháng cũ không nhảy số |
| Toàn bộ chuỗi | Sửa thẳng rule | Đổi cả quá khứ. `startDate` cố tình KHÔNG đổi theo ô Ngày |

Kéo–thả trên lưới tuần luôn dùng phạm vi **chỉ buổi này** — kéo một khối có nghĩa rõ ràng là dời buổi đó, không ai kéo mà mong cả chuỗi sáu tháng dịch theo.

## Bẫy đã gài sẵn — đừng vô tình gỡ ra

| Chỗ | Nếu phá thì hỏng gì |
|---|---|
| `getExceptionsInWindow` truy vấn hai chiều (`originalDate` ∪ `newDate`) | Bỏ vế `newDate` → buổi dời sang tuần khác BIẾN MẤT, loại `ADD` không bao giờ hiển thị |
| `ruleStatus` xét cả `count`, không chỉ `endDate` | Chỉ so `endDate` → chuỗi "10 buổi" đã dùng hết từ năm ngoái vẫn báo đang chạy |
| Màn hình Quản lý liệt kê MỌI rule | Bỏ đi → rule đã hết hạn không sinh buổi nào trên lịch, nên không còn đường nào sửa hay xóa nó |
| `expandSchedule` bước 4 (kéo `MOVE` từ ngoài cửa sổ vào) | Bỏ đi → cùng lỗi trên |
| `overlaps` dùng `<` chứ không phải `<=` | Đổi thành `<=` → mọi ca liền nhau (10–12h và 12–14h) đều bị báo trùng |
| Index `&[recurringRuleId+originalDate]` (dấu `&` = unique) | Bỏ `&` → hai exception chọi nhau trên cùng một buổi |
| `setOccurrenceStatus` giữ nguyên `type` của exception cũ | Ghi đè thành `'STATUS'` → buổi đã dời nhảy ngược về ngày gốc |
| `resizeOccurrence` giữ `'MOVE'` khi buổi đã bị dời | Đổi thành `'RESIZE'` → cùng lỗi trên, lần này khi co giãn |
| `upsertExceptionUndoable` chụp trạng thái cũ trước khi ghi đè | Hoàn tác kiểu "xóa bản vừa ghi" → buổi về ngày gốc thay vì ngày đã dời |
| `Math.abs` trong `calcMonthlyPayroll` và `normalizeAmount` | Bỏ đi → nhập nhầm dấu âm cho khoản phạt sẽ thành CỘNG tiền |
| Chặn `standardMonthlyHours > 0` | Bỏ đi → chia cho 0 → `Infinity` → `NaN` lan ra toàn bộ báo cáo |
| Không kẹp `net` về 0 khi âm | Kẹp lại → che mất lỗi nhập liệu |

Mỗi mục đều có test tương ứng trong `src/core/__tests__/`. Sửa mà test đỏ thì đọc tên test trước khi sửa test.

## Quy ước bắt buộc

| Quy ước | Chi tiết |
|---|---|
| Giờ treo tường | `date` = `"YYYY-MM-DD"`, `startTime` = `"HH:mm"` giờ địa phương. KHÔNG lưu UTC timestamp cho lịch. Chỉ `createdAt`/`updatedAt`/`deletedAt` mới là ISO UTC. |
| Thời lượng, không phải giờ kết thúc | Lưu `durationMinutes`. Nhờ vậy ca qua đêm (22:00–02:00) không thể sinh thời lượng âm. |
| Ngày sở hữu sự kiện | Sự kiện LUÔN thuộc về ngày của `startTime`, kể cả khi kết thúc sang hôm sau. |
| `originalDate` neo vào đâu | LUÔN trỏ tới ngày occurrence gốc do rule sinh ra. KHÔNG BAO GIỜ trỏ tới ngày đã dời tới. |
| `amount` của adjustment | LUÔN là số dương. Dấu cộng/trừ do `kind` quyết định. |
| Dexie `version()` | Chỉ được THÊM `version(2)`, `version(3)`… KHÔNG BAO GIỜ sửa `version(1)`. |
| i18n | Viết `t('...')` ngay từ đầu, chỉ điền bộ `vi`. Không hard-code chuỗi tiếng Việt vào component. |

## Sao lưu

Toàn bộ dữ liệu nằm trong IndexedDB của **một** trình duyệt. Xóa dữ liệu duyệt web, cài lại máy, hay đổi trình duyệt là mất trắng — không có máy chủ nào giữ hộ. Cài đặt → Sao lưu và khôi phục → Xuất file sao lưu.

Nhập có hai chế độ:

| Chế độ | Làm gì |
|---|---|
| Trộn | Giữ nguyên dữ liệu đang có. Bản ghi trùng `id` thì bản có `updatedAt` **muộn hơn** thắng. Không xóa gì. |
| Ghi đè | Xóa sạch rồi khôi phục từ file. Máy sẽ giống hệt lúc xuất. |

Quy tắc trộn cố tình **dùng chung với Phase đồng bộ Cloud** — `mergeById()` trong `core/backup.ts` chính là hàm giải quyết xung đột sau này, và nó có test ngay từ bây giờ.

Sao lưu giữ nguyên cả bản ghi đã xóa mềm. Bỏ tombstone đi thì khôi phục xong, mọi thứ người dùng đã cố ý dọn đi sẽ hiện về.

## Chế độ tối

Đảo **bảng màu** qua biến CSS của Tailwind v4 (`index.css`), không thêm biến thể `dark:` vào từng lớp. Tailwind v4 biên dịch mọi lớp màu thành `var(--color-…)`, nên gán lại các biến đó dưới `.dark` là toàn bộ giao diện tự lật.

Hai loại lớp phải xử lý riêng, đã ghi rõ trong `index.css`: lớp phủ (`bg-black/50` thay vì `bg-slate-900/40`, vì `--color-black` cố ý không bị đảo) và chữ nằm trên bề mặt đảo ngược (toast).

## Thống kê — bốn cách đếm "giờ"

Trộn lẫn bốn con số này là ra số vô nghĩa, nên `core/stats.ts` định nghĩa rõ:

| Tên | Nghĩa |
|---|---|
| `planned` | Mọi buổi trên lịch, **bất kể trạng thái** — thứ bạn định làm |
| `completed` | Chỉ buổi đã đánh dấu hoàn thành — thứ bạn thật sự đã làm |
| `cancelled` / `noShow` | Phần chênh lệch |
| `scheduled` | Buổi chưa xảy ra hoặc chưa đánh dấu |

Bất biến `completed + cancelled + noShow + scheduled === planned` có test riêng: thêm một trạng thái mới mà quên cập nhật `statsByCategory` sẽ làm test đỏ, thay vì để số liệu lệch âm thầm.

Lưu ý `completed` ở đây **khác** `hoursActual` trong `core/payroll.ts`. Bảng lương tính tiền trên mọi buổi không bị hủy kể cả buổi chưa tới (lương phải dự tính được); thống kê chỉ đếm cái đã thật sự xảy ra.

Màn hình này là lý do `ExceptionType='STATUS'` được thêm ở Phase 0 để vá lỗi B1. Nếu bật "tự đánh dấu buổi đã qua" trong Cài đặt thì mọi buổi quá khứ tự thành `COMPLETED` và tỷ lệ luôn đẹp — màn hình có nhắc chuyện đó ngay dưới biểu đồ.

## Hoàn tác

Phủ **mọi** thao tác ghi: tạo, sửa qua form (cả bảy nhánh của `applySubmit`), kéo–thả, co giãn, xóa buổi, xóa chuỗi, xóa danh mục, xóa cấu hình lương, xóa khoản điều chỉnh.

Nguyên tắc: hàm ghi trả về kèm cách hoàn nguyên, không có undo stack toàn cục. Hai chỗ khó:

`splitRuleFrom` phải đảo **ba** việc — bỏ rule mới, trả `endDate`/`count` của rule cũ, khôi phục exception đã dọn. Chỉ làm việc đầu thì chuỗi cũ vẫn bị đóng ở ngày cắt và mọi buổi sau đó biến mất vĩnh viễn.

`upsertExceptionUndoable` chụp trạng thái cũ **trước** khi ghi đè, vì index unique chỉ cho một exception mỗi buổi. Hoàn tác kiểu "xóa bản vừa ghi" sẽ đưa buổi về ngày gốc thay vì ngày đã dời — hoàn tác sai còn tệ hơn không có hoàn tác.

Ngoại lệ duy nhất: **nhập file sao lưu** và **xóa vĩnh viễn trong thùng rác** không hoàn tác được, và cả hai hộp thoại đều nói thẳng điều đó.

## Thùng rác

Mọi thao tác xóa đều là xóa mềm — bản ghi ở lại để nút Hoàn tác có đường quay về, và để Phase đồng bộ Cloud biết mà xóa ở phía kia. Nhưng khi toast tắt, tombstone không còn màn hình nào chạm tới: không khôi phục được, không dọn được, vẫn phình file sao lưu. Cài đặt → Thùng rác đóng vòng đó.

Xóa vĩnh viễn mặc định chỉ dọn thứ đã xóa **quá 30 ngày**. Lý do không chỉ là an toàn dữ liệu: mất tombstone là mất luôn tín hiệu "hãy xóa bản ghi này ở máy khác", nên dọn sớm rồi đồng bộ có thể khiến bản ghi sống lại từ máy chưa nhận được lệnh xóa.

Khôi phục một `RecurringRule` kéo theo cả exception bị dọn **cùng lúc** với nó — `softDeleteRule` đóng chung một dấu thời gian chính là để phục vụ chỗ này. Khôi phục Category thì **không** kéo lịch về: lúc xóa, rule và event đã bị dời sang "Chưa phân loại" và bản ghi không lưu chúng vốn thuộc về đâu. Chỉ nút Hoàn tác ngay tại thời điểm xóa mới làm được, vì nó giữ danh sách trong bộ nhớ. Màn hình nói rõ điều này.

## Nhắc lịch — và vì sao nó chỉ nhắc được nửa vời

Ứng dụng không có máy chủ. Không máy chủ thì không có Web Push, và không Web Push thì **không có cách nào** đánh thức trình duyệt đã đóng. Notification Triggers API làm được nhưng tới nay vẫn nằm sau cờ thử nghiệm.

Nên cơ chế là hẹn giờ trong trang: chỉ chạy khi tab hoặc app đang mở. Màn hình Cài đặt nói thẳng điều đó **ngay dưới tiêu đề**, không giấu xuống cuối — một tính năng nhắc lịch hứa nhiều hơn thực tế là cách nhanh nhất khiến người ta bỏ lỡ ca làm rồi mất niềm tin vào cả ứng dụng.

Muốn nhắc thật khi đóng app thì phải có backend đẩy Web Push. Đó là một dự án khác.

## Test

| Tầng | Cách test |
|---|---|
| `core/`, `pdf/model` | Hàm thuần, mảng vào mảng ra. Không cần DOM, chạy trong mili-giây. |
| `db/` | IndexedDB thật trong bộ nhớ qua `fake-indexeddb`. **Không mock Dexie.** |
| Component | `@testing-library/react`. Ưu tiên chặn tái phát các lỗi đã từng lọt. |

Bộ test ở `core/` **không bắt được** ba lỗi lọt lưới gần đây — ô số nằm trong `<label>`, cột biểu đồ cao 0px, bộ lọc nhắc lịch. Không phải vì chúng yếu, mà vì chúng nhìn sai chỗ. Test component tồn tại để bịt đúng khoảng mù đó, nên mỗi bài nên tương ứng với một lỗi thật chứ không phải phủ cho đủ.

Tầng `db/` chạy mã thật chứ không mock là có lý do: mock `db.rules.update()` chỉ chứng minh ta gọi đúng hàm, nó không chứng minh Dexie hiểu `deletedAt: undefined` là lệnh **xóa thuộc tính** — mà toàn bộ cơ chế hoàn tác dựa vào đúng hành vi đó.

Mỗi bài trong `src/db/__tests__/undo.test.ts` tương ứng với một lỗi đã từng xảy ra hoặc suýt xảy ra: ghi `CANCEL` đè lên `MOVE` rồi hoàn tác, đánh dấu hoàn thành làm mất `type: 'MOVE'`, tách chuỗi mà quên trả `endDate`, xóa danh mục rồi khôi phục mà lịch nằm lại ở "Chưa phân loại".

## Còn treo

| Việc | Ghi chú |
|---|---|
| Xuất PNG | Đã in được PDF qua `window.print()`. Muốn xuất ảnh bitmap thì dùng `html2canvas-pro`, KHÔNG dùng `html2canvas` 1.4.1 — bản đó crash với Tailwind v4 vì `oklch()`. |
| Xóa hẳn rate của riêng một buổi | Exception dùng `??` để nối tiếp giá trị gốc, nên không phân biệt được "để trống" với "xóa đi". |
| "Copy Week" | Chưa định nghĩa lại. Với kiến trúc rule-based, copy tuần sẽ nhân đôi sự kiện. |
| Biểu tượng PNG cho PWA | Hiện chỉ có SVG. Chrome cài được, nhưng Lighthouse muốn PNG 192px và 512px. |
| Test cho component | `core/` và `db/` đã phủ. Tầng React thì chưa — và hai lỗi lọt lưới gần đây (ô số nằm trong `<label>`, cột biểu đồ cao 0px) đều nằm đúng ở đó. |
| Nhắc lịch khi đã đóng app | Cần backend đẩy Web Push. Xem mục Nhắc lịch. |
| Đồng bộ Cloud | `BaseEntity` đã có `createdAt`/`updatedAt`/`deletedAt`, và `mergeById()` đã là quy tắc giải quyết xung đột. Chỉ phải viết lại `db/`. |

## Ngôn ngữ

Giao diện có `vi`, `en` và `zh`, đổi trong Cài đặt. Khóa nào thiếu ở bộ đang dùng thì rơi về tiếng Việt — mọi chuỗi mới đều viết ở `vi` trước, nên đó là bản đầy đủ nhất.

`formatMoney` / `formatDate` / `formatHours` lấy ngôn ngữ từ i18next **tại thời điểm gọi**, không phải hằng số lúc định nghĩa. Trước đây chúng mặc định cứng `'vi'`; không ai để ý vì chỉ có một bộ ngôn ngữ, nhưng đó đúng là loại trường chết chỉ lộ ra khi thêm bộ thứ hai.

Tiêu đề, ghi chú, địa điểm và tên học sinh là **dữ liệu người dùng** — chúng không đi qua i18n và hiện đúng như đã gõ, bất kể ngôn ngữ giao diện.

## Tài liệu kèm theo

| File | Nội dung |
|---|---|
| `REVIEW_Personal_Schedule_System.md` | 30+ lỗi tìm được trong kế hoạch gốc, phân theo mức nghiêm trọng |
| `PHASE0_Dac_ta_thi_cong.md` | Mô hình lương hai chế độ + schema chốt + 8 bước dựng nền móng |
