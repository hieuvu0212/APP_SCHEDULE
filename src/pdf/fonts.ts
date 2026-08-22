// ═══════════════════════════════════════════════════════════════════════════
//  pdf/fonts.ts — đăng ký font cho tài liệu PDF
//
//  ⚠️ VÌ SAO PDF PHẢI TỰ MANG FONT.
//
//  Font mặc định của định dạng PDF (Helvetica, Times) mã hóa WinAnsi — không
//  có glyph tiếng Việt có dấu, càng không có chữ Hán. Và khi thiếu glyph, PDF
//  KHÔNG bỏ trống: nó lấy glyph nằm ở chỉ số tương ứng trong bảng của font.
//  `中文` ra `-‡`. Ký tự sai trông như thật, nguy hiểm hơn ô vuông báo thiếu.
//
//  ⚠️ HAI BỘ FONT, CHỌN THEO NỘI DUNG.
//
//  Noto Sans (Latin + tiếng Việt) nặng ~500 KB. Noto Sans SC (chữ Hán) nặng
//  ~10 MB — gấp sáu mươi lần toàn bộ bundle. Nạp nó cho mọi lần xuất PDF chỉ
//  vì một người dùng có thể gõ tiếng Trung là bắt tất cả trả giá cho một
//  trường hợp hiếm.
//
//  Nên: dò nội dung trước, có chữ Hán mới tải font CJK. Và vì Noto Sans SC
//  CÓ SẴN glyph Latin, lúc đó nó lo được cả tài liệu — không cần cơ chế font
//  dự phòng nào, thứ mà @react-pdf hỗ trợ không đồng nhất giữa các phiên bản.
// ═══════════════════════════════════════════════════════════════════════════

const DIR = `${import.meta.env.BASE_URL}fonts/`;

export const LATIN_FAMILY = 'NotoSans';
export const CJK_FAMILY = 'NotoSansSC';

const LATIN_REGULAR = `${DIR}NotoSans-Regular.ttf`;
const LATIN_BOLD = `${DIR}NotoSans-Bold.ttf`;
const CJK_REGULAR = `${DIR}NotoSansSC-Regular.ttf`;
const CJK_BOLD = `${DIR}NotoSansSC-Bold.ttf`;

/** Ném khi thiếu file font, để UI hiện hướng dẫn thay vì lỗi thô */
export class MissingFontError extends Error {
  readonly family: string;

  constructor(family: string) {
    super('font-missing');
    this.name = 'MissingFontError';
    this.family = family;
  }
}

/**
 * Ném khi file có ở đó nhưng không phải font dùng được.
 *
 * fontkit chỉ nói "Unknown font format" — không cho biết nó đã đọc phải cái
 * gì, nên người dùng không có manh mối nào để sửa. Lớp này mang theo bốn byte
 * đầu đã giải mã thành thứ đọc được.
 */
export class FontFormatError extends Error {
  readonly url: string;
  readonly found: string;

  constructor(url: string, found: string) {
    super('font-format');
    this.name = 'FontFormatError';
    this.url = url;
    this.found = found;
  }
}

/** Kiểu tối thiểu của `Font` trong @react-pdf mà module này dùng tới */
interface FontModule {
  register: (config: unknown) => void;
  registerHyphenationCallback: (cb: (word: string) => string[]) => void;
}

type Verdict = { ok: true } | { ok: false; missing: boolean; found: string };

/**
 * Bốn byte đầu của file, đủ để nhận diện định dạng.
 *
 * ⚠️ HTML được xếp vào MISSING, không phải sai định dạng.
 *
 * Máy chủ dev của Vite trả về `index.html` với mã 200 cho đường dẫn không tìm
 * thấy, nên "đọc được HTML" gần như luôn có nghĩa là file không có ở đó — chứ
 * không phải ai đó đổi tên một trang web thành .ttf. Phân loại đúng ở đây
 * quyết định người dùng nhận được câu nào: "thiếu file, tải ở đây" hay
 * "file hỏng, kiểm tra ba chỗ". Câu thứ nhất mới là câu họ cần.
 */
function inspect(bytes: Uint8Array): Verdict {
  const hex = [...bytes.subarray(0, 4)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ascii = String.fromCharCode(...bytes.subarray(0, 4));

  // Các dạng font hợp lệ với fontkit
  if (hex === '00010000' || ascii === 'true' || ascii === 'ttcf') return { ok: true };
  if (ascii === 'OTTO' || ascii === 'wOFF') return { ok: true };

  if (ascii.startsWith('<')) return { ok: false, missing: true, found: 'HTML' };

  // Hai nhầm lẫn còn lại: file CÓ ở đó nhưng lấy nhầm bản.
  if (ascii.startsWith('PK')) {
    return { ok: false, missing: false, found: 'ZIP (chưa giải nén?)' };
  }
  if (ascii === 'wOF2') {
    return { ok: false, missing: false, found: 'WOFF2 (cần .ttf hoặc .otf)' };
  }
  return { ok: false, missing: false, found: `bytes ${hex}` };
}

/**
 * File có tồn tại và có đúng là font không.
 *
 * Trước đây chỉ gọi HEAD và xem mã trạng thái. Chưa đủ: máy chủ dev của Vite
 * trả về `index.html` với mã 200 cho một số đường dẫn không tìm thấy, nên
 * phép kiểm tra qua được còn fontkit thì nhận một trang HTML và chỉ kêu
 * "Unknown font format".
 *
 * Đọc CHUNK ĐẦU TIÊN thay vì cả file: font CJK nặng 10 MB và ta chỉ cần bốn
 * byte.
 */
async function checkFont(url: string, family: string): Promise<void> {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) throw new MissingFontError(family);

  const reader = response.body?.getReader();
  if (!reader) return; // không đọc được luồng thì để fontkit tự xử

  const { value } = await reader.read();
  void reader.cancel();
  if (!value || value.length < 4) throw new FontFormatError(url, 'file rỗng');

  const verdict = inspect(value);
  if (verdict.ok) return;
  if (verdict.missing) throw new MissingFontError(family);
  throw new FontFormatError(url, verdict.found);
}

async function exists(url: string): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD' }).catch(() => null);
  return !!response?.ok;
}

const registered = new Set<string>();

/**
 * Đăng ký bộ font phù hợp và trả về tên họ font để dùng cho tài liệu.
 *
 * Kiểm tra sự tồn tại TRƯỚC khi đăng ký. @react-pdf nuốt lỗi tải font và âm
 * thầm quay về Helvetica — PDF vẫn sinh ra, chỉ mất sạch dấu tiếng Việt. Thà
 * hỏng ồn ào còn hơn hỏng lặng lẽ.
 */
export async function ensureFonts(
  Font: FontModule,
  needsCjk: boolean,
): Promise<string> {
  const family = needsCjk ? CJK_FAMILY : LATIN_FAMILY;
  if (registered.has(family)) return family;

  const regular = needsCjk ? CJK_REGULAR : LATIN_REGULAR;
  await checkFont(regular, family);

  // Không có bản đậm thì dùng bản thường cho cả hai. Chữ đậm sẽ không đậm
  // hơn, nhưng tài liệu vẫn đọc được — và người dùng chỉ phải tải một file
  // 10 MB thay vì hai.
  const boldUrl = needsCjk ? CJK_BOLD : LATIN_BOLD;
  const bold = (await exists(boldUrl)) ? boldUrl : regular;

  Font.register({
    family,
    fonts: [
      { src: regular, fontWeight: 'normal' },
      { src: bold, fontWeight: 'bold' },
    ],
  });

  // Tắt tự động ngắt từ. Thuật toán của @react-pdf dựa trên tiếng Anh và cắt
  // từ tiếng Việt ra những mảnh vô nghĩa ("Giả-i tí-ch"). Với tiếng Trung thì
  // càng sai vì chữ Hán không có khái niệm ngắt từ theo âm tiết như vậy.
  Font.registerHyphenationCallback((word) => [word]);

  registered.add(family);
  return family;
}
