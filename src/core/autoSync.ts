// ═══════════════════════════════════════════════════════════════════════════
//  core/autoSync.ts — CÓ nên đồng bộ lúc này không
//
//  HÀM THUẦN. Không đọc đồng hồ, không chạm mạng, không biết React.
//  Phần bắt sự kiện và gọi mạng nằm ở hooks/useAutoSync.ts.
//
//  ⚠️ ĐỔI DỮ LIỆU CỤC BỘ *KHÔNG* PHẢI LÀ MỘT KÍCH HOẠT. ĐỪNG THÊM VÀO.
//
//  Nghe rất hợp lý: "sửa lịch xong thì đẩy lên luôn". Nhưng đồng bộ có chiều
//  KÉO VỀ, và kéo về là ghi vào Dexie. Ghi vào Dexie là một thay đổi cục bộ.
//  Thay đổi cục bộ kích hoạt đồng bộ. Vòng lặp khép kín, và nó chạy nhanh hết
//  mức mạng cho phép — trên máy người dùng thì đó là quạt kêu và pin tụt, trên
//  Supabase thì đó là hóa đơn.
//
//  Phá vòng lặp bằng cách "bỏ qua thay đổi do chính mình gây ra" thì phải phân
//  biệt được lệnh ghi của người dùng với lệnh ghi của tầng đồng bộ, xuyên qua
//  các lượt bất đồng bộ. Làm được, nhưng nó là một cờ trạng thái toàn cục nữa,
//  và cờ đó sai một lần là vòng lặp quay lại.
//
//  Nên kích hoạt là các sự kiện KHÔNG do đồng bộ sinh ra:
//
//      · mở ứng dụng           — lần đầu trong phiên
//      · tab được xem trở lại  — người dùng vừa từ máy khác quay sang
//      · có mạng trở lại       — vừa thoát khỏi vùng mất sóng
//      · hết một chu kỳ chờ    — app mở cả ngày trên màn hình thứ hai
//
//  Bốn cái đó phủ đúng nhu cầu thật ("giữ các máy khớp nhau") mà không cần
//  biết gì về việc ai vừa ghi cái gì.
// ═══════════════════════════════════════════════════════════════════════════

/** Vì sao tầng trên đang hỏi. Chỉ dùng để ghi log và cho test đọc được ý định. */
export type SyncTrigger = 'startup' | 'visible' | 'online' | 'interval' | 'manual';

export interface AutoSyncState {
  /** Người dùng đã bật trong Cài đặt chưa */
  enabled: boolean;
  /** Có phiên đăng nhập Supabase không */
  signedIn: boolean;
  /** navigator.onLine */
  online: boolean;
  /** Đang có một lần đồng bộ chạy dở */
  running: boolean;
  /** epoch ms của lần THỬ gần nhất, thành công hay không đều tính */
  lastAttemptAt: number | null;
  /** Số lần hỏng liên tiếp — dùng để giãn dần khoảng chờ */
  consecutiveFailures: number;
}

/**
 * Khoảng chờ tối thiểu giữa hai lần tự đồng bộ.
 *
 * Không có nó thì việc chuyển qua lại giữa hai tab sẽ bắn một lượt đồng bộ mỗi
 * lần — và người ta chuyển tab liên tục. Sáu mươi giây đủ để thao tác đó thành
 * vô hại mà vẫn đủ nhanh để "mở máy khác lên là thấy lịch mới".
 */
export const MIN_INTERVAL_MS = 60_000;

/** Chu kỳ tự chạy khi app mở suốt ngày mà không ai đụng tới */
export const POLL_INTERVAL_MS = 10 * 60_000;

/** Giãn tối đa — hỏng hoài thì thôi chờ lâu, nhưng đừng bỏ hẳn */
export const MAX_BACKOFF_MS = 30 * 60_000;

/**
 * Chờ bao lâu sau `n` lần hỏng liên tiếp.
 *
 * Nhân đôi mỗi lần: 1' → 2' → 4' → 8' → 16' → 30' (chạm trần).
 *
 * Không giãn thì máy mất mạng, hay tài khoản hết hạn, sẽ thử lại mỗi phút cho
 * tới khi người dùng đóng tab — hàng trăm request hỏng mà không ai được lợi.
 */
export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return MIN_INTERVAL_MS;
  return Math.min(MIN_INTERVAL_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
}

/**
 * Có nên chạy một lượt đồng bộ ngay bây giờ không.
 *
 * `trigger === 'manual'` bỏ qua MỌI phép chờ: người dùng vừa bấm nút thì họ
 * phải thấy một điều gì đó xảy ra. Nó vẫn tôn trọng `running` — bấm hai lần
 * không được phép sinh hai lượt chạy chồng nhau.
 */
export function shouldAutoSync(
  state: AutoSyncState,
  trigger: SyncTrigger,
  now: number,
): boolean {
  // Chạy chồng là điều kiện tiên quyết, kể cả với thao tác tay: hai lượt cùng
  // lúc sẽ đọc chung một ảnh chụp rồi ghi đè lẫn nhau ở phía đám mây.
  if (state.running) return false;

  if (trigger === 'manual') return state.signedIn;

  if (!state.enabled || !state.signedIn || !state.online) return false;
  if (state.lastAttemptAt === null) return true;

  return now - state.lastAttemptAt >= backoffMs(state.consecutiveFailures);
}
