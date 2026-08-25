// ═══════════════════════════════════════════════════════════════════════════
//  components/AccountView.tsx — màn hình Tài khoản
//
//  ⚠️ ĐÂY LÀ MỘT MÀN HÌNH, KHÔNG PHẢI MỘT CỔNG CHẶN.
//
//  Vào ứng dụng KHÔNG cần đăng nhập, và điều đó là cố ý. Ba lý do:
//
//  1. ĐÂY LÀ PWA. Người dùng mở app trên xe buýt để xem ca chiều nay. Bắt xác
//     thực phiên khi không có mạng nghĩa là khóa họ ra khỏi chính dữ liệu đang
//     nằm trong máy họ — hỏng ở đúng lúc một ứng dụng lịch cần chạy nhất.
//
//  2. BẢN CHƯA CẤU HÌNH SẼ THÀNH APP CHẾT. Thiếu biến môi trường Supabase thì
//     cổng đăng nhập không dẫn tới đâu cả. Hiện tại app vẫn chạy đủ mọi màn
//     hình, chỉ mất mục đồng bộ — đó là hành vi đúng, và chúng ta vừa mất công
//     sửa đúng lỗi ngược lại ở Phase 2.
//
//  3. NÓ SẼ LÀ AN TOÀN GIẢ. Lịch và thu nhập nằm trong IndexedDB. Ai cầm được
//     máy thì mở DevTools là đọc hết, có màn hình đăng nhập hay không cũng
//     vậy. Muốn khóa thật thì phải mã hoá IndexedDB bằng một passphrase cục
//     bộ — việc khác hẳn, và hứa hẹn bảo mật mà không có bảo mật thì tệ hơn
//     là nói thẳng rằng không có.
//
//  Cái màn hình này giải quyết là chuyện khác và có thật: đăng nhập từng nằm
//  trong một panel chật chội kẹp giữa phần Nhắc lịch và phần Sao lưu của màn
//  hình Cài đặt. Quản lý tài khoản xứng đáng có chỗ riêng.
// ═══════════════════════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useSupabaseUser } from '../hooks/useSupabaseUser';
import { CloudSyncSection } from './CloudSyncSection';
import { Toggle } from './ui';

export function AccountView() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const { configured, user } = useSupabaseUser();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{t('nav.account')}</h2>
        <p className="text-xs text-slate-500">{t('account.hint')}</p>
      </div>

      <CloudSyncSection />

      {/* Công tắc chỉ hiện khi đã đăng nhập. Bày một lựa chọn không có tác
          dụng gì ở trạng thái hiện tại chỉ khiến người dùng bật nó lên rồi
          tưởng đã xong việc. */}
      {configured && user && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <Toggle
            checked={settings.autoSyncEnabled}
            onChange={(v) => void update({ autoSyncEnabled: v })}
            label={t('cloud.autoSync')}
            hint={t('cloud.autoSyncHint')}
          />
        </section>
      )}

      {/* Nói rõ ngay tại chỗ rằng không đăng nhập vẫn dùng được đủ.
          Một màn hình tên "Tài khoản" mặc định gợi ý rằng phải có tài khoản
          mới dùng được — với app này thì ngược lại, và im lặng để người dùng
          tự suy ra là để họ suy ra sai. */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800">{t('account.optionalTitle')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {t('account.optionalBody')}
        </p>
      </section>
    </div>
  );
}
