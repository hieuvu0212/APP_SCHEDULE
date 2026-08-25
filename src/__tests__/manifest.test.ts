// ═══════════════════════════════════════════════════════════════════════════
//  manifest.webmanifest — lối tắt phải trỏ vào màn hình CÓ THẬT
//
//  Lối tắt PWA là URL viết tay trong một file JSON. Không có gì nối chúng với
//  `ALL_VIEWS` trong routes.ts, nên đổi tên một màn hình sẽ để lại một lối tắt
//  trỏ vào hư không — và nó hỏng ở nơi khó phát hiện nhất: menu chuột phải
//  trên biểu tượng ứng dụng ĐÃ CÀI, thứ mà người phát triển gần như không bao
//  giờ mở.
//
//  Bài test này là sợi dây duy nhất giữa hai file đó.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
// `?raw` chứ không phải `node:fs`. `tsconfig.app.json` khai `types: ["vite/client"]`
// và cố ý KHÔNG kéo vào kiểu của Node — mã trong `src/` chạy trên trình duyệt,
// mở cửa cho `node:fs` ở đây là mở cho cả những chỗ không nên dùng nó.
import manifestSource from '../../public/manifest.webmanifest?raw';
import { ALL_VIEWS, hashOfView, type View } from '../routes';

interface Manifest {
  start_url: string;
  shortcuts?: Array<{ name: string; short_name?: string; url: string }>;
}

const manifest = JSON.parse(manifestSource) as Manifest;

describe('lối tắt PWA', () => {
  const shortcuts = manifest.shortcuts ?? [];

  it('có ít nhất một lối tắt', () => {
    expect(shortcuts.length).toBeGreaterThan(0);
  });

  it.each(shortcuts.map((s) => [s.short_name ?? s.name, s.url] as const))(
    'lối tắt %s trỏ vào một màn hình có thật',
    (_label, url) => {
      const hash = url.slice(url.indexOf('#'));
      const known = ALL_VIEWS.map((v: View) => hashOfView(v));
      expect(known).toContain(hash);
    },
  );

  it('mọi lối tắt dùng đường dẫn tương đối như start_url', () => {
    // `vite.config.ts` đặt `base: './'` để mở `dist` bằng file:// cũng chạy.
    // Một lối tắt viết `/#/week` sẽ trỏ về gốc tên miền, tức là sai với bản
    // deploy dạng dự án trên GitHub Pages (`/tên-repo/`).
    for (const s of shortcuts) expect(s.url.startsWith('./')).toBe(true);
  });
});
