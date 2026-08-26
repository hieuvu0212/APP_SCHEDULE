// ═══════════════════════════════════════════════════════════════════════════
//  Modal — hành vi TIÊU ĐIỂM
//
//  Bốn bài dưới đây canh bốn thứ khác nhau, và cả bốn đều vô hình với người
//  dùng chuột. Chúng chỉ hỏng với người dùng bàn phím và người dùng trình đọc
//  màn hình, tức là nhóm không bao giờ báo lỗi vì họ đã quen với việc phần mềm
//  không dùng được.
//
//  jsdom KHÔNG tự di chuyển tiêu điểm khi nhấn Tab — nó không cài đặt hành vi
//  điều hướng mặc định của trình duyệt. Điều đó lại tiện: mọi lần tiêu điểm
//  dịch chuyển trong bài test đều là do MÃ CỦA TA gọi `.focus()`, nên test đo
//  đúng cái bẫy tiêu điểm chứ không đo jsdom.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '../ui';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Fixture({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <Modal title="Tiêu đề" onClose={onClose} footer={<button type="button">Lưu</button>}>
      <input aria-label="Tên" />
      <button type="button">Giữa</button>
    </Modal>
  );
}

describe('Modal — nhãn cho trình đọc màn hình', () => {
  it('nút đóng có tên, không phải một ký tự trần', () => {
    // Trước đây nút chỉ chứa "✕". Trình đọc màn hình đọc tên Unicode của ký
    // tự đó — hoặc không đọc gì — nên người dùng không biết nút này làm gì.
    render(<Fixture />);
    screen.getByRole('button', { name: 'common.close' });
  });

  it('ký tự ✕ bị ẩn khỏi cây trợ năng để không bị đọc hai lần', () => {
    render(<Fixture />);
    const close = screen.getByRole('button', { name: 'common.close' });
    expect(close.querySelector('[aria-hidden="true"]')?.textContent).toBe('✕');
  });
});

describe('Modal — tiêu điểm', () => {
  it('đưa tiêu điểm vào khung khi mở', () => {
    render(<Fixture />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('TRẢ tiêu điểm về nút đã mở nó khi đóng', () => {
    // Thiếu bước này thì đóng hộp thoại xong tiêu điểm rơi về <body>, và lần
    // Tab tiếp theo bắt đầu lại từ đầu trang — người chỉ dùng bàn phím mất
    // hoàn toàn chỗ đang đứng.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<Fixture />);
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it('không ném khi nút mở đã bị gỡ khỏi DOM lúc hộp thoại còn mở', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Fixture />);
    opener.remove(); // vd danh sách phía sau vừa được vẽ lại

    expect(() => unmount()).not.toThrow();
  });
});

describe('Modal — bẫy tiêu điểm', () => {
  it('Tab ở phần tử cuối cuộn về phần tử đầu', () => {
    render(<Fixture />);
    const items = screen.getAllByRole('button');
    const last = items[items.length - 1];
    const first = screen.getByRole('button', { name: 'common.close' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab ở phần tử đầu cuộn về phần tử cuối', () => {
    render(<Fixture />);
    const items = screen.getAllByRole('button');
    const last = items[items.length - 1];
    const first = screen.getByRole('button', { name: 'common.close' });

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(last);
  });

  it('Escape gọi onClose', () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
