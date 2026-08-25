// ═══════════════════════════════════════════════════════════════════════════
//  Sinh ảnh bitmap từ public/icon.svg
//
//  Chạy tay khi icon.svg đổi:  node scripts/generate-icons.mjs
//
//  KHÔNG nằm trong `npm run build`. Ảnh sinh ra được commit vào repo, nên
//  build không cần `sharp` — một phụ thuộc có mã nhị phân theo nền tảng, thứ
//  hay hỏng nhất trên CI. Ảnh đổi vài tháng một lần, build chạy mỗi lần push.
// ═══════════════════════════════════════════════════════════════════════════

import sharp from 'sharp';

const ICON = 'public/icon.svg';

/**
 * Ảnh chia sẻ mạng xã hội — 1200×630, tỉ lệ mà Facebook, X, LinkedIn, Slack,
 * Discord và Zalo đều dùng.
 *
 * Vẽ riêng chứ không phóng to icon: biểu tượng vuông kéo giãn ra khung ngang
 * sẽ méo, còn đặt vào giữa thì thừa hai mảng trống hai bên. Tấm thẻ này cần
 * mang được CHỮ — khi liên kết hiện trong một khung chat, chữ mới là thứ nói
 * cho người ta biết đây là cái gì.
 */
const SOCIAL_CARD = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0f172a"/>

  <!-- Dải màu nhấn ở mép trái, đồng bộ với bộ theme navy mặc định -->
  <rect width="16" height="630" fill="#f59e0b"/>

  <g transform="translate(96 168) scale(0.82)">
    <rect x="0" y="24" width="320" height="280" rx="32" fill="#f8fafc"/>
    <rect x="0" y="24" width="320" height="72" rx="32" fill="#f59e0b"/>
    <rect x="0" y="64" width="320" height="32" fill="#f59e0b"/>
    <rect x="72" y="0" width="28" height="56" rx="14" fill="#0f172a"/>
    <rect x="220" y="0" width="28" height="56" rx="14" fill="#0f172a"/>
    <g fill="#cbd5e1">
      <rect x="40" y="136" width="48" height="40" rx="10"/>
      <rect x="136" y="136" width="48" height="40" rx="10"/>
      <rect x="232" y="136" width="48" height="40" rx="10"/>
      <rect x="40" y="208" width="48" height="40" rx="10"/>
      <rect x="232" y="208" width="48" height="40" rx="10"/>
    </g>
    <rect x="136" y="208" width="48" height="40" rx="10" fill="#10b981"/>
  </g>

  <g fill="#f8fafc" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
    <text x="440" y="284" font-size="60" font-weight="700">Personal Schedule</text>
    <text x="440" y="352" font-size="60" font-weight="700">System</text>
    <text x="440" y="412" font-size="27" fill="#94a3b8">
      Lich ca nhan da loai, kem theo doi thu nhap
    </text>
    <text x="440" y="452" font-size="27" fill="#94a3b8">
      Du lieu nam tren may ban
    </text>
  </g>
</svg>`;

async function generate() {
  await sharp(ICON).resize(192, 192).png().toFile('public/icon-192.png');
  await sharp(ICON).resize(512, 512).png().toFile('public/icon-512.png');

  // ⚠️ Chữ trong thẻ social viết KHÔNG DẤU.
  //
  // `sharp` vẽ SVG bằng librsvg, và librsvg tra font trong fontconfig của HỆ
  // ĐIỀU HÀNH — không phải font của trình duyệt. Máy CI (ubuntu-latest) có rất
  // ít font, và chữ có dấu sẽ ra ô vuông tofu. Ảnh vẫn sinh ra, vẫn được
  // commit, và không ai phát hiện cho tới khi thấy liên kết hiện trong Zalo.
  //
  // Muốn có dấu thì phải nhúng font vào SVG dưới dạng base64 — thêm vài trăm
  // KB và một đường hỏng nữa, cho một tấm ảnh mà đa số người dùng không bao
  // giờ nhìn thấy. Không đáng.
  await sharp(Buffer.from(SOCIAL_CARD)).png().toFile('public/og-image.png');

  console.log('✓ icon-192.png, icon-512.png, og-image.png');
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
