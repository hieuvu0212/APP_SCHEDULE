// ═══════════════════════════════════════════════════════════════════════════
//  PERSONAL SCHEDULE SYSTEM — MÔ HÌNH DỮ LIỆU
// ═══════════════════════════════════════════════════════════════════════════
//
//  QUY ƯỚC THỜI GIAN — ĐỌC KỸ TRƯỚC KHI SỬA BẤT CỨ GÌ
//
//    · date        : "YYYY-MM-DD"  giờ treo tường tại địa phương
//    · startTime   : "HH:mm"       giờ treo tường tại địa phương
//    · month       : "YYYY-MM"
//    · createdAt…  : ISO 8601 UTC  ← CHỈ dành cho dấu thời gian hệ thống
//
//  KHÔNG lưu lịch dưới dạng UTC timestamp. Ca học 8h sáng phải là 8h sáng ở
//  mọi múi giờ. Nếu đổi sang UTC, mọi lịch quá khứ lẫn tương lai đều lệch khi
//  người dùng đổi múi giờ.
//
//  Một sự kiện LUÔN thuộc về ngày của startTime, kể cả khi kết thúc sang
//  ngày hôm sau (ca 22:00–02:00 thuộc về ngày bắt đầu).
//
//  Thời lượng lưu bằng durationMinutes, KHÔNG lưu endTime. Nhờ vậy ca qua
//  đêm không thể tạo ra thời lượng âm — trạng thái sai đó không tồn tại được.
// ═══════════════════════════════════════════════════════════════════════════

/** Mọi thực thể lưu DB đều kế thừa. Bắt buộc để Phase 7 (Cloud Sync) khả thi. */
export interface BaseEntity {
  id: string;
  /** ISO 8601 UTC */
  createdAt: string;
  /** ISO 8601 UTC — dùng để giải quyết xung đột khi đồng bộ */
  updatedAt: string;
  /** Tombstone. MỌI truy vấn phải lọc bỏ bản ghi có deletedAt. */
  deletedAt?: string;
}

// ─── Category ──────────────────────────────────────────────────────────────

export interface Category extends BaseEntity {
  name: string;
  /** HEX, vd "#f59e0b" */
  color: string;
  textColor?: string;
  defaultRatePerHour?: number;
  /**
   * Cờ GATING. false → mọi sự kiện thuộc Category này có thu nhập bằng 0,
   * bất kể ratePerHour hay fixedAmount có được điền hay không.
   */
  isIncomeEligible: boolean;
  /** true = danh mục hệ thống ("Chưa phân loại"), không cho xóa */
  isSystem?: boolean;
  sortOrder?: number;
}

// ─── Lịch lặp ──────────────────────────────────────────────────────────────

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RecurringRule extends BaseEntity {
  title: string;
  categoryId: string;

  freq: Frequency;
  /** Mặc định 1. interval=2 với freq='WEEKLY' nghĩa là cách một tuần. */
  interval: number;
  /** Dùng khi freq='WEEKLY'. LUÔN theo Date.getDay(): 0=CN, 1=T2 … 6=T7. */
  daysOfWeek?: number[];
  /** Dùng khi freq='MONTHLY'. 1–31; tháng không đủ ngày thì bỏ qua. */
  dayOfMonth?: number;

  startDate: string;
  /** BAO GỒM ngày này (inclusive). Bỏ trống = lặp vô hạn. */
  endDate?: string;
  /** Hoặc giới hạn theo số lần lặp thay cho endDate. */
  count?: number;

  startTime: string;
  durationMinutes: number;

  ratePerHour?: number;
  fixedAmount?: number;
  location?: string;
  /** Học sinh / lớp — dùng cho lịch gia sư, tránh phải tạo Category cho mỗi người */
  clientName?: string;
  tags?: string[];
  notes?: string;
}

// ─── Ngoại lệ ──────────────────────────────────────────────────────────────

export type ExceptionType =
  | 'CANCEL'   // hủy một buổi tại originalDate
  | 'MOVE'     // chuyển buổi sang ngày/giờ khác
  | 'RESIZE'   // đổi thời lượng
  | 'REPLACE'  // thay nội dung buổi
  | 'ADD'      // thêm buổi ngoài lịch gốc, không gắn rule
  | 'STATUS';  // chỉ đánh dấu trạng thái, không đổi giờ giấc

export type OccurrenceStatus =
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface ScheduleException extends BaseEntity {
  type: ExceptionType;

  /** Bỏ trống CHỈ KHI type='ADD'. */
  recurringRuleId?: string;

  /**
   * BẮT BUỘC với mọi type TRỪ 'ADD'.
   *
   * LUÔN trỏ tới ngày occurrence GỐC do rule sinh ra, KHÔNG BAO GIỜ trỏ tới
   * ngày đã dời tới. Nếu neo vào ngày đã dời, việc dời lần hai sẽ tạo chuỗi
   * exception nối nhau và thuật toán mở rộng phải truy vết đệ quy.
   */
  originalDate?: string;

  /** BẮT BUỘC với type='ADD' và type='MOVE'. */
  newDate?: string;

  newStartTime?: string;
  newDurationMinutes?: number;
  newTitle?: string;
  newCategoryId?: string;
  newRatePerHour?: number;
  newFixedAmount?: number;

  /** Cho phép thống kê "kế hoạch vs thực tế" trên lịch lặp. */
  status?: OccurrenceStatus;
  reason?: string;
}

// ─── Sự kiện đơn lẻ ────────────────────────────────────────────────────────

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

// ─── Lương ─────────────────────────────────────────────────────────────────

export type SalaryMode =
  | 'HOURLY'          // trả theo giờ — vd Rossi, tự nhập X đồng/giờ
  | 'FIXED_MONTHLY';  // khoán tháng — vd Y đồng/tháng

/** Chính sách khi giờ thực tế THẤP HƠN giờ công chuẩn. Chỉ dùng cho FIXED_MONTHLY. */
export type ShortfallPolicy =
  | 'NONE'       // nghỉ vẫn nhận đủ lương (lương khoán đúng nghĩa)
  | 'PRO_RATA';  // thiếu giờ nào trừ giờ đó theo đơn giá quy đổi

export interface SalaryRule extends BaseEntity {
  categoryId: string;
  mode: SalaryMode;

  /**
   * Khoảng hiệu lực, KHÔNG phải một tháng cụ thể.
   *
   * Bản kế hoạch gốc dùng month:"YYYY-MM" — mỗi tháng một bản ghi. Làm hai
   * năm nghĩa là 24 bản ghi giống hệt nhau, và tháng nào quên tạo là thu
   * nhập tháng đó về 0. Với khoảng hiệu lực, chỉ tạo bản mới khi lương đổi.
   *
   * effectiveFrom / effectiveTo đều BAO GỒM tháng đó. Bỏ trống effectiveTo
   * nghĩa là còn hiệu lực.
   */
  effectiveFrom: string;
  effectiveTo?: string;

  // ─── mode === 'HOURLY' ───
  ratePerHour?: number;

  // ─── mode === 'FIXED_MONTHLY' ───
  baseSalary?: number;
  /** BẮT BUỘC > 0 nếu dùng PRO_RATA hoặc overtimeMultiplier. */
  standardMonthlyHours?: number;
  shortfallPolicy?: ShortfallPolicy;

  // ─── dùng chung ───
  /** vd 1.5 — áp cho phần giờ vượt standardMonthlyHours */
  overtimeMultiplier?: number;
  /** vd 1.3 — phụ cấp ca đêm */
  nightShiftMultiplier?: number;
  nightShiftStart?: string;
  nightShiftEnd?: string;

  currency: string;
}

export type AdjustmentKind =
  | 'PENALTY'    // phạt: đi muộn, nghỉ không phép, vi phạm nội quy  → TRỪ
  | 'DEDUCTION'  // khấu trừ: BHXH, thuế, tạm ứng, đồng phục         → TRỪ
  | 'BONUS'      // thưởng: chuyên cần, KPI, doanh số, lễ tết        → CỘNG
  | 'ALLOWANCE'; // phụ cấp: ăn ca, xăng xe, điện thoại              → CỘNG

export interface PayrollAdjustment extends BaseEntity {
  categoryId: string;
  /** "YYYY-MM" — tính vào bảng lương tháng nào */
  month: string;
  kind: AdjustmentKind;
  /** vd "Đi muộn 15/09", "Thưởng chuyên cần T9" */
  label: string;
  /**
   * LUÔN LÀ SỐ DƯƠNG. Dấu do `kind` quyết định.
   *
   * Nếu cho phép số âm, sẽ có ngày nhập -50000 cho PENALTY và hệ thống trừ
   * đi số âm → CỘNG THÊM 50 nghìn. Con số vẫn trông hợp lý nên rất khó phát
   * hiện. Ràng buộc dương làm trạng thái sai đó không tồn tại được.
   */
  amount: number;

  /** Ngày xảy ra, để tra cứu về sau */
  date?: string;
  note?: string;

  linkedEventId?: string;
  linkedRuleId?: string;
  linkedOccurrenceDate?: string;
}

/** Biểu phạt/thưởng lặp lại, để bấm một nút là sinh adjustment */
export interface AdjustmentTemplate extends BaseEntity {
  categoryId: string;
  kind: AdjustmentKind;
  label: string;
  defaultAmount: number;
}

// ─── Kết quả tính toán (KHÔNG lưu DB) ──────────────────────────────────────

/** Một buổi đã materialize từ rule + exception, hoặc từ SingleEvent */
export interface Occurrence {
  /** Định danh ổn định để React dùng làm key */
  key: string;
  sourceType: 'RULE' | 'SINGLE';
  sourceId: string;
  /** Ngày occurrence gốc do rule sinh ra — dùng khi cần ghi exception */
  ruleOriginalDate?: string;

  title: string;
  categoryId: string;
  /** Ngày của startTime */
  date: string;
  startTime: string;
  durationMinutes: number;
  /** Dẫn xuất — tiện cho tầng render */
  endsNextDay: boolean;

  /** epoch ms — CHỈ dùng để so trùng lịch và sắp xếp, không hiển thị */
  startAbs: number;
  endAbs: number;

  status: OccurrenceStatus;
  ratePerHour?: number;
  fixedAmount?: number;
  location?: string;
  clientName?: string;
  notes?: string;

  hasConflict: boolean;
  /** key của các occurrence bị trùng */
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
  /** Cờ để UI cảnh báo đỏ — thường là dấu hiệu nhập liệu sai */
  isNegative: boolean;

  adjustments: PayrollAdjustment[];
}

// ─── Cấu hình ──────────────────────────────────────────────────────────────

export interface SystemSettings {
  language: 'vi' | 'en' | 'zh';
  currency: 'VND' | 'USD' | 'CNY';
  /** CHỈ ảnh hưởng thứ tự cột khi render. Không đụng tới daysOfWeek. */
  weekStartsOn: 0 | 1;
  theme: 'light' | 'dark' | 'system';
  showConflictAlerts: boolean;
  /** Buổi đã qua thời điểm hiện tại thì mặc định tính là hoàn thành */
  autoCompletePastOccurrences: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  language: 'vi',
  currency: 'VND',
  weekStartsOn: 1,
  theme: 'system',
  showConflictAlerts: true,
  autoCompletePastOccurrences: true,
};

/** ID cố định của danh mục hệ thống — dùng làm nơi gom event khi xóa Category */
export const UNCATEGORIZED_ID = 'sys-uncategorized';
