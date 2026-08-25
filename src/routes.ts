// ═══════════════════════════════════════════════════════════════════════════
//  routes.ts — danh sách màn hình và ánh xạ sang URL hash
//
//  HÀM THUẦN, nhưng CỐ Ý KHÔNG nằm trong core/.
//
//  `core/` là logic nghiệp vụ — thứ sống sót qua một lần viết lại toàn bộ giao
//  diện: thời gian, lương, mở rộng lịch lặp. Điều hướng thì ngược lại, nó CHÍNH
//  LÀ giao diện. Nhét vào core/ sẽ làm mờ đúng cái ranh giới mà `check:core`
//  tồn tại để canh.
//
//  ─── VÌ SAO DÙNG HASH CHỨ KHÔNG DÙNG HISTORY API ──────────────────────────
//
//  Ứng dụng deploy lên GitHub Pages, và `vite.config.ts` đặt `base: './'` để
//  mở thẳng thư mục `dist` bằng `file://` cũng chạy. Với đường dẫn thật
//  (`/payroll`), máy chủ tĩnh sẽ trả 404 khi người dùng tải lại trang hoặc mở
//  bookmark — GitHub Pages không có cách nào viết lại mọi đường dẫn về
//  index.html. Hash không bao giờ đi tới máy chủ, nên nó chạy ở mọi nơi kể cả
//  `file://`.
//
//  ─── VÌ SAO MỌI MÀN HÌNH ĐỀU CÓ HASH, KỂ CẢ MÀN HÌNH MẶC ĐỊNH ─────────────
//
//  Cho Tổng quan một URL trống sạch hơn về mặt thẩm mỹ, nhưng nó tạo ra hai
//  cách biểu diễn cùng một trạng thái, và mọi phép so `location.hash !== target`
//  phải mang theo một ngoại lệ. Một luật không ngoại lệ đáng giá hơn một dấu
//  `#/dashboard` hơi thừa.
// ═══════════════════════════════════════════════════════════════════════════

export type View =
  | 'dashboard'
  | 'week'
  | 'month'
  | 'list'
  | 'payroll'
  | 'dues'
  | 'stats'
  | 'manage'
  | 'account'
  | 'settings'
  | 'privacy';

/**
 * Màn hình có mặt trên thanh điều hướng.
 *
 * `privacy` cố ý KHÔNG nằm đây: nó là trang pháp lý, đọc một lần rồi thôi.
 * Chiếm một ô trên thanh tab của công cụ dùng hằng ngày là sai tỉ lệ. Nó tới
 * được qua link ở chân trang và qua `#/privacy`.
 */
export const NAV_VIEWS: View[] = [
  'account',
  'dashboard',
  'week',
  'month',
  'list',
  'payroll',
  'dues',
  'stats',
  'manage',
  'settings',
];

/** Mọi màn hình đi tới được bằng URL — gồm cả những màn hình ngoài thanh tab */
export const ALL_VIEWS: View[] = [...NAV_VIEWS, 'privacy'];

/** Màn hình có thanh điều hướng thời gian */
export const TIME_VIEWS: View[] = ['week', 'month', 'payroll', 'dues'];

/**
 * Màn hình có thanh Thêm nhanh.
 *
 * Nó tạo ra một BUỔI, nên chỉ có nghĩa ở những màn hình đang xem buổi. Trước
 * đây thanh này nằm ngoài mọi điều kiện nên hiện trên cả chín màn hình — kể cả
 * Cài đặt, Bảng lương và Thống kê, nơi một ô "Học toán 18h thứ 3" chỉ gây khó
 * hiểu. Quản lý cũng loại: ở đó người dùng đang thao tác với CHUỖI lặp, mà
 * Thêm nhanh chỉ sinh được buổi đơn lẻ.
 */
export const QUICK_ADD_VIEWS: View[] = ['dashboard', 'week', 'month', 'list'];

export const DEFAULT_VIEW: View = 'dashboard';

/** 'week' → '#/week' */
export function hashOfView(view: View): string {
  return `#/${view}`;
}

/**
 * '#/week' → 'week'. Chuỗi lạ trả `null` để nơi gọi tự chọn mặc định.
 *
 * KHÔNG ép về `DEFAULT_VIEW` ở đây. Trả `null` cho phép phân biệt "không có
 * hash" với "hash sai" — và nơi duy nhất cần phân biệt là trang 404.
 */
export function viewFromHash(hash: string): View | null {
  const name = hash.replace(/^#\/?/, '');
  return (ALL_VIEWS as string[]).includes(name) ? (name as View) : null;
}
