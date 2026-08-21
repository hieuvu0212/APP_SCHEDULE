# Personal Schedule System

Quản lý lịch cá nhân đa loại (học, làm ca, gia sư, nghiên cứu) kèm theo dõi thu nhập. Chạy hoàn toàn ở client, dữ liệu trong IndexedDB.

Sáu màn hình: lịch tuần có kéo–thả, lịch tháng, danh sách có lọc và tìm kiếm, bảng lương tháng, quản lý danh mục, cài đặt.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
```

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy bộ test (Vitest) |
| `npm run test:watch` | Test ở chế độ theo dõi |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:core` | Kiểm tra ranh giới `core/` |
| `npm run build` | Build production |

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
│   ├── income.ts        TẦNG 1 — tiền của một buổi
│   ├── payroll.ts       TẦNG 2 — tiền của một tháng (con số chính thức)
│   └── __tests__/
│
├── db/
│   ├── schema.ts        Lớp Dexie + chuỗi version()
│   ├── seed.ts          Danh mục mặc định
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

## Còn treo

| Việc | Ghi chú |
|---|---|
| Chế độ tối | `SystemSettings.theme` có trong schema nhưng chưa có công tắc. Làm đúng phải thêm biến `dark:` vào từng lớp Tailwind của mọi component. |
| `AdjustmentTemplate` | Có trong schema, chưa có UI. Để bấm một nút là sinh sẵn một khoản phạt/thưởng lặp lại. |
| Hoàn tác cho thao tác SỬA qua form | Kéo–thả và mọi thao tác xóa đã có hoàn tác. Sửa qua form thì chưa. |
| Xuất PDF / ảnh | Dùng `html2canvas-pro`, KHÔNG dùng `html2canvas` 1.4.1 — bản đó crash với Tailwind v4 vì `oklch()`. Với PDF A4 cân nhắc `window.print()` + `@media print`: chữ giữ dạng vector, ít code hơn hẳn. |
| Xóa hẳn rate của riêng một buổi | Exception dùng `??` để nối tiếp giá trị gốc, nên không phân biệt được "để trống" với "xóa đi". |
| "Copy Week" | Chưa định nghĩa lại. Với kiến trúc rule-based, copy tuần sẽ nhân đôi sự kiện. |
| Đồng bộ Cloud | `BaseEntity` đã có `createdAt`/`updatedAt`/`deletedAt` sẵn cho việc này. Chỉ phải viết lại `db/`. |

## Tài liệu kèm theo

| File | Nội dung |
|---|---|
| `REVIEW_Personal_Schedule_System.md` | 30+ lỗi tìm được trong kế hoạch gốc, phân theo mức nghiêm trọng |
| `PHASE0_Dac_ta_thi_cong.md` | Mô hình lương hai chế độ + schema chốt + 8 bước dựng nền móng |
