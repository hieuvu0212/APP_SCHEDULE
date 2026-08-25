// ═══════════════════════════════════════════════════════════════════════════
//  core/quickAdd.ts — bóc ngày, giờ và tiêu đề ra khỏi một câu tiếng Việt
//
//  HÀM THUẦN. Không đọc đồng hồ, không đọc DB. `today` truyền vào từ ngoài.
//
//  ⚠️ NGÀY PHÂN TÍCH TRƯỚC, GIỜ PHÂN TÍCH SAU. ĐỪNG ĐẢO LẠI.
//
//  Bản đầu tiên làm ngược. Với "Nộp báo cáo 25/8", bộ dò giờ chạy trước và
//  nuốt luôn số 25 làm giờ, kết quả:
//
//      { title: "Nộp báo cáo /8", startTime: "25:00", date: <hôm nay> }
//
//  Ba cái sai cùng lúc: giờ 25:00 không tồn tại (thẻ <input type="time"> từ
//  chối nó), tiêu đề còn sót "/8", và nhánh phân tích ngày dạng d/m TRỞ NÊN
//  KHÔNG THỂ CHẠM TỚI — số ngày luôn bị bộ dò giờ lấy mất trước. Cả một nhánh
//  code chết mà không có gì báo, vì ba bài test hiện có chỉ đi đường thuận.
//
//  Ngày trước thì "25/8" bị tiêu thụ hết trước khi bộ dò giờ nhìn thấy nó.
//
//  ─── BA QUY TẮC KHÁC, ĐỀU ĐÃ TỪNG LÀ LỖI ──────────────────────────────────
//
//  · SỐ TRẦN KHÔNG PHẢI LÀ GIỜ. "Học toán lớp 10" từng thành 10:00. Muốn là
//    giờ thì phải có dấu hiệu: `h`, `:`, chữ "giờ", tiền tố "lúc", hoặc buổi
//    đi kèm ("7 tối"). Chữ số đứng một mình là một phần của tiêu đề.
//
//  · BUỔI ÁP CHO CẢ KHOẢNG. "Dạy Lý 7h-9h tối" từng ra 07:00–09:00 và bỏ chữ
//    "tối" lại trong tiêu đề. Đúng phải là 19:00–21:00.
//
//  · CẮT THEO VỊ TRÍ, KHÔNG DÙNG String.replace. `replace(match[0], '')` xóa
//    lần xuất hiện ĐẦU TIÊN của chuỗi đó ở bất kỳ đâu — không nhất thiết là
//    chỗ vừa khớp. Ở đây ghi lại khoảng [đầu, cuối) rồi mới cắt.
//
//  ─── VÌ SAO KHÔNG ĐOÁN BỪA ────────────────────────────────────────────────
//
//  Không tìm thấy thì trả `null`, KHÔNG lấy hôm nay hay giờ hiện tại làm mặc
//  định. Bản trước mặc định về hôm nay, nên câu phân tích hỏng và câu cố ý
//  không nói ngày cho ra kết quả giống hệt nhau — người dùng không phân biệt
//  được "app hiểu ý tôi" với "app đoán đại". Tầng gọi chọn giá trị mặc định,
//  vì chỉ nó mới biết "bây giờ" là lúc nào.
// ═══════════════════════════════════════════════════════════════════════════

import { normalizeText } from './filter';
import { addDays, dayOfWeek, toHHMM } from './time';

export interface QuickAddResult {
  /** Phần còn lại sau khi bóc ngày giờ. Rỗng nếu câu chỉ có ngày giờ. */
  title: string;
  /** "YYYY-MM-DD", hoặc null nếu câu không nói ngày */
  date: string | null;
  /** "HH:mm", hoặc null nếu câu không nói giờ */
  startTime: string | null;
  /** "HH:mm". Có startTime mà không có giờ kết thúc thì mặc định +1 tiếng. */
  endTime: string | null;
  /**
   * Đối tượng của buổi — xem `RecurringRule.clientName`.
   *
   * `null` khi không nhận ra được. KHÔNG đoán từ ngữ pháp: xem chú thích của
   * `findClient()` để biết vì sao "dạy Gia" và "dạy Toán" không phân biệt
   * được bằng cấu trúc câu.
   */
  clientName: string | null;
  /** Các thứ trong tuần theo `Date.getDay()`, đã sắp xếp. Rỗng nếu không nói. */
  daysOfWeek: number[];
  /**
   * Có nên tạo LỊCH LẶP thay vì một buổi đơn lẻ không.
   *
   * Đúng khi câu nói từ HAI thứ trở lên — một buổi không thể vừa diễn ra thứ
   * Hai vừa diễn ra thứ Năm — hoặc khi có chữ chỉ sự lặp ("hàng tuần", "mỗi").
   *
   * MỘT thứ mà không có chữ chỉ lặp thì vẫn là buổi đơn lẻ vào thứ đó gần
   * nhất. "Họp thứ 5" hầu như luôn là một cuộc họp, không phải lịch cố định
   * mỗi thứ Năm suốt đời.
   */
  repeats: boolean;
}

/** Khoảng ký tự đã bị một bộ dò tiêu thụ */
interface Span {
  start: number;
  end: number;
}

const PERIOD = 'sáng|trưa|chiều|tối|đêm';

/**
 * ⚠️ RANH GIỚI TỪ PHẢI TỰ VIẾT — `\b` KHÔNG DÙNG ĐƯỢC VỚI TIẾNG VIỆT.
 *
 * `\b` của JavaScript định nghĩa "ký tự từ" là `[A-Za-z0-9_]`, kể cả khi bật
 * cờ `u`. Chữ cái có dấu nằm ngoài tập đó, nên `\btư\b` KHÔNG khớp "thứ tư":
 * 'ư' bị coi là dấu phân cách, và cuối chuỗi cũng là dấu phân cách, nên không
 * có ranh giới nào giữa hai thứ đó cả.
 *
 * Triệu chứng rất chọn lọc — "thứ ba", "thứ năm", "thứ sáu", "thứ bảy" đều
 * chạy vì chúng kết thúc bằng chữ cái ASCII. Chỉ "thứ tư" hỏng. Đúng loại lỗi
 * lọt qua kiểm thử thủ công vì người ta thử một hai trường hợp rồi tin cả cụm.
 */
const WB_START = String.raw`(?<![\p{L}\p{N}])`;
const WB_END = String.raw`(?![\p{L}\p{N}])`;

// ─── Ngày ──────────────────────────────────────────────────────────────────

const RELATIVE_DAY = new RegExp(
  `${WB_START}(hôm nay|ngày mai|ngày kia|mai|mốt)${WB_END}`,
  'iu',
);

/** Một thứ trong tuần, viết bằng số hoặc bằng chữ */
const DAY_TOKEN = String.raw`(?:thứ|t)\s*(?:[2-7]|hai|ba|tư|năm|sáu|bảy)|chủ\s*nhật|cn`;

/** Dấu ngăn giữa các thứ trong một danh sách: "thứ 2,5" · "thứ 2 và 5" */
const DAY_SEP = String.raw`\s*(?:,|và|&|\+|;)\s*`;

/**
 * Cả cụm thứ, có thể gồm NHIỀU thứ.
 *
 * "thứ 2,5" · "thứ 2 và thứ 5" · "t2, t4, t6" · "thứ 3 và cn"
 *
 * ⚠️ KHÔNG nhận danh sách ngăn bằng khoảng trắng trần ("thứ 2 5").
 * "Họp thứ 5 phòng 2" sẽ bị đọc thành thứ Năm và thứ Hai. Dấu ngăn tường minh
 * là ranh giới duy nhất phân biệt được "một danh sách thứ" với "một con số
 * tình cờ đứng sau".
 */
const WEEKDAY = new RegExp(
  `${WB_START}(?:vào\\s+)?(?:${DAY_TOKEN})(?:${DAY_SEP}(?:(?:thứ|t)\\s*)?(?:[2-7]|hai|ba|tư|năm|sáu|bảy|chủ\\s*nhật|cn))*${WB_END}`,
  'iu',
);

/** Từng thứ một, để bóc ra khỏi cụm đã khớp ở trên */
const DAY_IN_GROUP = new RegExp(
  `(?:thứ|t)\\s*([2-7]|hai|ba|tư|năm|sáu|bảy)|(chủ\\s*nhật|cn)|${WB_START}([2-7])${WB_END}`,
  'giu',
);

/**
 * Chữ chỉ sự lặp lại.
 *
 * Cần cho trường hợp MỘT thứ: "mỗi thứ 3" là lịch cố định, còn "thứ 3" trần
 * là một buổi vào thứ Ba tới. Hai câu đó khác nhau về ý định, và đoán sai
 * hướng nào cũng tệ — tạo nhầm chuỗi vô hạn thì phải đi xóa, mà tạo nhầm buổi
 * lẻ thì phải nhập lại từ đầu mỗi tuần.
 */
const REPEAT_MARKER = new RegExp(`${WB_START}(hàng tuần|hằng tuần|mỗi tuần|mỗi)${WB_END}`, 'iu');

/**
 * ⚠️ CHỈ NHẬN DẤU `/`, KHÔNG NHẬN `-`.
 *
 * "Dạy Lý 7-9h tối" — nếu `-` được coi là dấu ngăn ngày thì "7-9" là ngày 7
 * tháng 9, một ngày hoàn toàn hợp lệ. Bộ dò ngày chạy trước nên nó sẽ nuốt
 * mất khoảng giờ, và không có phép kiểm tra nào bắt được vì kết quả hợp lệ.
 *
 * Người Việt viết ngày bằng `/` ("25/8"). Mất `-` không mất gì cả.
 */
const NUMERIC_DAY = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/;

const WEEKDAY_INDEX: Record<string, number> = {
  hai: 1, '2': 1,
  ba: 2, '3': 2,
  tư: 3, '4': 3,
  năm: 4, '5': 4,
  sáu: 5, '6': 5,
  bảy: 6, '7': 6,
};

/** Bóc mọi thứ trong tuần ra khỏi một cụm đã khớp WEEKDAY */
function daysInGroup(group: string): number[] {
  const found = new Set<number>();
  for (const m of group.matchAll(DAY_IN_GROUP)) {
    // Nhóm 2 = "cn"/"chủ nhật"; nhóm 1 = có tiền tố thứ/t; nhóm 3 = số trần
    // đứng sau dấu ngăn ("thứ 2,5" thì số 5 không có tiền tố).
    if (m[2]) found.add(0);
    else {
      const token = (m[1] ?? m[3])?.toLowerCase();
      const index = token === undefined ? undefined : WEEKDAY_INDEX[token];
      if (index !== undefined) found.add(index);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Ngày gần nhất trong tương lai rơi vào một trong các thứ đã cho */
function nextMatching(days: number[], today: string): string {
  const from = dayOfWeek(today);
  // Lần TỚI, không phải hôm nay: "thứ 2" gõ vào thứ Hai nghĩa là tuần sau.
  const offsets = days.map((d) => ((d - from + 7 - 1) % 7) + 1);
  return addDays(today, Math.min(...offsets));
}

interface DateResult {
  date: string | null;
  daysOfWeek: number[];
}

function parseDate(text: string, today: string, spans: Span[]): DateResult {
  const none = { date: null, daysOfWeek: [] as number[] };

  const rel = text.match(RELATIVE_DAY);
  if (rel) {
    consume(spans, rel);
    const word = rel[1].toLowerCase();
    if (word === 'hôm nay') return { ...none, date: today };
    if (word === 'ngày kia' || word === 'mốt') return { ...none, date: addDays(today, 2) };
    return { ...none, date: addDays(today, 1) }; // mai / ngày mai
  }

  const dow = text.match(WEEKDAY);
  if (dow) {
    const days = daysInGroup(dow[0]);
    if (days.length > 0) {
      consume(spans, dow);
      // `date` là ngày BẮT ĐẦU. Với lịch lặp nhiều thứ, đó là buổi đầu tiên —
      // `expandSchedule` lo phần còn lại từ `daysOfWeek`.
      return { date: nextMatching(days, today), daysOfWeek: days };
    }
  }

  const numeric = text.match(NUMERIC_DAY);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = numeric[3] ? Number(numeric[3]) : Number(today.slice(0, 4));
    const iso = buildDate(year, month, day);
    if (iso) {
      consume(spans, numeric);
      // Năm ghi rõ thì tôn trọng nguyên văn, kể cả khi nó ở quá khứ. Không
      // ghi năm mà ngày đã trôi qua thì hiểu là năm sau — cùng quy tắc "lần
      // tới" với thứ trong tuần, để cả tính năng chỉ có MỘT luật về thời
      // gian: Thêm nhanh luôn nói về tương lai. Muốn ghi lùi thì dùng form
      // đầy đủ, nơi ô ngày hiện rõ.
      if (!numeric[3] && iso < today) {
        return { ...none, date: buildDate(year + 1, month, day) ?? iso };
      }
      return { ...none, date: iso };
    }
  }

  return none;
}

/** Ngày hợp lệ → "YYYY-MM-DD". 31/02 và 32/1 trả null thay vì cuộn sang tháng sau. */
function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(year, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  // Dựng chuỗi bằng tay từ các số đã kiểm — KHÔNG dùng toISOString().
  // `new Date(y, m, d)` là nửa đêm GIỜ ĐỊA PHƯƠNG, toISOString() đổi sang UTC,
  // và ở UTC+7 thì nửa đêm hôm nay là 17:00 HÔM QUA — lệch đúng một ngày.
  // Bản trước mắc đúng lỗi này, ở đúng nhánh này.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Giờ ───────────────────────────────────────────────────────────────────

const CLOCK = String.raw`(\d{1,2})(?:\s*[:h]\s*(\d{2})|\s*h\b|\s*giờ)?`;

const TIME_RANGE = new RegExp(
  String.raw`\b(?:từ\s*)?${CLOCK}\s*(?:-|–|—|đến|tới)\s*${CLOCK}\s*(${PERIOD})?`,
  'giu',
);

const SINGLE_TIME = new RegExp(
  String.raw`\b(?:lúc\s*|vào\s*)?${CLOCK}\s*(${PERIOD})?`,
  'giu',
);

/** Chuỗi khớp có thật sự trông như một giờ không, hay chỉ là con số trần */
const LOOKS_LIKE_TIME = new RegExp(String.raw`[:h]|giờ|lúc|${PERIOD}`, 'iu');

/**
 * Chỗ khớp ĐẦU TIÊN trông giống một giờ — không phải chỗ khớp đầu tiên.
 *
 * ⚠️ `text.match()` chỉ trả về một kết quả. Với "Bài 18 ôn tập 18h" thì kết
 * quả đó là số 18 trần trong tiêu đề; nó trượt phép kiểm LOOKS_LIKE_TIME, và
 * nếu dừng ở đó thì "18h" ở cuối câu không bao giờ được xét — câu có giờ rõ
 * ràng lại trả về `startTime: null`.
 *
 * Cả tính năng "số trần không phải là giờ" phụ thuộc vào việc DUYỆT TIẾP thay
 * vì bỏ cuộc ở ứng viên đầu tiên bị loại.
 */
function firstTimeLike(text: string, re: RegExp): RegExpMatchArray | null {
  for (const m of text.matchAll(re)) {
    if (LOOKS_LIKE_TIME.test(m[0])) return m;
  }
  return null;
}

interface Clock {
  hour: number;
  minute: number;
}

function readClock(h: string, m: string | undefined): Clock | null {
  const hour = Number(h);
  const minute = m === undefined ? 0 : Number(m);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Dời giờ theo buổi trong ngày.
 *
 * "7 tối" là 19:00, không phải 07:00. Quy ước dân dụng, không phải quy tắc
 * toán học — "12 trưa" là 12:00 còn "12 đêm" là 00:00, và "2 giờ đêm" là
 * 02:00 chứ không phải 14:00.
 */
function applyPeriod(clock: Clock, period: string | undefined): Clock {
  if (!period) return clock;
  const p = period.toLowerCase();
  const h = clock.hour;

  if (p === 'sáng') return { ...clock, hour: h === 12 ? 0 : h };
  if (p === 'trưa') return { ...clock, hour: h < 11 ? h + 12 : h };
  if (p === 'chiều' || p === 'tối') return { ...clock, hour: h < 12 ? h + 12 : h };
  // đêm: 12 đêm = 00:00, 7–11 đêm = 19:00–23:00, 1–4 đêm giữ nguyên.
  if (p === 'đêm') return { ...clock, hour: h === 12 ? 0 : h >= 7 && h < 12 ? h + 12 : h };
  return clock;
}

const hhmm = (c: Clock) => toHHMM(c.hour * 60 + c.minute);

function parseTime(
  text: string,
  spans: Span[],
): { startTime: string | null; endTime: string | null } {
  const range = firstTimeLike(text, TIME_RANGE);
  if (range) {
    const from = readClock(range[1], range[2]);
    const to = readClock(range[3], range[4]);
    if (from && to) {
      const period = range[5];
      consume(spans, range);
      return {
        // Buổi áp cho CẢ HAI đầu: "7h-9h tối" là 19:00–21:00. Áp riêng đầu
        // cuối sẽ ra 07:00–21:00, một ca mười bốn tiếng.
        startTime: hhmm(applyPeriod(from, period)),
        endTime: hhmm(applyPeriod(to, period)),
      };
    }
  }

  const single = firstTimeLike(text, SINGLE_TIME);
  if (single) {
    const clock = readClock(single[1], single[2]);
    if (clock) {
      const start = applyPeriod(clock, single[3]);
      consume(spans, single);
      return {
        startTime: hhmm(start),
        // Mặc định một tiếng. `toHHMM` cuộn vòng qua nửa đêm, nên 23:00 ra
        // 00:00 chứ không phải "24:00" — một giờ mà <input type="time"> từ
        // chối và bản trước sinh ra được.
        endTime: toHHMM(start.hour * 60 + start.minute + 60),
      };
    }
  }

  return { startTime: null, endTime: null };
}

// ─── Đối tượng ─────────────────────────────────────────────────────────────

/**
 * "cho Gia" · "với anh Nam" — cách nói RÕ RÀNG rằng đây là một người.
 *
 * Bắt buộc chữ cái đầu VIẾT HOA. Không có ràng buộc đó thì "làm cho xong" cho
 * ra đối tượng tên "xong" — `cho` và `với` là hai từ phổ biến bậc nhất tiếng
 * Việt và chúng đứng trước đủ thứ.
 */
const EXPLICIT_CLIENT = new RegExp(
  `${WB_START}(?:cho|với)\\s+(\\p{Lu}[\\p{L}]*(?:\\s+\\p{Lu}[\\p{L}]*)*)${WB_END}`,
  'u',
);

/**
 * Tìm đối tượng của buổi trong câu.
 *
 * ⚠️ NGỮ PHÁP KHÔNG ĐỦ ĐỂ LÀM VIỆC NÀY. ĐỪNG THỬ.
 *
 *     "dạy Gia"   → Gia là một người
 *     "dạy Toán"  → Toán là một môn học
 *
 * Hai câu có cấu trúc GIỐNG HỆT NHAU: động từ + danh từ riêng viết hoa. Không
 * có quy tắc cú pháp nào phân biệt được, và mọi mẹo dựa trên danh sách môn học
 * đều vỡ ở cái tên thứ nhất nằm ngoài danh sách. Đoán bừa ở đây nghĩa là mỗi
 * lần gõ "dạy Toán" lại phải đi xóa một Đối tượng tên "Toán" — tệ hơn hẳn so
 * với việc không đoán gì.
 *
 * Nên chỗ này KHÔNG suy từ câu chữ, mà ĐỐI CHIẾU VỚI DỮ LIỆU ĐÃ CÓ. Tên nào
 * đã từng là Đối tượng trong lịch của bạn thì lần sau gõ ra là nhận được ngay.
 * Lần đầu tiên vẫn phải điền tay — nhưng đúng một lần, và đó là lần duy nhất
 * ứng dụng có cơ sở nào để biết "Gia" là người còn "Toán" thì không.
 *
 * `cho`/`với` là đường tắt cho chính lần đầu đó.
 *
 * So khớp bỏ dấu và không phân biệt hoa thường qua `normalizeText`, nên gõ
 * "gia" vẫn ra "Gia" — nhưng trả về ĐÚNG DẠNG ĐÃ LƯU, để không sinh ra hai
 * đối tượng chỉ khác nhau cách viết.
 */
function findClient(text: string, knownClients: string[]): string | null {
  const explicit = text.match(EXPLICIT_CLIENT);
  if (explicit) return explicit[1];

  const haystack = normalizeText(text);
  // Tên dài khớp trước: "Gia Bảo" phải thắng "Gia" khi cả hai cùng có trong
  // danh sách, nếu không thì đối tượng luôn bị cắt cụt còn chữ đầu.
  const sorted = [...knownClients].sort((a, b) => b.length - a.length);

  for (const client of sorted) {
    const needle = normalizeText(client);
    if (!needle) continue;
    // Ranh giới từ để "An" không khớp bên trong "Anh văn".
    const pattern = new RegExp(
      `${WB_START}${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${WB_END}`,
      'u',
    );
    if (pattern.test(haystack)) return client;
  }

  return null;
}

// ─── Cắt và ghép tiêu đề ───────────────────────────────────────────────────

function consume(spans: Span[], match: RegExpMatchArray): void {
  const start = match.index ?? 0;
  spans.push({ start, end: start + match[0].length });
}

/**
 * Từ nối còn trơ lại sau khi bóc mất ngày giờ quanh nó.
 *
 * Gồm cả chữ chỉ sự lặp: "Học Anh mỗi thứ 3" bị bóc mất "thứ 3" và để lại
 * tiêu đề "Học Anh mỗi" — đọc như một câu bỏ dở.
 *
 * ⚠️ DÙNG WB_START/WB_END, KHÔNG DÙNG `\b`.
 *
 * `\b` của JavaScript chỉ biết `[A-Za-z0-9_]`, nên `\btừ\b` KHÔNG khớp chữ
 * "từ" — 'ừ' bị coi là dấu phân cách. Bản trước dùng `\b` ở đây và hậu quả
 * rất chọn lọc: "vào", "lúc", "ngày", "hồi" đều bị xóa vì chúng kết thúc bằng
 * chữ cái ASCII, riêng "từ" thì không. Cùng một cái bẫy đã gài ở phần thứ
 * trong tuần, lọt lại ở đây.
 */
const DANGLING = new RegExp(
  `${WB_START}(vào|lúc|từ|ngày|hồi|hàng tuần|hằng tuần|mỗi tuần|mỗi)${WB_END}`,
  'giu',
);

function titleFrom(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) out += text.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  out += text.slice(cursor);

  return out
    .replace(DANGLING, ' ')
    .replace(/[,;–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Điểm vào ──────────────────────────────────────────────────────────────

/**
 * "Dạy Gia thứ 2,5 18h-20h" → một LỊCH LẶP thứ Hai và thứ Năm, Đối tượng Gia.
 *
 * @param today         "YYYY-MM-DD" của hôm nay — truyền vào để hàm thuần.
 * @param knownClients  Đối tượng đã có trong dữ liệu, để nhận ra tên người.
 *                      Xem `findClient()` về việc vì sao không đoán từ ngữ pháp.
 */
export function parseQuickAdd(
  text: string,
  today: string,
  knownClients: string[] = [],
): QuickAddResult {
  const spans: Span[] = [];

  // Thứ tự ở đây LÀ hành vi của tính năng. Xem cảnh báo đầu file.
  const { date, daysOfWeek } = parseDate(text, today, spans);
  const { startTime, endTime } = parseTime(blankOut(text, spans), spans);

  const title = titleFrom(text, spans);

  // Tìm đối tượng trong TIÊU ĐỀ, không phải trong câu gốc: ngày giờ đã bị bóc
  // đi rồi, nên không còn nguy cơ một con số hay chữ "thứ" lọt vào tên người.
  const clientName = findClient(title, knownClients);

  // Hai thứ trở lên thì chắc chắn là lịch lặp — một buổi không thể vừa diễn
  // ra thứ Hai vừa diễn ra thứ Năm.
  const repeats = daysOfWeek.length > 1 || (daysOfWeek.length === 1 && REPEAT_MARKER.test(text));

  return { title, date, startTime, endTime, clientName, daysOfWeek, repeats };
}

/**
 * Che phần đã bị bộ dò ngày lấy đi, giữ nguyên độ dài chuỗi.
 *
 * Giữ nguyên độ dài là điều kiện bắt buộc: `match.index` của bộ dò giờ phải
 * còn trỏ đúng vào chuỗi gốc, nếu không thì khoảng cắt lệch và tiêu đề mất
 * mất vài ký tự đầu.
 */
function blankOut(text: string, spans: Span[]): string {
  let out = text;
  for (const span of spans) {
    out = out.slice(0, span.start) + ' '.repeat(span.end - span.start) + out.slice(span.end);
  }
  return out;
}
