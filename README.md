# Personal Schedule System — Phase 0

Nền móng: mô hình dữ liệu, IndexedDB, và toàn bộ logic nghiệp vụ dạng hàm thuần.

**Chưa có giao diện lịch — đó là đúng.** Mở lên chỉ thấy màn hình nghiệm thu trạng thái. Week View bắt đầu ở Phase 1.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
```

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy 61 test (Vitest) |
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
│   ├── expand.ts        Mở rộng lịch lặp + hợp nhất ngoại lệ
│   ├── conflict.ts      Phát hiện trùng lịch
│   ├── income.ts        TẦNG 1 — tiền của một buổi
│   ├── payroll.ts       TẦNG 2 — tiền của một tháng (con số chính thức)
│   └── __tests__/
│
├── db/
│   ├── schema.ts        Lớp Dexie + chuỗi version()
│   ├── seed.ts          Danh mục mặc định
│   └── repo/            CRUD — nơi DUY NHẤT được đụng vào db
│
├── i18n/                i18next + bộ vi (en/zh thêm ở Phase 5)
└── App.tsx              Màn hình nghiệm thu Phase 0
```

### Quy tắc bất di bất dịch

`core/` chỉ nhận mảng vào, trả mảng ra. Không import `react`, không import `dexie`.

Nhờ đó: test chạy trong mili-giây không cần DOM, và Phase 7 lên Cloud DB chỉ phải viết lại `db/`, `core/` không đụng một dòng.

`npm run check:core` kiểm tra ranh giới này. Chạy nó trước mỗi lần commit.

## Những lỗi đã được vá sẵn so với bản kế hoạch gốc

| Mã | Lỗi | Cách vá |
|---|---|---|
| **A1** | Ca qua đêm cho thời lượng âm (`22:00 − 02:00 = −20h`) | Lưu `durationMinutes` thay cho `endTime`. Trạng thái sai không tồn tại được. |
| **A2** | Buổi bị `MOVE` sang tuần khác **biến mất** | Truy vấn exception hai chiều: `originalDate` HOẶC `newDate`. Xem `db/repo/exceptions.ts`. |
| **A4** | Chỉ lặp được theo tuần | Thêm `freq` + `interval` + `dayOfMonth` → tuần chẵn/lẻ, lặp tháng. |
| **A5** | Mâu thuẫn ISO/Timestamp vs `"HH:mm"` | Chốt giờ treo tường. Xem chú thích đầu `types/index.ts`. |
| **B1** | Buổi lặp không đánh dấu được "đã đi làm" | Thêm `ExceptionType='STATUS'` → thống kê kế hoạch vs thực tế tính được. |
| **B2** | `Category.defaultRatePerHour` là trường chết | Đưa vào chuỗi ưu tiên 6 bước ở `core/income.ts`. |
| **B3** | `SalaryRule` mơ hồ giữa lương khoán và lương giờ | Thêm `mode` + `shortfallPolicy`. Hai chế độ, hai tầng tính tiền. |
| **B4** | Thiếu dấu thời gian → Phase 7 không đồng bộ được | `BaseEntity` có `createdAt`/`updatedAt`/`deletedAt` (tombstone). |
| **B5** | Exception chọi nhau, `ADD` mồ côi | Unique index `[recurringRuleId+originalDate]`, ngữ nghĩa upsert. |
| **B7a** | Xóa Category không có nơi gom sự kiện | Seed "Chưa phân loại", `isSystem: true`, không cho xóa. |
| **B7c/d** | Trùng lịch dùng sai bất đẳng thức, chỉ so trong ngày | So trên epoch ms, `aStart < bEnd && bStart < aEnd`. |
| **C2** | i18n để tới Phase 5 | Cài ngay Phase 0 — Phase 5 chỉ còn việc dịch, không phải refactor. |
| **C4** | Không có test ở phase nào | 61 test, phủ hết các ca biên trên. |
| **D1** | `html2canvas` crash với Tailwind v4 (`oklch`) | Dùng `html2canvas-pro` khi tới Phase 4. |

## Hai chế độ lương

Điểm dễ hiểu lầm nhất của hệ thống:

```
calcOccurrenceIncome()   TẦNG 1 — tiền một buổi
                         FIXED_MONTHLY trả về null, KHÔNG phải 0.
                         UI hiện "—" cho null, "0đ" cho 0.

calcMonthlyPayroll()     TẦNG 2 — CON SỐ CHÍNH THỨC
                         Mọi màn hình thống kê phải đọc từ đây.
```

Với lương khoán tháng, "buổi thứ Ba kiếm được bao nhiêu?" **không có đáp án** — 8 triệu/tháng không phải tổng của 22 buổi chia đều. Cộng dồn Tầng 1 sẽ ra sai: tháng thiếu buổi thấp hơn lương thật, tháng thừa buổi cao hơn.

Cùng dữ liệu 160 giờ (chuẩn 176), phạt 100k, thưởng 300k:

| Chế độ | Thực nhận |
|---|---|
| `HOURLY` 45.000đ/giờ | 7.400.000 |
| `FIXED_MONTHLY` 8tr, `NONE` | 8.200.000 |
| `FIXED_MONTHLY` 8tr, `PRO_RATA` | 7.472.727 |

Ba con số khác nhau — nên `mode` và `shortfallPolicy` phải nhập rõ khi tạo, không có mặc định nào an toàn.

## Phase 1 tiếp theo

Week View + Month View, CRUD Category và SingleEvent. Toàn bộ logic đã sẵn trong `core/` — Phase 1 chủ yếu là việc vẽ.
