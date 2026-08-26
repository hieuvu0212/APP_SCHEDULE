import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { hashOfView, viewFromHash, type View } from '../routes';

/**
 * Nối `view` với `location.hash` theo cả hai chiều.
 *
 * ⚠️ GIÁ TRỊ BAN ĐẦU ĐỌC Ở `useState`, KHÔNG PHẢI Ở ĐÂY.
 *
 * Nếu đọc hash lần đầu bằng một effect thì có đua: effect này gọi
 * `setView('payroll')`, rồi effect đồng bộ ngược chạy trong CÙNG lượt đó với
 * `view` vẫn là giá trị cũ `'dashboard'`, và nó ghi đè `#/payroll` thành
 * `#/dashboard`. Mở bookmark vào Bảng lương sẽ nhảy về Tổng quan — lúc được
 * lúc không, tùy thứ tự effect.
 *
 * Nơi gọi phải khởi tạo bằng:
 *     useState<View>(() => viewFromHash(location.hash) ?? DEFAULT_VIEW)
 */
export function useHashRoute(view: View, setView: (v: View) => void): void {
  // Chiều VÀO: người dùng bấm Back/Forward, hoặc sửa thẳng thanh địa chỉ.
  useEffect(() => {
    const onHashChange = () => {
      const next = viewFromHash(window.location.hash);
      if (next) setView(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setView]);

  // Chiều RA: đổi tab thì URL đổi theo.
  //
  // Gán `location.hash` sẽ ĐẨY một mục vào lịch sử — đó là chủ đích, vì nó
  // làm nút Back của trình duyệt quay về màn hình trước thay vì thoát hẳn
  // ứng dụng. Phép so `!==` chặn vòng lặp: hashchange do chính ta gây ra sẽ
  // setView về đúng giá trị đang có, React bỏ qua, effect không chạy lại.
  useEffect(() => {
    const target = hashOfView(view);
    if (window.location.hash !== target) window.location.hash = target;
  }, [view]);
}

/**
 * Tiêu đề tab theo màn hình đang mở.
 *
 * Không phải chuyện SEO — trình thu thập chỉ thấy một cái vỏ rỗng vì dữ liệu
 * nằm trong IndexedDB. Đây là chuyện dùng hằng ngày: mở chín tab thì cả chín
 * cùng tên là không phân biệt được cái nào, lịch sử duyệt web thành một cột
 * chữ giống hệt nhau, và trình chuyển ứng dụng của PWA cũng vậy.
 *
 * Tổng quan giữ nguyên tên ứng dụng, không thêm tiền tố: nó là màn hình mặc
 * định, và "Tổng quan · Personal Schedule System" chỉ dài hơn chứ không nói
 * thêm điều gì.
 */
export function useDocumentTitle(view: View): void {
  const { t } = useTranslation();

  useEffect(() => {
    const appName = t('app.name');
    document.title = view === 'dashboard' ? appName : `${t(`nav.${view}`)} · ${appName}`;
  }, [view, t]);
}
