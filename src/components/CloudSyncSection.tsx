import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncReport } from '../core/sync';
import { getSupabase } from '../db/cloud';
import { useSupabaseUser } from '../hooks/useSupabaseUser';
import { useSync } from '../sync/context';
import { Button, Field } from './ui';
import { inputClass } from './styles';

/**
 * Trạng thái sau một lần bấm — KIỂU CÓ CẤU TRÚC, không phải chuỗi.
 *
 * Bản trước lưu một chuỗi rồi chọn màu chữ bằng `syncStatus.includes('Lỗi')`.
 * Điều đó buộc thông báo phải là tiếng Việt để giao diện hiển thị đúng: đổi
 * sang `en` là mọi lỗi hiện màu xanh lá. Kiểu dữ liệu tự nó phải nói được đây
 * là thành công hay thất bại; ngôn ngữ chỉ là chuyện hiển thị.
 */
type Status =
  | { kind: 'idle' }
  | { kind: 'error'; messageKey: string; detail?: string }
  | { kind: 'done'; report: SyncReport };

export function CloudSyncSection() {
  const { t } = useTranslation();
  const { configured, user, loading } = useSupabaseUser();
  const sync = useSync();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function withAuth(run: (client: NonNullable<Awaited<ReturnType<typeof getSupabase>>>) => Promise<string | null>) {
    setAuthError(null);
    setAuthNotice(null);
    setBusy(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setAuthError(t('cloud.error.notConfigured'));
        return;
      }
      const message = await run(supabase);
      if (message) setAuthError(message);
    } finally {
      setBusy(false);
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    void withAuth(async (supabase) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    });
  };

  const handleSignUp = () => {
    void withAuth(async (supabase) => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return error.message;
      setAuthNotice(t('cloud.signUpSent'));
      return null;
    });
  };

  const handleLogout = () => {
    void withAuth(async (supabase) => {
      await supabase.auth.signOut();
      setStatus({ kind: 'idle' });
      return null;
    });
  };

  // Bấm tay đi qua CÙNG một cổng với tự đồng bộ, không gọi thẳng
  // `syncWithCloud`. Gọi thẳng sẽ vượt qua phép chặn chạy chồng, và hai lượt
  // song song đọc chung một ảnh chụp rồi ghi đè lẫn nhau trên đám mây.
  const handleSync = async () => {
    setStatus({ kind: 'idle' });
    await sync.syncNow();
  };

  if (loading) return null;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{t('cloud.title')}</h3>
        <p className="mt-1 text-xs text-slate-500">{t('cloud.hint')}</p>
      </div>

      {/* Chưa cấu hình thì nói thẳng, và nói rõ là dữ liệu vẫn an toàn tại chỗ.
          Ẩn im lặng sẽ khiến người dùng tưởng tính năng bị hỏng. */}
      {!configured ? (
        <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
          {t('cloud.notConfigured')}
        </p>
      ) : !user ? (
        <form onSubmit={handleLogin} className="space-y-3 rounded-lg bg-slate-50 p-4">
          <Field label={t('cloud.email')}>
            {(id) => (
              <input
                id={id}
                type="email"
                required
                autoComplete="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('cloud.password')}>
            {(id) => (
              <input
                id={id}
                type="password"
                required
                autoComplete="current-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>

          {authError && <p className="text-xs text-red-600">{authError}</p>}
          {authNotice && <p className="text-xs text-slate-600">{authNotice}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={busy}>
              {t('cloud.login')}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={handleSignUp}>
              {t('cloud.signup')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <p className="text-sm text-slate-800">
            {t('cloud.loggedInAs')} <span className="font-semibold">{user.email}</span>
          </p>

          {status.kind === 'error' && (
            <p className="text-xs text-red-600">
              {t(status.messageKey)}
              {status.detail && <span className="block text-slate-500">{status.detail}</span>}
            </p>
          )}

          {sync.lastError && <p className="text-xs text-red-600">{sync.lastError}</p>}
          {sync.lastReport && <SyncSummary report={sync.lastReport} />}

          {/* "Lần cuối" quan trọng hơn vẻ ngoài của nó. Với tự đồng bộ, người
              dùng không còn bấm nút nên không còn dấu hiệu nào cho biết nó có
              thật sự chạy hay không — và một tính năng đồng bộ âm thầm ngừng
              chạy là cách chắc chắn nhất để mất dữ liệu mà không hay biết. */}
          <p className="text-xs text-slate-500">
            {sync.lastSyncAt
              ? t('cloud.lastSync', { when: new Date(sync.lastSyncAt).toLocaleString() })
              : t('cloud.neverSynced')}
          </p>

          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || sync.running}
              onClick={() => void handleSync()}
            >
              {sync.running ? t('cloud.syncing') : t('cloud.syncNow')}
            </Button>
            <Button variant="outline" disabled={busy || sync.running} onClick={handleLogout}>
              {t('cloud.logout')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Báo cáo theo từng bảng, không phải một dòng "Thành công!".
 *
 * Đồng bộ có thể thành công MỘT PHẦN — một bảng vỡ vì lược đồ lệch hay ràng
 * buộc khóa ngoại trong khi bảy bảng kia đi trọn. Gộp tất cả thành một dấu
 * tích xanh là nói dối đúng vào lúc người dùng cần biết sự thật nhất.
 */
function SyncSummary({ report }: { report: SyncReport }) {
  const { t } = useTranslation();
  const failed = report.tables.filter((r) => r.error);

  return (
    <div className="space-y-1 text-xs">
      <p className={failed.length > 0 ? 'text-amber-700' : 'text-green-700'}>
        {t('cloud.syncResult', { pushed: report.pushed, pulled: report.pulled })}
      </p>
      {failed.map((r) => (
        <p key={r.table} className="text-red-600">
          {t('cloud.tableFailed', { table: r.table })} {r.error}
        </p>
      ))}
    </div>
  );
}
