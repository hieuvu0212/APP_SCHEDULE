// ═══════════════════════════════════════════════════════════════════════════
//  pdf/exportSchedulePdf.tsx — sinh file PDF và tải xuống
//
//  ⚠️ NẠP ĐỘNG, KHÔNG import tĩnh.
//
//  `@react-pdf/renderer` nặng khoảng 350 KB gzip, gần gấp ba toàn bộ bundle
//  hiện tại (156 KB). Nhét vào bundle chính là bắt mọi người tải nó mỗi lần
//  mở ứng dụng, chỉ để phục vụ một nút thỉnh thoảng mới bấm.
//
//  `await import()` đẩy cả thư viện lẫn SchedulePdf sang một chunk riêng, chỉ
//  tải khi người dùng thật sự bấm Xuất PDF. Bundle chính không đổi một byte.
//
//  ⚠️ VÌ SAO PHẢI NẠP FONT RIÊNG.
//
//  Font mặc định của PDF (Helvetica, Times) mã hóa WinAnsi — KHÔNG có glyph
//  tiếng Việt có dấu. "Đại học" sẽ ra "ai hc" hoặc một dãy ô vuông, và tệ hơn
//  là nó ra như vậy mà không báo lỗi gì. Phải đăng ký một file TTF thật.
//
//  Chữ Hán cần thêm một font CJK ~8–10 MB nữa; hiện chưa nạp, nên tiêu đề
//  tiếng Trung sẽ ra ô vuông trong PDF. Dùng nút "In" cho trường hợp đó —
//  trình duyệt in bằng font hệ thống nên Unicode luôn đúng.
// ═══════════════════════════════════════════════════════════════════════════

import type { Category, Occurrence, SalaryRule } from '../types';
import {
  buildPdfModel,
  findUnsupportedText,
  pdfFileName,
  type PdfModelInput,
} from './model';

/** Thư mục chứa font, theo base URL của bản build */
const FONT_DIR = `${import.meta.env.BASE_URL}fonts/`;
const REGULAR = `${FONT_DIR}NotoSans-Regular.ttf`;
const BOLD = `${FONT_DIR}NotoSans-Bold.ttf`;

/** Ném khi thiếu file font, để UI hiện được câu hướng dẫn thay vì lỗi thô */
export class MissingFontError extends Error {
  constructor() {
    super('font-missing');
    this.name = 'MissingFontError';
  }
}

/**
 * Ném khi lịch chứa chữ mà font Latin không vẽ được.
 *
 * KHÔNG sinh file rồi cảnh báo: PDF sẽ ra ký tự sai trông như thật (中文 →
 * "-‡") chứ không phải ô vuông, nên người dùng có thể gửi đi mà không biết.
 */
export class UnsupportedGlyphError extends Error {
  // Khai báo và gán TƯỜNG MINH, không dùng tham số-thuộc tính
  // `constructor(public sample: string)`.
  //
  // `erasableSyntaxOnly` trong tsconfig.app.json cấm cú pháp cần biên dịch
  // thật, và tham số-thuộc tính đúng là loại đó: nó SINH RA mã gán chứ không
  // chỉ là chú thích kiểu. Vite dùng esbuild vốn chỉ bóc kiểu đi, nên trường
  // này sẽ biến mất lúc chạy — `e.sample` là undefined và câu báo lỗi mất
  // luôn đoạn chữ cần chỉ ra.
  readonly sample: string;

  constructor(sample: string) {
    super('unsupported-glyph');
    this.name = 'UnsupportedGlyphError';
    this.sample = sample;
  }
}

let fontsReady = false;

async function ensureFonts(Font: {
  register: (config: unknown) => void;
  registerHyphenationCallback: (cb: (word: string) => string[]) => void;
}): Promise<void> {
  if (fontsReady) return;

  // Kiểm tra sự tồn tại TRƯỚC khi đăng ký. @react-pdf nuốt lỗi tải font và
  // âm thầm quay về Helvetica — tức là PDF vẫn sinh ra, chỉ mất hết dấu
  // tiếng Việt. Thà hỏng to còn hơn hỏng lặng lẽ.
  const probe = await fetch(REGULAR, { method: 'HEAD' }).catch(() => null);
  if (!probe?.ok) throw new MissingFontError();

  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: REGULAR, fontWeight: 'normal' },
      { src: BOLD, fontWeight: 'bold' },
    ],
  });

  // Tắt tự động ngắt từ. Thuật toán ngắt của @react-pdf dựa trên tiếng Anh
  // và cắt từ tiếng Việt ra những mảnh vô nghĩa ("Giả-i tí-ch").
  Font.registerHyphenationCallback((word) => [word]);

  fontsReady = true;
}

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

  // Kiểm TRƯỚC khi nạp font và render: thà không có file còn hơn có file sai.
  const unsupported = findUnsupportedText(model);
  if (unsupported) throw new UnsupportedGlyphError(unsupported);

  await ensureFonts(Font as never);
  const blob = await pdf(<SchedulePdf model={model} />).toBlob();

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
