# Personal Schedule System

Quản lý lịch cá nhân đa loại (học, làm ca, gia sư, nghiên cứu) kèm theo dõi thu nhập. Chạy hoàn toàn ở client, dữ liệu trong IndexedDB. Đồng bộ nhiều thiết bị qua Supabase là **tùy chọn** — không cấu hình thì ứng dụng chạy y hệt như trước.

Mười màn hình trên thanh điều hướng: tổng quan, lịch tuần có kéo–thả, lịch tháng, danh sách có lọc và tìm kiếm, bảng lương tháng, thu tiền, thống kê, quản lý (danh mục + lịch lặp), tài khoản, cài đặt. Cộng trang chính sách riêng tư ở `#/privacy`, ngoài thanh tab.

**Nếu bạn sắp sửa mã trong dự án này, đọc [Tiêu chuẩn và quy trình](#tiêu-chuẩn-và-quy-trình) trước.**

### `Client` không phải "học sinh"

Thực thể này trả lời câu **"buổi này dành cho ai / ở đâu"**: học sinh với lịch gia sư, chỗ làm với lịch đi làm, môn học với lịch đại học, đề tài với lịch nghiên cứu. Tên đặt chung từ đầu để không phải đổi khi dùng cho loại lịch khác, và bộ lọc ở Danh sách lẫn Thống kê đều lọc theo nó.

Trên giao diện nó hiển thị là **"Đối tượng"** ở cả ba ngôn ngữ. Trong mã và trong DB nó là bảng `clients`; `rules`, `events`, `exceptions` và `payments` chỉ giữ khóa `clientId`. Nếu bạn viết chữ "học sinh" vào một nhãn nào đó, bạn đang thu hẹp nó về đúng một trong bốn công dụng của nó.

Từ `db.version(3)` nó **không còn là chuỗi gõ tay**. `clientIdFromName()` sinh id tất định từ tên đã bỏ dấu — `Minh` → `client-minh` — nên gõ lại cùng một tên sẽ trỏ về đúng đối tượng cũ thay vì đẻ thêm một bản ghi nữa. Đổi tên một đối tượng giờ không làm mồ côi khoản thu nào, vì `Payment` neo vào `clientId` chứ không phải vào tên.

⚠️ Cái giá của "tất định là bỏ dấu": **"Minh" và "Mình" gộp làm một.** Đó là chủ ý — trước kia chúng là hai đối tượng rời và đó mới là thứ không ai muốn — nhưng nếu bạn thật sự có hai người khác nhau đúng ở mỗi cái dấu, phải phân biệt bằng tên đầy đủ. `ensureClient()` chỉ tách ra id ngẫu nhiên khi id trùng mà tên chuẩn hóa **khác** nhau (`Minh!` so với `Minh`).

Phím tắt: `←` `→` đổi tuần/tháng, `T` về hôm nay, `N` thêm sự kiện.

Tiêu đề và ghi chú là **dữ liệu người dùng**, không đi qua i18n — gõ 中文 thì hiện 中文. Font stack khai báo sẵn CJK để không rơi vào font dự phòng tùy máy, và tìm kiếm bỏ dấu vẫn hoạt động trên chuỗi trộn Việt–Trung (có test).

## Trạng thái dự án (Project Status)

### Completed
- Kiến trúc cơ sở, i18n, IndexedDB.
- Tính năng cốt lõi: Quản lý lịch tuần/tháng, Thống kê, Tài khoản, Cài đặt.
- Tính năng thu tiền (DuesView), xuất PDF, ICS.
- Thực thể `Client` độc lập với id tất định, thay cho chuỗi gõ tay (`db.version(3)`).
- Bọc ứng dụng qua nền tảng Capacitor (Native Android/iOS).

### In Progress
- **Web Push mới có khung, chưa chạy được.** Edge Function và khóa VAPID đã dựng, nhưng subscription chưa được lưu và chưa có bộ lập lịch — xem mục "Khung Web Push đã dựng". Nhắc lịch thực tế vẫn là `setTimeout` trong trang.

### Next Tasks
- *(Theo quyết định của người dùng)*

### Known Issues
- **Tên thuần chữ Hán/Nhật sinh id ngẫu nhiên, không tất định.** `clientIdFromName()` lọc bỏ mọi ký tự ngoài `[a-z0-9-]`, nên `小明` cho ra chuỗi rỗng và rơi về `newId()`. Hệ quả: gõ lại đúng tên đó tạo thêm một đối tượng mới mỗi lần. Dọn tạm bằng **Gộp đối tượng trùng** ở Cài đặt; sửa gốc thì phải đổi cách sinh id, mà việc đó đụng vào `version(3)` đã chạy nên cần cân nhắc riêng.

### Security Status
- Tích hợp RLS (nếu cấu hình Supabase).
- Sử dụng HTTPS/TLS ở môi trường production.
- Không lộ secrets (Sử dụng `import.meta.env`).
- Database migration script chạy cục bộ (Dexie), ngăn rủi ro SQL Injection hoặc sai sót Role.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
```

## Deploy

Push lên `main` là `.github/workflows/deploy.yml` tự chạy: `npm ci` → sáu cổng chặn (`check:core`, `check:cloud`, `check:i18n`, `lint`, `test`, `typecheck`) → build → đẩy `dist/` lên GitHub Pages. **Cổng nào đỏ thì không có gì được deploy** — đó là toàn bộ lý do chúng tồn tại. Cùng danh sách với `npm run verify` ở máy.

Bật một lần trong repo: Settings → Pages → Source → **GitHub Actions**.

### Biến môi trường cho bản deploy

Muốn bản trên GitHub Pages dùng được Đồng bộ Cloud thì đặt các biến này ở Settings → Secrets and variables → Actions → **Variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_VAPID_PUBLIC_KEY   (chỉ cần khi nối xong Web Push — hiện chưa)
```

**Ở `Variables`, không phải `Secrets`.** Anon key của Supabase vốn là công khai — nó đi thẳng vào bundle JS phía trình duyệt trong mọi trường hợp, và thứ bảo vệ dữ liệu là RLS chứ không phải sự bí mật của key này. Giấu nó vào `Secrets` không tăng chút an toàn nào, chỉ tạo cảm giác an toàn giả.

Khóa VAPID **công khai** cùng một lý lẽ: nó phải nằm trong bundle thì trình duyệt mới đăng ký push được. Chỉ khóa VAPID **riêng tư** mới là secret thật — và nó nằm ở biến môi trường của Edge Function, không bao giờ đi qua bước build này. Lẫn hai khóa đó với nhau là cách làm lộ khóa riêng tư nhanh nhất.

Bỏ trống cũng được: app vẫn build và chạy bình thường, mục Đồng bộ trong Cài đặt hiện dòng "chưa cấu hình".

⚠️ Vite nhúng `import.meta.env.VITE_*` thành **hằng chuỗi lúc biên dịch**, nên hai biến này phải có mặt ở bước `npm run build`, không phải lúc chạy. Thiếu ở đó thì bundle mang chuỗi rỗng vĩnh viễn và không có cách nào cấu hình sau khi deploy.

`vite.config.ts` đặt `base: './'` (đường dẫn tương đối) thay vì viết cứng tên repo. Nhờ vậy không phải sửa file khi đổi tên repo, và mở thẳng thư mục `dist` bằng `file://` cũng chạy. An toàn vì ứng dụng chỉ có một trang, không có router lồng nhiều cấp.

**Dữ liệu KHÔNG đi theo.** IndexedDB tách riêng theo origin, nên bản trên `github.io` khởi đầu trống trơn — dữ liệu ở `localhost` vẫn nằm nguyên chỗ cũ. Muốn chuyển thì Cài đặt → Xuất file sao lưu ở máy này, rồi Nhập từ file ở máy kia. Cũng vì thế mà **repo công khai không làm lộ lịch của bạn**: chỉ có mã nguồn được đẩy lên, dữ liệu chưa bao giờ rời khỏi trình duyệt.

## Cài như ứng dụng

Có `manifest.webmanifest` và service worker tự viết (`public/sw.js`), không thêm phụ thuộc nào. Mở bản đã deploy trên Chrome/Edge → menu → "Cài đặt ứng dụng"; trên Android là "Thêm vào màn hình chính". Sau lần mở đầu tiên, app chạy được cả khi không có mạng — dữ liệu vốn đã nằm trong IndexedDB, thứ duy nhất cần cache là mấy file HTML/JS/CSS.

Service worker dùng **hai chiến lược khác nhau, không được gộp**: yêu cầu điều hướng thì ưu tiên mạng, tài nguyên thì ưu tiên cache. `index.html` trỏ tới các file JS đã băm tên, nên phục vụ bản HTML cũ từ cache sau khi deploy bản mới sẽ khiến nó đòi những file không còn tồn tại — trắng màn hình và người dùng không có đường thoát.

## Xuất sang ứng dụng lịch (.ics)

Cài đặt → Xuất sang ứng dụng lịch. Đưa lịch vào Google Calendar, Apple Calendar, Outlook hay ứng dụng lịch của điện thoại.

Khác PDF/PNG ở chỗ căn bản: **PDF là ảnh chụp để đọc, `.ics` là dữ liệu sống.** Buổi học vào thẳng lịch hệ điều hành, có nhắc nhở thật (thứ mà ứng dụng này [không tự làm được](#nhắc-lịch--và-vì-sao-nó-chỉ-nhắc-được-nửa-vời)), và lịch lặp vẫn là một chuỗi sửa được.

### Giờ trôi nổi — quyết định lớn nhất của module

RFC 5545 cho ba cách ghi thời điểm:

```
DTSTART:20260824T180000Z              ← UTC
DTSTART;TZID=Asia/Ho_Chi_Minh:2026…   ← có múi giờ
DTSTART:20260824T180000               ← TRÔI NỔI, ta dùng cái này
```

Giờ trôi nổi nghĩa là *"18:00 ở bất cứ đâu bạn đang đứng"*. Đó chính xác là mô hình của ứng dụng: `types/index.ts` nói ca học 8h sáng phải là 8h sáng ở mọi múi giờ.

Chọn `Z` thì bay sang Nhật là toàn bộ lịch lệch hai tiếng — và nó lệch **âm thầm**, file vẫn hợp lệ, ứng dụng lịch vẫn nhận. Chọn `TZID` thì phải nhúng cả khối `VTIMEZONE` với luật giờ mùa hè, sai một luật là lệch một tiếng trong nửa năm. Giờ trôi nổi vừa đúng mô hình vừa là ít mã nhất; hiếm khi hai điều đó trùng nhau.

Ngoại lệ: `DTSTAMP` **phải** có `Z`. Nó là thời điểm sinh file, không phải giờ lịch.

### Bốn loại dữ liệu, bốn cách ánh xạ

| Trong ứng dụng | Trong .ics |
|---|---|
| `SingleEvent` | một `VEVENT` |
| `RecurringRule` | một `VEVENT` + `RRULE` |
| exception `CANCEL` | `EXDATE` trên `VEVENT` của chuỗi |
| exception `MOVE`/`REPLACE`/`RESIZE` | `VEVENT` riêng, **cùng UID**, mang `RECURRENCE-ID` trỏ về ngày gốc |
| exception `ADD` | `VEVENT` độc lập, UID riêng |

Cách này giữ lịch lặp là **một** mục trong ứng dụng lịch. Cách dễ hơn — mở rộng hết thành từng buổi rời — cho ra file đúng nhưng người dùng nhận về 52 mục không sửa hàng loạt được.

⚠️ `RECURRENCE-ID` phải trỏ về **ngày gốc do rule sinh ra**, không phải ngày đã dời tới — cùng quy ước với `originalDate`. Trỏ nhầm thì ứng dụng lịch không tìm thấy buổi để thay thế và hiện **cả hai**: buổi cũ ở ngày cũ, buổi mới ở ngày mới.

### Hai cái bẫy của định dạng

**Gấp dòng đếm theo BYTE, không theo ký tự.** RFC 5545 giới hạn 75 **octet** mỗi dòng. `"Học Toán"` là 8 ký tự nhưng 11 byte; mỗi chữ Hán 3 byte. Đếm theo ký tự sẽ sinh dòng vượt giới hạn với gần như mọi dữ liệu thật của ứng dụng này, và trình phân tích nghiêm ngặt từ chối **cả file**. Cũng không được cắt giữa một ký tự nhiều byte — nửa ký tự UTF-8 là byte rác.

**Escape dấu gạch chéo ngược TRƯỚC.** Đổi sau thì chính những dấu vừa thêm cho `,` và `;` lại bị escape lần nữa, và một ghi chú có dấu phẩy sẽ hiện ra kèm dấu gạch chéo thừa.

### Xuất tất cả, không theo khoảng thời gian

Không có nút "xuất tuần này". Lịch lặp trong `.ics` là một mục kèm `RRULE`, không phải một nhúm buổi — cắt theo khoảng thời gian sẽ buộc phải hoặc san phẳng chuỗi (mất khả năng sửa hàng loạt) hoặc viết lại `startDate` của rule (nói dối về chuỗi). Ứng dụng lịch nhận vào vốn đã tự lo việc hiển thị khoảng nào.

### Nó KHÔNG phải bản sao lưu

Giao diện nói thẳng điều này bằng một khối cảnh báo, và đó không phải sự cẩn thận thừa. File `.ics` chỉ mang lịch: **không** có cấu hình lương, khoản thu, danh mục hay tombstone, và nhập lại cũng không khôi phục được gì. Hai nút nằm gần nhau mà một cái là bản dự phòng đầy đủ, một cái là bản trích xuất một phần — nhầm ở đây nghĩa là ai đó tin rằng mình đã có bản dự phòng trong khi không có.

## Điều hướng, URL và tiêu đề trang

Mười một màn hình, một trang HTML. Trạng thái điều hướng nằm ở `location.hash`: `#/week`, `#/payroll`, `#/privacy`. Định nghĩa ở `src/routes.ts`, nối vào React bằng `hooks/useHashRoute.ts`.

**Hash chứ không phải History API.** Với đường dẫn thật (`/payroll`), máy chủ tĩnh trả 404 khi người dùng tải lại trang hoặc mở bookmark — GitHub Pages không viết lại được mọi đường dẫn về `index.html`. Hash không bao giờ đi tới máy chủ, nên nó chạy cả trên GitHub Pages lẫn khi mở `dist` bằng `file://`.

Bốn thứ có được nhờ đó: nút **Back** của trình duyệt quay về màn hình trước thay vì thoát hẳn ứng dụng, mỗi màn hình **bookmark** được, **gửi link** thẳng tới Bảng lương cho người khác, và **lối tắt PWA** — chuột phải lên biểu tượng ứng dụng đã cài để nhảy thẳng vào Tuần, Thu nhập hay Thu tiền.

Lối tắt khai trong `manifest.webmanifest` là URL viết tay, không có gì nối chúng với `routes.ts`. Đổi tên một màn hình sẽ để lại lối tắt trỏ vào hư không, và nó hỏng ở nơi khó phát hiện nhất: menu chuột phải trên biểu tượng ứng dụng đã cài, thứ người phát triển gần như không bao giờ mở. `src/__tests__/manifest.test.ts` là sợi dây duy nhất giữa hai file đó.

⚠️ **Giá trị ban đầu phải đọc trong hàm khởi tạo `useState`, không phải trong một effect.** Đọc bằng effect sẽ đua với effect đồng bộ ngược: effect đọc gọi `setView('payroll')`, rồi effect ghi chạy trong cùng lượt đó với `view` vẫn là `'dashboard'` cũ và ghi đè hash. Mở bookmark vào Bảng lương sẽ nhảy về Tổng quan — lúc được lúc không, tùy thứ tự effect.

`document.title` cũng đổi theo màn hình. **Không phải chuyện SEO** — trình thu thập chỉ thấy một cái vỏ rỗng. Đây là chuyện dùng hằng ngày: mở chín tab mà cả chín cùng tên thì không phân biệt được cái nào, và lịch sử duyệt web thành một cột chữ giống hệt nhau.

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

Biểu tượng có cả SVG lẫn PNG 192px và 512px (`scripts/generate-icons.mjs` sinh ra bằng `sharp`), nên `manifest.webmanifest` đủ điều kiện của Lighthouse.

| Lệnh | Việc |
|---|---|
| **`npm run verify`** | **Chạy cả sáu cổng chặn. Đây là lệnh duy nhất cần nhớ.** |
| `npm test` | Chạy bộ test (Vitest) |
| `npm run test:watch` | Test ở chế độ theo dõi |
| `npm run typecheck` | `tsc -b` — **phải là `-b`**, xem bên dưới |
| `npm run lint` | oxlint |
| `npm run check:core` | Ranh giới `core/` — không được import React/Dexie |
| `npm run check:cloud` | `supabase_schema.sql` phải khớp `types/index.ts` |
| `npm run check:i18n` | Mọi khóa `t('…')` phải có ở cả ba bộ vi/en/zh |
| `npm run build` | Build production |

`npm run verify` chạy đúng sáu bước mà `deploy.yml` chạy, theo đúng thứ tự đó. Nó xanh ở máy thì gần như chắc chắn xanh trên CI — và ngược lại, không cần đợi CI để biết mình vừa làm hỏng cái gì.

Một lệnh nữa chạy tay, không nằm trong `verify`: `node scripts/generate-icons.mjs` sinh lại `icon-192.png`, `icon-512.png` và `og-image.png` từ `public/icon.svg`. Ảnh được commit vào repo nên build không cần `sharp` — một phụ thuộc có mã nhị phân theo nền tảng, thứ hay hỏng nhất trên CI.

### ⚠️ `typecheck` phải chạy `tsc -b`, không phải `tsc --noEmit`

`tsconfig.json` là một **solution file**: `"files": []` cộng với `references` trỏ sang `tsconfig.app.json` và `tsconfig.node.json`.

Chạy `tsc --noEmit` trên cấu hình đó sẽ kiểm tra đúng **không file nào** rồi thoát với mã 0. Lệnh luôn xanh, và nó xanh vì chẳng làm gì cả. Chỉ chế độ build `-b` mới đi theo các reference.

Lỗi này im lặng theo cách tệ nhất: nó không báo gì, chỉ đơn giản là không bảo vệ. Bốn lỗi kiểu thật đã lọt qua nhiều phiên làm việc và chỉ lộ ra khi chạy `npm run build`.

## Tiêu chuẩn và quy trình

> Phần này viết ra sau Phase 2, và nó tồn tại vì một lý do cụ thể: **Phase 2 đi qua toàn bộ cổng chặn rồi vẫn hỏng.** 284 test xanh, `tsc -b` xanh, lint xanh — và tính năng Đồng bộ Cloud chưa từng chạy thành công một lần nào. Những gì dưới đây là các lỗ hổng đã bịt lại, viết ra để lần sau không phải phát hiện lại từ đầu.

### Định nghĩa "xong"

Một tính năng chỉ được coi là xong khi **cả mười một dòng** dưới đây đúng. Thiếu một dòng thì nó là bản nháp, dù chạy được trên máy bạn.

| # | Điều kiện | Vì sao |
|---|---|---|
| 1 | `npm run verify` xanh | Năm cổng, một lệnh |
| 2 | Logic khó nằm ở `core/`, hàm thuần | Test được trong mili-giây, và lên Cloud DB chỉ phải viết lại `db/` |
| 3 | Mỗi bài test tương ứng **một lỗi thật** | Test viết cho đủ số lượng không bảo vệ gì, chỉ làm chậm |
| 4 | Test đã được **chứng minh là bắt được lỗi** | Xem "Test phải đỏ được" bên dưới |
| 5 | Mọi chuỗi hiển thị có khóa ở **cả ba** bộ `vi`/`en`/`zh` | Không `t('key', 'Tiếng Việt')` — xem bên dưới |
| 6 | Không dò lỗi bằng nội dung chuỗi | `status.includes('Lỗi')` hỏng ngay khi đổi ngôn ngữ |
| 7 | Thiếu cấu hình là **trạng thái**, không phải ngoại lệ | Ném ở cấp module làm trắng cả màn hình |
| 8 | Thao tác ghi có đường **hoàn tác**, hoặc hộp thoại nói rõ là không có | Quy ước có từ Phase 0 |
| 9 | Bảng mới thì thêm vào `BACKUP_TABLES` **và** `supabase_schema.sql` | Thiếu chỗ nào thì dữ liệu bốc hơi ở chỗ đó |
| 10 | Chú thích giải thích **vì sao**, không phải **cái gì** | Mã đã nói cái gì rồi |
| 11 | README cập nhật **trong cùng lần thay đổi** | Xem bên dưới |

#### Test phải chứng minh được là nó đỏ được

Một bài test chưa bao giờ đỏ thì không phải là bảo vệ, nó là trang trí — và nó còn tệ hơn không có gì, vì nó tạo cảm giác an toàn.

Sau khi viết test cho một lỗi, **hãy tái tạo lại lỗi đó và xác nhận bài test chuyển đỏ**, rồi mới phục hồi bản sửa. Mất ba mươi giây, và nó là khác biệt giữa "tôi tin là mình đã sửa" với "tôi biết là mình đã sửa".

Ba cổng mới thêm ở Phase 2 đều đã qua bước này:

| Cổng / test | Lỗi tái tạo để kiểm tra | Kết quả |
|---|---|---|
| `check:cloud` | Đổi `effective_from` thành `effective_month` | ❌ báo đúng cột thiếu |
| `db/__tests__/sync.test.ts` | Cho `toCloud` chỉ gửi trường có giá trị | ❌ 2 bài đỏ, đúng bài tombstone |
| `CloudSyncSection.test.tsx` | — | Đã bắt được lỗi thật ngay khi viết: bản đầu đo `.env` của máy chứ không đo mã nguồn |

#### README cập nhật cùng lần thay đổi, không để sau

Sau Phase 2, bảng "Còn treo" vẫn ghi Đồng bộ Cloud là *chưa làm* trong khi nó đã được viết xong — và không có dòng nào về Thêm nhanh. Với một dự án mà README là nguồn sự thật, tài liệu sai còn nguy hiểm hơn tài liệu thiếu: người đọc tin nó.

Nếu thay đổi của bạn khiến một câu nào trong README thành sai, sửa câu đó là **một phần của thay đổi**, không phải việc dọn dẹp để sau.

#### Không viết `t('key', 'Chuỗi mặc định')`

Tham số thứ hai của `t()` là chuỗi dự phòng. Nó làm màn hình trông ổn ngay lập tức, và chính vì thế mà **khóa thiếu không bao giờ bị phát hiện** — không ai thấy `cloud.title` hiện thô lên giao diện để mà đi bổ sung.

Toàn bộ mục Cloud của Phase 2 được viết theo kiểu này: không một khóa nào tồn tại trong `vi.json`, `en.json` hay `zh.json`, và giao diện vẫn hiện tiếng Việt hoàn hảo ở cả ba ngôn ngữ.

Viết `t('cloud.title')` trần. Thiếu khóa thì màn hình hiện `cloud.title`, xấu và không bỏ qua được — đó chính là tác dụng.

### Sáu cổng chặn — và khoảng mù của từng cổng

Cổng chặn chỉ hữu ích khi bạn biết nó **không** nhìn thấy gì. Bốn lỗi nghiêm trọng nhất của Phase 2 đều rơi vào khoảng mù chung của cả bốn cổng cũ.

| Cổng | Thấy được | **Không** thấy được |
|---|---|---|
| `check:core` | Import React/Dexie trong `core/` | Mọi thứ khác |
| `check:cloud` | Lệch cột giữa SQL và TypeScript | Lệch **kiểu** cột, ràng buộc, RLS |
| `check:i18n` | Khóa thiếu, chuỗi dự phòng inline | Khóa dựng động — nhưng xem ghi chú dưới bảng |
| `lint` | Mã chết, biến thừa, vi phạm Fast Refresh | Tính đúng đắn |
| `test` | Hành vi có bài test | Hành vi **không** có bài test |
| `typecheck` | Sai kiểu trong `.ts`/`.tsx` | File `.sql`, `.json`, `.yml` — TypeScript không đọc chúng |

Dòng cuối là dòng đắt giá nhất. Ba trong bốn lỗi P0/P1 của Phase 2 nằm ngoài file TypeScript:

- Lược đồ sai nằm trong `.sql` → `check:cloud` sinh ra để bịt
- Khóa i18n thiếu nằm trong `.json` → `check:i18n` sinh ra để bịt
- Biến môi trường thiếu nằm trong `.yml` → canh bằng `CloudSyncSection.test.tsx`

`check:i18n` chứng minh giá trị ngay trong lần chạy đầu tiên: nó tìm ra `print.bandLabel` — một khóa thiếu ở **cả ba** bộ ngôn ngữ từ Phase 1, khiến ô góc trên-trái của bảng lịch trong file PDF và PNG xuất ra in thẳng chuỗi thô `print.bandLabel`. Lỗi đó nằm trong sản phẩm nhiều tuần: nó không làm hỏng gì, không ném lỗi, chỉ hiện sai trên một tệp mà người dùng gửi cho người khác.

#### Khoảng mù của cổng tĩnh không phải là khoảng mù vĩnh viễn

`check:i18n` không phân giải được `t(\`nav.${view}\`)` vì giá trị chỉ tồn tại lúc chạy. Nhưng mỗi họ khóa động trong dự án này đều dựng từ một **tập hữu hạn và liệt kê được** — danh sách màn hình, bảy ngày trong tuần, ba mã lỗi đám mây. Cái script tĩnh không làm được thì bài test làm được dễ dàng: `src/__tests__/i18nDynamicKeys.test.ts` import chính tập đó rồi thử từng phần tử.

Bài test đó sinh ra từ một lỗi thật, và là lỗi vừa mắc phải ngay sau khi viết mục tiêu chuẩn này: `nav.privacy` thiếu ở cả ba bộ, vì `privacy` là màn hình **duy nhất** không nằm trên thanh điều hướng. Tiêu đề tab hiện chuỗi thô `nav.privacy · Personal Schedule System`. Bài học không phải "cổng tĩnh vô dụng" mà là: **thấy một khoảng mù thì đừng chỉ ghi chú nó, hãy bịt nó bằng công cụ khác.**

### Quy tắc bất di bất dịch

Bốn quy tắc dưới đây khác với "quy ước" ở chỗ: vi phạm chúng không làm sai một tính năng, nó làm **hỏng khả năng bảo trì của cả dự án**. Có script canh hai cái đầu.

**1. `core/` không import React, không import Dexie.**
Nhờ vậy test chạy trong mili-giây không cần DOM, và khi đổi tầng lưu trữ chỉ phải viết lại `db/`. Đây cũng là lý do phần khó của mọi tính năng phải nằm ở `core/`: `planSync()`, `mergeById()`, `planWeekCopy()`, `parseQuickAdd()` đều test được mà không dựng gì cả. Canh bằng `npm run check:core`.

**2. `db/repo/` là nơi DUY NHẤT chạm vào `db`.**
Component gọi thẳng Dexie thì không còn chỗ nào để đặt logic xóa mềm, dấu thời gian, và hoàn tác.

**3. `supabase_schema.sql` phải khớp `types/index.ts`.**
Canh bằng `npm run check:cloud`. Thêm trường vào một interface thì thêm cột vào SQL trong cùng lần thay đổi.

**4. Chỉ được THÊM `version(n)` vào Dexie, không bao giờ sửa version cũ.**
Nâng cấp schema không hoàn tác được. Hiện tại đang ở `version(3)`, và máy đã lên v3 không quay về v2. Kèm theo đó: **thêm `version(4)` không vá được máy đã chạy qua v3** — sai sót của một migration đã chạy phải sửa bằng công cụ chạy trên dữ liệu đang có (xem "Gộp đối tượng trùng"), không phải bằng một version mới.

## Cấu trúc

```
src/
├── types/index.ts       Toàn bộ schema. Đọc phần đầu file trước khi sửa gì.
├── routes.ts            Danh sách màn hình + ánh xạ sang #hash. Hàm thuần,
│                        nhưng CỐ Ý ngoài core/ — điều hướng là giao diện.
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
│   ├── copyWeek.ts      Dựng kế hoạch nhân bản tuần (không ghi gì)
│   ├── payment.ts       Ai còn nợ bao nhiêu — trạng thái được TÍNH RA
│   ├── income.ts        TẦNG 1 — tiền của một buổi
│   ├── payroll.ts       TẦNG 2 — tiền của một tháng (con số chính thức)
│   ├── sync.ts          Ai thắng khi đồng bộ — dùng chung isNewer() với backup
│   ├── autoSync.ts      CÓ nên đồng bộ lúc này không — chống chạy chồng
│   ├── dedupe.ts        Tìm danh mục trùng + chọn bản giữ lại
│   ├── quickAdd.ts      Bóc ngày/giờ/tiêu đề từ một câu tiếng Việt
│   ├── ics.ts           Dựng file iCalendar — giờ trôi nổi, RRULE, EXDATE
│   └── __tests__/
│
├── db/
│   ├── schema.ts        Lớp Dexie + chuỗi version()
│   ├── seed.ts          Danh mục mặc định
│   ├── backup.ts        Xuất/nhập toàn bộ DB
│   ├── cloud.ts         Client Supabase — khởi tạo LƯỜI, thiếu env không sập
│   ├── sync.ts          Bản kê → nội dung, + bốn phép biến đổi hình dạng
│   ├── purge.ts         Xóa vĩnh viễn ở CẢ HAI phía — chống bản ghi sống lại
│   ├── exportIcs.ts     Đọc DB → core/ics.ts → tải file .ics
│   ├── dedupe.ts        Gộp danh mục — trỏ lại BẢY nơi tham chiếu, có hoàn tác
│   └── repo/            CRUD — nơi DUY NHẤT được đụng vào db
│
├── hooks/
│   ├── useSchedule.ts   Nối db/ với core/ cho các màn hình lịch
│   ├── usePayroll.ts    Nối db/ với core/ cho màn hình thu nhập
│   ├── useSupabaseUser.ts  Phiên đăng nhập, nếu có cấu hình đám mây
│   ├── useHashRoute.ts  Nối view ↔ location.hash + document.title
│   └── useSettings.ts
│
├── actions/schedule.ts  Dịch thao tác người dùng thành lệnh ghi DB
├── undo/
│   ├── context.ts       UndoContext + useUndo()
│   └── UndoProvider.tsx Toast "Hoàn tác" — CHỈ export component
├── sync/
│   ├── context.ts       SyncContext + useSync()
│   └── SyncProvider.tsx Nơi DUY NHẤT gọi useAutoSync()
├── components/
│   ├── styles.ts        inputClass — hằng dùng chung, tách khỏi ui.tsx
│   ├── eventValidation.ts  validate() — tách khỏi EventDialog.tsx
│   ├── ErrorBoundary.tsx   Chặn lỗi nạp chunk lazy làm trắng màn hình
│   ├── AccountView.tsx     Đăng nhập — MỘT MÀN HÌNH, không phải cổng chặn
│   ├── PrivacyView.tsx     Chính sách riêng tư, ở #/privacy
│   └── …
├── i18n/                i18next + ba bộ vi / en / zh
└── App.tsx

public/
├── robots.txt           Disallow — trình thu thập chỉ thấy vỏ rỗng
├── 404.html             Trang độc lập, không React. GitHub Pages phục vụ nó.
├── og-image.png         Ảnh chia sẻ 1200×630, sinh bằng sharp
└── sw.js                Service worker tự viết

scripts/
├── check-core-boundary.mjs   core/ không được import React/Dexie
├── check-cloud-schema.mjs    supabase_schema.sql phải khớp types/index.ts
├── check-i18n.mjs            mọi khóa t('…') phải có ở cả ba ngôn ngữ
└── generate-icons.mjs        icon PNG + ảnh chia sẻ (chạy tay, không ở CI)
```

### Vì sao `useUndo`, `inputClass`, `validate` nằm ở file riêng

Fast Refresh của Vite chỉ giữ được state của một module khi module đó **không export gì ngoài component**. Một hook, một hằng chuỗi, một hàm thuần nằm chung là đủ để mất điều kiện đó — và hậu quả rơi đúng vào lúc khó chịu nhất: sửa một dòng trong `EventDialog` là form đang gõ dở bị nạp lại từ đầu.

`oxlint` cảnh báo chuyện này qua `only-export-components`. Đừng gộp chúng về lại cho gọn.

### Bốn màn hình nạp theo yêu cầu

`StatsView`, `PayrollView`, `DuesView`, `SettingsView` đi qua `React.lazy`. Mở app là vào Tổng quan, nên bốn màn hình đó không cần cho lần vẽ đầu tiên và có thể cả phiên không ai mở. `Suspense` bọc **cả** chuỗi render chứ không bọc riêng từng màn hình, và fallback trùng với ô "đang tải" của dữ liệu — người dùng không cần phân biệt đang chờ mã hay chờ dữ liệu.

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

## Thu tiền

Trả lời câu "ai còn nợ mình bao nhiêu". Dùng cho học phí gia sư, tiền công theo buổi, hay bất cứ khoản nào gắn với một đối tượng cụ thể.

**Trạng thái được TÍNH RA, không lưu.** "Đã thu / thu một phần / chưa thu" là kết quả so tổng các khoản đã ghi nhận với số phải thu của tháng. Lưu nó thành một cột là tạo nguồn sự thật thứ hai: thêm một buổi vào cuối tháng thì số phải thu đổi, nhưng cột trạng thái không tự biết — và nó sẽ nói dối đúng vào lúc cần nhất.

**Lương khoán tháng hiện "—" ở cột Phải thu.** Không phải thiếu dữ liệu: 8 triệu một tháng không tách được cho từng học sinh, chia đều ra là bịa số. Một buổi khoán tháng làm cả dòng thành không quy đổi được — cộng phần còn lại rồi hiện ra sẽ là con số đúng một nửa, tệ hơn không hiện gì. Tiền đã thu thật thì vẫn ghi nhận bình thường.

### `db.version(3)` — migration một chiều, và ba thứ giữ cho nó an toàn

`version(2)` chỉ thêm một bảng rỗng: Dexie tạo object store mới, không đụng một byte dữ liệu cũ, rủi ro gần bằng không. `version(3)` thì ngược hẳn — nó **đọc và ghi lại toàn bộ** `rules`, `events` và `payments` để đổi `clientName` thành `clientId`, rồi bỏ hẳn `clientKey`. Đây là migration đắt nhất của dự án, và **nâng cấp schema không hoàn tác được**: máy đã lên `version(3)` không quay về `version(2)`.

Ba thứ giữ cho nó an toàn:

- **Id tất định.** Migration gọi đúng `clientIdFromName()` mà ứng dụng dùng lúc chạy, nên hai máy migrate độc lập cho ra cùng một bộ id — đồng bộ xong không đẻ ra hai đối tượng cho cùng một người.
- **`updatedAt = t` trên mọi bản ghi bị sửa.** Thiếu dòng này thì bản ghi vừa migrate vẫn mang dấu thời gian cũ, lần đồng bộ kế tiếp thấy bản trên mây "mới hơn" và **ghi đè ngược lại `clientName` vừa bỏ đi**. Migration đúng nhưng bị đồng bộ nuốt mất là lỗi khó thấy nhất trong nhóm này.
- **`clientLabel` giữ lại trên `payments`** (nullable). Nó là bản sao đọc được của tên tại thời điểm thu tiền — xóa một đối tượng thì khoản thu cũ vẫn còn chữ để hiển thị, thay vì một id trần.

⚠️ **Không tạo `version(4)` để vá kết quả của `version(3)`.** Máy đã chạy qua v3 sẽ không chạy lại upgrade đó lần nữa, nên v4 chỉ vá được máy cài mới — đúng những máy không cần vá. Sai sót do trùng id phải xử bằng **Gộp đối tượng trùng** ở Cài đặt: nó chạy trên dữ liệu đang có, ở mọi máy, bao nhiêu lần cũng được.

### Khóa ngoại của `clients` là khóa ghép, không phải `id` trần

Trong `supabase_schema.sql`, bốn bảng tham chiếu đều khai báo:

```sql
FOREIGN KEY (user_id, client_id) REFERENCES public.clients (user_id, id)
```

Ghép `user_id` vào khóa là **ràng buộc bảo mật, không chỉ toàn vẹn**: nó khiến một người không thể trỏ bản ghi của mình vào đối tượng của người khác, kể cả khi đoán trúng `id`. Bỏ `user_id` ra khỏi cặp khóa là mở lại đúng lỗ đó, và RLS ở tầng trên không bịt hộ được.

Vì `id` do client sinh (`client-minh`) chứ không phải `uuid` do Postgres sinh, kiểu cột là `text`. Thêm bảng nào tham chiếu `clients` thì chép nguyên dạng khóa ghép này — `npm run check:cloud` bắt được cột thiếu, nhưng **không** bắt được khóa ngoại khai sai.

## Ba phạm vi khi sửa một buổi của lịch lặp

| Phạm vi | Ghi gì | Hệ quả |
|---|---|---|
| Chỉ buổi này | Một `ScheduleException` (`MOVE` nếu đổi ngày, `REPLACE` nếu không) | Các buổi khác giữ nguyên |
| Buổi này và các buổi sau | Đặt `endDate` cho rule cũ + tạo rule mới từ mốc cắt | Buổi đã qua giữ nguyên → bảng lương tháng cũ không nhảy số |
| Toàn bộ chuỗi | Sửa thẳng rule, **kể cả `startDate`** | Đổi cả quá khứ |

Ô **Ngày** mang nghĩa khác nhau theo phạm vi, nên form đổi nhãn thành "Ngày bắt đầu chuỗi" khi ở phạm vi toàn bộ chuỗi. Trước đây nhánh đó bỏ qua ô Ngày với lý do "dời `startDate` sẽ viết lại quá khứ" — lý do đúng, cách xử lý sai: người dùng gõ ngày mới, bấm Lưu, không có gì xảy ra và cũng không có gì báo. Ai không muốn đụng vào quá khứ thì đã có sẵn phạm vi "Buổi này và các buổi sau".

**Dấu vết để phân biệt hai phạm vi khi soi dữ liệu:** chuỗi hàng tuần từ 17/08 mà "dời sang 03/08" nhưng **thiếu 10/08** thì đó là một exception `MOVE` của riêng một buổi, không phải chuỗi đã dời — chuỗi thật sự dời sẽ sinh cả 10/08. Có test cho cả hai trường hợp.

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
| ID của danh mục seed là HẰNG SỐ (`SEEDED_CATEGORY_IDS`) | Đổi về `newId()` → mỗi máy sinh một bộ danh tính mới, đồng bộ nhân bản im lặng, "Gia sư" thành ba |
| `db/dedupe.ts` khai BẢY nơi tham chiếu thành dữ liệu | Bỏ sót `exceptions.newCategoryId` → buổi đã đổi danh mục riêng trỏ vào danh mục đã xóa và biến mất khỏi mọi bộ lọc |
| `toCloud` điền `null` cho MỌI cột thiếu | Chỉ gửi trường có giá trị → khôi phục từ Thùng rác không lan lên đám mây, bản ghi "sống ở máy này chết trên mây" |
| Khóa chính đám mây là `(user_id, id)` | Đổi về `id` → người dùng thứ hai vỡ ngay ở bảng đầu tiên vì `sys-uncategorized` trùng khóa |
| Cột thời gian trên Supabase là `text` | Đổi sang `timestamptz` → `…+00:00` vs `….000Z`, phép so chuỗi sai ở thế hòa |
| `syncTable` bắt lỗi theo TỪNG bảng | `throw` ra ngoài → một bảng hỏng làm các bảng đứng sau nó không bao giờ được đồng bộ |
| `fetchAll` phân trang bằng `.range()` | Bỏ đi → PostgREST cắt im lặng ở 1000 dòng, máy mới kéo về thiếu dữ liệu mà không báo |
| `db/cloud.ts` khởi tạo client LƯỜI | Gọi `createClient` ở cấp module → thiếu env là trắng cả màn hình, không riêng mục Cloud |
| QuickAdd phân tích ngày TRƯỚC giờ | Đảo lại → `"25/8"` thành giờ `25:00`, nhánh ngày `d/m` thành code chết |
| QuickAdd đòi dấu hiệu giờ (`h`, `:`, "lúc", buổi) | Bỏ đi → mọi số trong tiêu đề bị nuốt làm giờ |

Mỗi mục đều có test tương ứng trong `src/core/__tests__/` hoặc `src/db/__tests__/`. Sửa mà test đỏ thì đọc tên test trước khi sửa test.

## Quy ước bắt buộc

| Quy ước | Chi tiết |
|---|---|
| Giờ treo tường | `date` = `"YYYY-MM-DD"`, `startTime` = `"HH:mm"` giờ địa phương. KHÔNG lưu UTC timestamp cho lịch. Chỉ `createdAt`/`updatedAt`/`deletedAt` mới là ISO UTC. |
| Thời lượng, không phải giờ kết thúc | Lưu `durationMinutes`. Nhờ vậy ca qua đêm (22:00–02:00) không thể sinh thời lượng âm. |
| Ngày sở hữu sự kiện | Sự kiện LUÔN thuộc về ngày của `startTime`, kể cả khi kết thúc sang hôm sau. |
| `originalDate` neo vào đâu | LUÔN trỏ tới ngày occurrence gốc do rule sinh ra. KHÔNG BAO GIỜ trỏ tới ngày đã dời tới. |
| `amount` của adjustment | LUÔN là số dương. Dấu cộng/trừ do `kind` quyết định. |
| Dexie `version()` | Chỉ được THÊM `version(2)`, `version(3)`… KHÔNG BAO GIỜ sửa `version(1)`. |
| i18n | Viết `t('...')` **trần**, không có chuỗi dự phòng, và điền khóa vào cả ba bộ `vi`/`en`/`zh`. Không hard-code chuỗi tiếng Việt vào component. |
| Không dò lỗi bằng nội dung chuỗi | `status.includes('Lỗi')` hỏng ngay khi đổi ngôn ngữ. Dùng kiểu có cấu trúc hoặc mã lỗi. |
| Thiếu cấu hình là TRẠNG THÁI | Không ném ở cấp module. Trả `null` và để nơi gọi xử lý — kiểu trả về buộc người viết nghĩ tới trường hợp đó. |
| Bảng mới | Phải thêm vào `BACKUP_TABLES` **và** `supabase_schema.sql` trong cùng lần thay đổi. |
| Bản ghi hệ thống tự tạo | ID phải TẤT ĐỊNH, không bao giờ `newId()`. Nhiều máy cùng tạo ra nó thì chúng phải là MỘT bản ghi. |

## Sao lưu

Toàn bộ dữ liệu nằm trong IndexedDB của **một** trình duyệt. Xóa dữ liệu duyệt web, cài lại máy, hay đổi trình duyệt là mất trắng — không có máy chủ nào giữ hộ. Cài đặt → Sao lưu và khôi phục → Xuất file sao lưu.

Nhập có hai chế độ:

| Chế độ | Làm gì |
|---|---|
| Trộn | Giữ nguyên dữ liệu đang có. Bản ghi trùng `id` thì bản có `updatedAt` **muộn hơn** thắng. Không xóa gì. |
| Ghi đè | Xóa sạch rồi khôi phục từ file. Máy sẽ giống hệt lúc xuất. |

Quy tắc trộn **dùng chung với Đồng bộ Cloud**: cả hai gọi `isNewer()` trong `core/backup.ts`. Đó là một hàm ba dòng, và nó tách riêng vì bản đồng bộ đầu tiên đã tự viết lại phép so bằng `new Date(x).getTime()` thay vì dùng lại `mergeById` — hai bản sao của cùng một quy tắc, và chúng lệch nhau ngay từ đầu ở thế hòa.

Sao lưu giữ nguyên cả bản ghi đã xóa mềm. Bỏ tombstone đi thì khôi phục xong, mọi thứ người dùng đã cố ý dọn đi sẽ hiện về.

## Đồng bộ Cloud

**Tùy chọn.** Không cấu hình thì ứng dụng chạy y hệt như trước, chỉ mất mục này trong Cài đặt. Dữ liệu vẫn nằm trong IndexedDB; đám mây là bản đối chiếu, không phải nguồn sự thật.

Dựng máy chủ: tạo dự án Supabase → dán `supabase_schema.sql` vào SQL Editor → chép `.env.example` thành `.env` và điền hai biến.

### Ai thắng — và vì sao phép so là so CHUỖI

`planSync()` trong `core/sync.ts` xét bốn trường hợp: chỉ có ở local thì đẩy lên, chỉ có trên mây thì kéo về, có ở cả hai thì bên `updatedAt` muộn hơn thắng, bằng nhau thì không làm gì.

Phép so là `(a ?? '') > (b ?? '')` — **so chuỗi, không phải `Date.getTime()`**. Chuỗi ISO 8601 UTC so theo thứ tự từ điển là đúng thứ tự thời gian, *miễn là định dạng đồng nhất*. Đó chính là lý do mọi cột thời gian trong `supabase_schema.sql` khai là `text` chứ không phải `timestamptz`: `timestamptz` trả về `…+00:00` trong khi client ghi `….000Z`, và ở thế hòa thì `'+'` (0x2B) nhỏ hơn `'.'` (0x2E) — bản đến sẽ thắng bản đang có, ngược hẳn quy tắc.

Cùng lý do đó, `date`, `startTime`, `month` cũng là `text`: chúng là **giờ treo tường**, chuỗi mờ đục, không phải thời điểm. Để Postgres hiểu chúng là mời một tầng ép kiểu vào giữa.

### Bốn phép biến đổi hình dạng, và cái thứ tư là cái khó

| # | Chiều | Việc |
|---|---|---|
| 1 | ↔ | `camelCase` ↔ `snake_case`, chỉ ở tầng ngoài cùng |
| 2 | ↔ | Gắn `user_id` khi đẩy, **gỡ ra** khi kéo về |
| 3 | ← | `null` từ Postgres thành **vắng mặt** — để bản ghi kéo về có cùng hình dạng với bản ghi tạo tại máy |
| 4 | → | **Vắng mặt thành `null` khi đẩy lên** |

Phép thứ tư là thứ khiến việc khôi phục từ Thùng rác hoạt động, và nó phản trực giác.

Khôi phục **xóa hẳn** thuộc tính `deletedAt` (Dexie hiểu `undefined` là lệnh xóa thuộc tính). Nên payload đẩy lên không có khóa `deleted_at` nào cả. PostgREST dựng danh sách cột từ *hợp các khóa của cả lô*, và cột không nằm trong danh sách thì **không được cập nhật** — tombstone cũ trên đám mây nằm nguyên. Bản ghi thành "sống ở máy này, chết trên đám mây", và thao tác khôi phục biến mất không dấu vết.

Tệ hơn: hành vi phụ thuộc vào việc trong lô đó có bản ghi nào *khác* đang mang `deleted_at` hay không. Cùng một thao tác, lúc chạy lúc không, tùy người dùng vừa xóa cái gì khác — loại lỗi không tái hiện được theo yêu cầu.

Cách chữa là điền **đủ mọi cột** cho từng dòng đẩy lên, thiếu thì `null`. Danh sách cột lấy từ chính dữ liệu vừa kéo về: PostgREST luôn trả đủ mọi cột kể cả cột null, nên một dòng bất kỳ là bản khai lược đồ chính xác nhất có thể có — và nó không thể lệch khỏi máy chủ theo cách một danh sách viết tay sẽ lệch.

### Danh tính phải ỔN ĐỊNH giữa các máy — cả hai chiều đều hỏng được

Đây là bài học đắt nhất của dự án, và nó xuất hiện **hai lần theo hai hướng ngược nhau** từ đúng một câu hỏi: *danh mục mặc định có danh tính ổn định giữa các máy không?*

| Trả lời | Hậu quả |
|---|---|
| Cùng id trên mọi máy, PK là `id` | Người dùng thứ hai vỡ ở bảng đầu tiên với `23505 duplicate key` |
| Id ngẫu nhiên mỗi lần seed | Đồng bộ **nhân bản im lặng** — "Gia sư" thành ba |

Bản gốc trả lời **"có với một cái, không với năm cái kia"** — câu tệ nhất có thể, vì nó làm cả hai kiểu hỏng đều không lộ ra. `UNCATEGORIZED_ID` là hằng số nên nó gây lỗi khóa chính; năm danh mục còn lại dùng `newId()` nên chúng nhân bản. Và vì "Chưa phân loại" là cái **duy nhất không nhân bản**, nhìn qua tưởng là chuyện ngẫu nhiên chứ không phải một quy luật.

Điều làm lỗi nhân bản khó thấy: **nó không sai ở tầng đồng bộ.** HTTP 200, không ngoại lệ, báo cáo xanh, số liệu đẩy/kéo hợp lý. Đồng bộ làm đúng việc được giao trên dữ liệu mà tầng dưới đã bịa ra hai danh tính cho cùng một thứ. Không cổng chặn nào bắt được, vì không có gì *sai* để bắt.

IndexedDB tách theo origin, nên "máy mới" xảy ra thường xuyên hơn cảm giác rất nhiều: đổi trình duyệt, xóa dữ liệu duyệt web, cửa sổ ẩn danh, và cả **`localhost:5173` so với `127.0.0.1:5173`**.

**Quy tắc rút ra:** bất cứ bản ghi nào do hệ thống tự tạo ra trên nhiều máy đều phải mang **id tất định**. `SEEDED_CATEGORY_IDS` trong `types/index.ts` giữ năm hằng số đó, và `db/__tests__/dedupe.test.ts` có bài seed hai lần rồi trộn lại để canh.

### Dọn những bản đã lỡ sinh ra

Sửa seed chỉ chặn lỗi tái diễn; dữ liệu đã hỏng vẫn hỏng. `Cài đặt → Danh mục bị trùng` gộp chúng lại.

⚠️ **Không bao giờ gộp tự động.** Chính chú thích trong `db/seed.ts` nói *"Đi làm ở đây là MỘT chỗ làm, không phải nhóm gộp mọi chỗ làm"* — hai chỗ làm cùng tên là hợp lệ, và gộp chúng sẽ ép hai cấu hình lương khác nhau về làm một. Giao diện hiện số bản ghi sẽ chuyển của từng nhóm rồi để người dùng quyết từng nhóm.

Gộp phải trỏ lại **bảy** nơi, không phải sáu:

```
rules.categoryId · events.categoryId · salaryRules.categoryId
adjustments.categoryId · adjustmentTemplates.categoryId · payments.categoryId
exceptions.newCategoryId          ← DỄ QUÊN NHẤT
```

`exceptions.newCategoryId` không cùng tên với sáu cái kia, nên tìm bằng cách gõ `categoryId` là bỏ sót — và bỏ sót thì buổi đã đổi danh mục riêng sẽ trỏ tới danh mục vừa xóa mềm rồi biến mất khỏi mọi bộ lọc. `db/dedupe.ts` khai bảy nơi đó thành **dữ liệu**, để việc đếm và việc trỏ lại không thể lệch nhau.

Bản bị gộp **xóa mềm**, không xóa cứng — cùng lý do với Thùng rác: tombstone là thứ mang lệnh xóa sang máy khác.

Một trường hợp **được** xử lý tự động, sau mỗi lần đồng bộ: danh mục seed (`sys-*`) **chưa có tham chiếu nào** mà trùng tên với danh mục khác thì bỏ đi. Đây là đường đi của máy mới cài app cho tài khoản đã có dữ liệu — seed năm bản mẫu rồi kéo về năm bản thật. An toàn vì phạm vi rất hẹp: không tham chiếu nào nghĩa là chắc chắn không mất gì.

### Khóa chính là `(user_id, id)`, không phải `id`

`UNCATEGORIZED_ID` là hằng số cố định `'sys-uncategorized'`, nên seed của **mọi máy** đều tạo một Category mang đúng id đó. Với `id` làm khóa chính toàn cục, người thứ hai đăng nhập sẽ đụng khóa với hàng của người thứ nhất — và RLS che mất hàng kia nên `upsert` không thấy gì để ghi đè, nó thành `INSERT` và vỡ với `23505 duplicate key`.

Triệu chứng: app chạy hoàn hảo với một tài khoản, hỏng ngay ở **bảng đầu tiên** với tài khoản thứ hai. Người dùng đầu tiên không bao giờ gặp, nên lỗi này sống sót qua mọi lần thử nghiệm của chính tác giả.

Khóa ngoại cũng ghép: `(user_id, category_id) REFERENCES categories (user_id, id)`. Ngoài toàn vẹn dữ liệu, nó khiến việc trỏ sang danh mục của người khác trở thành bất khả thi ở tầng CSDL.

### Một bảng hỏng không kéo theo bảy bảng còn lại

Vòng đồng bộ bắt lỗi **theo từng bảng** và trả về báo cáo, không `throw` ra ngoài. Bản đầu tiên ném thẳng trong vòng lặp, mà `salary_rules` đứng thứ năm trong tám bảng và lược đồ của nó sai — nên `adjustments`, `adjustment_templates` và `payments` **không bao giờ được đồng bộ**, trong khi người dùng chỉ thấy một dòng "Lỗi đồng bộ" và tưởng là mạng chập chờn.

Màn hình Cài đặt hiện số liệu theo từng bảng chứ không phải một dấu tích xanh, vì đồng bộ có thể thành công một phần.

⚠️ **Thứ tự `BACKUP_TABLES` là có ý nghĩa.** Khóa ngoại bắt `categories` phải lên trước `rules`, và `rules` trước `exceptions`. Đừng sắp xếp lại cho đẹp mắt.

### Gia tăng: bản kê trước, nội dung sau

Đồng bộ **không** tải toàn bộ dữ liệu mỗi lần nữa. Hai bước:

1. `fetchManifest()` lấy **chỉ `id` và `updated_at`** của mọi dòng.
2. `planSync()` chạy trên bản kê đó, rồi `fetchByIds()` tải nội dung đầy đủ của đúng những dòng cần kéo về.

Điều làm cách này khả thi: `planSync()` vốn chỉ cần hai trường đó — nội dung bản ghi không tham gia vào phép so nào cả. Một dòng kê nặng khoảng 60 byte, một buổi học đầy đủ dễ vượt 300. Với hai năm lịch thì đó là khác biệt giữa vài chục KB và vài MB **mỗi lần bấm Đồng bộ**. Không đổi gì thì lần đồng bộ thứ hai tải về **không một dòng đầy đủ nào** — có test đo đúng con số đó.

⚠️ **Cố ý KHÔNG dùng mốc thời gian (watermark).** Cách "chỉ lấy dòng đổi sau mốc X" nghe gọn hơn nhưng đòi hai đồng hồ phải khớp nhau. Máy có đồng hồ chạy chậm sẽ sinh `updatedAt` nhỏ hơn mốc và bản ghi của nó **không bao giờ được đẩy lên** — mất dữ liệu âm thầm, không lỗi, không cách nào phát hiện. Bản kê so trực tiếp hai bên nên lệch đồng hồ không tạo ra được trạng thái đó.

Cần đẩy lên mà không kéo về dòng nào thì không có mẫu để suy danh sách cột; `fetchSample()` lấy đúng một dòng cho việc đó, và chỉ khi thật sự cần.

### Phân trang — 1000 dòng là giới hạn im lặng

`select()` trần của PostgREST trả về **tối đa 1000 dòng** và không báo là đã cắt. Hai năm lịch dạy kèm dễ dàng vượt 1000 exception. Hậu quả không phải lỗi mà là im lặng: máy mới chỉ kéo về 1000 dòng đầu, người dùng thấy lịch thiếu một mảng và không hiểu vì sao. Mọi truy vấn đi qua `page()` và lặp bằng `.range()` cho tới hết.

`fetchByIds` còn chia lô **200 id một lần**: PostgREST nhận bộ lọc qua chuỗi truy vấn, mỗi UUID chiếm 37 ký tự, và vượt giới hạn độ dài URL sẽ trả `414 URI Too Long` — một mã lỗi chẳng nói gì về nguyên nhân, và chỉ xuất hiện với người dùng có nhiều dữ liệu nhất.

### Tự đồng bộ — và vì sao "khi dữ liệu đổi" KHÔNG phải một kích hoạt

Tắt mặc định, bật ở màn hình Tài khoản. Bốn kích hoạt: **mở ứng dụng**, **quay lại tab**, **có mạng trở lại**, và một **chu kỳ mười phút** cho trường hợp app mở cả ngày trên màn hình phụ.

⚠️ **Không có "khi dữ liệu cục bộ đổi", và đừng thêm vào.**

Nghe rất hợp lý — "sửa lịch xong thì đẩy lên luôn". Nhưng đồng bộ có chiều **kéo về**, và kéo về là ghi vào Dexie. Ghi vào Dexie là một thay đổi cục bộ. Thay đổi cục bộ kích hoạt đồng bộ. Vòng lặp khép kín, chạy nhanh hết mức mạng cho phép: trên máy người dùng là quạt kêu và pin tụt, trên Supabase là hóa đơn.

Phá vòng lặp bằng cách "bỏ qua thay đổi do chính mình gây ra" thì phải phân biệt được lệnh ghi của người dùng với lệnh ghi của tầng đồng bộ, xuyên qua các lượt bất đồng bộ. Làm được, nhưng nó là thêm một cờ trạng thái toàn cục, và cờ đó sai một lần là vòng lặp quay lại. Bốn kích hoạt trên phủ đúng nhu cầu thật mà không cần biết ai vừa ghi cái gì.

**Ba lớp bảo vệ**, tất cả ở `core/autoSync.ts` dưới dạng hàm thuần:

| Lớp | Chặn cái gì |
|---|---|
| Cờ `running` | Hai lượt cùng lúc đọc chung một ảnh chụp rồi ghi đè lẫn nhau trên đám mây. Áp cho **cả** thao tác bấm tay |
| Khoảng chờ 60 giây | Chuyển qua lại giữa hai tab bắn một lượt đồng bộ mỗi lần |
| Giãn dần khi hỏng | 1′ → 2′ → 4′ → … → 30′. Tài khoản hết hạn mà thử lại mỗi phút là hàng trăm request hỏng |

`useAutoSync` **chỉ được gọi một lần** trong cả ứng dụng, ở `SyncProvider`. Mỗi lần gọi là một bộ hẹn giờ và một cờ `running` riêng; hai bản sao không thấy nhau và phép chặn chạy chồng mất tác dụng đúng lúc cần nhất. Nút "Đồng bộ ngay" đi qua cùng context đó chứ không gọi thẳng `syncWithCloud`, vì lý do y hệt.

Màn hình Tài khoản hiện **"Đồng bộ lần cuối"**. Với tự đồng bộ, người dùng không còn bấm nút nên không còn dấu hiệu nào cho biết nó có thật sự chạy — và một tính năng đồng bộ âm thầm ngừng chạy là cách chắc chắn nhất để mất dữ liệu mà không hay biết. Mốc đó lưu ở `localStorage` chứ không ở bảng settings: nó là trạng thái của một máy, và bảng settings thì nằm trong file sao lưu.

### Xóa vĩnh viễn — vòng lặp "bản ghi sống lại"

Thùng rác → Xóa vĩnh viễn xóa cứng ở máy. Nếu chỉ làm đúng chừng đó thì hàng trên đám mây còn nguyên, lần đồng bộ kế tiếp kéo nó về, và **bản ghi sống lại**. Người dùng xóa lần nữa, nó lại về. Nhìn từ phía họ thì đó không phải lỗi đồng bộ — nó giống hệt như ứng dụng bị hỏng.

`db/purge.ts` đóng vòng đó bằng cách gộp hai việc vào **một** hàm. Cách chữa hiển nhiên hơn — "nhớ gọi thêm hàm xóa trên mây sau khi xóa ở máy" — chính là loại quy ước sẽ bị quên: nó đúng ở chỗ gọi hôm nay và sai ở chỗ gọi thứ ba được thêm vào sáu tháng nữa.

Tầng cũng có chủ đích: `db/repo/` là CRUD thuần trên Dexie và không được biết gì về mạng, nên `db/purge.ts` nằm cùng tầng với `db/backup.ts`.

**Chưa đăng nhập thì xóa ở máy vẫn chạy**, phần đám mây bỏ qua và màn hình nói rõ rằng bản ghi sẽ quay về. Chặn người dùng dọn thùng rác chỉ vì họ chưa đăng nhập là lấy một tính năng cục bộ đem đi cầm cho một tính năng tùy chọn. Mạng lỗi cũng vậy: bản ghi ở máy đã mất vĩnh viễn rồi, ném lỗi ra ngoài lúc đó chỉ khiến giao diện trông như cả thao tác đã thất bại.

`db/__tests__/purge.test.ts` có một **bài đối chứng**: gọi thẳng repo cục bộ, bỏ qua `db/purge.ts`, rồi đồng bộ và khẳng định bản ghi **sống lại**. Không có nó thì bài test chính không chứng minh được gì cả.

## Màn hình Tài khoản — và vì sao KHÔNG có cổng đăng nhập

Đăng nhập có màn hình riêng (`#/account`), nhưng **vào ứng dụng không cần đăng nhập**. Đó là quyết định có chủ đích, không phải việc chưa làm xong.

**Cổng đăng nhập sẽ giết chế độ offline.** Đây là PWA. Người dùng mở app trên xe buýt để xem ca chiều nay; bắt xác thực phiên khi không có mạng nghĩa là khóa họ ra khỏi chính dữ liệu đang nằm trong máy họ. Một ứng dụng lịch hỏng đúng lúc cần nhất là một ứng dụng lịch hỏng.

**Nó sẽ biến bản chưa cấu hình thành app chết.** Thiếu biến môi trường Supabase thì cổng đăng nhập không dẫn tới đâu cả — và đó chính xác là lỗi P0 vừa phải sửa ở Phase 2, chỉ khác là lần này ta tự gây ra.

**Và nó sẽ là an toàn giả.** Lịch với thu nhập nằm trong IndexedDB; ai cầm được máy thì mở DevTools là đọc hết, có màn hình đăng nhập hay không cũng vậy. Muốn khóa thật thì phải mã hoá IndexedDB bằng một passphrase cục bộ — việc khác hẳn, và hứa hẹn bảo mật mà không có bảo mật thì tệ hơn nói thẳng rằng không có.

Cái màn hình này giải quyết là chuyện khác và có thật: đăng nhập từng nằm trong một panel chật chội kẹp giữa phần Nhắc lịch và phần Sao lưu của Cài đặt. Quản lý tài khoản xứng đáng có chỗ riêng — nhưng "có chỗ riêng" không đồng nghĩa với "bắt buộc phải đi qua".

## Chính sách riêng tư

Ở `#/privacy`, link từ cuối màn hình Cài đặt. Ứng dụng thu email và mật khẩu, lưu lịch làm việc và thu nhập — chừng đó là đủ để cần một trang nói rõ dữ liệu đi đâu.

Trang này **nói thẳng ba điều bất lợi** mà phần lớn chính sách riêng tư lờ đi:

- Bản ghi đã xóa còn nằm lại 30 ngày dưới dạng tombstone.
- Anon key của Supabase là công khai — thứ bảo vệ dữ liệu là RLS.
- Người vận hành dự án Supabase có toàn quyền truy cập cơ sở dữ liệu.

Ba điều đó đều đúng, và một chính sách bỏ qua chúng là một chính sách nói dối. Điều làm nó vẫn là câu chuyện *tốt* là phần còn lại: mặc định không có gì rời khỏi máy cả. Có test giữ ba mục này khỏi bị cắt đi trong một lần "dọn cho gọn".

Ngày cập nhật viết cứng chứ không lấy `new Date()`. "Cập nhật lần cuối" mà tự nhảy theo hôm nay là một lời nói dối tự động.

## Thêm nhanh bằng văn bản

Ô một dòng ở các màn hình lịch: gõ *"Học Toán 18h-20h thứ 3"* rồi Enter, hộp thoại tạo buổi mở ra với ngày, giờ và tiêu đề đã điền sẵn.

**Nó không tự lưu.** Bộ phân tích đoán từ ngôn ngữ tự nhiên nên nó sẽ đoán sai; ghi thẳng vào DB một thứ vừa đoán sai là cách nhanh nhất làm mất niềm tin vào tính năng. Hộp thoại hiện đúng những gì nó hiểu, sai thì sửa ngay tại chỗ.

### Ngày phân tích TRƯỚC giờ — thứ tự này là hành vi của tính năng

Bản đầu tiên làm ngược, và với `"Nộp báo cáo 25/8"` thì bộ dò giờ nuốt luôn số 25 làm giờ:

```
{ title: "Nộp báo cáo /8", startTime: "25:00", date: <hôm nay> }
```

Ba cái sai cùng lúc: `25:00` không tồn tại (`<input type="time">` từ chối nó), tiêu đề còn sót `"/8"`, và **cả nhánh phân tích ngày dạng `d/m` trở nên không thể chạm tới** — số ngày luôn bị bộ dò giờ lấy mất trước. Một nhánh code chết mà không có gì báo.

### Nhiều thứ trong tuần → LỊCH LẶP, không phải một buổi

`Dạy Gia thứ 2,5 18h-20h` cho ra **một lịch lặp** vào thứ Hai và thứ Năm, không phải một buổi lẻ. Hộp thoại mở ra với "Hàng tuần" đã bật và hai ô T2, T5 đã chọn.

Luật: **từ hai thứ trở lên thì chắc chắn là lặp** — một buổi không thể vừa diễn ra thứ Hai vừa diễn ra thứ Năm. Một thứ thì vẫn là buổi lẻ, trừ khi có chữ chỉ lặp (`mỗi`, `hàng tuần`). "Họp thứ 5" hầu như luôn là một cuộc họp, không phải lịch cố định suốt đời — và đoán sai hướng đó thì người dùng phải đi xóa cả một chuỗi.

⚠️ **Dấu ngăn phải tường minh** (`,` `và` `&` `+`). Nhận cả khoảng trắng trần thì `Thi thứ 5 phòng 2` biến thành lịch lặp thứ Hai và thứ Năm.

### Đối tượng: đối chiếu dữ liệu, KHÔNG đoán từ ngữ pháp

Gõ `Dạy Gia` thì ô **Đối tượng** tự điền "Gia". Nhưng cách nó làm được điều đó không phải bằng phân tích câu:

```
"dạy Gia"   → Gia là một người
"dạy Toán"  → Toán là một môn học
```

Hai câu **giống hệt nhau về cấu trúc**: động từ + danh từ riêng viết hoa. Không quy tắc cú pháp nào phân biệt được, và mọi mẹo dựa trên danh sách môn học đều vỡ ở cái tên thứ nhất nằm ngoài danh sách. Đoán bừa nghĩa là mỗi lần gõ "dạy Toán" lại phải đi xóa một Đối tượng tên "Toán" — tệ hơn hẳn việc không đoán gì.

Nên `findClient()` **đối chiếu với những Đối tượng đã có trong dữ liệu**. Tên nào bạn đã từng dùng thì lần sau gõ ra là nhận được ngay; lần đầu vẫn phải điền tay, nhưng đúng một lần — và đó là lần duy nhất ứng dụng có cơ sở nào để biết "Gia" là người còn "Toán" thì không.

So khớp bỏ dấu và không phân biệt hoa thường, nhưng trả về **đúng dạng đã lưu**: gõ `day gia` ra `Gia`, không sinh thêm một đối tượng viết thường. Tên dài thắng tên ngắn, để "Gia Bảo" không bị cắt cụt thành "Gia".

`cho X` / `với X` là đường tắt cho chính lần đầu đó — bắt buộc viết hoa, vì không có ràng buộc ấy thì "làm cho xong" cho ra một đối tượng tên "xong".

Danh sách đọc từ `rules` và `events` qua `useKnownClients()`, **không** từ `occurrences` đang hiển thị: Occurrence chỉ tồn tại cho cửa sổ đang xem, nên dùng nó thì một học sinh dạy từ ba tháng trước sẽ không được nhận ra — và được hay không tùy vào việc người dùng đang mở tuần nào.

### Bốn quy tắc còn lại

**Số trần không phải là giờ.** `"Học toán lớp 10"` từng thành 10:00. Muốn là giờ thì phải có dấu hiệu: `h`, `:`, chữ "giờ", tiền tố "lúc", hoặc buổi đi kèm (`"7 tối"`). Và nếu ứng viên đầu tiên trượt phép kiểm này thì phải **duyệt tiếp**, không bỏ cuộc — `"Bài 18 ôn tập 18h"` có giờ thật ở cuối câu.

**Buổi áp cho cả khoảng.** `"7h-9h tối"` là 19:00–21:00, không phải 07:00–09:00.

**Luôn nói về tương lai.** `"thứ 3"` gõ vào thứ Tư là thứ Ba tuần sau; `"20/8"` gõ vào 24/8 là năm sau. Một luật duy nhất, không ngoại lệ — muốn ghi lùi thì dùng form đầy đủ. Năm ghi rõ (`20/8/2020`) thì tôn trọng nguyên văn.

**Không đoán bừa.** Không tìm thấy thì trả `null`, không lấy hôm nay làm mặc định. Mặc định làm câu phân tích *hỏng* và câu cố ý không nói ngày cho ra kết quả giống hệt nhau. Tầng gọi chọn giá trị mặc định, vì chỉ nó mới biết "bây giờ" là lúc nào.

### `\b` không dùng được với tiếng Việt

`\b` của JavaScript định nghĩa "ký tự từ" là `[A-Za-z0-9_]`, **kể cả khi bật cờ `u`**. Chữ cái có dấu nằm ngoài tập đó, nên `\btư\b` không khớp `"thứ tư"`.

Triệu chứng rất chọn lọc: "thứ ba", "thứ năm", "thứ sáu", "thứ bảy" đều chạy vì chúng kết thúc bằng chữ cái ASCII — chỉ **"thứ tư"** hỏng. Đúng loại lỗi lọt qua kiểm thử thủ công vì người ta thử một hai trường hợp rồi tin cả cụm. `core/quickAdd.ts` tự dựng ranh giới bằng `(?<![\p{L}\p{N}])` và `(?![\p{L}\p{N}])`.

## Màu nhấn và chế độ tối

Hai trục độc lập, hai cơ chế khác nhau: chế độ tối là **lớp** `.dark`, màu nhấn là **thuộc tính** `data-theme`. Tách ra để chúng ghép được — `.dark[data-theme='blue']` cần màu xanh sáng hơn bản nền sáng, nếu không nút chìm vào nền.

`@theme` của Tailwind v4 sinh `bg-primary` / `text-primary-fg` từ biến `--color-primary`, và vì lớp đó biên dịch thành `var(--color-primary)`, gán lại biến ở `[data-theme=…]` là toàn bộ nút, tab và biểu đồ đổi theo. Bảy bộ: navy, blue, green, purple, rose, orange, teal.

**Hai thứ màu nhấn KHÔNG được nuốt:**

Màu danh mục đến từ dữ liệu người dùng và đi qua thuộc tính `style` inline, nên theme không chạm tới. Đó là cách phân biệt Rossi với Gia sư — để theme đè lên là mất hẳn một chiều thông tin.

Dấu "hôm nay" giữ màu hổ phách. Nếu nó đổi theo theme thì ở bộ Orange, ô hôm nay và tab đang chọn sẽ cùng màu.

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

## Nhân bản tuần

Nút **Nhân bản tuần** ở màn hình Tuần chép các buổi của tuần đang xem sang một tuần khác. Dành cho lịch làm ca: ca đổi từng tuần nên không viết thành lịch lặp được, nhưng tuần này thường giống tuần trước ở phần lớn các buổi.

Ghi chú cũ trong mục "Còn treo" nói rằng với kiến trúc rule-based thì chép tuần sẽ nhân đôi sự kiện. Điều đó đúng — và đó chính là lý do phép lọc phải là `ruleOriginalDate`, **không phải** `sourceType`:

| Buổi | `ruleOriginalDate` | Xử lý |
|---|---|---|
| Sự kiện đơn lẻ | không có | **chép** |
| Ngoại lệ loại `ADD` | không có | **chép** — nó là buổi thêm tay một lần, không lặp |
| Do rule sinh ra | có | bỏ — chuỗi tự phủ sang tuần đích |
| Buổi của rule đã dời/sửa | có | bỏ — vẫn là buổi của chuỗi |

Buổi loại `ADD` mang `sourceType: 'RULE'` nhưng không lặp lại. Lọc theo `sourceType` sẽ đánh rơi đúng nhóm này, và đó là loại lỗi im lặng: người dùng chỉ thấy "hình như thiếu vài buổi".

Ba điểm nữa:

Bản sao **luôn ở trạng thái `SCHEDULED`**, kể cả khi chép từ buổi đã hoàn thành. Bản sao là kế hoạch chứ không phải bản ghi; chép nguyên `COMPLETED` sang tuần sau là khai rằng một buổi chưa diễn ra đã xong, và con số đó chảy thẳng vào Thống kê lẫn bảng lương.

Buổi **đã hủy hoặc vắng mặt thì bỏ**. Chúng là bản ghi của việc đã không xảy ra, chép sang tuần sau không có nghĩa gì.

`planWeekCopy()` chỉ **dựng kế hoạch**, không ghi. Hộp thoại hiển thị đúng những con số của kế hoạch đó, rồi ghi đúng mảng vừa hiển thị — không có đường nào để đếm một đằng ghi một nẻo. Hoàn tác xóa mềm toàn bộ buổi vừa tạo, kể cả buổi người dùng đã kịp sửa: họ đang rút lại nguyên thao tác chép.

Ô chọn ngày nhận ngày bất kỳ nhưng **nắn về đầu tuần**. Không nắn thì chọn nhằm thứ Tư sẽ dịch cả tuần đi ba ngày — vẫn "chạy", chỉ là sai.

## Thùng rác

Mọi thao tác xóa đều là xóa mềm — bản ghi ở lại để nút Hoàn tác có đường quay về, và để Phase đồng bộ Cloud biết mà xóa ở phía kia. Nhưng khi toast tắt, tombstone không còn màn hình nào chạm tới: không khôi phục được, không dọn được, vẫn phình file sao lưu. Cài đặt → Thùng rác đóng vòng đó.

Xóa vĩnh viễn mặc định chỉ dọn thứ đã xóa **quá 30 ngày**. Lý do không chỉ là an toàn dữ liệu: mất tombstone là mất luôn tín hiệu "hãy xóa bản ghi này ở máy khác", nên dọn sớm rồi đồng bộ có thể khiến bản ghi sống lại từ máy chưa nhận được lệnh xóa.

Khôi phục một `RecurringRule` kéo theo cả exception bị dọn **cùng lúc** với nó — `softDeleteRule` đóng chung một dấu thời gian chính là để phục vụ chỗ này. Khôi phục Category thì **không** kéo lịch về: lúc xóa, rule và event đã bị dời sang "Chưa phân loại" và bản ghi không lưu chúng vốn thuộc về đâu. Chỉ nút Hoàn tác ngay tại thời điểm xóa mới làm được, vì nó giữ danh sách trong bộ nhớ. Màn hình nói rõ điều này.

## Nhắc lịch — và vì sao nó chỉ nhắc được nửa vời

Ứng dụng không có máy chủ. Không máy chủ thì không có Web Push, và không Web Push thì **không có cách nào** đánh thức trình duyệt đã đóng. Notification Triggers API làm được nhưng tới nay vẫn nằm sau cờ thử nghiệm.

Nên cơ chế là hẹn giờ trong trang: chỉ chạy khi tab hoặc app đang mở. Màn hình Cài đặt nói thẳng điều đó **ngay dưới tiêu đề**, không giấu xuống cuối — một tính năng nhắc lịch hứa nhiều hơn thực tế là cách nhanh nhất khiến người ta bỏ lỡ ca làm rồi mất niềm tin vào cả ứng dụng.

Muốn nhắc thật khi đóng app thì phải có backend đẩy Web Push.

### Khung Web Push đã dựng — và ba mảnh còn thiếu

Phase 3 dựng phần vỏ: `supabase/functions/push-reminder/`, biến `VITE_VAPID_PUBLIC_KEY`, và `requestNotificationPermission()` đã gọi `pushManager.subscribe()`. **Đừng nhầm cái vỏ đó với một tính năng chạy được** — đường đi hiện tại đứt ở ba chỗ:

| Mảnh thiếu | Ở đâu | Hệ quả |
|---|---|---|
| Subscription không được lưu | `useReminders.ts` — lấy xong `console.log` rồi bỏ, dòng `fetch` còn nằm trong chú thích | Máy chủ không có địa chỉ nào để đẩy tới |
| Không có bảng chứa subscription | `supabase_schema.sql` — chưa có bảng nào | Có gửi lên cũng không có chỗ ghi |
| Edge Function chưa có bộ lập lịch | `push-reminder/index.ts` — chỉ nhận POST rồi đẩy lại ngay, `supabaseClient` khai ra mà không dùng | Không ai quét "buổi sắp tới trong 15 phút" để mà bắn |

Nên thứ đang thật sự nhắc bạn vẫn là `setTimeout` trong trang, và mục Cài đặt vẫn phải nói đúng như cũ: **chỉ chạy khi tab hoặc app đang mở.** Nối ba mảnh trên thì mới được phép đổi câu đó.

## Trợ năng

**Không có thẻ `<img>` nào trong toàn bộ `src/`** — giao diện dựng bằng SVG nội tuyến và chữ. Nên "alt text" ở đây không phải chuyện ảnh, mà là chuyện **ký hiệu trần**: `✓`, `⚠`, `✕`, `‹`, `›` chỉ truyền được thông tin qua mắt. Trình đọc màn hình đọc tên Unicode của ký tự, hoặc bỏ qua hẳn.

Quy ước: ký hiệu mang thông tin thì bọc `role="img"` kèm `aria-label`; ký hiệu nằm trong nút đã có `aria-label` thì đánh `aria-hidden="true"` để không bị đọc hai lần.

Thanh điều hướng dùng `aria-current="page"`, **không** dùng `role="tablist"`. Mẫu tablist của ARIA hứa hẹn điều hướng bằng phím mũi tên, mà `←` `→` ở app này đã dành cho việc đổi tuần. Khai một vai trò rồi không cài hành vi đi kèm còn tệ hơn không khai.

`Modal` làm **ba việc riêng biệt** với tiêu điểm, và thiếu việc nào cũng bỏ rơi người dùng bàn phím ở một chỗ khác nhau:

| Việc | Thiếu thì sao |
|---|---|
| Đưa tiêu điểm vào khung khi mở | Họ vẫn ở nền phía sau, gõ Tab vào một form bị che khuất |
| Giữ tiêu điểm ở trong (bẫy Tab) | Tab vài lần là ra khỏi hộp thoại và thao tác trên nền mà không thấy — trong khi `aria-modal` đã nói với trình đọc màn hình rằng phần đó không tồn tại |
| Trả tiêu điểm về nút đã mở nó | Đóng xong tiêu điểm rơi về `<body>`, Tab tiếp theo bắt đầu lại từ đầu trang |

Cả ba có test trong `src/components/__tests__/Modal.test.tsx`. jsdom không tự di chuyển tiêu điểm khi nhấn Tab, và điều đó lại tiện: mọi lần tiêu điểm dịch chuyển trong bài test đều do mã của ta gọi `.focus()`, nên test đo đúng cái bẫy tiêu điểm chứ không đo jsdom.

## Những thứ cố ý KHÔNG có

Danh sách này tồn tại để lần sau không phải tranh luận lại. Mỗi mục là một thứ đã được cân nhắc và bị loại, kèm lý do.

| Không có | Vì sao |
|---|---|
| **Công cụ phân tích / analytics** | Mâu thuẫn trực tiếp với lời hứa "dữ liệu không rời khỏi trình duyệt", kéo theo nghĩa vụ xin đồng ý cookie, và với một công cụ cá nhân thì nó không trả lời câu hỏi nào cả |
| **Breadcrumbs** | Không có tầng nào để lần. Mười một màn hình phẳng, thanh tab chính là điều hướng |
| **Internal links** | Một trang, các màn hình đổi bằng state. Không có link nội bộ nào để tạo — khái niệm này thuộc về web nội dung |
| **`robots.txt` cho phép index** | Ngược lại: `Disallow: /`. Trình thu thập chỉ thấy cái vỏ rỗng vì nội dung nằm trong IndexedDB. Index một trang không có nội dung không lợi gì, mà lại đúng loại trang bị đánh giá chất lượng thấp |
| **Cổng đăng nhập bắt buộc** | Xem mục "Màn hình Tài khoản" ở trên |
| **`og:url` tuyệt đối** | Không biết tên miền lúc build, và `base: './'` tồn tại chính là để không phải biết. Ghi cứng một tên miền là tạo ra giá trị sẽ sai ngay khi ai đó fork |

Điểm chung của ba mục đầu: chúng là checklist cho **web nội dung** cần Google index. Đây là **công cụ**, và nội dung của nó là dữ liệu riêng tư mà bạn *không* muốn ai index.

`og:image` thì có (`public/og-image.png`, 1200×630), nhưng đường dẫn là **tương đối**. Facebook, X, Slack và Discord đều tự nối nó với URL trang; LinkedIn kén hơn và có thể bỏ qua ảnh. Đó là cái giá của việc không ghi cứng tên miền, và nó rẻ hơn một cấu hình sẽ chết.

## Test

| Tầng | Cách test |
|---|---|
| `core/`, `pdf/model` | Hàm thuần, mảng vào mảng ra. Không cần DOM, chạy trong mili-giây. |
| `db/` | IndexedDB thật trong bộ nhớ qua `fake-indexeddb`. **Không mock Dexie.** |
| `db/sync` | IndexedDB thật + một `CloudTransport` giả. Không chạm mạng. |
| Component | `@testing-library/react`. Ưu tiên chặn tái phát các lỗi đã từng lọt. |

Bộ test ở `core/` **không bắt được** ba lỗi lọt lưới gần đây — ô số nằm trong `<label>`, cột biểu đồ cao 0px, bộ lọc nhắc lịch. Không phải vì chúng yếu, mà vì chúng nhìn sai chỗ. Test component tồn tại để bịt đúng khoảng mù đó, nên mỗi bài nên tương ứng với một lỗi thật chứ không phải phủ cho đủ.

Tầng `db/` chạy mã thật chứ không mock là có lý do: mock `db.rules.update()` chỉ chứng minh ta gọi đúng hàm, nó không chứng minh Dexie hiểu `deletedAt: undefined` là lệnh **xóa thuộc tính** — mà toàn bộ cơ chế hoàn tác dựa vào đúng hành vi đó.

Mỗi bài trong `src/db/__tests__/undo.test.ts` tương ứng với một lỗi đã từng xảy ra hoặc suýt xảy ra: ghi `CANCEL` đè lên `MOVE` rồi hoàn tác, đánh dấu hoàn thành làm mất `type: 'MOVE'`, tách chuỗi mà quên trả `endDate`, xóa danh mục rồi khôi phục mà lịch nằm lại ở "Chưa phân loại".

`src/db/__tests__/sync.test.ts` cũng vậy. Bản giả `CloudTransport` mô phỏng đúng một hành vi của PostgREST: `upsert` **chỉ ghi đè những cột có mặt trong payload**. Đó chính là chỗ bản đồng bộ đầu tiên vỡ, nên bản giả phải trung thực ở đúng điểm đó — nếu không thì test chỉ chứng minh được rằng mã chạy, chứ không chứng minh nó đúng.

## Còn treo

| Việc | Ghi chú |
|---|---|
| ~~Xuất PNG~~ | `html2canvas-pro` render qua off-screen DOM, không kéo hỏng style Tailwind v4. |
| ~~Xóa hẳn rate của riêng một buổi~~ | Xóa override thì `newRatePerHour` về `undefined` và fallback về rate của rule. |
| ~~Biểu tượng PNG cho PWA~~ | `scripts/generate-icons.mjs` sinh 192px và 512px bằng `sharp`. |
| ~~Test cho component~~ | Đã có cho `EventDialog` (thẻ `label` bọc ô input), `StatsView` (chia 0 ra chiều cao `0px`), `CloudSyncSection` (thiếu env làm trắng màn hình). |
| ~~Đồng bộ Cloud~~ | Xong ở Phase 2, viết lại toàn bộ sau khi rà soát. Xem mục "Đồng bộ Cloud". |
| ~~Thêm nhanh bằng văn bản~~ | Xong ở Phase 2, viết lại parser sau khi rà soát. Xem mục "Thêm nhanh bằng văn bản". |
| ~~Xóa vĩnh viễn không lan lên đám mây~~ | `db/purge.ts` gộp xóa cục bộ và xóa trên mây vào một hàm. Có bài đối chứng chứng minh vòng lặp "sống lại" là có thật và đã đóng. |
| ~~Đồng bộ gia tăng~~ | Bản kê trước (`id` + `updated_at`), nội dung sau. Không đổi gì thì lần đồng bộ thứ hai tải về không một dòng đầy đủ nào. |
| ~~Điều hướng bằng URL~~ | `#/week`, `#/payroll`… Nút Back hoạt động, bookmark được, lối tắt PWA trỏ thẳng vào từng màn hình. |
| ~~Đồng bộ tự động~~ | Bốn kích hoạt, ba lớp chống chạy chồng. Cố ý KHÔNG chạy khi dữ liệu đổi — xem mục "Tự đồng bộ". |
| ~~Xuất sang ứng dụng lịch~~ | `.ics` với `RRULE`, `EXDATE` và `RECURRENCE-ID`. Xem mục "Xuất sang ứng dụng lịch". |
| Giải quyết xung đột ở mức TRƯỜNG | Hiện là "cả bản ghi nào mới hơn thì thắng". Hai máy sửa hai trường khác nhau của cùng một buổi thì một bên mất thay đổi. Cần lưu dấu thời gian theo từng trường — đắt, và chỉ đáng làm khi thật sự có hai người dùng chung. |
| ~~`clientName` thành thực thể có `id`~~ | Xong ở Phase 3 bằng `db.version(3)`. `Payment` neo vào `clientId` nên đổi tên không còn làm mồ côi khoản thu nào. Xem mục "`db.version(3)`". |
| Nhắc lịch khi đã đóng app | Phase 3 mới dựng **khung**: Edge Function `push-reminder` và biến `VITE_VAPID_PUBLIC_KEY`. Vẫn chưa chạy được — xem mục "Nhắc lịch" để biết còn thiếu ba mảnh nào. |

## Ngôn ngữ

Giao diện có `vi`, `en` và `zh`, đổi trong Cài đặt. Khóa nào thiếu ở bộ đang dùng thì rơi về tiếng Việt — mọi chuỗi mới đều viết ở `vi` trước, nên đó là bản đầy đủ nhất.

⚠️ Cơ chế rơi về `vi` đó là lý do **không được viết `t('key', 'Chuỗi mặc định')`**. Chuỗi dự phòng inline làm màn hình trông ổn ngay lập tức, và chính vì thế mà khóa thiếu không bao giờ bị phát hiện. Toàn bộ mục Cloud của Phase 2 được viết theo kiểu đó: không một khóa nào tồn tại trong cả ba file, mà giao diện vẫn hiện tiếng Việt hoàn hảo ở cả ba ngôn ngữ. Xem "Định nghĩa xong".

`formatMoney` / `formatDate` / `formatHours` lấy ngôn ngữ từ i18next **tại thời điểm gọi**, không phải hằng số lúc định nghĩa. Trước đây chúng mặc định cứng `'vi'`; không ai để ý vì chỉ có một bộ ngôn ngữ, nhưng đó đúng là loại trường chết chỉ lộ ra khi thêm bộ thứ hai.

Tiêu đề, ghi chú, địa điểm và tên học sinh là **dữ liệu người dùng** — chúng không đi qua i18n và hiện đúng như đã gõ, bất kể ngôn ngữ giao diện.

## Tài liệu kèm theo

| File | Nội dung |
|---|---|
| `REVIEW_Personal_Schedule_System.md` | 30+ lỗi tìm được trong kế hoạch gốc, phân theo mức nghiêm trọng |
| `PHASE0_Dac_ta_thi_cong.md` | Mô hình lương hai chế độ + schema chốt + 8 bước dựng nền móng |
