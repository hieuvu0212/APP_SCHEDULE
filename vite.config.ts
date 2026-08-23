/// <reference types="vitest" />
// LƯU Ý: defineConfig import từ 'vitest/config', KHÔNG phải từ 'vite'.
// Bản của 'vite' không nhận khóa `test` → TypeScript báo lỗi ngay.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // ĐƯỜNG DẪN TƯƠNG ĐỐI.
  //
  // GitHub Pages phục vụ site tại https://<user>.github.io/<tên-repo>/, tức là
  // trong một thư mục con. Với base mặc định '/', mọi thẻ script sẽ trỏ tới
  // /assets/… ở gốc tên miền và trang ra trắng.
  //
  // Dùng './' thay vì viết cứng '/APP_SCHEDULE/': không phải sửa file này khi
  // đổi tên repo, và mở thẳng thư mục dist bằng file:// cũng chạy. Cách này an
  // toàn vì ứng dụng chỉ có MỘT trang, không có router lồng nhiều cấp.
  base: './',

  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Gắn IndexedDB chạy trong bộ nhớ để tầng db/ test được bằng mã thật.
    setupFiles: ['./src/test/setup.ts'],
  },
});
