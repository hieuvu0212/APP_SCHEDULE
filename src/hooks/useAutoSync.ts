import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POLL_INTERVAL_MS,
  shouldAutoSync,
  type AutoSyncState,
  type SyncTrigger,
} from '../core/autoSync';
import type { SyncReport } from '../core/sync';
import { syncWithCloud } from '../db/sync';
import { syncReminderQueue } from '../db/pushQueue';

/**
 * Mốc đồng bộ gần nhất — lưu ở localStorage, KHÔNG ở bảng settings.
 *
 * Hai lý do. Thứ nhất, nó là trạng thái CỦA MỘT MÁY, không phải tùy chọn của
 * người dùng: "máy này đã đồng bộ lúc 9h" chẳng có nghĩa gì trên điện thoại.
 * Thứ hai, và quan trọng hơn — bảng settings nằm trong file sao lưu, nên nhập
 * một bản sao lưu cũ sẽ mang theo một mốc thời gian cũ và làm lệch cả logic
 * chờ. localStorage nằm ngoài mọi thứ đó.
 */
const LAST_SYNC_KEY = 'personal-schedule:lastSyncAt';

function readLastSync(): number | null {
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface AutoSyncStatus {
  running: boolean;
  /** epoch ms của lần đồng bộ THÀNH CÔNG gần nhất */
  lastSyncAt: number | null;
  lastReport: SyncReport | null;
  lastError: string | null;
}

export interface UseAutoSync extends AutoSyncStatus {
  /** Bấm nút "Đồng bộ ngay" — bỏ qua mọi phép chờ, vẫn chặn chạy chồng */
  syncNow: () => Promise<void>;
}

/**
 * Tự đồng bộ theo sự kiện, cộng một hàm để bấm tay.
 *
 * ⚠️ CHỈ ĐƯỢC GỌI MỘT LẦN TRONG CẢ ỨNG DỤNG (ở App.tsx).
 *
 * Mỗi lần gọi là một bộ hẹn giờ và một bộ lắng nghe sự kiện riêng, mỗi bộ giữ
 * `running` của riêng nó. Hai bản sao sẽ không thấy nhau, và phép chặn chạy
 * chồng — thứ ngăn hai lượt cùng đọc một ảnh chụp rồi ghi đè lẫn nhau trên
 * đám mây — mất tác dụng đúng lúc cần nhất.
 *
 * Bốn kích hoạt, và KHÔNG có "khi dữ liệu cục bộ đổi". Xem core/autoSync.ts.
 */
export function useAutoSync(enabled: boolean, signedIn: boolean): UseAutoSync {
  const [status, setStatus] = useState<AutoSyncStatus>(() => ({
    running: false,
    lastSyncAt: readLastSync(),
    lastReport: null,
    lastError: null,
  }));

  // Trạng thái quyết định nằm ở ref, KHÔNG ở state.
  //
  // `run` được gắn vào bộ lắng nghe sự kiện và bộ hẹn giờ. Đọc state trong đó
  // sẽ bắt được giá trị đông cứng của lần render gắn nó — `running` mãi mãi
  // là `false` với bộ lắng nghe, và phép chặn chạy chồng thành vô dụng.
  const gate = useRef<AutoSyncState>({
    enabled,
    signedIn,
    online: true,
    running: false,
    lastAttemptAt: null,
    consecutiveFailures: 0,
  });

  // Cập nhật trong effect, KHÔNG phải lúc render. Ghi vào ref giữa chừng một
  // lần render là ghi vào thứ React có thể vứt đi và render lại — với Strict
  // Mode ở chế độ dev thì nó render hai lần, và một nửa số lần ghi biến mất.
  useEffect(() => {
    gate.current.enabled = enabled;
    gate.current.signedIn = signedIn;
  }, [enabled, signedIn]);

  const run = useCallback(async (trigger: SyncTrigger) => {
    gate.current.online = navigator.onLine;
    if (!shouldAutoSync(gate.current, trigger, Date.now())) return;

    gate.current.running = true;
    gate.current.lastAttemptAt = Date.now();
    setStatus((s) => ({ ...s, running: true, lastError: null }));

    try {
      const report = await syncWithCloud();
      const at = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(at));

      // Nạp hàng đợi nhắc lịch Web Push sau khi dữ liệu đồng bộ thành công
      await syncReminderQueue().catch((err) => {
        console.error('Failed to sync reminder queue:', err);
      });

      // Một bảng lỗi KHÔNG tính là cả lượt hỏng: bảy bảng kia đã đồng bộ
      // xong, và giãn khoảng chờ vì một lược đồ lệch sẽ làm chậm cả phần
      // đang chạy tốt. Lỗi vẫn nằm trong báo cáo để giao diện hiện ra.
      gate.current.consecutiveFailures = 0;
      setStatus({ running: false, lastSyncAt: at, lastReport: report, lastError: null });
    } catch (e) {
      gate.current.consecutiveFailures += 1;
      setStatus((s) => ({
        ...s,
        running: false,
        lastError: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      gate.current.running = false;
    }
  }, []);

  // Gắn ba bộ lắng nghe. KHÔNG chạy 'startup' ở đây — lúc mount thì
  // `useSupabaseUser` còn đang hỏi phiên đăng nhập nên `signedIn` luôn là
  // false, và lượt chạy đó chắc chắn bị `shouldAutoSync` chặn. Effect bên
  // dưới mới là chỗ bắt đúng thời điểm "đã biết là có đăng nhập".
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run('visible');
    };
    const onOnline = () => void run('online');
    const timer = window.setInterval(() => void run('interval'), POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [run]);

  // Biết chắc là đã đăng nhập → đồng bộ ngay, đừng bắt đợi hết một chu kỳ
  // mười phút. Đây cũng là lượt "mở ứng dụng" thật sự.
  //
  // `set-state-in-effect` tắt có chủ đích: `run` đặt `running: true` để hiện
  // trạng thái đang chạy trước khi gọi mạng. Đó đúng là trường hợp mà chính
  // phần trợ giúp của quy tắc này miễn trừ — "đồng bộ React với một hệ thống
  // bên ngoài". Không có cách nào diễn đạt nó mà không chạm vào state.
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (signedIn) void run('startup');
  }, [signedIn, run]);

  const syncNow = useCallback(() => run('manual'), [run]);

  return { ...status, syncNow };
}
