// ═══════════════════════════════════════════════════════════════════════════
//  Kiểm tra ranh giới: core/ phải là hàm thuần, không phụ thuộc React/Dexie.
//
//  Vỡ ranh giới này là mất khả năng test nhanh (phải dựng DOM) và mất tính di
//  động sang Cloud DB (phải viết lại cả core/ chứ không riêng db/).
//
//  ⚠️ VIẾT BẰNG NODE, KHÔNG PHẢI BASH.
//
//  Bản cũ là script .sh gọi qua `bash`. Trên Windows, `bash` thường trỏ vào
//  WSL; máy nào chưa cài distro nào thì lệnh chết với "Windows Subsystem for
//  Linux has no installed distributions" — và cổng kiểm tra im lặng biến mất
//  khỏi quy trình của người đó. Node thì `npm` nào cũng có sẵn, không có gì
//  để thiếu.
// ═══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join('src', 'core');
const FORBIDDEN = /\bfrom\s+['"](react|react-dom|dexie|dexie-react-hooks)['"]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (FORBIDDEN.test(line)) hits.push(`  ${file}:${i + 1}  ${line.trim()}`);
  });
}

if (hits.length > 0) {
  console.error('❌ VỠ RANH GIỚI — core/ đang import React hoặc Dexie:\n');
  console.error(hits.join('\n'));
  console.error('\nchi tiết vì sao: xem phần "Quy tắc bất di bất dịch" trong README.');
  process.exit(1);
}

console.log('✅ core/ vẫn thuần khiết (không import React/Dexie)');
