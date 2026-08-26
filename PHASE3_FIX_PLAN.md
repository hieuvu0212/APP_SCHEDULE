# Kế hoạch sửa Phase 3 — Client Entity

> Đặc tả để thi công. Không phải mã nguồn.
> Trạng thái xuất phát: nhánh `test`, commit `f254b70`. Bốn trên sáu cổng chặn đang đỏ.
>
> **✅ ĐÃ THI CÔNG XONG (A–F).** Sáu trên sáu cổng chặn xanh, 525 bài test qua.
> Hai việc *không* nằm trong kế hoạch này và vẫn còn mở, đã ghi ở README mục
> "Trạng thái dự án": Web Push mới có khung chưa nối, và tên thuần chữ Hán
> chưa sinh được id tất định.

---

## 0. Hai nguyên tắc giải thích gần hết danh sách bên dưới

**Nguyên tắc 1 — Bản ghi do hệ thống tự sinh trên nhiều máy phải có ID TẤT ĐỊNH.**

Đây là bài học đã trả giá hai lần trong dự án này:

| Lần | Biểu hiện |
|---|---|
| Danh mục mặc định dùng `newId()` | "Gia sư" nhân thành 3 |
| Migration v3 dùng `Math.random()` cho client | "Gia" thành 2, tiền thu tách làm 2 dòng |

Hai máy cùng migrate cùng một cái tên phải cho ra **cùng một id**. Nếu không, đồng bộ coi chúng là hai thực thể và không có cách nào biết chúng là một.

**Nguyên tắc 2 — Bảng mới phải vào ĐỦ bốn nơi, cùng một lần thay đổi.**

`clients` hiện chỉ tồn tại trong Dexie. Thiếu ba nơi còn lại:

```
src/db/schema.ts          ✅ đã có
src/core/backup.ts        ✅ BACKUP_TABLES (đứng sau categories, trước rules)
src/db/tables.ts          ✅ tableOf() + ALL_TABLES
supabase_schema.sql       ✅ CREATE TABLE + RLS + khóa ngoại ghép
```

Hệ quả đã kiểm chứng bằng cách chạy thật: **xuất sao lưu rồi khôi phục là mất sạch tên đối tượng.**

---

## A. Đưa `clients` vào vòng đời dữ liệu

> Mức độ: **chặn merge**. Đây là lỗi mất dữ liệu.

### A1. `src/core/backup.ts`

Thêm `'clients'` vào `BACKUP_TABLES`.

⚠️ **Vị trí trong mảng có ý nghĩa.** `syncWithCloud()` đẩy theo đúng thứ tự này, và Supabase có khóa ngoại. `clients` phải đứng **trước** `rules`, `events`, `payments`. Đặt ngay sau `categories`:

```
categories, clients, rules, exceptions, events, salaryRules, adjustments, adjustmentTemplates, payments
```

### A2. `src/db/tables.ts`

Thêm `clients: db.clients` vào map trong `tableOf()`, và `db.clients` vào `ALL_TABLES`.

`ALL_TABLES` dùng cho giao dịch chạy trên toàn bộ — thiếu nó thì `importBackup` chế độ `replace` sẽ ghi clients **ngoài** giao dịch, và đứt giữa chừng để lại lịch trỏ tới client không tồn tại.

Thêm vào đây cũng tự động cho `clients` vào **Thùng rác** (`listTrash` duyệt `BACKUP_TABLES`) — đúng ý muốn.

### A3. `supabase_schema.sql`

**Bảng mới** `public.clients`, theo đúng khuôn của các bảng khác:

- khóa chính ghép `(user_id, id)`
- mọi cột thời gian là `text` (lý do ở đầu file SQL — `mergeById` so chuỗi)
- `name text NOT NULL`, `email/phone/note text`
- RLS `FOR ALL USING (auth.uid() = user_id) WITH CHECK (…)`
- index `(user_id, updated_at)` cho đồng bộ gia tăng

**Cột mới trên bảng cũ** — đây là 4 lỗi mà `check:cloud` đang báo:

| Bảng | Thêm | Khóa ngoại |
|---|---|---|
| `rules` | `client_id text` | `(user_id, client_id) → clients(user_id, id)` |
| `events` | `client_id text` | như trên |
| `exceptions` | `new_client_id text` | như trên |
| `payments` | `client_id text` | như trên |

**Cột cũ phải xử lý, không được bỏ mặc:**

`payments.client_key` và `payments.client_label` đang là **`NOT NULL`**. `Payment` không còn `clientKey`, nên `toCloud()` sẽ gửi `null` → vi phạm ràng buộc → **bảng payments không bao giờ đồng bộ được**. Bắt buộc phải bỏ `NOT NULL` hoặc bỏ hẳn cột.

Khuyến nghị: **bỏ hẳn** `client_key`, và **giữ** `client_label` dạng nullable như bản dự phòng đọc được (xem C3). `rules.client_name` và `events.client_name` cũng bỏ.

⚠️ Bỏ cột trên bảng đã có dữ liệu là `ALTER TABLE … DROP COLUMN`, không phải sửa `CREATE TABLE`. File SQL dùng `CREATE TABLE IF NOT EXISTS` nên chạy lại **không** đổi bảng đang tồn tại. Cần một khối `ALTER TABLE` riêng, hoặc chạy khối `DROP` ở đầu file để dựng lại từ đầu (chấp nhận được vì đám mây chỉ là bản đối chiếu, dữ liệu gốc nằm ở máy).

### A4. `scripts/check-cloud-schema.mjs`

Thêm `clients: 'Client'` vào `TABLE_TO_INTERFACE`.

Không thêm thì cổng chặn **không biết bảng đó tồn tại** và sẽ báo xanh trong khi lược đồ vẫn thiếu — đúng loại "cổng xanh vì chẳng làm gì" mà README cảnh báo.

### A5. Kiểm chứng

`npm run check:cloud` phải xanh và báo **9 bảng**.

Viết một bài test khứ hồi sao lưu (`src/db/__tests__/backup.integration.test.ts`):
tạo client + rule trỏ tới nó → `exportBackup` → `clear` → `importBackup('replace')` → khẳng định tra được tên client từ `rule.clientId`.

Bài này chính là thứ tôi đã chạy tay và nó đỏ. Nó phải đỏ được, nên hãy thử bỏ `'clients'` khỏi `BACKUP_TABLES` để xác nhận.

---

## B. ID client tất định

> Mức độ: **chặn merge**. Lỗi nhân bản dữ liệu tiền.

### B1. File mới `src/core/clientId.ts`

Hàm thuần, nằm ở `core/` vì nó không chạm React/Dexie và cần test nhanh.

```ts
export function clientIdFromName(name: string): string | null
```

**Logic:**

1. `normalizeText(name)` — đã có sẵn ở `core/filter.ts`, bỏ dấu + chữ thường.
2. Rỗng sau chuẩn hóa → trả `null` (nơi gọi tự xử lý; tên chỉ gồm dấu câu không phải một đối tượng).
3. Thay mọi cụm khoảng trắng bằng `-`, bỏ ký tự không phải chữ/số/gạch ngang.
4. Trả `client-` + kết quả.

```
"Gia"      → "client-gia"
"Gia Bảo"  → "client-gia-bao"
"  GIA  "  → "client-gia"
"???"      → null
```

**Đánh đổi phải ghi vào chú thích:** hai người khác nhau cùng tên "Gia" sẽ dùng chung một id, tức là bị coi là một. Đây **đúng bằng** hành vi cũ của `Payment.clientKey` (cũng là tên đã chuẩn hóa), nên không phải bước lùi. Muốn tách thì đặt tên phân biệt — "Gia (lớp 10)".

### B2. Chỗ tạo Client mới

Ở tầng repo (`src/db/repo/clients.ts` — tạo mới nếu chưa có), hàm `ensureClient(name)`:

1. `id = clientIdFromName(name)`; `null` → dùng `newId()`.
2. Đọc `db.clients.get(id)`.
3. Không có → tạo mới với id đó.
4. Có, và `normalizeText(existing.name) === normalizeText(name)` → dùng lại, **không tạo trùng**.
5. Có, nhưng tên đã khác (người dùng đã đổi tên client đó) → dùng `newId()`.

Nhánh 5 là trường hợp hiếm nhưng thật: tạo "Gia" → đổi tên thành "Minh" → tạo lại "Gia". Không có nhánh này thì client mới sẽ ghi đè lên client đã đổi tên.

⚠️ **Đổi tên client KHÔNG đổi id.** ID là danh tính, tên là nhãn. Đổi id sẽ phải trỏ lại toàn bộ tham chiếu.

### B3. Sửa migration v3 dùng `clientIdFromName`

Thay dòng `'client-' + Math.random()…` trong `src/db/schema.ts`.

⚠️ Vì hàm này ở `core/`, mà `schema.ts` ở `db/` — chiều import đó hợp lệ (`db/` được import `core/`, không ngược lại).

### B4. Test — `src/core/__tests__/clientId.test.ts`

- Cùng tên → cùng id, gọi bao nhiêu lần cũng vậy
- Khác hoa thường / khác dấu / thừa khoảng trắng → **cùng** id
- Tên rỗng hoặc chỉ dấu câu → `null`
- **Bài quan trọng nhất:** mô phỏng hai máy cùng migrate danh sách tên giống nhau → hai bộ id **bằng nhau**. Đây là bài canh đúng lỗi đã xảy ra.

---

## C. Sửa migration `version(3)`

> Mức độ: **chặn merge** ở mục C1.

### C1. Bump `updatedAt` cho mọi bản ghi đã sửa

Migration đang `put(r)` mà giữ nguyên `updatedAt`. Hệ quả: một máy **chưa** migrate có `updatedAt` mới hơn sẽ thắng ở `planSync()` và **ghi đè ngược** bản đã migrate — `clientId` biến mất.

Đặt `r.updatedAt = t` trước mỗi `put`. Dùng chung một mốc `t` cho cả migration.

### C2. Bỏ vòng lặp `exceptions` hiện tại

`ex.newClientName` chưa bao giờ tồn tại trong `ScheduleException` — vòng lặp đó không bao giờ chạy. Bỏ đi, hoặc nếu muốn giữ chỗ thì để `newClientId` mặc định `undefined`.

### C3. Giữ `clientLabel` trên `Payment`

Migration đang `delete p.clientLabel`. Sau đó `useDues.ts:68` lại gán ngược nó vào — tức là code đang xóa rồi dựng lại cùng một thứ.

Khuyến nghị: **giữ** `clientLabel` như trường tùy chọn, ghi lúc tạo, và coi nó là **bản dự phòng đọc được** khi client mồ côi. Cùng tinh thần với việc tombstone giữ lại dữ liệu: một khoản thu 5 triệu mà không hiện tên ai thì vô dụng.

Nếu chọn bỏ hẳn thì phải bỏ cả ở `types/index.ts`, `supabase_schema.sql`, và `useDues.ts` — không được để ba nơi nói ba kiểu.

### C4. Dữ liệu đã lỡ migrate

⚠️ **Máy bạn đã chạy `version(3)` rồi.** Dexie chỉ nâng cấp một lần, nên sửa mã migration **không** chạy lại và **không** dọn được các id ngẫu nhiên đang có.

Đó là lý do mục D tồn tại. Đừng thêm `version(4)` để chuẩn hóa id — nó lại là một bước không hoàn tác được nữa, và nó phải xử lý cả trường hợp máy khác đã đẩy id cũ lên mây.

---

## D. Công cụ gộp Client

> Mức độ: **cần**, vì đây là đường duy nhất dọn dữ liệu đã hỏng.

### D1. Tái sử dụng bộ máy đã có, đừng viết lại

`core/dedupe.ts` và `db/dedupe.ts` đã làm đúng việc này cho Danh mục, có 34 bài test. Việc cần là **tổng quát hóa**, không phải nhân bản.

Trong `db/dedupe.ts`, mảng `REFERENCES` hiện viết cứng cho Category. Nâng thành hai bản khai:

```ts
const CATEGORY_REFS = [ … 7 nơi như hiện tại … ];

const CLIENT_REFS = [
  { table: () => db.rules,      field: 'clientId' },
  { table: () => db.events,     field: 'clientId' },
  { table: () => db.exceptions, field: 'newClientId' },
  { table: () => db.payments,   field: 'clientId' },
];
```

Rồi tách các hàm hiện có thành bản nhận `refs` làm tham số:

```ts
countRefs(refs)                     // thay countCategoryRefs()
mergeEntity(table, refs, keepId, mergeIds)   // thay mergeCategories()
```

Giữ `countCategoryRefs()` / `mergeCategories()` như lớp mỏng gọi vào bản tổng quát, để 34 bài test hiện có **không phải sửa**. Test cũ còn xanh chính là bằng chứng việc tổng quát hóa không làm hỏng gì.

⚠️ `exceptions.newClientId` là trường **dễ quên nhất**, đúng như `exceptions.newCategoryId` — tên khác với ba cái kia nên tìm bằng cách gõ `clientId` là bỏ sót.

### D2. Chọn bản giữ lại

Trong `core/dedupe.ts`, thêm `findDuplicateClients(clients, refs)`. Thứ tự ưu tiên **khác** Category (client không có `isSystem`):

1. ID **khớp** `clientIdFromName(name)` — đây là bản mà mọi máy khác cũng sẽ sinh ra. Giữ nó là cách duy nhất để lần migrate/tạo sau không đẻ thêm bản trùng.
2. Nhiều tham chiếu nhất — ít phải trỏ lại nhất.
3. `createdAt` sớm nhất.

Bước 1 là bước làm cho việc gộp có tác dụng lâu dài. Thiếu nó thì gộp xong vẫn còn id ngẫu nhiên và máy tiếp theo lại sinh trùng.

### D3. Giao diện

Thêm vào `SettingsView.tsx` một mục song song với `DuplicateSection` hiện có. Có thể gộp chung một mục "Dữ liệu bị trùng" với hai nhóm con, hoặc hai mục riêng — tùy bạn.

Bắt buộc giữ ba tính chất của mục Danh mục:
- **Không bao giờ gộp tự động.** Hai người trùng tên là chuyện có thật.
- Hiện **số bản ghi sẽ chuyển** trước khi bấm.
- Gộp xong **đẩy vào Hoàn tác** (`pushUndo`).

### D4. Test

`src/db/__tests__/dedupe.test.ts`, thêm nhóm cho client:
- Trỏ lại đủ **4** nơi, gồm `exceptions.newClientId`
- Xóa **mềm** bản bị gộp, không xóa cứng
- Hoàn tác trả từng bản ghi về **đúng** client cũ của nó
- **Bài đối chứng:** hai client cùng tên với id ngẫu nhiên → `computeDues` cho ra **hai dòng**, tiền tách đôi. Không có bài này thì bài chính không chứng minh được gì.

---

## E. Dọn nợ kỹ thuật

### E1. 15 test đỏ ở `core/__tests__/payment.test.ts`

Không phải code hỏng — fixture dựng Occurrence chỉ có `clientName`, còn `computeDues` gộp theo `clientId`. Thêm `clientId` vào hàm `occ()` trong file test.

Nhân tiện thêm một bài mới: occurrence **không có** `clientId` thì bị bỏ qua hoàn toàn (hành vi hiện tại) — hiện chưa có gì canh điều đó.

### E2. Ba lỗi TypeScript

Import thừa, xóa là xong:

```
src/components/QuickAdd.tsx:7   inputClass
src/core/payment.ts:25          normalizeText
src/hooks/useClients.ts:3       Client
```

`src/core/payment.ts` mất `normalizeText` là dấu hiệu logic gộp theo `clientKey` đã bị gỡ — kiểm lại xem còn chỗ nào cần nó không trước khi xóa import.

### E3. `RuleManager.tsx:183` hiện Đối tượng trống

Đọc `rule.clientName`, mà migration đã `delete` trường đó. Màn hình Quản lý hiện trống cho mọi lịch lặp đã migrate.

Sửa bằng E4 bên dưới, đừng vá riêng chỗ này.

### E4. Việc tra tên client đang lặp ở hai nơi

`useSchedule.ts:56` và `useDues.ts:59` cùng dựng `clientMap` rồi gán `occ.clientName = …`. Hai bản sao của cùng một logic sẽ lệch nhau — và `RuleManager` là chỗ thứ ba, hiện chưa có bản nào.

Tách thành một hook dùng chung:

```ts
// src/hooks/useClientNames.ts
export function useClientNames(): Map<string, string>
```

Hai hook kia dùng nó; `RuleManager` cũng dùng nó để tra tên từ `rule.clientId`.

⚠️ Hai hook hiện đang **ghi đè thuộc tính** lên object do `useLiveQuery` trả về (`occ.clientName = …`). Nên tạo object mới thay vì sửa tại chỗ — object từ Dexie có thể được dùng lại giữa các lần render.

### E5. VAPID đang là khoá demo

`useReminders.ts:50` viết cứng `BEl62iUYgUivxIkv69yViEuiBIa-…` — khoá mẫu trong mọi hướng dẫn web-push, chú thích cũng ghi `(demo)`. Không phải lộ bí mật (nó vốn công khai), nhưng **bạn không giữ nửa private tương ứng nên push không bao giờ gửi được**.

Sửa theo đúng khuôn `db/cloud.ts` đã dùng cho Supabase:

1. Đọc từ `import.meta.env.VITE_VAPID_PUBLIC_KEY`.
2. Hàm `isPushConfigured()` kiểm chuỗi khác rỗng **và** đúng độ dài khoá VAPID (87 ký tự base64url) — kiểm "khác rỗng" thôi sẽ để lọt giá trị mẫu dán nhầm, đúng lỗi `your-supabase-url` đã gặp.
3. Chưa cấu hình → **không** gọi `pushManager.subscribe()`, và giao diện Cài đặt nói rõ "chưa cấu hình máy chủ đẩy thông báo" thay vì im lặng hỏng.
4. Thêm `VITE_VAPID_PUBLIC_KEY` vào `.env.example` và vào khối `env:` của bước build trong `deploy.yml`.

Nhắc lại điều README đã nói: nhắc lịch trong trang chỉ chạy khi app đang mở. Web Push chỉ thật sự hoạt động khi Edge Function được deploy **và** có `VAPID_PRIVATE_KEY` trên Supabase. Trước lúc đó, đừng để giao diện hứa nhiều hơn thực tế.

---

## F. Thứ tự thi công

Có phụ thuộc, nên đừng làm song song tùy tiện:

```
1. B1  core/clientId.ts + test          ← không phụ thuộc gì, làm trước
2. B3  migration dùng clientIdFromName
   C1  bump updatedAt
   C2  bỏ vòng lặp chết
   C3  quyết clientLabel giữ hay bỏ
3. A1  BACKUP_TABLES
   A2  tables.ts
   A4  check-cloud mapping              ← làm trước A3 để cổng báo đúng chỗ thiếu
4. A3  supabase_schema.sql              ← chạy check:cloud tới khi xanh
5. E1  sửa 15 test
   E2  xóa 3 import thừa
6. D   công cụ gộp Client               ← cần B1 để chọn bản giữ lại
7. E3+E4  useClientNames                ← cần D xong để không sửa hai lần
8. E5  VAPID
9. README: cập nhật mục "Bẫy đã gài sẵn" + "Quy ước bắt buộc"
```

Bước 3 trước bước 4 là có chủ đích: thêm mapping vào cổng chặn **trước** khi sửa SQL, để cổng chỉ ra chính xác còn thiếu cột nào thay vì phải tự dò.

---

## G. Định nghĩa "xong"

Ngoài 11 dòng trong README, lần này thêm bốn dòng riêng cho Client:

| # | Điều kiện |
|---|---|
| 1 | `npm run verify` xanh **cả sáu cổng** — không phải chỉ `tsc` |
| 2 | Khứ hồi sao lưu giữ được tên đối tượng (có test) |
| 3 | Hai máy migrate cùng dữ liệu → **cùng** bộ client id (có test) |
| 4 | `check:cloud` báo **9 bảng** |
| 5 | Gộp Client trỏ lại đủ **4** nơi kể cả `exceptions.newClientId` (có test) |
| 6 | Mỗi cổng/test mới đã được **chứng minh là đỏ được** bằng cách tái tạo lỗi gốc |

Dòng 6 là dòng hay bị bỏ qua nhất và cũng là dòng đáng giá nhất. Ba mươi giây để biết chắc mình đã sửa, thay vì tin là đã sửa.

---

## H. Những gì KHÔNG làm trong đợt này

| Không làm | Vì sao |
|---|---|
| `version(4)` chuẩn hóa lại id | Thêm một bước không hoàn tác được nữa. Mục D làm được cùng việc mà không cần |
| Gộp Client tự động | Hai người trùng tên là chuyện thật. Cùng lý do với Danh mục |
| Đổi `clientId` khi đổi tên client | ID là danh tính, tên là nhãn. Đổi id là phải trỏ lại toàn bộ tham chiếu |
| Bỏ `android/` + `ios/` khỏi repo | Capacitor khuyến nghị commit chúng. 172 file là cái giá đã biết, không phải lỗi |
