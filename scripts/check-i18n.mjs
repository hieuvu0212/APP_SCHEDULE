// ═══════════════════════════════════════════════════════════════════════════
//  Kiểm tra ranh giới: mọi khóa `t('…')` phải có mặt ở CẢ BA bộ ngôn ngữ.
//
//  ⚠️ VÌ SAO CỔNG NÀY TỒN TẠI.
//
//  Toàn bộ mục Đồng bộ đám mây của Phase 2 được viết mà KHÔNG có lấy một khóa
//  nào trong vi.json, en.json hay zh.json. Giao diện vẫn hiện tiếng Việt hoàn
//  hảo ở cả ba ngôn ngữ, vì mã dùng dạng có chuỗi dự phòng:
//
//      t('cloud.title', 'Đồng bộ Đám mây')
//
//  Tham số thứ hai làm màn hình trông ổn ngay lập tức, và chính vì thế mà
//  không ai phát hiện. Đổi sang English thì vẫn ra tiếng Việt — không lỗi,
//  không cảnh báo, không có gì để nhận ra.
//
//  Cổng này bắt cả hai mặt của vấn đề: khóa thiếu, và dạng gọi có chuỗi dự
//  phòng vốn là thứ che giấu khóa thiếu.
//
//  ─── GIỚI HẠN ĐÃ BIẾT ─────────────────────────────────────────────────────
//
//  Khóa dựng động (`t(\`nav.${view}\`)`) không kiểm tĩnh được. Script liệt kê
//  chúng ra để người đọc tự soi, chứ không coi là lỗi. Đây là đánh đổi có ý
//  thức: một cổng bắt được 90% trường hợp và chạy trong 50ms đáng giá hơn một
//  bộ phân tích cú pháp đầy đủ mà không ai chịu bảo trì.
// ═══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const LANGS = ['vi', 'en', 'zh'];

/** `t('a.b')` hoặc `t("a.b")` — bắt cả tham số thứ hai để tố cáo chuỗi dự phòng */
const T_CALL = /\bt\(\s*(['"])([\w.]+)\1\s*(,)?/g;

/** t(`nav.${v}`) — không kiểm tĩnh được, chỉ liệt kê */
const T_DYNAMIC = /\bt\(\s*`([^`]*\$\{[^`]*)`/g;

/**
 * Bỏ chú thích trước khi quét.
 *
 * Không bỏ thì một dòng chú thích như `// Viết t('...') ngay từ đầu` bị đọc
 * thành một khóa tên `...` và cổng báo đỏ vì một câu văn xuôi. Cảnh báo giả
 * là cách nhanh nhất khiến người ta ngừng tin vào cổng chặn.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue; // test được phép mock `t`
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

const bundles = Object.fromEntries(
  LANGS.map((lang) => [lang, flatten(JSON.parse(readFileSync(`src/i18n/${lang}.json`, 'utf8')))]),
);

const used = new Map(); // khóa → file đầu tiên dùng nó
const withFallback = [];
const dynamic = [];

for (const file of walk(SRC)) {
  const source = stripComments(readFileSync(file, 'utf8'));

  for (const m of source.matchAll(T_CALL)) {
    const [, , key, comma] = m;
    if (!used.has(key)) used.set(key, file);
    // Dấu phẩy sau khóa nghĩa là có tham số thứ hai. Nó có thể là chuỗi dự
    // phòng (cấm) hoặc object nội suy như { count } (hợp lệ) — phân biệt bằng
    // ký tự đầu tiên khác khoảng trắng phía sau.
    if (comma) {
      const rest = source.slice(m.index + m[0].length).trimStart();
      if (rest.startsWith('"') || rest.startsWith("'") || rest.startsWith('`')) {
        withFallback.push(`${file}  t('${key}', …)`);
      }
    }
  }

  for (const m of source.matchAll(T_DYNAMIC)) dynamic.push(`${file}  t(\`${m[1]}\`)`);
}

const errors = [];

for (const [key, file] of used) {
  const missing = LANGS.filter((lang) => !bundles[lang].has(key));
  if (missing.length > 0) {
    errors.push(`thiếu khóa \`${key}\` ở [${missing.join(', ')}]  — dùng tại ${file}`);
  }
}

for (const line of withFallback) {
  errors.push(`chuỗi dự phòng inline — bỏ tham số thứ hai đi:  ${line}`);
}

if (dynamic.length > 0) {
  console.log(`ℹ️  ${dynamic.length} khóa dựng động, không kiểm tĩnh được:`);
  console.log(dynamic.map((d) => `   ${d}`).join('\n'));
  console.log('');
}

if (errors.length > 0) {
  console.error('❌ i18n CHƯA ĐẦY ĐỦ:\n');
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  console.error('\nMọi chuỗi hiển thị phải có khóa ở cả ba bộ vi/en/zh.');
  console.error('Chi tiết vì sao: đọc đầu file scripts/check-i18n.mjs');
  process.exit(1);
}

console.log(`✅ i18n đầy đủ (${used.size} khóa × ${LANGS.length} ngôn ngữ)`);
