// ═══════════════════════════════════════════════════════════════════════════
//  Bài test này tồn tại vì MỘT lỗi cụ thể, và nó là lỗi tệ nhất của Phase 2.
//
//  `db/sync.ts` từng gọi `createClient(url, key)` ở CẤP MODULE. Trên bản
//  deploy, biến môi trường là chuỗi rỗng và supabase-js ném ngay lúc nạp
//  module:
//
//      if (!trimmedUrl) throw new Error("supabaseUrl is required.");
//
//  Chuỗi phụ thuộc: SettingsView (React.lazy) → CloudSyncSection → sync.ts.
//  Chunk lazy vỡ lúc nạp, React gỡ cả cây, TRẮNG MÀN HÌNH. Người dùng mất
//  luôn Sao lưu, Thùng rác, đổi ngôn ngữ, đổi theme — mọi thứ nằm trong Cài
//  đặt — chỉ vì một tính năng họ có thể chưa từng bật.
//
//  ⚠️ PHẢI TỰ ĐẶT BIẾN MÔI TRƯỜNG, KHÔNG ĐƯỢC DỰA VÀO MÁY ĐANG CHẠY.
//
//  Vitest nạp file `.env` giống hệt Vite. Bản đầu của bài test này cho rằng
//  môi trường test là trống nên nó XANH ở máy CI (không có .env) và ĐỎ ở máy
//  người viết (có .env) — tức là nó đo cấu hình máy chứ không đo mã nguồn.
//  Đúng cái bẫy đã sinh ra chính lỗi mà nó đi canh.
// ═══════════════════════════════════════════════════════════════════════════

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { CloudSyncSection } from '../CloudSyncSection';
import { SyncProvider } from '../../sync/SyncProvider';
import { __resetCloudClientForTests, getSupabase, isCloudConfigured } from '../../db/cloud';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Nút "Đồng bộ ngay" đi qua context chứ không gọi thẳng `syncWithCloud` — đó
// là thứ giữ cho bấm tay và tự đồng bộ dùng CHUNG một phép chặn chạy chồng.
const render = (ui: React.ReactElement) => rtlRender(<SyncProvider>{ui}</SyncProvider>);

function setCloudEnv(url: string, key: string) {
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
  __resetCloudClientForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  __resetCloudClientForTests();
});

describe('db/cloud — thiếu cấu hình là TRẠNG THÁI, không phải ngoại lệ', () => {
  it('biến rỗng → isCloudConfigured() trả false thay vì ném', () => {
    setCloudEnv('', '');
    expect(isCloudConfigured()).toBe(false);
  });

  it('biến rỗng → getSupabase() trả null thay vì ném', async () => {
    setCloudEnv('', '');
    await expect(getSupabase()).resolves.toBeNull();
  });

  it('giá trị mẫu chưa điền cũng bị coi là chưa cấu hình', () => {
    // .env.example chứa `your-supabase-url`. Người ta sao chép nó thành .env
    // rồi quên điền; phép kiểm "khác rỗng" cho chuỗi đó lọt qua, và lỗi dời
    // sang tận lúc gọi mạng — xa chỗ sai thật.
    setCloudEnv('your-supabase-url', 'your-supabase-anon-key');
    expect(isCloudConfigured()).toBe(false);
  });

  it('URL hợp lệ → có cấu hình', () => {
    setCloudEnv('https://abc.supabase.co', 'anon-key');
    expect(isCloudConfigured()).toBe(true);
  });

  it('hai lời gọi SONG SONG chỉ dựng MỘT client', async () => {
    // ⚠️ Bài này sinh ra từ một cảnh báo thật trong console trình duyệt:
    //
    //     Multiple GoTrueClient instances detected in the same browser context.
    //
    // Bản trước lưu client ĐÃ RESOLVE. `useSupabaseUser` và `CloudSyncSection`
    // cùng gọi `getSupabase()` khi mở màn hình Tài khoản; cả hai chạy tới phép
    // kiểm cache TRƯỚC khi `await import()` của bên nào kịp resolve, nên cả
    // hai đều thấy rỗng và cả hai đều dựng client. Hai client dùng chung một
    // khóa lưu trữ phiên đăng nhập.
    //
    // Cuộc đua này KHÔNG lộ ra nếu gọi tuần tự — phải gọi song song mới thấy.
    setCloudEnv('https://abc.supabase.co', 'anon-key');

    const [a, b] = await Promise.all([getSupabase(), getSupabase()]);

    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('gọi lại sau khi đã dựng vẫn trả đúng client đó', async () => {
    setCloudEnv('https://abc.supabase.co', 'anon-key');
    const first = await getSupabase();
    expect(await getSupabase()).toBe(first);
  });
});

describe('CloudSyncSection khi CHƯA cấu hình đám mây', () => {
  it('render được, KHÔNG ném — đây là bài chặn lỗi trắng màn hình', () => {
    setCloudEnv('', '');
    expect(() => render(<CloudSyncSection />)).not.toThrow();
  });

  it('nói rõ là chưa cấu hình, không im lặng biến mất', () => {
    // Ẩn im lặng cũng "không sập", nhưng người dùng sẽ tưởng tính năng hỏng
    // thay vì hiểu rằng nó chỉ chưa được bật.
    setCloudEnv('', '');
    render(<CloudSyncSection />);
    screen.getByText('cloud.notConfigured');
  });

  it('không hiện form đăng nhập khi không có chỗ nào để đăng nhập', () => {
    setCloudEnv('', '');
    render(<CloudSyncSection />);
    expect(screen.queryByText('cloud.login')).toBeNull();
  });
});

describe('CloudSyncSection khi ĐÃ cấu hình nhưng chưa đăng nhập', () => {
  it('hiện form đăng nhập, không hiện thông báo chưa cấu hình', async () => {
    setCloudEnv('https://abc.supabase.co', 'anon-key');
    render(<CloudSyncSection />);
    // `useSupabaseUser` gọi mạng để lấy phiên, nên form xuất hiện bất đồng bộ.
    await screen.findByText('cloud.login');
    expect(screen.queryByText('cloud.notConfigured')).toBeNull();
  });
});
