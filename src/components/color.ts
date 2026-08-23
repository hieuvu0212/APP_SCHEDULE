/**
 * Pha loãng màu danh mục để làm nền khối sự kiện.
 *
 * Dùng hex 8 ký tự thay vì `color-mix()`: cùng một chuỗi màu sẽ đi thẳng vào
 * thẻ `style`, không phụ thuộc vào việc Tailwind có sinh ra lớp tương ứng hay
 * không. Màu danh mục do người dùng chọn nên không thể biết trước.
 *
 * Đầu vào lạ thì trả nguyên xi — thà nền đậm một chút còn hơn mất màu.
 */
export function tint(hex: string, alpha = '22'): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const body = m[1].length === 3
    ? m[1].split('').map((c) => c + c).join('')
    : m[1];
  return `#${body}${alpha}`;
}
