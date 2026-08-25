// ═══════════════════════════════════════════════════════════════════════════
//  db/cloud.ts — client Supabase, khởi tạo LƯỜI
//
//  ⚠️ VÌ SAO KHÔNG GỌI createClient Ở CẤP MODULE.
//
//  Bản trước viết `export const supabase = createClient(url, key)` ngay đầu
//  file sync.ts. Với `url` là chuỗi rỗng, supabase-js ném lỗi NGAY LÚC NẠP
//  MODULE:
//
//      index.cjs:380  if (!trimmedUrl) throw new Error("supabaseUrl is required.");
//
//  Và chuỗi phụ thuộc biến nó thành thảm họa:
//
//      SettingsView (React.lazy)  →  CloudSyncSection  →  sync.ts  →  💥
//
//  Chunk lazy vỡ lúc nạp, không ErrorBoundary nào bắt (hồi đó chưa có), React
//  gỡ cả cây — TRẮNG MÀN HÌNH. Người dùng mất luôn Sao lưu, Thùng rác, đổi
//  ngôn ngữ, đổi theme: mọi thứ nằm trong Cài đặt, chỉ vì một biến môi trường
//  thiếu cho một tính năng họ có thể chưa từng bật.
//
//  Và nó CHỈ xảy ra ở bản deploy. Máy dev có .env nên không ai thấy.
//
//  Guard `if (!supabaseUrl) throw` bên trong syncWithCloud() là code chết —
//  createClient đã ném trước khi hàm đó có cơ hội chạy.
//
//  Nguyên tắc rút ra: THIẾU CẤU HÌNH LÀ MỘT TRẠNG THÁI, KHÔNG PHẢI MỘT NGOẠI
//  LỆ. Cloud là tùy chọn, nên app không cấu hình phải chạy bình thường và nói
//  rõ vì sao mục Cloud không dùng được.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js';

const URL_KEY = 'VITE_SUPABASE_URL';
const ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env[name] ?? '').trim();
}

/**
 * Đã cấu hình đám mây chưa.
 *
 * Kiểm cả tiền tố `https://` chứ không chỉ "khác rỗng": giá trị mẫu trong
 * .env.example là `your-supabase-url`, và người ta sao chép .env.example
 * thành .env rồi quên điền. Chuỗi đó lọt qua phép kiểm rỗng, createClient
 * nhận nó, và lỗi dời sang lúc gọi mạng — xa chỗ sai thật.
 */
export function isCloudConfigured(): boolean {
  return readEnv(URL_KEY).startsWith('https://') && readEnv(ANON_KEY).length > 0;
}

/**
 * ⚠️ LƯU LỜI HỨA, KHÔNG LƯU KẾT QUẢ.
 *
 * Bản trước lưu `SupabaseClient | null` đã resolve. Nghe thì tương đương,
 * nhưng `getSupabase()` là hàm bất đồng bộ và có HAI nơi gọi nó gần như cùng
 * lúc lúc mở màn hình Tài khoản: `useSupabaseUser` và `CloudSyncSection`.
 *
 * Cả hai chạy tới `if (cached)` TRƯỚC khi `await import(...)` của bên nào
 * resolve, nên cả hai đều thấy rỗng và cả hai đều gọi `createClient`. Kết quả
 * là hai client dùng chung một khóa lưu trữ, và supabase-js cảnh báo thẳng:
 *
 *     Multiple GoTrueClient instances detected in the same browser context.
 *     …may produce undefined behavior when used concurrently.
 *
 * Đây là cuộc đua cổ điển của bộ nhớ đệm bất đồng bộ, và nó KHÔNG lộ ra trong
 * bộ test — test gọi hàm này tuần tự. Nó chỉ hiện khi mở app thật và nhìn vào
 * console.
 *
 * Lưu chính lời hứa thì lời gọi thứ hai nhận lại đúng lời hứa đang bay, và
 * `createClient` chỉ chạy một lần dù có bao nhiêu nơi gọi song song.
 */
let pending: Promise<SupabaseClient> | null = null;

/**
 * Client dùng chung, dựng ở lần gọi đầu tiên.
 *
 * Trả `null` khi chưa cấu hình — KHÔNG ném. Nơi gọi phải xử lý `null` tường
 * minh, và đó là chủ ý: kiểu trả về buộc người viết nghĩ tới trường hợp không
 * có đám mây, thay vì để nó thành một lần sập lúc chạy.
 *
 * Bất đồng bộ vì supabase-js được nạp động — thư viện nặng ~200 KB và tuyệt
 * đại đa số phiên làm việc không chạm tới nó.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  // Chưa cấu hình thì KHÔNG ghi nhớ gì cả: test đổi biến môi trường giữa
  // chừng, và ghi nhớ một câu trả lời "không" sẽ khóa nó lại vĩnh viễn.
  if (!isCloudConfigured()) return Promise.resolve(null);

  pending ??= (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(readEnv(URL_KEY), readEnv(ANON_KEY), {
      auth: { persistSession: true },
    });
  })();

  return pending;
}

/** Chỉ dùng trong test — quên gọi là client của bài trước rò sang bài sau. */
export function __resetCloudClientForTests(): void {
  pending = null;
}
