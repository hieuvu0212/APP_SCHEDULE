// ═══════════════════════════════════════════════════════════════════════════
//  pdf/exportSchedulePdf.tsx — sinh file PDF và tải xuống
//
//  ⚠️ NẠP ĐỘNG, KHÔNG import tĩnh.
//
//  `@react-pdf/renderer` nặng khoảng 456 KB gzip, gấp gần ba lần toàn bộ
//  bundle hiện tại (158 KB). Nhét vào bundle chính là bắt mọi người tải nó
//  mỗi lần mở ứng dụng, chỉ để phục vụ một nút thỉnh thoảng mới bấm.
//
//  `await import()` đẩy cả thư viện lẫn SchedulePdf sang một chunk riêng, chỉ
//  tải khi người dùng thật sự bấm Xuất PDF. Bundle chính không đổi một byte.
//
//  Font cũng theo nguyên tắc đó, xem pdf/fonts.ts: bộ Latin ~500 KB tải khi
//  xuất lần đầu, bộ CJK ~10 MB CHỈ tải khi lịch thật sự có chữ Hán.
// ═══════════════════════════════════════════════════════════════════════════

import type { Category, Occurrence, SalaryRule } from '../types';
import { ensureFonts } from './fonts';
import {
  buildPdfModel,
  findUnsupportedText,
  pdfFileName,
  type PdfModelInput,
} from './model';

// Chuyển tiếp để App chỉ phải biết một điểm vào duy nhất cho việc xuất PDF,
// không cần biết font nằm ở module nào.
export { MissingFontError, FontFormatError } from './fonts';

export interface ExportInput {
  dates: string[];
  occurrences: Occurrence[];
  categories: Map<string, Category>;
  salaryRules: SalaryRule[];
  labels: PdfModelInput['labels'];
  format: PdfModelInput['format'];
}

export async function exportSchedulePdf(input: ExportInput): Promise<void> {
  const [{ Font, pdf }, { SchedulePdf }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./SchedulePdf'),
  ]);

  const model = buildPdfModel(input);

  // Dò nội dung TRƯỚC khi nạp font. Có chữ Hán, kana, Hangul hay emoji thì
  // phải dùng bộ CJK — bộ Latin sẽ vẽ ra ký tự sai chứ không phải ô trống.
  const needsCjk = findUnsupportedText(model) !== null;
  const fontFamily = await ensureFonts(Font as never, needsCjk);

  const blob = await pdf(<SchedulePdf model={model} fontFamily={fontFamily} />).toBlob();

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfFileName(input.dates);
    link.click();
  } finally {
    // Không thu hồi thì blob nằm lại trong bộ nhớ tới khi đóng tab. Vài chục
    // lần xuất là vài chục megabyte không ai dọn.
    URL.revokeObjectURL(url);
  }
}
