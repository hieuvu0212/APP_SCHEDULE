// ═══════════════════════════════════════════════════════════════════════════
//  Kiểm tra ranh giới: supabase_schema.sql phải khớp src/types/index.ts.
//
//  ⚠️ VÌ SAO CỔNG NÀY TỒN TẠI.
//
//  Bản SQL đầu tiên viết bảng `salary_rules` theo mô hình lương CŨ — cái đã bị
//  REVIEW bác bỏ từ Phase 0 — và thiếu bảy cột: effective_from, effective_to,
//  base_salary, overtime_multiplier, night_shift_multiplier/start/end.
//
//  Không có gì bắt được. `npm test` xanh (284 bài, không bài nào chạm SQL),
//  `tsc -b` xanh (TypeScript không đọc file .sql), lint xanh. Lỗi chỉ lộ ra
//  khi người dùng thật bấm Đồng bộ và nhận về một dòng PGRST204 khó hiểu — và
//  vì vòng lặp đồng bộ dừng ở bảng lỗi, ba bảng phía sau lặng lẽ không sync.
//
//  Đây chính xác là loại lệch mà con người không thấy khi đọc review: hai file
//  cách nhau, tên trường na ná nhau, và cái sai TRÔNG NHƯ CÁI ĐÚNG.
//
//  Cột thừa trong SQL chỉ là cảnh báo — bảng có thể mang thêm thứ riêng của
//  phía máy chủ. Cột THIẾU là lỗi: nó nghĩa là dữ liệu người dùng đi lên mây
//  rồi bốc hơi, hoặc cả lần đồng bộ vỡ.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TYPES_FILE = join('src', 'types', 'index.ts');
const SQL_FILE = 'supabase_schema.sql';

/** Bảng SQL ↔ interface TypeScript. Thêm bảng mới thì thêm vào đây. */
const TABLE_TO_INTERFACE = {
  categories: 'Category',
  clients: 'Client',
  rules: 'RecurringRule',
  exceptions: 'ScheduleException',
  events: 'SingleEvent',
  salary_rules: 'SalaryRule',
  adjustments: 'PayrollAdjustment',
  adjustment_templates: 'AdjustmentTemplate',
  payments: 'Payment',
};

/**
 * Cột chỉ có ở phía máy chủ, không tương ứng trường nào trong TypeScript.
 * `user_id` do tầng đồng bộ gắn vào lúc đẩy — client không lưu nó.
 */
const SERVER_ONLY = new Set(['user_id']);

const toSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Bỏ chú thích khối và chú thích dòng để chúng không bị nhận nhầm là trường */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Thân của `interface X { … }` — dựa vào dấu `}` ở đầu dòng để kết thúc */
function interfaceBody(src, name) {
  const start = src.search(new RegExp(`interface\\s+${name}\\b[^{]*\\{`));
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  const end = src.indexOf('\n}', open);
  return end === -1 ? null : src.slice(open + 1, end);
}

function fieldsOf(src, name) {
  const body = interfaceBody(src, name);
  if (body === null) return null;
  const fields = [];
  for (const line of stripComments(body).split('\n')) {
    const m = line.match(/^\s{2}(\w+)\??\s*:/);
    if (m) fields.push(m[1]);
  }
  return fields;
}

/** Tên cột của `CREATE TABLE … ( … )`, bỏ qua các dòng ràng buộc */
function columnsOf(sql, table) {
  const re = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table}\\s*\\(`);
  const start = sql.search(re);
  if (start === -1) return null;
  const open = sql.indexOf('(', start);
  const end = sql.indexOf('\n);', open);
  if (end === -1) return null;

  const NOT_A_COLUMN = /^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|EXCLUDE)$/i;
  const cols = [];
  for (const line of stripComments(sql.slice(open + 1, end)).split('\n')) {
    const m = line.match(/^\s{2}(\w+)\s+/);
    if (m && !NOT_A_COLUMN.test(m[1])) cols.push(m[1]);
  }
  return cols;
}

// ─── So khớp ────────────────────────────────────────────────────────────────

const types = readFileSync(TYPES_FILE, 'utf8');
const sql = readFileSync(SQL_FILE, 'utf8');

const base = fieldsOf(types, 'BaseEntity');
if (!base) {
  console.error(`❌ Không tìm thấy interface BaseEntity trong ${TYPES_FILE}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

for (const [table, iface] of Object.entries(TABLE_TO_INTERFACE)) {
  const own = fieldsOf(types, iface);
  if (!own) {
    errors.push(`${table}: không tìm thấy interface ${iface} trong ${TYPES_FILE}`);
    continue;
  }

  const cols = columnsOf(sql, table);
  if (!cols) {
    errors.push(`${table}: không tìm thấy CREATE TABLE public.${table} trong ${SQL_FILE}`);
    continue;
  }

  const expected = new Set([...base, ...own].map(toSnake));
  const actual = new Set(cols);

  for (const want of expected) {
    if (!actual.has(want)) {
      errors.push(`${table}: THIẾU cột \`${want}\`  (${iface}.${want.replace(/_(\w)/g, (_, c) => c.toUpperCase())})`);
    }
  }
  for (const got of actual) {
    if (!expected.has(got) && !SERVER_ONLY.has(got)) {
      warnings.push(`${table}: cột \`${got}\` không tương ứng trường nào trong ${iface}`);
    }
  }
}

if (warnings.length > 0) {
  console.warn('⚠️  Cột thừa ở phía SQL:\n');
  console.warn(warnings.map((w) => `  ${w}`).join('\n'));
  console.warn('');
}

if (errors.length > 0) {
  console.error('❌ LƯỢC ĐỒ ĐÁM MÂY LỆCH KHỎI TYPESCRIPT:\n');
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  console.error(`\nSửa ${SQL_FILE} cho khớp, rồi chạy lại migration trên Supabase.`);
  console.error('Chi tiết vì sao cổng này tồn tại: đọc đầu file scripts/check-cloud-schema.mjs');
  process.exit(1);
}

const n = Object.keys(TABLE_TO_INTERFACE).length;
console.log(`✅ Lược đồ đám mây khớp TypeScript (${n} bảng)`);
