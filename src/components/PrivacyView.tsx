// ═══════════════════════════════════════════════════════════════════════════
//  components/PrivacyView.tsx — chính sách riêng tư
//
//  Ứng dụng thu email và mật khẩu, lưu lịch làm việc và thu nhập. Chừng đó là
//  đủ để cần một trang nói rõ dữ liệu đi đâu — không phải vì thủ tục, mà vì
//  người dùng có quyền biết trước khi họ gõ số tiền lương vào.
//
//  ⚠️ VIẾT ĐÚNG SỰ THẬT, KỂ CẢ PHẦN BẤT LỢI.
//
//  Trang này nói thẳng ba điều mà đa số chính sách riêng tư lờ đi:
//    · Bản ghi đã xóa còn nằm lại 30 ngày dưới dạng tombstone.
//    · Anon key của Supabase là công khai — thứ bảo vệ dữ liệu là RLS.
//    · Người vận hành dự án Supabase có quyền truy cập cơ sở dữ liệu.
//
//  Ba điều đó đều đúng, và một chính sách bỏ qua chúng là một chính sách nói
//  dối. Điều làm nó vẫn là một câu chuyện TỐT là phần còn lại: mặc định không
//  có gì rời khỏi máy cả.
//
//  Ngày cập nhật viết cứng chứ không lấy `new Date()`. "Cập nhật lần cuối" mà
//  tự nhảy theo hôm nay là một lời nói dối tự động.
// ═══════════════════════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import { Button } from './ui';

const LAST_UPDATED = '2026-08-24';

export function PrivacyView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <article className="max-w-2xl space-y-5">
      <header>
        <h2 className="text-base font-semibold text-slate-900">{t('privacy.title')}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {t('privacy.lastUpdated', { date: LAST_UPDATED })}
        </p>
      </header>

      {/* Câu trả lời ngắn đặt lên đầu. Ai đọc chính sách riêng tư cũng chỉ
          muốn biết đúng một điều, và bắt họ cuộn qua sáu mục để tới đó là
          cách chắc chắn khiến không ai đọc. */}
      <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
        {t('privacy.tagline')}
      </p>

      <Section title={t('privacy.local.title')} body={t('privacy.local.body')} />

      <Section
        title={t('privacy.cloud.title')}
        body={t('privacy.cloud.body')}
        items={[
          t('privacy.cloud.i1'),
          t('privacy.cloud.i2'),
          t('privacy.cloud.i3'),
          t('privacy.cloud.i4'),
        ]}
      />

      <Section
        title={t('privacy.notCollected.title')}
        body={t('privacy.notCollected.body')}
        items={[
          t('privacy.notCollected.i1'),
          t('privacy.notCollected.i2'),
          t('privacy.notCollected.i3'),
          t('privacy.notCollected.i4'),
        ]}
      />

      <Section title={t('privacy.retention.title')} body={t('privacy.retention.body')} />
      <Section title={t('privacy.deletion.title')} body={t('privacy.deletion.body')} />
      <Section title={t('privacy.operator.title')} body={t('privacy.operator.body')} />

      <Button variant="outline" onClick={onBack}>
        {t('privacy.back')}
      </Button>
    </article>
  );
}

function Section({
  title,
  body,
  items,
}: {
  title: string;
  body: string;
  items?: string[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{body}</p>
      {items && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
