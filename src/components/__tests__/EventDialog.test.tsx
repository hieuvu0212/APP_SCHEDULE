// ═══════════════════════════════════════════════════════════════════════════
//  Test tầng React — bài đầu tiên trong dự án
//
//  `@testing-library/react` nằm trong package.json từ Phase 0 và chưa từng
//  được import lần nào. Trong khi đó cả ba lỗi lọt lưới gần đây đều phát sinh
//  đúng ở tầng này: ô số nằm trong <label>, cột biểu đồ cao 0px, và bộ lọc
//  nhắc lịch. 199 test ở `core/` không bắt được cái nào — không phải vì chúng
//  yếu, mà vì chúng nhìn sai chỗ.
//
//  Bài quan trọng nhất ở đây là bài "gõ được số buổi": nó chặn tái phát đúng
//  con bug đã khiến chuỗi `TEST COUNT` giới hạn 3 buổi lại lưu thành 10.
//
//  ⚠️ Không dùng matcher của jest-dom. `getByRole()` đã tự ném lỗi khi không
//  tìm thấy, nên `.toBeInTheDocument()` là thừa; giá trị ô nhập so thẳng
//  `.value` cho rõ.
// ═══════════════════════════════════════════════════════════════════════════

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Category } from '../../types';
import { EventDialog, type SubmitPayload } from '../EventDialog';

const categories: Category[] = [
  {
    id: 'dh',
    name: 'Đại học',
    color: '#3b82f6',
    isIncomeEligible: false,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

let submitted: SubmitPayload | null = null;

function open() {
  submitted = null;
  render(
    <EventDialog
      target={{ kind: 'create', date: '2026-07-31', startTime: '08:00' }}
      categories={categories}
      onSubmit={(payload) => {
        submitted = payload;
      }}
      onClose={vi.fn()}
    />,
  );
}

const valueOf = (el: HTMLElement) => (el as HTMLInputElement).value;

/**
 * Bấm Lưu rồi CHỜ.
 *
 * `submit` trong EventDialog là hàm async: nó `await onSubmit(...)` rồi mới
 * `setSaving(false)`. Dù onSubmit của test đồng bộ, phép await vẫn đẩy lần
 * setState đó sang microtask kế tiếp — ngoài phạm vi act() của fireEvent, và
 * React cảnh báo. `waitFor` bọc act nên vừa hết cảnh báo vừa chờ đúng lúc.
 */
async function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDefined();
  });
}

afterEach(cleanup);

// ───────────────────────────────────────────────────────────────────────────

describe('ô "Sau số buổi" — chặn tái phát lỗi <label> lồng ô nhập', () => {
  it('gõ được số vào ô, và số đó đi vào payload', async () => {
    // Lỗi cũ: ô số nằm TRONG thẻ <label> của radio. Một <label> không có
    // thuộc tính `for` gắn với thẻ nhập đầu tiên bên trong nó — cái radio.
    // Mọi cú bấm vào ô số bị chuyển thành cú bấm lên radio, tiêu điểm nhảy
    // đi, và giá trị mặc định '10' được lưu thay vì con số người dùng gõ.
    open();

    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'TEST COUNT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hàng tuần' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sau số buổi' }));

    // `spinbutton` phân biệt ô number với cái radio cùng nhãn.
    const countInput = screen.getByRole('spinbutton', { name: 'Sau số buổi' });
    fireEvent.change(countInput, { target: { value: '3' } });
    expect(valueOf(countInput)).toBe('3');

    await save();

    expect(submitted).not.toBeNull();
    expect(submitted!.recurrence?.count).toBe(3);
    // KHÔNG được là 10 — đó là giá trị mặc định của form.
    expect(submitted!.recurrence?.count).not.toBe(10);
  });

  it('ô ngày kết thúc cũng gõ được, cùng lý do', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Hàng tuần' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Đến hết ngày' }));

    const dateInput = screen.getByLabelText('Đến hết ngày', {
      selector: 'input[type=date]',
    });
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    expect(valueOf(dateInput)).toBe('2026-12-31');
  });
});

describe('kiểm tra hợp lệ', () => {
  it('không cho lưu khi thiếu tiêu đề', async () => {
    open();
    await save();

    expect(submitted).toBeNull();
    // getByText tự ném nếu không thấy — đó chính là phép khẳng định.
    screen.getByText('Không được để trống');
  });

  it('lặp hàng tuần mà không chọn thứ nào thì bị chặn', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Ca' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hàng tuần' }));

    // Form chọn sẵn thứ của ngày đang mở; 31/07/2026 là Thứ Sáu. Bỏ chọn nó.
    fireEvent.click(screen.getByRole('button', { name: 'T6' }));
    await save();

    expect(submitted).toBeNull();
    screen.getByText('Chọn ít nhất một thứ trong tuần');
  });
});

describe('thời lượng', () => {
  it('suy ra từ cặp giờ, và ca qua đêm KHÔNG ra số âm', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Ca đêm' } });
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '02:00' } });

    await save();

    // 22:00 → 02:00 là 4 tiếng, không phải −20 tiếng. Đây là lỗi A1 của bản
    // kế hoạch gốc, giờ được chặn ở cả tầng nhập liệu.
    expect(submitted!.durationMinutes).toBe(240);
  });

  it('cảnh báo khi ca dài bất thường', () => {
    open();
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '08:30' } });
    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '00:00' } });

    // Khớp riêng câu CẢNH BÁO. Chuỗi "15,5 giờ" trần xuất hiện ở cả dòng gợi ý
    // "Dài 15,5 giờ" bên dưới ô Kết thúc, nên tìm bằng nó sẽ ra hai kết quả.
    screen.getByText(/^Ca này dài 15,5 giờ/);
  });
});

describe('ô tiền theo cờ isIncomeEligible', () => {
  it('danh mục không tính thu nhập thì không có ô nhập tiền', () => {
    open();
    expect(screen.queryByRole('button', { name: 'Đơn giá riêng' })).toBeNull();
    screen.getByText(/không tính vào thu nhập/);
  });
});
