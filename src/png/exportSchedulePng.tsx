import { createRoot } from 'react-dom/client';
import { buildPdfModel, pdfFileName } from '../pdf/model';
import type { ExportInput } from '../pdf/exportSchedulePdf';
import { SchedulePng } from './SchedulePng';

export async function exportSchedulePng(input: ExportInput): Promise<void> {
  const model = buildPdfModel(input);

  // Tạo container ẩn ngoài màn hình
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  // Khai ngoài `try` để khối `finally` gỡ được nó kể cả khi html2canvas ném.
  let root: ReturnType<typeof createRoot> | undefined;

  try {
    root = createRoot(container);

    // Render và đợi DOM cập nhật xong
    await new Promise<void>((resolve) => {
      // Vì html2canvas cần fonts đã tải, có thể cần font hệ thống, nhưng
      // ta đang dùng inline styles và font 'sans-serif', nên không phải nạp font riêng.
      root!.render(<SchedulePng model={model} />);

      // Chờ React render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const html2canvas = (await import('html2canvas-pro')).default;
    
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2, // Hi-res
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const url = canvas.toDataURL('image/png');
    
    const link = document.createElement('a');
    link.href = url;
    // Thay đổi đuôi .pdf thành .png
    link.download = pdfFileName(input.dates).replace(/\.pdf$/, '.png');
    link.click();
    
  } finally {
    // ⚠️ PHẢI unmount TRƯỚC KHI gỡ node khỏi DOM.
    //
    // Gỡ thẳng container để lại một root React còn sống trỏ vào node đã mồ
    // côi: React 19 cảnh báo ra console và cây đó không bao giờ được thu dọn.
    // Mỗi lần bấm Xuất PNG lại rò thêm một cây.
    //
    // `unmount()` đồng bộ nhưng React yêu cầu nó không nằm trong lúc đang
    // render; ở đây đã ra khỏi mọi chu kỳ render nên gọi thẳng được.
    root?.unmount();
    container.remove();
  }
}
