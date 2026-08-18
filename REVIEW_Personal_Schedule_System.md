# REVIEW KẾ HOẠCH — PERSONAL SCHEDULE SYSTEM

*Rà soát kỹ thuật trước khi viết dòng code đầu tiên · 18/08/2026*

---

## 0. Đánh giá tổng thể

Kế hoạch này ở trên mức trung bình đáng kể. Bốn quyết định kiến trúc đã đúng và không cần bàn lại:

- **Rule + Exception thay vì sinh bản ghi tĩnh.** Đây chính xác là cách CalDAV và Google Calendar làm. Nếu chọn hướng ngược lại (sinh sẵn hàng nghìn dòng), việc sửa lịch gốc sau này gần như không cứu được.
- **`isIncomeEligible` đặt ở cấp Category kèm bước gating bắt buộc.** Đặt cờ ở cấp hệ thống hay cấp event đều sai; cấp Category là đúng tầng.
- **Cảnh báo trùng lịch không chặn thao tác.** Đúng với thực tế: người dùng cố tình để trùng rồi tự xử.
- **Dòng dữ liệu một chiều, mọi view render từ cùng nguồn.**

Ngoài ra, việc mục 4.2 tự ghi chú lại lỗ hổng của bản kế hoạch trước (event thuộc "Đại học" lỡ điền `ratePerHour` vẫn được cộng thu nhập) và đề xuất khóa ô nhập ở tầng UI như một lớp phòng thủ thứ hai — đó là kỷ luật kỹ thuật tốt.

Phần còn lại của tài liệu này là những chỗ **sẽ gây đập đi làm lại** nếu không sửa trước, xếp theo mức độ nghiêm trọng.

---

## NHÓM A — Mâu thuẫn nội tại & lỗi logic, phải chốt trước Phase 0

### A1. Ca qua đêm làm vỡ công thức thời lượng ⚠️ nghiêm trọng nhất

Mục 4.2: *"Thời lượng sự kiện tính bằng (endTime − startTime)"*.

Với ca `22:00 → 02:00` (ca đêm part-time, hoàn toàn có thật với Rossi hoặc F&B nói chung), phép trừ cho **−20 giờ**. Hệ quả lan ra toàn hệ thống:

| Nơi bị ảnh hưởng | Hỏng như thế nào |
|---|---|
| Thống kê tổng giờ | Cộng số âm → tổng giờ tuần bị trừ đi |
| Thu nhập | `ratePerHour × (−20)` → thu nhập âm |
| Phát hiện trùng lịch | Khoảng `[22:00, 02:00]` không phải khoảng hợp lệ, mọi so sánh giao nhau đều sai |
| Week View | Block vẽ ngược, hoặc chiều cao âm |
| Sự kiện thuộc ngày nào | 02:00 hôm sau tính vào ngày nào cho thống kê tháng? |

**Cách sửa** — chọn một trong hai, nhưng phải chọn ngay ở Phase 0:

```ts
// Phương án 1 (khuyến nghị): lưu thời lượng thay vì giờ kết thúc
startTime: string;        // "22:00"
durationMinutes: number;  // 240
// endTime trở thành giá trị dẫn xuất, không lưu

// Phương án 2: giữ endTime, thêm cờ tường minh
startTime: string;
endTime: string;
endsNextDay?: boolean;    // true khi ca vắt qua nửa đêm
```

Kèm quy ước bắt buộc ghi vào tài liệu: **một sự kiện luôn thuộc về ngày của `startTime`** cho mục đích nhóm và thống kê, dù nó kết thúc sang ngày hôm sau. Week View render nó thành hai block liền mạch.

> Phương án 1 sạch hơn vì loại bỏ hoàn toàn trạng thái không hợp lệ — không thể biểu diễn một ca có thời lượng âm. Phương án 2 dễ nhập liệu hơn cho người dùng nhưng cho phép dữ liệu rác tồn tại.

---

### A2. Exception loại MOVE làm sự kiện biến mất khỏi cửa sổ hiển thị ⚠️

Thuật toán mục 4.1 mở rộng RecurringRule trên khoảng `[start, end]` **rồi mới** áp Exception. Bước áp Exception ngầm định lấy các exception theo `originalDate`.

Xét tình huống: ca ngày **30/08** được MOVE sang **02/09**.

- **Xem tuần 24–30/08:** exception có `originalDate = 30/08` được nạp → CANCEL tại 30/08, chèn vào 02/09 (ngoài cửa sổ, không hiển thị). ✅ Đúng.
- **Xem tuần 01–07/09:** mở rộng rule chỉ sinh các occurrence trong 01–07/09; ngày 30/08 không nằm trong đó. Truy vấn exception theo `originalDate ∈ [01/09, 07/09]` **không bắt được** bản ghi này. → **Ca đã dời biến mất hoàn toàn.** ❌

Người dùng dời một ca sang tuần sau, rồi sang tuần sau mở lịch lên thì không thấy đâu cả. Đây là lỗi im lặng, rất khó lần ra khi đã code xong.

**Cách sửa.** Truy vấn exception phải hai chiều, và Dexie cần index cho cả hai cột:

```ts
// Điều kiện nạp exception cho cửa sổ [start, end]:
//   originalDate ∈ [start, end]   →  các occurrence bị hủy/sửa trong cửa sổ
//   HOẶC newDate ∈ [start, end]   →  các occurrence từ nơi khác dời VÀO cửa sổ

const [fromOriginal, fromNew] = await Promise.all([
  db.exceptions.where('originalDate').between(start, end, true, true).toArray(),
  db.exceptions.where('newDate').between(start, end, true, true).toArray(),
]);
const exceptions = dedupeById([...fromOriginal, ...fromNew]);
```

Bản ghi loại `ADD` cũng chỉ có `newDate`, nên nhánh thứ hai này bắt buộc phải có — không có nó thì **ADD cũng không bao giờ hiển thị**.

---

### A3. Mục 9 mâu thuẫn trực tiếp với kiến trúc ở mục 2 ⚠️

Mục 9, bước 1: *"Tạo bản sao cấu trúc tuần hiện tại làm nền cho tuần sau."*

Bước này là tàn dư của tư duy lưu bản ghi tĩnh, và nó **mâu thuẫn với chính nguyên tắc ở mục 2**. Trong mô hình rule-based, tuần sau **đã tồn tại sẵn** do RecurringRule sinh ra. "Giữ lịch cũ" là hành động **không làm gì cả**.

Nếu ai đó cài đặt bước 1 đúng theo chữ nghĩa, kết quả là mỗi sự kiện tuần sau xuất hiện **hai lần** — một từ rule, một từ bản sao — và bộ phát hiện trùng lịch sẽ báo đỏ toàn bộ tuần.

**Sửa lại mục 9:**

```
1. (Không thao tác) Lịch tuần sau đã do RecurringRule sinh ra sẵn.
2. Sinh ScheduleException loại CANCEL cho ca Thứ 6 20h của tuần đó.
3. Sinh ScheduleException loại ADD cho ca Rossi Thứ 4 sáng.
4. Hiển thị Preview Modal liệt kê hai thay đổi, chờ xác nhận.
5. Ghi vào database; các tuần khác không bị ảnh hưởng.
```

**Liên đới:** mục 7.1 liệt kê *"chức năng Copy Week"* trong nhóm Bắt buộc. Với kiến trúc rule-based, "Copy Week" cần được định nghĩa lại — copy một tuần do rule sinh sang tuần khác cũng do rule sinh sẽ tạo ra nhân bản. Chức năng này chỉ có ý nghĩa khi áp cho **SingleEvent**, hoặc khi hiểu là **Template tuần** (lưu một bộ rule mẫu để áp cho học kỳ mới). Cần chốt là cái nào. Hiện tại nó cũng **không nằm trong Phase nào** ở mục 6.

---

### A4. RecurringRule chỉ biểu diễn được lặp theo tuần

Mục 1.2 hứa: *"Lặp lịch linh hoạt theo ngày, **tuần, tháng** và quy tắc tùy chỉnh."*

Nhưng schema mục 3.2 chỉ có `daysOfWeek: number[]` — thuần túy lặp tuần, chu kỳ cố định 1 tuần. Không biểu diễn được:

- Lặp **hai tuần một lần** (ca luân phiên).
- Lặp **theo tháng** ("ngày 15 hằng tháng", "Thứ 7 đầu tiên của tháng").
- **Tuần chẵn / tuần lẻ** và **khoảng tuần** — cái này quan trọng nhất, vì lịch đại học Việt Nam gần như luôn ghi kiểu *"học tuần 1–8"*, *"tiết 4–6 tuần lẻ"*. Với schema hiện tại, người dùng phải tạo 1 rule rồi bấm CANCEL hàng chục lần.

**Hai hướng sửa:**

```ts
// Hướng tối thiểu — đủ dùng, ít việc
freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
interval: number;              // mặc định 1; =2 nghĩa là cách một chu kỳ
daysOfWeek?: number[];         // dùng khi freq='WEEKLY'
dayOfMonth?: number;           // dùng khi freq='MONTHLY'
count?: number;                // số lần lặp, thay thế cho endDate
```

```ts
// Hướng chuẩn hóa — nhiều việc hơn nhưng lãi về sau
rrule: string;   // chuỗi RFC 5545, vd "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"
```

Hướng thứ hai đáng cân nhắc nghiêm túc: nó cho **xuất/nhập file .ics miễn phí** (đồng bộ sang Google Calendar, Apple Calendar), và Phase 7 đã có mục tiêu Cloud Sync — lúc đó chuẩn RRULE là thứ mọi hệ thống lịch đều hiểu. Thư viện `rrule` trên npm xử lý phần mở rộng, dù bản mới nhất (2.8.1) đã phát hành từ 11/2023 nên cần chấp nhận là nó ổn định chứ không còn phát triển tích cực.

---

### A5. Mục 2 và mục 3 nói ngược nhau về cách lưu thời gian

- **Mục 2:** *"thời gian tính theo mốc giờ thực tế (ISO/Timestamp), không gò vào 3 ca Sáng/Chiều/Tối."*
- **Mục 3.2 / 3.4:** `startTime: string; // "HH:mm"` và `date: string; // "YYYY-MM-DD"` — tức là **giờ treo tường (wall-clock)**, không phải timestamp.

Hai chỗ này mâu thuẫn. Điều đáng nói là **schema mới đúng**, còn câu chữ ở mục 2 sai.

Với ứng dụng lịch cá nhân, giờ treo tường là lựa chọn chính xác: một ca học 8h sáng là 8h sáng, bất kể múi giờ hay quy ước giờ mùa hè. Nếu lưu thành UTC timestamp, người dùng bay sang Đài Bắc là toàn bộ lịch trong quá khứ lẫn tương lai dịch đi một giờ — sai hoàn toàn.

**Sửa:** viết lại câu ở mục 2 thành *"thời gian lưu theo giờ treo tường tại địa phương (`YYYY-MM-DD` + `HH:mm`), quy đổi sang timestamp chỉ ở tầng tính toán và hiển thị; không gò vào 3 ca Sáng/Chiều/Tối."*

Ý định thật của câu gốc là **không hard-code khung giờ cố định** — điều đó vẫn giữ nguyên. Nhưng nếu để nguyên chữ "ISO/Timestamp", sáu tháng nữa sẽ có người (kể cả chính bạn) đọc lại và "sửa cho đúng chuẩn" thành UTC, rồi phá vỡ toàn bộ.

---

## NHÓM B — Lỗ hổng mô hình dữ liệu

### B1. Không có cách đánh dấu "buổi này tôi đã đi làm rồi"

Mục 5 hứa Statistics sẽ *"so sánh thu nhập **kế hoạch vs thực tế**"*. Nhưng với mô hình hiện tại, **con số thực tế không tồn tại**:

- `SingleEvent` có `status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'` ✅
- Occurrence sinh từ `RecurringRule` — **không có trường status nào cả** ❌

Mà phần lớn thu nhập (ca Rossi, buổi gia sư) đến từ lịch lặp. Nghĩa là tính năng đã hứa ở mục 5 hiện **không tính được**.

**Cách sửa nhẹ nhất** — thêm trường vào ScheduleException và cho nó tồn tại độc lập với `type`:

```ts
export interface ScheduleException {
  // ...
  status?: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
}
```

Nghĩa là: đánh dấu một buổi lặp là "đã hoàn thành" sinh ra một exception chỉ mang `status`, không đổi giờ giấc gì. Thống kê "kế hoạch" đếm toàn bộ occurrence; "thực tế" chỉ đếm những occurrence có `status = 'COMPLETED'`.

Cần chốt thêm một quy tắc: **occurrence chưa được đánh dấu thì tính là gì?** Đề xuất: đã qua thời điểm hiện tại thì mặc định coi là hoàn thành (đỡ phải bấm mỗi ngày), chưa tới thì là kế hoạch.

---

### B2. `Category.defaultRatePerHour` là trường chết

Trường này có trong schema mục 3.1 nhưng **không xuất hiện ở bất kỳ đâu trong chuỗi ưu tiên tính thu nhập ở mục 4.2**. Nó sẽ vĩnh viễn không được đọc.

**Chuỗi ưu tiên đầy đủ nên là:**

```
0. Category.isIncomeEligible === false  →  income = 0  (GATING, dừng luôn)
1. event.fixedAmount        có    →  income = fixedAmount
2. event.ratePerHour        có    →  income = ratePerHour × hours
3. SalaryRule(category, tháng) có →  income = calculatedHourlyRate × hours
4. Category.defaultRatePerHour có →  income = defaultRatePerHour × hours
5. còn lại                        →  income = 0
```

Lưu ý bổ sung: khi occurrence được materialize từ `RecurringRule` + `ScheduleException`, các trường `newRatePerHour` / `newFixedAmount` của exception phải **ghi đè** giá trị của rule **trước khi** chạy chuỗi ưu tiên. Nghĩa là chuỗi trên chạy trên event đã hợp nhất, không phải trên rule gốc. Mục 4.2 chưa nói điều này.

---

### B3. `SalaryRule` mơ hồ giữa hai mô hình lương khác hẳn nhau

```ts
calculatedHourlyRate = baseSalary / standardMonthlyHours
```

Rồi thu nhập tháng = `calculatedHourlyRate × số giờ thực tế`. Đây là mô hình **lương giờ chia đều (pro-rata)**:

- Chuẩn 200h, làm 100h → nhận **một nửa** lương cơ bản.
- Chuẩn 200h, làm 250h → nhận **125%** lương cơ bản.

Nhưng nếu Rossi trả **lương khoán cố định**, thì thu nhập tháng = `baseSalary`, bất kể làm bao nhiêu giờ, và công thức trên sai hoàn toàn. Hai mô hình này khác nhau về bản chất còn tài liệu không nói rõ là cái nào.

**Cần bổ sung:**

```ts
export interface SalaryRule {
  // ...
  mode: 'PRO_RATA' | 'FIXED_MONTHLY';   // chốt rõ mô hình
  overtimeMultiplier?: number;          // hệ số ngoài giờ, vd 1.5
  nightShiftMultiplier?: number;        // phụ cấp ca đêm — liên quan trực tiếp tới A1
  // Validate bắt buộc: standardMonthlyHours > 0
  //   (nếu = 0 → chia cho 0 → Infinity → NaN lan ra toàn bộ báo cáo)
}
```

Phụ cấp ca đêm và hệ số ngày lễ (luật lao động VN quy định 300% ngày lễ tết) có thể nằm ngoài phạm vi — nhưng nên là **quyết định có ý thức**, ghi vào tài liệu là "cố tình không làm", chứ không phải bỏ sót.

Thêm một ràng buộc UI: không cho tạo `SalaryRule` cho Category có `isIncomeEligible = false` — nó vô nghĩa và gây nhầm lẫn.

---

### B4. Thiếu `createdAt` / `updatedAt` / `deletedAt` — Phase 7 sẽ trả giá

Phase 7 đặt mục tiêu **Cloud Sync đa thiết bị real-time**. Đồng bộ hai chiều mà không có dấu thời gian sửa đổi thì **không có cách nào giải quyết xung đột**: máy A sửa một event, máy B cũng sửa event đó, khi gặp nhau hệ thống không biết bản nào mới hơn.

Xóa cũng vậy: nếu máy A xóa một event và máy B chưa biết, lần đồng bộ sau máy B sẽ "khôi phục" nó — event xóa rồi cứ sống lại. Cần **tombstone** (`deletedAt` thay vì xóa thật).

Thêm ba trường này ở Phase 0 tốn gần như không có gì. Retrofit ở Phase 7 nghĩa là migrate toàn bộ dữ liệu đã tích lũy và sửa mọi hàm ghi:

```ts
interface BaseEntity {
  id: string;
  createdAt: string;   // ISO timestamp — chỗ này thì ISO thật, khác với giờ lịch
  updatedAt: string;
  deletedAt?: string;  // tombstone; mọi truy vấn phải lọc bỏ
}
```

Đây là loại chi phí "trả bây giờ 1 đồng, trả sau 100 đồng".

---

### B5. Ràng buộc thiếu trong `ScheduleException`

**Ba vấn đề riêng biệt:**

1. **`newDate` phải bắt buộc với loại `ADD`.** Schema hiện để cả `originalDate?` lẫn `newDate?` là optional, nên tồn tại được một bản ghi ADD **không có ngày nào cả** — dữ liệu mồ côi, không bao giờ hiển thị, không bao giờ xóa được qua UI.

2. **Không có ràng buộc duy nhất trên `[recurringRuleId, originalDate]`.** Hiện tại có thể có đồng thời một CANCEL và một MOVE cho cùng một buổi. Mục 4.1 quy định thứ tự áp dụng theo *loại*, nhưng đó không phải là bảo đảm tính duy nhất. Cần index unique trong Dexie và ngữ nghĩa **upsert** (ghi đè) thay vì thêm mới.

3. **MOVE nhiều lần — `originalDate` neo vào đâu?** Cần quy ước dứt khoát: `originalDate` **luôn** trỏ tới ngày occurrence gốc do rule sinh ra, **không bao giờ** trỏ tới ngày đã dời tới. Nếu không, dời lần hai sẽ tạo chuỗi exception nối nhau và logic mở rộng lịch phải truy vết đệ quy — rất dễ sinh vòng lặp vô hạn.

Cấu hình Dexie tương ứng:

```ts
db.version(1).stores({
  categories:  'id, name',
  rules:       'id, categoryId, startDate',
  exceptions:  'id, &[recurringRuleId+originalDate], newDate, recurringRuleId',
  events:      'id, date, categoryId, [date+categoryId]',
  salaryRules: 'id, &[categoryId+month]',
});
```

---

### B6. Không biểu diễn được "sửa từ buổi này trở đi"

Khi người dùng kéo một buổi lặp trong Week View, UI buộc phải hỏi ba lựa chọn quen thuộc:

| Lựa chọn | Mô hình hiện tại hỗ trợ? |
|---|---|
| Chỉ buổi này | ✅ sinh một Exception |
| **Từ buổi này trở đi** | ❌ **không biểu diễn được** |
| Toàn bộ chuỗi | ✅ sửa thẳng RecurringRule |

Lựa chọn giữa — thực tế là **cái được dùng nhiều nhất** (đổi ca cố định từ tháng sau, đổi giờ dạy từ giữa học kỳ) — đòi hỏi **tách rule**: đặt `endDate` cho rule cũ ngay trước ngày đó, rồi tạo rule mới từ ngày đó với thuộc tính đã sửa, đồng thời di chuyển các exception liên quan sang rule mới. Toàn bộ nghiệp vụ này không được nhắc ở đâu trong kế hoạch.

Không nhất thiết phải làm ở Phase 2, nhưng phải **ghi vào tài liệu** để lúc thiết kế UI kéo-thả không bị bất ngờ.

---

### B7. Các thiếu sót nhỏ hơn nhưng vẫn nên chốt

| # | Vấn đề | Đề xuất |
|---|---|---|
| a | **Chưa seed Category mặc định.** Mục 8.1 yêu cầu xóa Category thì đưa event về "danh mục mặc định", nhưng danh mục đó không tồn tại trong kế hoạch. | Seed sẵn "Chưa phân loại" từ Phase 0, không cho xóa, `isIncomeEligible = false`. |
| b | **`endDate` của RecurringRule: bao gồm hay không bao gồm ngày cuối?** Không nói. | Chốt **inclusive**, ghi vào comment. Lỗi lệch một ngày kinh điển. |
| c | **Trùng lịch phải dùng bất đẳng thức nghiêm ngặt.** Ca 10:00–12:00 và 12:00–14:00 **không** phải trùng. | `aStart < bEnd && bStart < aEnd`. Và sau A1, phải so trên trục timestamp tuyệt đối chứ không phải chuỗi `"HH:mm"`. |
| d | **Trùng lịch chỉ so trong cùng một ngày** (mục 4.1) → ca 22:00–02:00 và sự kiện 01:00 hôm sau không bị phát hiện. | Sau khi sửa A1, so trên khoảng thời gian tuyệt đối, mở rộng cửa sổ so sánh ±1 ngày. |
| e | **`daysOfWeek` quy ước 0–6 vs `weekStartsOn: 0\|1`.** Dễ lẫn giữa lưu trữ và hiển thị. | Ghi rõ: lưu trữ **luôn** dùng `Date.getDay()` (0 = Chủ nhật); `weekStartsOn` **chỉ** ảnh hưởng thứ tự cột khi render. |
| f | **`currency` là một giá trị toàn hệ thống.** Nếu vừa có thu nhập VND (Rossi) vừa có USD (freelance), một trường duy nhất không biểu diễn nổi. | Hoặc đưa `currency` xuống cấp Category, hoặc ghi rõ đây là **đơn tiền tệ, chỉ để hiển thị ký hiệu, không quy đổi**. |
| g | **Gia sư theo học sinh nhưng không có thực thể học sinh.** Mục 1.1 nói *"buổi dạy theo học sinh hoặc nhóm, đơn giá theo giờ"*. Ép mỗi học sinh thành một Category sẽ làm bảng màu và bộ lọc loạn hết. | Thêm `clientName?: string` hoặc `tags?: string[]` vào rule/event. Nhẹ, đủ để nhóm và lọc. |
| h | **Backup JSON không có số phiên bản schema.** Qua 8 phase, bản backup Phase 4 phục hồi ở Phase 6 sẽ vỡ. | `{ schemaVersion, exportedAt, data: {...} }` + hàm migrate lúc import. Chốt luôn: import là **ghi đè** hay **hợp nhất**, và xử lý trùng ID thế nào. |
| i | **Không có kế hoạch migration cho Dexie.** Schema chắc chắn đổi qua 8 phase. | Dùng chuỗi `db.version(n).stores({...}).upgrade(tx => ...)` ngay từ đầu, không bao giờ sửa version cũ. |
| j | **Đổi `isIncomeEligible` làm thống kê quá khứ đổi theo.** Tháng 7 đang là 5tr, bật cờ xong thành 3tr. | Chấp nhận được với app cá nhân, nhưng nên hiển thị cảnh báo nêu rõ điều này (mục 8.1 mới cảnh báo về mất dữ liệu rate, chưa nói về thống kê quá khứ). |
| k | **`SingleEvent.status = 'CANCELLED'` có được tính vào thống kê không?** Không nói. | Chốt: không tính vào giờ và thu nhập; vẫn hiển thị trên lịch dạng mờ/gạch ngang. |

---

## NHÓM C — Vấn đề về lộ trình

### C1. Undo là nguyên tắc cốt lõi nhưng không nằm trong Phase nào

Mục 2 đặt *"Toàn vẹn và hoàn tác dữ liệu"* thành một trong năm nguyên tắc thiết kế cốt lõi. Nhưng rà toàn bộ bảng Phase ở mục 6: **không có hạng mục Undo nào**. Phase 4 chỉ có Export/Import JSON — đó là sao lưu, không phải hoàn tác.

Undo trên IndexedDB không hề nhẹ: cần một stack lệnh với thao tác nghịch đảo cho từng loại ghi, và phải quyết định undo có xuyên qua reload trang hay không.

**Chọn một:** đưa vào Phase 1 (làm đúng ngay từ đầu, vì mọi hàm ghi đều phải đi qua lớp command), hoặc hạ nguyên tắc ở mục 2 xuống thành *"khôi phục được từ bản sao lưu JSON"* và bỏ chữ Undo. Để nguyên như hiện tại là tự lừa mình.

---

### C2. i18n xếp ở Phase 5 nhưng ảnh hưởng từ Phase 1

Mục 8.3 quy định UI hiển thị tiếng Việt. Phase 5 mới tích hợp i18n (vi/en/zh).

Nghĩa là qua bốn phase, toàn bộ chuỗi tiếng Việt nằm rải rác hard-code trong mọi component. Đến Phase 5 phải quét lại từng file, bóc từng chuỗi ra — công việc vừa nhàm vừa dễ sót, và sót thì lộ ra rất khó chịu (nút thì tiếng Anh, tooltip vẫn tiếng Việt).

**Đề xuất:** cài `i18next` + `react-i18next` ngay Phase 0/1, viết `t('week.title')` từ đầu, chỉ điền bộ `vi`. Đến Phase 5 công việc còn lại thuần túy là **dịch**, không phải **refactor**. Chi phí thêm ở Phase 1 gần như bằng không.

Kèm theo: dùng `Intl.DateTimeFormat` và `Intl.NumberFormat` ngay từ đầu thay vì tự nối chuỗi ngày tháng. VND không có phần thập phân, USD/CNY có hai chữ số — `Intl.NumberFormat` xử lý sẵn.

---

### C3. Phase 6 (NLP) phụ thuộc hạ tầng của Phase 7

Phase 6 dự kiến *"tích hợp LLM API để phân tích lệnh thời gian"*. Nhưng ứng dụng đến Phase 6 vẫn thuần client-side.

**API key không thể nằm an toàn trong ứng dụng client-side** — nó sẽ nằm trong bundle JavaScript, ai mở DevTools cũng đọc được. Muốn gọi LLM API đúng cách cần một backend proxy, mà backend lại là Phase 7. Tức là **thứ tự phase đang mâu thuẫn với phụ thuộc kỹ thuật**.

**Hai lối ra:**

1. Người dùng tự dán API key của mình vào phần Cài đặt, lưu trong IndexedDB. Hoàn toàn chấp nhận được với một công cụ cá nhân chỉ mình dùng — nhưng phải **ghi rõ vào kế hoạch** rằng đây là lựa chọn có ý thức, kèm cảnh báo không được deploy public.
2. Đẩy một backend proxy tối thiểu lên trước, nhập vào Phase 6.

Thêm ba yêu cầu cho luồng NLP mà kế hoạch chưa nói: (a) phải nạp lịch hiện tại làm ngữ cảnh cho model; (b) phải giải nghĩa từ tương đối — "tuần sau", "thứ 6 tới" — dựa trên ngày hôm nay, và cần chốt "tuần sau" bắt đầu từ thứ Hai hay từ hôm nay + 7; (c) Preview Modal phải cho **từ chối từng thay đổi một**, không phải chỉ có nút Đồng ý/Hủy cho cả gói.

---

### C4. Không có framework kiểm thử trong bất kỳ Phase nào

Mục 8.1 liệt kê các ràng buộc toàn vẹn dữ liệu cần kiểm tra, nhưng mục 6 không có phase nào đặt hạ tầng test.

Thuật toán mở rộng lịch lặp + hợp nhất Exception là **hàm thuần** (pure function): vào là `(rules, exceptions, events, window)`, ra là danh sách occurrence. Đây đúng là loại code bắt buộc phải có unit test — logic phức tạp, nhiều ca biên, và **sai thì im lặng** chứ không văng lỗi.

**Đề xuất:** Phase 2 giao kèm bộ test Vitest cho engine. Các ca tối thiểu phải phủ:

- Ca qua đêm (A1) — thời lượng, ngày sở hữu, trùng lịch.
- MOVE ra ngoài cửa sổ hiển thị rồi xem từ phía bên kia (A2).
- MOVE xuyên tháng, xuyên năm.
- CANCEL đúng ngày `startDate` và đúng ngày `endDate` của rule.
- ADD không gắn rule.
- Rule có `endDate` rơi vào giữa tuần đang xem.
- Hai sự kiện chạm nhau đúng điểm cuối (không được báo trùng).
- Rule bị xóa nhưng exception còn sót (8.1).
- Tháng 2 năm nhuận, và tháng có 5 ngày thứ Sáu.

Khoảng 30 test, viết một buổi. Chúng sẽ bắt lỗi suốt cả năm sau đó.

---

### C5. Timeline 10 tuần không thực tế

Mục 1.1 cho biết người dùng đồng thời: đi học đại học, đi làm ca, dạy gia sư, và làm nghiên cứu. Trong khi đó lộ trình đặt Phase 0→6 gọn trong 10 tuần.

Riêng Phase 2 — thuật toán mở rộng RecurringRule + giao diện CANCEL/MOVE/RESIZE/ADD + phát hiện trùng lịch — gói trong 2 tuần là căng nhất. Phần kéo-thả trên lưới thời gian (Phase 5) cũng thường ngốn nhiều hơn dự kiến gấp đôi.

Ước lượng thực tế cho một người làm bán thời gian: **4–6 tháng** cho tới hết Phase 6.

Đây không phải chê thiết kế. Nhưng một lộ trình không thực tế sẽ khiến bạn cảm thấy mình đang thất bại trong khi thực ra đang tiến triển bình thường — và đó là lý do phổ biến nhất khiến các dự án cá nhân bị bỏ giữa chừng. Đặt mốc trung thực ngay từ đầu thì dễ đi đường dài hơn.

---

## NHÓM D — Rủi ro thư viện (đã kiểm chứng ngày 18/08/2026)

### D1. `html2canvas` + Tailwind v4 = crash ngay lập tức ⚠️

Đây là quả mìn cụ thể nhất trong kế hoạch, vì nó nổ ngay lần chạy đầu tiên.

| Thư viện | Bản mới nhất | Phát hành lần cuối |
|---|---|---|
| `html2canvas` | 1.4.1 | **22/01/2022** — hơn 4 năm rưỡi không có bản mới |
| `tailwindcss` | 4.3.3 | đang phát triển tích cực |

Tailwind v4 dùng **`oklch()`** làm định dạng màu mặc định cho toàn bộ bảng màu. `html2canvas` 1.4.1 không hiểu hàm màu này và ném lỗi:

```
Error: Attempting to parse an unsupported color function "oklch"
```

Cài `npm create vite` + Tailwind hôm nay là ra thẳng v4. Nghĩa là Phase 4 sẽ chết ngay lần thử xuất PNG đầu tiên.

**Ba lựa chọn, xếp theo mức khuyến nghị:**

1. **`html2canvas-pro`** — bản fork có hỗ trợ `oklch()`, `lab()`, `lch()`, `color()`. Phiên bản 2.3.9, vừa cập nhật hôm nay, ~150 nghìn lượt tải mỗi tuần. API tương thích ngược nên chỉ cần đổi dòng import.
2. **`html-to-image`** — cách tiếp cận khác (SVG foreignObject thay vì vẽ lại canvas), chất lượng chữ thường tốt hơn. Bản 1.11.13 (04/2025). Đổi API một chút.
3. Ghim Tailwind v3, hoặc ghi đè toàn bộ bảng màu về HEX/RGB. Chống được lỗi nhưng là bơi ngược dòng.

### D2. `jspdf` + ảnh raster cho ra bản PDF A4 chữ mờ

Cách làm phổ biến — chụp DOM thành PNG rồi nhét PNG vào jsPDF — cho ra chữ **raster**. In A4 ra giấy sẽ thấy răng cưa, và không bôi đen copy được chữ trong file PDF.

**Cân nhắc `window.print()` + stylesheet `@media print`:** chữ giữ nguyên dạng vector, sắc nét, chọn/copy được, hỗ trợ ngắt trang tự nhiên, và **ít code hơn hẳn**. Người dùng bấm in rồi chọn "Save as PDF" — mọi trình duyệt đều có sẵn.

Chỉ cần jsPDF khi bắt buộc phải sinh file PDF **không qua tương tác người dùng** (ví dụ xuất hàng loạt). Với công cụ cá nhân, gần như chắc chắn không cần.

### D3. Nên dùng `useLiveQuery` của Dexie — kế hoạch chưa nhắc

Dexie 4.4.5 đang được cập nhật tích cực (bản mới nhất 14/08/2026). Hook `useLiveQuery` cho phép component **tự động re-render khi dữ liệu trong IndexedDB đổi**, bỏ được toàn bộ phần quản lý trạng thái tải/đồng bộ thủ công.

Điều này liên quan trực tiếp tới mục 8.2: `useMemo`/`useCallback` chỉ giải quyết được việc tính lại thừa, nhưng rủi ro hiệu năng thật nằm ở chỗ khác — **mở rộng lại toàn bộ rule sau mỗi lần gõ phím trong ô lọc**. Nên memo hóa theo khóa `(cửa sổ thời gian, phiên bản rules, phiên bản exceptions)` chứ không phải theo từng tham số rời rạc.

---

## Phụ lục — Checklist sửa tài liệu

Sắp theo thứ tự nên xử lý:

**Trước khi mở editor (chốt trên giấy):**

- [ ] A1 — Chọn `durationMinutes` hay `endsNextDay`. Ghi quy tắc "sự kiện thuộc ngày của startTime".
- [ ] A5 — Sửa câu ISO/Timestamp ở mục 2 thành giờ treo tường.
- [ ] A4 — Chốt `freq`/`interval`/`dayOfMonth`, hay đi thẳng RRULE.
- [ ] B3 — Chốt Rossi trả lương khoán hay lương giờ pro-rata.
- [ ] A3 — Viết lại mục 9 bỏ bước "tạo bản sao tuần". Định nghĩa lại "Copy Week" ở 7.1 hoặc bỏ khỏi nhóm Bắt buộc.
- [ ] C1 — Quyết định: làm Undo (đưa vào Phase 1) hay bỏ khỏi nguyên tắc mục 2.
- [ ] C5 — Đặt lại mốc thời gian trung thực.

**Sửa vào schema ở Phase 0:**

- [ ] B4 — Thêm `createdAt` / `updatedAt` / `deletedAt` cho mọi entity.
- [ ] B1 — Thêm `status` vào ScheduleException.
- [ ] B5 — `newDate` bắt buộc với ADD; unique index `[recurringRuleId+originalDate]`; quy ước originalDate neo vào occurrence gốc.
- [ ] B2 — Viết lại chuỗi ưu tiên thu nhập 6 bước ở mục 4.2, nói rõ chạy trên event đã hợp nhất.
- [ ] B7a — Seed Category "Chưa phân loại".
- [ ] B7b — Chốt `endDate` là inclusive.
- [ ] B7g — Thêm `clientName` / `tags` cho lịch gia sư.
- [ ] B7i — Thiết lập chuỗi `db.version()` của Dexie.

**Sửa vào thuật toán ở Phase 2:**

- [ ] A2 — Truy vấn exception hai chiều (`originalDate` HOẶC `newDate`).
- [ ] B7c/B7d — Bất đẳng thức nghiêm ngặt + so trùng trên trục thời gian tuyệt đối.
- [ ] B6 — Ghi nhận nghiệp vụ "từ buổi này trở đi" (tách rule), kể cả khi chưa làm ngay.
- [ ] C4 — Dựng Vitest, viết bộ test cho engine.

**Đổi quyết định công nghệ:**

- [ ] D1 — Thay `html2canvas` bằng `html2canvas-pro`.
- [ ] D2 — Cân nhắc `window.print()` thay `jspdf`.
- [ ] D3 — Dùng `useLiveQuery` của Dexie.
- [ ] C2 — Cài i18next ngay Phase 0/1.
- [ ] C3 — Chốt cách xử lý API key cho Phase 6.
- [ ] B7h — Thêm `schemaVersion` vào backup JSON.

---

## Kết luận

Kiến trúc nền không cần thay đổi — Rule + Exception, gating thu nhập ở cấp Category, dòng dữ liệu một chiều đều đúng.

Ba việc đáng sửa nhất, theo thứ tự:

1. **A1 — ca qua đêm.** Sửa sau khi đã code xong Phase 3 nghĩa là đụng vào mọi công thức tính giờ, tính tiền, và phát hiện trùng lịch cùng lúc.
2. **A2 — MOVE xuyên cửa sổ.** Lỗi im lặng, mất dữ liệu trước mắt người dùng, và rất khó lần ra nguồn gốc khi phát hiện muộn.
3. **B4 — dấu thời gian sửa đổi.** Miễn phí hôm nay, đắt kinh khủng ở Phase 7.

Cả ba đều là loại lỗi thiết kế chứ không phải lỗi cài đặt — nghĩa là sửa trên giấy mất một buổi, sửa trong code mất vài tuần.

---

### Nguồn tham khảo

- [html2canvas #3269 — lỗi oklch với Tailwind CSS v4](https://github.com/niklasvh/html2canvas/issues/3269)
- [html2canvas #3150 — unsupported color function "oklch"](https://github.com/niklasvh/html2canvas/issues/3150)
- [html2canvas-pro trên npm — hỗ trợ lab/lch/oklch](https://www.npmjs.com/package/html2canvas-pro)
- [yorickshan/html2canvas-pro trên GitHub](https://github.com/yorickshan/html2canvas-pro)
- [So sánh dom-to-image / html-to-image / html2canvas](https://npm-compare.com/dom-to-image,html-to-image,html2canvas)

*Phiên bản và ngày phát hành các gói npm được kiểm chứng trực tiếp qua `npm view` ngày 18/08/2026.*
