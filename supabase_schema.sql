-- ═══════════════════════════════════════════════════════════════════════════
--  PERSONAL SCHEDULE SYSTEM — LƯỢC ĐỒ SUPABASE
--
--  Bản sao của IndexedDB ở phía máy chủ. Nguồn sự thật về HÌNH DẠNG dữ liệu
--  vẫn là `src/types/index.ts`; file này chỉ dịch sang SQL.
--
--  ⚠️ SỬA FILE NÀY XONG PHẢI CHẠY `npm run check:cloud`.
--  Script đó so từng cột ở đây với từng trường trong types/index.ts và báo đỏ
--  nếu lệch. Nó tồn tại vì bản đầu tiên của file này đã âm thầm dùng lại mô
--  hình lương CŨ (`effective_month`, một bản ghi mỗi tháng) — thứ đã bị bác bỏ
--  từ Phase 0 — và thiếu bảy cột. Không có gì báo lỗi cho tới lúc bấm Đồng bộ.
--
--  ─── BA QUYẾT ĐỊNH KHÔNG HIỂN NHIÊN, ĐỌC TRƯỚC KHI ĐỔI ────────────────────
--
--  1. KHÓA CHÍNH LÀ (user_id, id), KHÔNG PHẢI id.
--
--     `UNCATEGORIZED_ID` là hằng số CỐ ĐỊNH `'sys-uncategorized'` — seed của
--     MỌI máy đều tạo ra một Category mang đúng id đó. Với `id` làm khóa chính
--     toàn cục, người thứ hai đăng nhập sẽ đụng khóa với hàng của người thứ
--     nhất. Tệ hơn: RLS che mất hàng kia, nên `upsert` không thấy gì để ghi đè,
--     nó thành INSERT và vỡ với 23505 duplicate key.
--
--     Triệu chứng sẽ là: app chạy hoàn hảo với một tài khoản, và hỏng ngay ở
--     BẢNG ĐẦU TIÊN với tài khoản thứ hai. Người dùng đầu tiên không bao giờ
--     gặp — nên lỗi này sống sót qua mọi lần thử nghiệm của chính tác giả.
--
--  2. MỌI CỘT THỜI GIAN LÀ `text`, KHÔNG PHẢI `timestamptz` / `date`.
--
--     `updatedAt` không chỉ là thông tin, nó là KHÓA GIẢI QUYẾT XUNG ĐỘT, và
--     `mergeById()` so sánh nó bằng phép so chuỗi. `timestamptz` trả về
--     "2026-08-24T10:00:00+00:00" trong khi client ghi "2026-08-24T10:00:00.000Z".
--     Cùng một thời điểm, hai chuỗi khác nhau — và ở thế hòa, ký tự '+' (0x2B)
--     nhỏ hơn '.' (0x2E) nên bản đến sẽ thắng bản đang có. Đúng ngược với quy
--     tắc "hòa thì giữ bản đang có" mà core/backup.ts có test.
--
--     `date` và `time` cũng vậy: `date`, `startTime`, `month` là GIỜ TREO
--     TƯỜNG — chuỗi mờ đục, không phải thời điểm. Để Postgres hiểu chúng là
--     mời một tầng ép kiểu vào giữa. `text` cho vòng đời khứ hồi đúng từng byte.
--
--     Cái mất là kiểm tra kiểu ở phía máy chủ. Bù lại bằng CHECK ở dưới.
--
--  3. KHÔNG CÓ BẢNG `settings`.
--
--     Ngôn ngữ, theme, màu nhấn, bật/tắt nhắc lịch là cấu hình CỦA MỘT MÁY.
--     Đồng bộ chúng nghĩa là đổi theme trên điện thoại thì laptop cũng đổi
--     theo — không ai muốn thế. Cấu hình cố ý nằm lại trong IndexedDB.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── KHỐI ĐẶT LẠI — MẶC ĐỊNH TẮT ───────────────────────────────────────────
--
-- ⚠️ BỎ CHÚ THÍCH LÀ XÓA SẠCH DỮ LIỆU ĐÁM MÂY CỦA MỌI NGƯỜI DÙNG.
--
-- Bản trước để chín lệnh DROP ... CASCADE chạy thẳng ở đầu file. Đây là file
-- người ta dán vào SQL Editor của Supabase — dán lại lần thứ hai để "cập nhật
-- schema" là mất toàn bộ lịch trên đám mây, không hỏi lại câu nào.
--
-- Phần dưới dùng CREATE TABLE IF NOT EXISTS, nên chạy lại bao nhiêu lần cũng
-- an toàn. Chỉ mở khối này khi bạn THẬT SỰ muốn dựng lại từ đầu.
--
-- DROP TABLE IF EXISTS public.reminder_queue      CASCADE;
-- DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
-- DROP TABLE IF EXISTS public.payments            CASCADE;
-- DROP TABLE IF EXISTS public.adjustment_templates CASCADE;
-- DROP TABLE IF EXISTS public.adjustments         CASCADE;
-- DROP TABLE IF EXISTS public.salary_rules        CASCADE;
-- DROP TABLE IF EXISTS public.events              CASCADE;
-- DROP TABLE IF EXISTS public.exceptions          CASCADE;
-- DROP TABLE IF EXISTS public.rules               CASCADE;
-- DROP TABLE IF EXISTS public.categories          CASCADE;
-- DROP TABLE IF EXISTS public.clients             CASCADE;



-- ─── clients ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clients (
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                     text NOT NULL,

  name                   text NOT NULL,
  email                  text,
  phone                  text,
  note                   text,

  created_at             text NOT NULL,
  updated_at             text NOT NULL,
  deleted_at             text,

  PRIMARY KEY (user_id, id)
);

-- ─── categories ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories (
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                     text NOT NULL,

  name                   text NOT NULL,
  color                  text NOT NULL,
  text_color             text,
  default_rate_per_hour  numeric,
  is_income_eligible     boolean NOT NULL DEFAULT false,
  is_system              boolean,
  sort_order             integer,

  created_at             text NOT NULL,
  updated_at             text NOT NULL,
  deleted_at             text,

  PRIMARY KEY (user_id, id)
);


-- ─── rules — lịch lặp ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rules (
  user_id            uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                 text NOT NULL,

  title              text NOT NULL,
  category_id        text,

  freq               text NOT NULL,
  interval           integer NOT NULL DEFAULT 1,
  days_of_week       integer[],
  day_of_month       integer,

  start_date         text NOT NULL,
  end_date           text,
  count              integer,

  start_time         text NOT NULL,
  duration_minutes   integer NOT NULL,

  rate_per_hour      numeric,
  fixed_amount       numeric,
  location           text,
  client_id          text,
  tags               text[],
  notes              text,

  created_at         text NOT NULL,
  updated_at         text NOT NULL,
  deleted_at         text,

  PRIMARY KEY (user_id, id),

  -- Khóa ngoại GHÉP: kèm user_id nghĩa là không thể trỏ sang danh mục của
  -- người khác, kể cả khi đoán trúng id. Ràng buộc bảo mật, không chỉ toàn vẹn.
  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),
  FOREIGN KEY (user_id, client_id)   REFERENCES public.clients (user_id, id),

  CONSTRAINT rules_freq_valid     CHECK (freq IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  CONSTRAINT rules_interval_valid CHECK (interval >= 1),
  CONSTRAINT rules_duration_valid CHECK (duration_minutes > 0)
);


-- ─── exceptions — ngoại lệ của lịch lặp ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exceptions (
  user_id               uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                    text NOT NULL,

  type                  text NOT NULL,
  recurring_rule_id     text,
  original_date         text,
  new_date              text,

  new_start_time        text,
  new_duration_minutes  integer,
  new_title             text,
  new_category_id       text,
  new_client_id         text,
  new_rate_per_hour     numeric,
  new_fixed_amount      numeric,

  status                text,
  reason                text,

  created_at            text NOT NULL,
  updated_at            text NOT NULL,
  deleted_at            text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, recurring_rule_id) REFERENCES public.rules (user_id, id),
  FOREIGN KEY (user_id, new_category_id)   REFERENCES public.categories (user_id, id),
  FOREIGN KEY (user_id, new_client_id)     REFERENCES public.clients (user_id, id),

  CONSTRAINT exceptions_type_valid CHECK (
    type IN ('CANCEL', 'MOVE', 'RESIZE', 'REPLACE', 'ADD', 'STATUS')
  ),
  CONSTRAINT exceptions_status_valid CHECK (
    status IS NULL OR status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  )
);

-- Bản sao của index unique `&[recurringRuleId+originalDate]` bên Dexie.
--
-- Nó là thứ chặn hai ngoại lệ chọi nhau trên cùng một buổi (vừa CANCEL vừa
-- MOVE). Không mirror sang đây thì đám mây trở thành đường vòng để tạo ra
-- đúng trạng thái mà client cấm.
--
-- Ngoại lệ loại 'ADD' có cả hai cột NULL. Postgres coi NULL là khác nhau
-- trong ràng buộc unique, nên nhiều ADD vẫn hợp lệ — đúng như Dexie.
CREATE UNIQUE INDEX IF NOT EXISTS exceptions_one_per_occurrence
  ON public.exceptions (user_id, recurring_rule_id, original_date);


-- ─── events — sự kiện đơn lẻ ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  user_id           uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                text NOT NULL,

  title             text NOT NULL,
  category_id       text,
  date              text NOT NULL,
  start_time        text NOT NULL,
  duration_minutes  integer NOT NULL,

  location          text,
  client_id         text,
  tags              text[],
  notes             text,
  rate_per_hour     numeric,
  fixed_amount      numeric,
  status            text NOT NULL,

  created_at        text NOT NULL,
  updated_at        text NOT NULL,
  deleted_at        text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),
  FOREIGN KEY (user_id, client_id)   REFERENCES public.clients (user_id, id),

  CONSTRAINT events_status_valid CHECK (
    status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  CONSTRAINT events_duration_valid CHECK (duration_minutes > 0)
);


-- ─── salary_rules — cấu hình lương ─────────────────────────────────────────
--
-- ⚠️ `effective_from` / `effective_to` là KHOẢNG HIỆU LỰC dạng "YYYY-MM", KHÔNG
-- phải một tháng cụ thể.
--
-- Bản kế hoạch gốc dùng một bản ghi cho mỗi tháng. Làm hai năm là 24 bản ghi
-- giống hệt nhau, và tháng nào quên tạo thì thu nhập tháng đó về 0 mà không
-- báo gì. REVIEW đã bác bỏ mô hình đó từ Phase 0 và code chưa bao giờ dùng nó.
-- Bản SQL đầu tiên vô tình khôi phục lại nó — đừng lặp lại.

CREATE TABLE IF NOT EXISTS public.salary_rules (
  user_id                 uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                      text NOT NULL,

  category_id             text,
  mode                    text NOT NULL,

  effective_from          text NOT NULL,
  effective_to            text,

  -- mode = 'HOURLY'
  rate_per_hour           numeric,

  -- mode = 'FIXED_MONTHLY'
  base_salary             numeric,
  standard_monthly_hours  numeric,
  shortfall_policy        text,

  -- dùng chung
  overtime_multiplier     numeric,
  night_shift_multiplier  numeric,
  night_shift_start       text,
  night_shift_end         text,

  currency                text NOT NULL,

  created_at              text NOT NULL,
  updated_at              text NOT NULL,
  deleted_at              text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),

  CONSTRAINT salary_mode_valid CHECK (mode IN ('HOURLY', 'FIXED_MONTHLY')),
  CONSTRAINT salary_shortfall_valid CHECK (
    shortfall_policy IS NULL OR shortfall_policy IN ('NONE', 'PRO_RATA')
  ),

  -- Mirror của phép chặn trong core/payroll.ts. Bỏ đi thì chia cho 0 sinh
  -- Infinity, rồi NaN lan ra toàn bộ báo cáo lương.
  CONSTRAINT salary_standard_hours_positive CHECK (
    standard_monthly_hours IS NULL OR standard_monthly_hours > 0
  ),

  CONSTRAINT salary_range_ordered CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);


-- ─── adjustments — phạt / thưởng / khấu trừ / phụ cấp ──────────────────────

CREATE TABLE IF NOT EXISTS public.adjustments (
  user_id                 uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id                      text NOT NULL,

  category_id             text,
  month                   text NOT NULL,
  kind                    text NOT NULL,
  label                   text NOT NULL,
  amount                  numeric NOT NULL,

  date                    text,
  note                    text,
  linked_event_id         text,
  linked_rule_id          text,
  linked_occurrence_date  text,

  created_at              text NOT NULL,
  updated_at              text NOT NULL,
  deleted_at              text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),

  CONSTRAINT adjustments_kind_valid CHECK (
    kind IN ('PENALTY', 'DEDUCTION', 'BONUS', 'ALLOWANCE')
  ),

  -- `amount` LUÔN DƯƠNG — dấu do `kind` quyết định. Cho phép số âm thì một
  -- ngày nào đó ai đó nhập -50000 cho PENALTY, hệ thống trừ đi số âm, và
  -- khoản phạt biến thành khoản CỘNG. Con số vẫn trông hợp lý nên gần như
  -- không thể phát hiện bằng mắt.
  CONSTRAINT adjustments_amount_positive CHECK (amount >= 0)
);


-- ─── adjustment_templates ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.adjustment_templates (
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id              text NOT NULL,

  category_id     text,
  kind            text NOT NULL,
  label           text NOT NULL,
  default_amount  numeric NOT NULL,

  created_at      text NOT NULL,
  updated_at      text NOT NULL,
  deleted_at      text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),

  CONSTRAINT templates_kind_valid CHECK (
    kind IN ('PENALTY', 'DEDUCTION', 'BONUS', 'ALLOWANCE')
  ),
  CONSTRAINT templates_amount_positive CHECK (default_amount >= 0)
);


-- ─── payments — thu tiền ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id            text NOT NULL,

  client_label  text,
  client_id     text,
  category_id   text,
  month         text NOT NULL,
  amount        numeric NOT NULL,
  paid_at       text,
  method        text,
  note          text,

  created_at    text NOT NULL,
  updated_at    text NOT NULL,
  deleted_at    text,

  PRIMARY KEY (user_id, id),

  FOREIGN KEY (user_id, category_id) REFERENCES public.categories (user_id, id),
  FOREIGN KEY (user_id, client_id)   REFERENCES public.clients (user_id, id),

  CONSTRAINT payments_amount_positive CHECK (amount >= 0)
);


-- ─── push_subscriptions — đăng ký Web Push ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id          text NOT NULL,

  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,

  created_at  text NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at  text NOT NULL,
  deleted_at  text,

  PRIMARY KEY (user_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uniq
  ON public.push_subscriptions (user_id, endpoint);


-- ─── reminder_queue — hàng đợi Web Push ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reminder_queue (
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  id          text NOT NULL,

  fire_at     text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  url         text,

  sent_at     text,

  created_at  text NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at  text NOT NULL,
  deleted_at  text,

  PRIMARY KEY (user_id, id)
);

-- Upsert của client KHÔNG gửi `created_at` (gửi thì mỗi lần nạp lại đè mất
-- mốc tạo gốc), nên cột phải tự có giá trị khi INSERT. `CREATE TABLE IF NOT
-- EXISTS` không đụng vào bảng đã dựng trước khi DEFAULT được thêm — hai câu
-- ALTER dưới đây vá những bảng đó, và chạy lại bao nhiêu lần cũng an toàn.
ALTER TABLE public.push_subscriptions
  ALTER COLUMN created_at SET DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
ALTER TABLE public.reminder_queue
  ALTER COLUMN created_at SET DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

-- Cron quét XUYÊN user, nên index KHÔNG mở đầu bằng user_id như các bảng khác.
CREATE INDEX IF NOT EXISTS reminder_queue_due_idx
  ON public.reminder_queue (fire_at)
  WHERE sent_at IS NULL AND deleted_at IS NULL;


-- ─── Chỉ mục cho đồng bộ ───────────────────────────────────────────────────
--
-- Đồng bộ gia tăng sẽ hỏi "có gì đổi sau mốc X?" trên từng bảng. Không có
-- index này thì mỗi lần đồng bộ là một lần quét toàn bảng.

CREATE INDEX IF NOT EXISTS clients_sync_idx              ON public.clients              (user_id, updated_at);
CREATE INDEX IF NOT EXISTS categories_sync_idx           ON public.categories           (user_id, updated_at);
CREATE INDEX IF NOT EXISTS rules_sync_idx                ON public.rules                (user_id, updated_at);
CREATE INDEX IF NOT EXISTS exceptions_sync_idx           ON public.exceptions           (user_id, updated_at);
CREATE INDEX IF NOT EXISTS events_sync_idx               ON public.events               (user_id, updated_at);
CREATE INDEX IF NOT EXISTS salary_rules_sync_idx         ON public.salary_rules         (user_id, updated_at);
CREATE INDEX IF NOT EXISTS adjustments_sync_idx          ON public.adjustments          (user_id, updated_at);
CREATE INDEX IF NOT EXISTS adjustment_templates_sync_idx ON public.adjustment_templates (user_id, updated_at);
CREATE INDEX IF NOT EXISTS payments_sync_idx             ON public.payments             (user_id, updated_at);
CREATE INDEX IF NOT EXISTS push_subscriptions_sync_idx   ON public.push_subscriptions   (user_id, updated_at);


-- ─── Row Level Security ────────────────────────────────────────────────────
--
-- `WITH CHECK` viết TƯỜNG MINH dù Postgres mặc định lấy lại biểu thức USING
-- khi thiếu. Đây là ranh giới bảo mật duy nhất giữa dữ liệu của hai người
-- dùng; nó phải đọc được mà không cần tra tài liệu để biết chiều ghi cũng
-- được canh.

ALTER TABLE public.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_queue       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_clients              ON public.clients;
DROP POLICY IF EXISTS own_categories           ON public.categories;
DROP POLICY IF EXISTS own_rules                ON public.rules;
DROP POLICY IF EXISTS own_exceptions           ON public.exceptions;
DROP POLICY IF EXISTS own_events               ON public.events;
DROP POLICY IF EXISTS own_salary_rules         ON public.salary_rules;
DROP POLICY IF EXISTS own_adjustments          ON public.adjustments;
DROP POLICY IF EXISTS own_adjustment_templates ON public.adjustment_templates;
DROP POLICY IF EXISTS own_payments             ON public.payments;
DROP POLICY IF EXISTS own_push_subscriptions   ON public.push_subscriptions;
DROP POLICY IF EXISTS own_reminder_queue       ON public.reminder_queue;

CREATE POLICY own_clients ON public.clients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_categories ON public.categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rules ON public.rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_exceptions ON public.exceptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_events ON public.events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_salary_rules ON public.salary_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_adjustments ON public.adjustments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_adjustment_templates ON public.adjustment_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_payments ON public.payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_push_subscriptions ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_reminder_queue ON public.reminder_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
