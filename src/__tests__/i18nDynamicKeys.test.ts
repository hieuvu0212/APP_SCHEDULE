// ═══════════════════════════════════════════════════════════════════════════
//  Khóa i18n DỰNG ĐỘNG — phần mà `npm run check:i18n` không với tới
//
//  Script kiểm i18n quét văn bản nguồn tìm `t('khóa.tĩnh')`. Nó không thể phân
//  giải `t(`nav.${view}`)` vì giá trị của `view` chỉ tồn tại lúc chạy, và
//  script đã tự khai giới hạn đó ra.
//
//  ⚠️ ĐÂY KHÔNG PHẢI GIỚI HẠN KHÔNG VÁ ĐƯỢC.
//
//  Mỗi họ khóa động ở đây đều dựng từ một TẬP HỮU HẠN VÀ LIỆT KÊ ĐƯỢC — danh
//  sách màn hình, bảy ngày trong tuần. Cái mà script tĩnh không làm được thì
//  bài test làm được dễ dàng: import chính tập đó rồi thử từng phần tử.
//
//  Bài test này sinh ra từ một lỗi thật: `nav.privacy` bị thiếu ở cả ba bộ
//  ngôn ngữ ngay sau khi màn hình Chính sách riêng tư được thêm vào, vì nó là
//  màn hình DUY NHẤT không nằm trên thanh điều hướng. Tiêu đề tab hiện chuỗi
//  thô `nav.privacy · Personal Schedule System`. Cổng tĩnh không thấy, và
//  không có bài test nào nhìn vào chỗ đó.
//
//  Thêm một họ khóa động mới thì thêm một khối vào đây.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { ALL_VIEWS } from '../routes';
import en from '../i18n/en.json';
import vi from '../i18n/vi.json';
import zh from '../i18n/zh.json';

const BUNDLES = { vi, en, zh } as const;

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node !== null && typeof node === 'object' && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, bundle);
}

function expectKeyInAllBundles(key: string) {
  for (const [lang, bundle] of Object.entries(BUNDLES)) {
    const value = lookup(bundle, key);
    expect(typeof value, `thiếu \`${key}\` ở bộ ${lang}`).toBe('string');
  }
}

describe('nav.<view> — dựng trong useDocumentTitle và thanh điều hướng', () => {
  it.each(ALL_VIEWS)('nav.%s có ở cả ba ngôn ngữ', (view) => {
    // ⚠️ Duyệt ALL_VIEWS, KHÔNG phải NAV_VIEWS.
    //
    // `useDocumentTitle` chạy cho MỌI màn hình đi tới được bằng URL, kể cả màn
    // hình không có mặt trên thanh tab. Duyệt NAV_VIEWS sẽ bỏ sót đúng
    // `privacy` — tức là bỏ sót đúng cái lỗi bài test này sinh ra để bắt.
    expectKeyInAllBundles(`nav.${view}`);
  });
});

describe('weekday.s<0-6> — dựng ở sáu component khác nhau', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('weekday.s%i có ở cả ba ngôn ngữ', (day) => {
    expectKeyInAllBundles(`weekday.s${day}`);
  });
});

describe('cloud.error.<code> — dựng từ CloudError.code', () => {
  // Danh sách này phải khớp `CloudErrorCode` trong db/sync.ts. Thêm mã lỗi mới
  // mà quên khóa i18n thì người dùng nhận về một chuỗi thô đúng vào lúc có sự
  // cố — lúc tệ nhất để giao diện trông như đang hỏng.
  it.each(['notConfigured', 'notSignedIn', 'unknown'])(
    'cloud.error.%s có ở cả ba ngôn ngữ',
    (code) => {
      expectKeyInAllBundles(`cloud.error.${code}`);
    },
  );
});

describe('ba bộ ngôn ngữ có cùng tập khóa', () => {
  function flatten(obj: unknown, prefix = '', out: string[] = []): string[] {
    if (obj === null || typeof obj !== 'object') return out;
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') flatten(value, path, out);
      else out.push(path);
    }
    return out;
  }

  const viKeys = new Set(flatten(vi));

  it.each(['en', 'zh'] as const)('bộ %s không thiếu khóa nào so với vi', (lang) => {
    // `vi` là bản đầy đủ nhất theo quy ước — mọi chuỗi mới viết ở đó trước.
    // Khóa thiếu ở en/zh sẽ âm thầm rơi về tiếng Việt, và người dùng bản
    // tiếng Anh thấy một câu tiếng Việt xen giữa mà không hiểu vì sao.
    const missing = [...viKeys].filter((k) => typeof lookup(BUNDLES[lang], k) !== 'string');
    expect(missing).toEqual([]);
  });
});
