// ═══════════════════════════════════════════════════════════════════════════
//  AccountView và PrivacyView — test khói
//
//  Hai màn hình này đi qua React.lazy, nên một lỗi lúc render KHÔNG hiện ra
//  cho tới khi người dùng bấm đúng vào tab đó. Với màn hình Chính sách riêng
//  tư — thứ có thể cả tháng không ai mở — nó có thể hỏng rất lâu mà không ai
//  biết.
//
//  ⚠️ CỐ Ý KHÔNG MOCK react-i18next.
//
//  Các bài test component khác mock `t` thành hàm trả về chính khóa, vì chúng
//  quan tâm tới hành vi chứ không quan tâm chữ. Ở đây thì ngược lại: giá trị
//  lớn nhất là xác nhận MỌI KHÓA ĐỀU PHÂN GIẢI ĐƯỢC. Mock `t` sẽ làm bài test
//  xanh kể cả khi cả ba file ngôn ngữ trống rỗng — đúng lỗi của Phase 2.
//
//  `src/test/setup.ts` đã khởi tạo i18next thật cho cả bộ test.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import { AccountView } from '../AccountView';
import { PrivacyView } from '../PrivacyView';
import { SyncProvider } from '../../sync/SyncProvider';

// `AccountView` đọc trạng thái đồng bộ qua context. Bọc bằng provider THẬT
// chứ không mock `useSync`: provider là nơi duy nhất được phép gọi
// `useAutoSync`, và một bài test mock nó đi sẽ không phát hiện được nếu ai đó
// gỡ provider ra khỏi cây.
const render = (ui: React.ReactElement) => rtlRender(<SyncProvider>{ui}</SyncProvider>);

/** Khóa chưa phân giải lọt ra giao diện dưới dạng `a.b.c` — bắt bằng hình dạng */
const UNRESOLVED_KEY = /\b[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9]*){1,3}\b/;

describe('AccountView', () => {
  it('render không ném', () => {
    expect(() => render(<AccountView />)).not.toThrow();
  });

  it('nói rõ rằng không đăng nhập vẫn dùng được', () => {
    // Một màn hình tên "Tài khoản" mặc định gợi ý rằng phải có tài khoản mới
    // dùng được app. Với app này thì ngược lại, và im lặng là để người dùng
    // tự suy ra sai.
    const { container } = render(<AccountView />);
    expect(container.textContent).toContain('Không đăng nhập vẫn dùng được đầy đủ');
  });
});

describe('PrivacyView', () => {
  it('render không ném', () => {
    expect(() => render(<PrivacyView onBack={() => {}} />)).not.toThrow();
  });

  it('mọi khóa i18n đều phân giải, không lọt khóa thô ra màn hình', () => {
    const { container } = render(<PrivacyView onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toMatch(UNRESOLVED_KEY);
  });

  it('nói thẳng ba điều bất lợi thay vì lờ đi', () => {
    // Một chính sách riêng tư bỏ qua phần bất lợi là một chính sách nói dối.
    // Ba mục này dễ bị cắt đi trong một lần "dọn cho gọn" — bài test giữ chúng.
    const text = render(<PrivacyView onBack={() => {}} />).container.textContent ?? '';
    expect(text).toContain('30 ngày'); // tombstone còn lại bao lâu
    expect(text).toContain('công khai'); // anon key là công khai
    expect(text).toContain('toàn quyền truy cập'); // người vận hành đọc được DB
  });
});
