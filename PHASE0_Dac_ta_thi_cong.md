# PHASE 0 — ĐẶC TẢ THI CÔNG

*Schema chốt (đã vá toàn bộ lỗi trong bản review) + mô hình lương hai chế độ + các bước dựng nền*

---

## PHẦN I — MÔ HÌNH LƯƠNG HAI CHẾ ĐỘ

### 1. Vấn đề: hai chế độ lương không cùng đơn vị tính

Bạn cần hai kiểu:

| Kiểu | Ví dụ | Đơn vị tính tiền |
|---|---|---|
| **Theo giờ** | Rossi — tự nhập X đồng/giờ | **Từng buổi** cộng lại |
| **Khoán tháng** | công việc sau — Y đồng/tháng, có phạt thì trừ | **Cả tháng**, không chia được cho buổi |

Điểm mấu chốt: **không thể dùng chung một hàm tính tiền cho cả hai.**

Với lương khoán tháng, câu hỏi "buổi thứ Ba tuần này kiếm được bao nhiêu tiền?" **không có câu trả lời**. Lương 8 triệu/tháng không phải là tổng của 22 buổi × 363.636đ — nghỉ một buổi có phép vẫn nhận đủ 8 triệu, làm thêm một buổi cũng vẫn 8 triệu.

Nếu ép chia đều rồi cộng lại, sẽ có hai lỗi cùng lúc:

- Tháng làm thiếu buổi → tổng cộng ra **thấp hơn** lương thật.
- Tháng làm thừa buổi → tổng cộng ra **cao hơn** lương thật.

Nên hệ thống cần **hai tầng tính tiền tách bạch**:

```
Tầng 1 — calcOccurrenceIncome(occurrence)
         Tiền của MỘT buổi. Chỉ có nghĩa với chế độ HOURLY.
         Với FIXED_MONTHLY luôn trả về null (không phải 0 — null nghĩa là
         "không quy đổi được", để UI hiển thị dấu "—" thay vì "0đ").

Tầng 2 — calcMonthlyPayroll(categoryId, month)  ← CON SỐ CHÍNH THỨC
         Tiền của MỘT THÁNG cho một công việc.
         HOURLY        → cộng dồn Tầng 1
         FIXED_MONTHLY → lấy baseSalary
         rồi cả hai cùng đi qua bước cộng thưởng / trừ phạt.
```

Mọi màn hình thống kê thu nhập phải đọc từ **Tầng 2**. Tầng 1 chỉ dùng để hiển thị con số nhỏ trên từng block lịch.

> **Hệ quả cho Dashboard:** ô "thu nhập ước tính **tuần**" ở mục 5 không tính được cho công việc khoán tháng. Hoặc hiển thị "8.000.000đ/tháng" thay vì một con số tuần, hoặc ghi rõ "(ước tính chia đều)". Đừng để nó lặng lẽ hiện một con số sai.

---

### 2. `SalaryRule` — bản chốt

```ts
export type SalaryMode = 'HOURLY' | 'FIXED_MONTHLY';

/** Chính sách khi giờ làm thực tế THẤP HƠN giờ công chuẩn (chỉ dùng cho FIXED_MONTHLY) */
export type ShortfallPolicy =
  | 'NONE'       // nghỉ vẫn nhận đủ lương (lương khoán đúng nghĩa)
  | 'PRO_RATA';  // thiếu giờ nào trừ giờ đó theo đơn giá quy đổi

export interface SalaryRule extends BaseEntity {
  categoryId: string;
  mode: SalaryMode;

  /**
   * Khoảng hiệu lực, KHÔNG phải một tháng cụ thể.
   * effectiveFrom: "YYYY-MM", bao gồm tháng này.
   * effectiveTo:   "YYYY-MM", bao gồm tháng này. Bỏ trống = còn hiệu lực.
   */
  effectiveFrom: string;
  effectiveTo?: string;

  // ─── mode === 'HOURLY' ───
  ratePerHour?: number;

  // ─── mode === 'FIXED_MONTHLY' ───
  baseSalary?: number;
  standardMonthlyHours?: number;   // BẮT BUỘC > 0 nếu dùng PRO_RATA hoặc OT
  shortfallPolicy?: ShortfallPolicy;

  // ─── dùng chung ───
  overtimeMultiplier?: number;     // vd 1.5 — áp cho giờ vượt standardMonthlyHours
  nightShiftMultiplier?: number;   // phụ cấp ca đêm; liên quan trực tiếp tới ca qua đêm
  nightShiftStart?: string;        // "22:00" — mốc bắt đầu tính ca đêm
  nightShiftEnd?: string;          // "06:00"
  currency: string;                // "VND" | "USD" | "CNY"
}
```

**Vì sao đổi `month` thành `effectiveFrom`/`effectiveTo`:**

Bản kế hoạch gốc để `month: "YYYY-MM"` — mỗi tháng một bản ghi. Làm Rossi hai năm nghĩa là **24 bản ghi giống hệt nhau**, và mỗi tháng mới bạn phải nhớ tạo thêm một bản, quên là thu nhập tháng đó về 0.

Với khoảng hiệu lực, bạn chỉ tạo bản ghi mới **khi lương thật sự thay đổi**. Tăng lương từ tháng 3/2027? Đặt `effectiveTo = "2027-02"` cho bản cũ, tạo bản mới `effectiveFrom = "2027-03"`. Đúng với thực tế, và không bao giờ "hết hạn" ngoài ý muốn.

**Quy tắc chọn bản ghi cho tháng M:**

```ts
// Lấy SalaryRule có hiệu lực, ưu tiên bản có effectiveFrom muộn nhất
const rule = rules
  .filter(r => r.categoryId === categoryId
            && r.effectiveFrom <= month
            && (!r.effectiveTo || r.effectiveTo >= month))
  .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
```

Kèm **validate lúc lưu**: không cho hai bản ghi cùng Category chồng lấn khoảng hiệu lực. Nếu chồng, hỏi người dùng có muốn tự động đóng bản cũ lại không.

---

### 3. `PayrollAdjustment` — phạt, thưởng, phụ cấp

Đây là thực thể **mới**, chưa có trong kế hoạch gốc. Nó xử lý yêu cầu *"nếu có phạt thì trừ đi"*.

```ts
export type AdjustmentKind =
  | 'PENALTY'      // phạt: đi muộn, nghỉ không phép, vi phạm nội quy   → TRỪ
  | 'DEDUCTION'    // khấu trừ khác: BHXH, thuế, tạm ứng, đồng phục     → TRỪ
  | 'BONUS'        // thưởng: chuyên cần, KPI, doanh số, lễ tết         → CỘNG
  | 'ALLOWANCE';   // phụ cấp: ăn ca, xăng xe, điện thoại               → CỘNG

export interface PayrollAdjustment extends BaseEntity {
  categoryId: string;
  month: string;          // "YYYY-MM" — tính vào bảng lương tháng nào
  kind: AdjustmentKind;
  label: string;          // "Đi muộn 15/09", "Thưởng chuyên cần T9"
  amount: number;         // LUÔN LUÔN LÀ SỐ DƯƠNG (xem ghi chú bên dưới)
  date?: string;          // ngày xảy ra, để tra cứu về sau
  note?: string;

  // Liên kết tùy chọn tới buổi cụ thể gây ra khoản này
  linkedEventId?: string;
  linkedRuleId?: string;
  linkedOccurrenceDate?: string;
}
```

**Vì sao `amount` luôn dương:** nếu cho phép nhập số âm, sẽ có ngày bạn nhập `-50000` cho một `PENALTY` và hệ thống trừ đi số âm → **cộng thêm** 50 nghìn. Lỗi này rất khó phát hiện vì con số vẫn trông hợp lý. Để dấu do `kind` quyết định thì trạng thái sai đó **không tồn tại được**.

**Mẫu phạt lặp lại:** nếu công ty có biểu phạt cố định (đi muộn 50k/lần, nghỉ không phép 200k/lần), thêm một bảng nhỏ để bấm một nút là sinh adjustment, đỡ gõ tay:

```ts
export interface AdjustmentTemplate extends BaseEntity {
  categoryId: string;
  kind: AdjustmentKind;
  label: string;          // "Đi muộn"
  defaultAmount: number;  // 50000
}
```

Không bắt buộc ở Phase 0, nhưng schema nên chừa sẵn chỗ.

---

### 4. Công thức tính lương tháng — bản đầy đủ

```
calcMonthlyPayroll(categoryId, month):

┌─ BƯỚC 0 — GATING (bắt buộc, chạy trước mọi thứ) ─────────────────┐
│  Category.isIncomeEligible === false  →  TRẢ VỀ 0, DỪNG LẠI      │
│  (Bỏ qua cả adjustment. Lịch học không có lương thì cũng          │
│   không có thưởng, không có phạt.)                                │
└───────────────────────────────────────────────────────────────────┘

┌─ BƯỚC 1 — LƯƠNG GỐC (gross) ─────────────────────────────────────┐
│                                                                   │
│  ┌ mode = 'HOURLY' ────────────────────────────────────────────┐ │
│  │  gross = Σ calcOccurrenceIncome(o)                          │ │
│  │          với mọi occurrence o thuộc Category trong tháng     │ │
│  │                                                              │ │
│  │  Chuỗi ưu tiên đơn giá của từng occurrence:                  │ │
│  │    1. o.fixedAmount           → dùng thẳng, không nhân giờ   │ │
│  │    2. o.ratePerHour           → × số giờ                     │ │
│  │    3. SalaryRule.ratePerHour  → × số giờ                     │ │
│  │    4. Category.defaultRatePerHour → × số giờ                 │ │
│  │    5. không có gì             → 0                            │ │
│  │  (chạy trên occurrence ĐÃ HỢP NHẤT rule + exception)         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌ mode = 'FIXED_MONTHLY' ─────────────────────────────────────┐ │
│  │  gross = baseSalary                                          │ │
│  │  hourlyEquiv = baseSalary / standardMonthlyHours             │ │
│  │  actual = tổng giờ thực tế trong tháng                       │ │
│  │                                                              │ │
│  │  nếu actual < standard  và  shortfallPolicy = 'PRO_RATA':    │ │
│  │      gross −= (standard − actual) × hourlyEquiv              │ │
│  │                                                              │ │
│  │  nếu actual > standard  và  có overtimeMultiplier:           │ │
│  │      gross += (actual − standard) × hourlyEquiv × multiplier │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘

┌─ BƯỚC 2 — PHỤ CẤP CA ĐÊM (nếu có cấu hình) ──────────────────────┐
│  nightHours = số giờ rơi vào [nightShiftStart, nightShiftEnd]     │
│  gross += nightHours × đơn giá giờ × (nightShiftMultiplier − 1)   │
└───────────────────────────────────────────────────────────────────┘

┌─ BƯỚC 3 — ĐIỀU CHỈNH ────────────────────────────────────────────┐
│  net = gross                                                      │
│      + Σ amount  (kind ∈ {BONUS, ALLOWANCE})                      │
│      − Σ amount  (kind ∈ {PENALTY, DEDUCTION})                    │
└───────────────────────────────────────────────────────────────────┘

TRẢ VỀ dạng có bóc tách, KHÔNG chỉ một con số:
  { gross, totalBonus, totalPenalty, net, hoursActual, hoursStandard,
    breakdown: PayrollAdjustment[] }
```

**Hai điểm cần chốt:**

1. **`net` âm thì xử lý sao?** Khi tiền phạt vượt lương gốc. Đề xuất: **cho phép âm, kèm cảnh báo đỏ trên UI**. Đừng kẹp về 0 — kẹp là che mất lỗi nhập liệu, mà lỗi nhập liệu chính là nguyên nhân khả dĩ nhất khi con số ra âm.

2. **Trả về đối tượng bóc tách, không trả về một số.** Bạn sẽ luôn cần biết *"tháng này bị trừ 350k vì cái gì"*. Nếu hàm chỉ trả về `net`, đến lúc cần bóc tách phải viết lại toàn bộ. Trả về đủ ngay từ đầu không tốn thêm gì.

---

### 5. Ví dụ đối chiếu — cùng dữ liệu, hai chế độ ra hai kết quả

Tháng 9/2026: làm **160 giờ**, giờ công chuẩn 176, đi muộn 2 lần (50k/lần), thưởng chuyên cần 300k.

| | HOURLY (45.000đ/giờ) | FIXED_MONTHLY (8.000.000đ, `NONE`) | FIXED_MONTHLY (8.000.000đ, `PRO_RATA`) |
|---|---|---|---|
| Lương gốc | 160 × 45.000 = **7.200.000** | **8.000.000** | 8.000.000 × (160/176) = **7.272.727** |
| Thưởng | +300.000 | +300.000 | +300.000 |
| Phạt | −100.000 | −100.000 | −100.000 |
| **Thực nhận** | **7.400.000** | **8.200.000** | **7.472.727** |

Ba con số khác nhau từ cùng một bộ dữ liệu lịch. Đây chính là lý do `mode` và `shortfallPolicy` phải là trường bắt buộc — không có giá trị mặc định nào an toàn.

---

## PHẦN II — SCHEMA CHỐT (`src/types/index.ts`)

Đây là toàn bộ mô hình dữ liệu sau khi vá mọi lỗi trong bản review. Dán thẳng vào dự án được.

```ts
// ═══════════════════════════════════════════════════════════════
//  QUY ƯỚC THỜI GIAN — đọc kỹ trước khi sửa bất cứ gì
//
//  · date        : "YYYY-MM-DD"  giờ treo tường tại địa phương
//  · startTime   : "HH:mm"       giờ treo tường tại địa phương
//  · month       : "YYYY-MM"
//  · createdAt.. : ISO 8601 UTC  ← CHỈ dấu thời gian hệ thống
//
//  KHÔNG lưu lịch dưới dạng UTC timestamp. Ca học 8h sáng phải là
//  8h sáng ở mọi múi giờ. Đổi sang UTC là mọi lịch quá khứ lẫn
//  tương lai đều lệch khi người dùng đổi múi giờ.
//
//  Một sự kiện LUÔN thuộc về ngày của startTime, kể cả khi nó
//  kết thúc sang ngày hôm sau.
// ═══════════════════════════════════════════════════════════════

/** Mọi thực thể kế thừa — bắt buộc, để Phase 7 Cloud Sync khả thi */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;   // tombstone; MỌI truy vấn phải lọc bỏ
}

// ─── Category ──────────────────────────────────────────────────

export interface Category extends BaseEntity {
  name: string;
  color: string;
  textColor?: string;
  defaultRatePerHour?: number;
  isIncomeEligible: boolean;
  isSystem?: boolean;   // true = "Chưa phân loại", không cho xóa
  sortOrder?: number;
}

// ─── Lịch lặp ──────────────────────────────────────────────────

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RecurringRule extends BaseEntity {
  title: string;
  categoryId: string;

  freq: Frequency;
  interval: number;        // mặc định 1; =2 nghĩa là cách một chu kỳ
  daysOfWeek?: number[];   // freq='WEEKLY'. LUÔN theo Date.getDay(), 0=CN
  dayOfMonth?: number;     // freq='MONTHLY'

  startDate: string;
  endDate?: string;        // BAO GỒM ngày này. Bỏ trống = vô hạn
  count?: number;          // hoặc giới hạn theo số lần lặp

  startTime: string;
  durationMinutes: number; // ← thay cho endTime; ca qua đêm không vỡ

  ratePerHour?: number;
  fixedAmount?: number;
  location?: string;
  clientName?: string;     // học sinh / lớp — cho lịch gia sư
  tags?: string[];
  notes?: string;
}

// ─── Ngoại lệ ──────────────────────────────────────────────────

export type ExceptionType =
  | 'CANCEL' | 'MOVE' | 'RESIZE' | 'REPLACE' | 'ADD'
  | 'STATUS';   // MỚI: chỉ đánh dấu trạng thái, không đổi giờ giấc

export type OccurrenceStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ScheduleException extends BaseEntity {
  type: ExceptionType;

  /**
   * recurringRuleId : bỏ trống CHỈ KHI type='ADD'
   * originalDate    : BẮT BUỘC với mọi type TRỪ 'ADD'.
   *                   LUÔN trỏ tới ngày occurrence GỐC do rule sinh ra,
   *                   KHÔNG BAO GIỜ trỏ tới ngày đã dời tới.
   *                   (Nếu không, dời lần hai sẽ tạo chuỗi đệ quy.)
   * newDate         : BẮT BUỘC với type='ADD' và type='MOVE'.
   */
  recurringRuleId?: string;
  originalDate?: string;
  newDate?: string;

  newStartTime?: string;
  newDurationMinutes?: number;
  newTitle?: string;
  newCategoryId?: string;
  newRatePerHour?: number;
  newFixedAmount?: number;

  status?: OccurrenceStatus;   // cho phép thống kê "kế hoạch vs thực tế"
  reason?: string;
}

// ─── Sự kiện đơn lẻ ────────────────────────────────────────────

export interface SingleEvent extends BaseEntity {
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location?: string;
  clientName?: string;
  tags?: string[];
  notes?: string;
  ratePerHour?: number;
  fixedAmount?: number;
  status: OccurrenceStatus;
}

// ─── Lương (xem Phần I) ────────────────────────────────────────

export type SalaryMode = 'HOURLY' | 'FIXED_MONTHLY';
export type ShortfallPolicy = 'NONE' | 'PRO_RATA';
export type AdjustmentKind = 'PENALTY' | 'DEDUCTION' | 'BONUS' | 'ALLOWANCE';

export interface SalaryRule extends BaseEntity {
  categoryId: string;
  mode: SalaryMode;
  effectiveFrom: string;
  effectiveTo?: string;
  ratePerHour?: number;
  baseSalary?: number;
  standardMonthlyHours?: number;
  shortfallPolicy?: ShortfallPolicy;
  overtimeMultiplier?: number;
  nightShiftMultiplier?: number;
  nightShiftStart?: string;
  nightShiftEnd?: string;
  currency: string;
}

export interface PayrollAdjustment extends BaseEntity {
  categoryId: string;
  month: string;
  kind: AdjustmentKind;
  label: string;
  amount: number;          // luôn dương
  date?: string;
  note?: string;
  linkedEventId?: string;
  linkedRuleId?: string;
  linkedOccurrenceDate?: string;
}

// ─── Kết quả tính toán (không lưu DB) ──────────────────────────

/** Một buổi đã được materialize từ rule + exception, hoặc từ SingleEvent */
export interface Occurrence {
  key: string;               // định danh ổn định để React dùng làm key
  sourceType: 'RULE' | 'SINGLE';
  sourceId: string;
  ruleOriginalDate?: string; // occurrence gốc, dùng khi ghi exception

  title: string;
  categoryId: string;
  date: string;              // ngày của startTime
  startTime: string;
  durationMinutes: number;
  endsNextDay: boolean;      // dẫn xuất, tiện cho tầng render

  startAbs: number;          // epoch ms — CHỈ dùng để so trùng & sắp xếp
  endAbs: number;

  status: OccurrenceStatus;
  ratePerHour?: number;
  fixedAmount?: number;
  location?: string;
  clientName?: string;
  notes?: string;

  hasConflict: boolean;
  conflictWith: string[];
}

export interface MonthlyPayroll {
  categoryId: string;
  month: string;
  mode: SalaryMode;
  currency: string;
  hoursActual: number;
  hoursStandard?: number;
  gross: number;
  totalBonus: number;
  totalPenalty: number;
  net: number;
  isNegative: boolean;       // cờ để UI cảnh báo
  adjustments: PayrollAdjustment[];
}

// ─── Cấu hình ──────────────────────────────────────────────────

export interface SystemSettings {
  language: 'vi' | 'en' | 'zh';
  currency: 'VND' | 'USD' | 'CNY';
  weekStartsOn: 0 | 1;       // CHỈ ảnh hưởng thứ tự cột khi render
  theme: 'light' | 'dark' | 'system';
  showConflictAlerts: boolean;
  autoCompletePastOccurrences: boolean;  // buổi đã qua tự tính là hoàn thành
}
```

---

## PHẦN III — CÁC BƯỚC DỰNG PHASE 0

### Bước 1 — Khởi tạo dự án

```bash
npm create vite@latest personal-schedule -- --template react-ts
cd personal-schedule
npm install

# Dữ liệu
npm install dexie dexie-react-hooks uuid

# Giao diện — Tailwind v4 dùng plugin Vite, không còn postcss.config
npm install -D tailwindcss @tailwindcss/vite

# Đa ngôn ngữ — CÀI NGAY, đừng để tới Phase 5
npm install i18next react-i18next

# Kiểm thử
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

`vite.config.ts`:

```ts
// Lưu ý: import defineConfig từ 'vitest/config', KHÔNG phải từ 'vite'.
// Bản của 'vite' không nhận khóa `test` → TypeScript báo lỗi ngay.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', globals: true },
});
```

`src/index.css` — chỉ một dòng, đúng chuẩn Tailwind v4:

```css
@import "tailwindcss";
```

---

### Bước 2 — Cấu trúc thư mục

Ranh giới quan trọng nhất của toàn dự án nằm ở đây:

```
src/
├── types/index.ts          ← toàn bộ schema ở Phần II
│
├── core/                   ← HÀM THUẦN. KHÔNG import React. KHÔNG import Dexie.
│   ├── time.ts             ← cộng phút, đổi giờ treo tường ↔ epoch, ca qua đêm
│   ├── expand.ts           ← (rules, exceptions, events, window) → Occurrence[]
│   ├── conflict.ts         ← Occurrence[] → gắn cờ hasConflict
│   ├── income.ts           ← Occurrence → tiền một buổi (Tầng 1)
│   ├── payroll.ts          ← (category, month, ...) → MonthlyPayroll (Tầng 2)
│   └── __tests__/
│       ├── time.test.ts
│       ├── expand.test.ts
│       └── payroll.test.ts
│
├── db/
│   ├── schema.ts           ← lớp Dexie + chuỗi version()
│   ├── seed.ts             ← Category "Chưa phân loại"
│   └── repo/               ← CRUD; nơi DUY NHẤT được đụng vào db
│
├── hooks/                  ← useCalendar, useIncome, useExceptions
├── i18n/                   ← index.ts + vi.json (en/zh để trống tới Phase 5)
├── components/
└── App.tsx
```

**Quy tắc bất di bất dịch: `core/` không được import bất cứ thứ gì từ `react`, `dexie`, hay `components/`.**

Nó chỉ nhận mảng vào, trả mảng ra. Ba lợi ích:

- Test được bằng Vitest thuần, không cần dựng DOM, chạy trong mili-giây.
- Chính là *"tách logic nghiệp vụ thành Custom Hooks"* mà mục 8.3 yêu cầu, nhưng chặt hơn.
- Phase 7 chuyển sang Cloud DB chỉ phải viết lại `db/`, `core/` không đụng tới một dòng.

Cách kiểm tra ranh giới còn nguyên vẹn — chạy định kỳ:

```bash
grep -rE "from ['\"](react|dexie)" src/core/ && echo "❌ VỠ RANH GIỚI" || echo "✅ OK"
```

---

### Bước 3 — Dexie schema

```ts
// src/db/schema.ts
import Dexie, { type Table } from 'dexie';
import type {
  Category, RecurringRule, ScheduleException,
  SingleEvent, SalaryRule, PayrollAdjustment,
} from '../types';

export class ScheduleDB extends Dexie {
  categories!: Table<Category, string>;
  rules!: Table<RecurringRule, string>;
  exceptions!: Table<ScheduleException, string>;
  events!: Table<SingleEvent, string>;
  salaryRules!: Table<SalaryRule, string>;
  adjustments!: Table<PayrollAdjustment, string>;

  constructor() {
    super('PersonalScheduleDB');

    this.version(1).stores({
      categories:  'id, name, deletedAt',
      rules:       'id, categoryId, startDate, endDate, deletedAt',

      // HAI index dưới đây là thứ khiến MOVE và ADD hoạt động đúng.
      // Thiếu index newDate → buổi đã dời sang tuần khác BIẾN MẤT.
      exceptions:  'id, &[recurringRuleId+originalDate], newDate, recurringRuleId, deletedAt',

      events:      'id, date, categoryId, [date+categoryId], deletedAt',
      salaryRules: 'id, categoryId, effectiveFrom, [categoryId+effectiveFrom], deletedAt',
      adjustments: 'id, [categoryId+month], month, categoryId, deletedAt',
    });

    // Phase sau CHỈ ĐƯỢC thêm version mới. Không bao giờ sửa version(1).
    // this.version(2).stores({...}).upgrade(tx => { ... });
  }
}

export const db = new ScheduleDB();
```

---

### Bước 4 — Truy vấn exception hai chiều

Đây là đoạn sửa lỗi A2. Viết nó ngay Phase 0 để Phase 2 chỉ việc gọi:

```ts
// src/db/repo/exceptions.ts
export async function getExceptionsInWindow(start: string, end: string) {
  const [byOriginal, byNew] = await Promise.all([
    // occurrence bị hủy/sửa TRONG cửa sổ
    db.exceptions.where('originalDate').between(start, end, true, true).toArray(),
    // occurrence từ nơi khác dời VÀO cửa sổ — thiếu vế này là mất dữ liệu
    db.exceptions.where('newDate').between(start, end, true, true).toArray(),
  ]);

  const seen = new Map<string, ScheduleException>();
  for (const e of [...byOriginal, ...byNew]) {
    if (!e.deletedAt) seen.set(e.id, e);
  }
  return [...seen.values()];
}
```

---

### Bước 5 — Seed Category mặc định

```ts
// src/db/seed.ts
export async function seedIfEmpty() {
  if (await db.categories.count() > 0) return;

  const now = new Date().toISOString();
  await db.categories.bulkAdd([
    { id: 'sys-uncategorized', name: 'Chưa phân loại', color: '#94a3b8',
      isIncomeEligible: false, isSystem: true, sortOrder: 999,
      createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Đại học', color: '#3b82f6',
      isIncomeEligible: false, sortOrder: 1, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Rossi', color: '#f59e0b',
      isIncomeEligible: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Gia sư', color: '#10b981',
      isIncomeEligible: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Nghiên cứu', color: '#8b5cf6',
      isIncomeEligible: false, sortOrder: 4, createdAt: now, updatedAt: now },
  ]);
}
```

---

### Bước 6 — `core/time.ts`, viên gạch đầu tiên

Mọi thứ khác dựng trên module này, nên nó phải đúng trước tiên:

```ts
// src/core/time.ts

/** "22:00" → 1320 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 1320 → "22:00"; tự cuộn vòng qua nửa đêm */
export function toHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Giờ treo tường → epoch ms. CHỈ dùng để so trùng lịch và sắp xếp. */
export function toAbsolute(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

/** Ca có vắt qua nửa đêm không */
export function endsNextDay(startTime: string, durationMinutes: number): boolean {
  return toMinutes(startTime) + durationMinutes >= 1440;
}

/** Giờ kết thúc để hiển thị. 22:00 + 240 phút → "02:00" */
export function endTimeOf(startTime: string, durationMinutes: number): string {
  return toHHMM(toMinutes(startTime) + durationMinutes);
}

/** Trùng lịch — BẤT ĐẲNG THỨC NGHIÊM NGẶT.
 *  10:00–12:00 và 12:00–14:00 KHÔNG phải trùng. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
```

---

### Bước 7 — Test ngay, trước khi có giao diện

Đây là điểm kế hoạch gốc bỏ sót hoàn toàn — không Phase nào có hạ tầng test.

```ts
// src/core/__tests__/time.test.ts
import { describe, it, expect } from 'vitest';
import { endTimeOf, endsNextDay, overlaps, toAbsolute } from '../time';

describe('ca qua đêm', () => {
  it('22:00 + 4 giờ ra 02:00, không ra giờ âm', () => {
    expect(endTimeOf('22:00', 240)).toBe('02:00');
    expect(endsNextDay('22:00', 240)).toBe(true);
  });

  it('ca ban ngày không bị đánh dấu qua đêm', () => {
    expect(endTimeOf('08:00', 120)).toBe('10:00');
    expect(endsNextDay('08:00', 120)).toBe(false);
  });

  it('ca kết thúc đúng nửa đêm', () => {
    expect(endTimeOf('22:00', 120)).toBe('00:00');
    expect(endsNextDay('22:00', 120)).toBe(true);
  });
});

describe('phát hiện trùng lịch', () => {
  it('hai ca chạm nhau đúng điểm cuối KHÔNG phải trùng', () => {
    const a = [toAbsolute('2026-09-01', '10:00'), toAbsolute('2026-09-01', '12:00')];
    const b = [toAbsolute('2026-09-01', '12:00'), toAbsolute('2026-09-01', '14:00')];
    expect(overlaps(a[0], a[1], b[0], b[1])).toBe(false);
  });

  it('ca qua đêm trùng với sự kiện sáng sớm hôm sau', () => {
    const night = [toAbsolute('2026-09-01', '22:00'), toAbsolute('2026-09-02', '02:00')];
    const early = [toAbsolute('2026-09-02', '01:00'), toAbsolute('2026-09-02', '03:00')];
    expect(overlaps(night[0], night[1], early[0], early[1])).toBe(true);
  });
});
```

Chạy `npx vitest`. Bảy test này xanh là nền thời gian đã vững — phần khó nhất của toàn dự án đã qua.

---

### Bước 8 — Danh sách nghiệm thu Phase 0

Phase 0 xong khi **tất cả** các mục sau đúng:

- [ ] `npm run dev` chạy, Tailwind v4 hoạt động
- [ ] `src/types/index.ts` đầy đủ, `npx tsc --noEmit` không lỗi
- [ ] Dexie tạo được DB, thấy trong DevTools → Application → IndexedDB
- [ ] `seedIfEmpty()` chạy đúng một lần, có 5 Category
- [ ] `core/time.ts` xong, test xanh hết
- [ ] `grep` ranh giới `core/` trả về ✅
- [ ] i18next khởi tạo, hiển thị được một chuỗi từ `vi.json`
- [ ] `getExceptionsInWindow` viết xong (chưa cần dùng)
- [ ] Commit git đầu tiên

**Chưa cần có ở Phase 0:** bất kỳ màn hình lịch nào, CRUD, hay giao diện. Phase 0 là nền móng — nhìn vào chỉ thấy một trang trắng, và như vậy là đúng.

---

## Tóm tắt thứ tự thi công

```
Bước 1  scaffold + cài gói           ~30 phút
Bước 2  cấu trúc thư mục             ~15 phút
Bước 3  types/index.ts               ~1 giờ   (dán từ Phần II rồi rà lại)
Bước 4  db/schema.ts + repo          ~1 giờ
Bước 5  seed                         ~20 phút
Bước 6  core/time.ts                 ~1 giờ   ← quan trọng nhất
Bước 7  test                         ~1 giờ
Bước 8  i18n + nghiệm thu            ~1 giờ
                                     ─────────
                                     ~6 giờ, gọn trong một cuối tuần
```

Sau đó Phase 1 mới bắt đầu dựng Week View — và lúc đó nó chỉ còn là việc vẽ, vì mô hình dữ liệu đã đúng sẵn.
