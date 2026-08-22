// ═══════════════════════════════════════════════════════════════════════════
//  Thiết lập chung cho Vitest
//
//  `fake-indexeddb/auto` gắn một bản IndexedDB chạy hoàn toàn trong bộ nhớ vào
//  globalThis. Dexie không biết gì về chuyện đó — nó chỉ thấy `indexedDB` như
//  bình thường — nên tầng db/ chạy đúng mã thật, không phải mock.
//
//  Đây là điểm khác biệt quan trọng: mock lại `db.rules.update()` chỉ kiểm tra
//  được rằng ta gọi đúng hàm, chứ không kiểm tra được rằng Dexie hiểu
//  `deletedAt: undefined` là lệnh XÓA thuộc tính. Mà đó lại chính là hành vi
//  toàn bộ cơ chế hoàn tác dựa vào.
//
//  ⚠️ Phải import TRƯỚC mọi thứ chạm tới Dexie. Vitest nạp setupFiles trước
//  file test nên thứ tự được đảm bảo.
// ═══════════════════════════════════════════════════════════════════════════

import 'fake-indexeddb/auto';

// ⚠️ KHÔNG dùng @testing-library/jest-dom.
//
// Bộ matcher của nó (`toBeInTheDocument`, `toHaveValue`) không gắn được vào
// `expect` của Vitest ở phiên bản đang dùng, và quan trọng hơn: chúng gần như
// thừa. `getByText()` và `getByRole()` ĐÃ TỰ NÉM LỖI khi không tìm thấy, nên
// `.toBeInTheDocument()` phía sau chỉ là trang trí. Giá trị ô nhập thì so
// thẳng `input.value` — rõ ràng hơn và không phụ thuộc vào gì cả.

// Khởi tạo i18next MỘT LẦN cho cả bộ test. Component nào cũng gọi
// `useTranslation()`, và nếu chưa init thì `t('...')` trả về khóa thô — test
// sẽ đi tìm chữ "Lưu" trong khi màn hình đang hiện "common.save".
import '../i18n';
