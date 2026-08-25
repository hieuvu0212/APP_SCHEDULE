import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, isCloudConfigured } from '../db/cloud';

export interface CloudAuthState {
  /** Có biến môi trường Supabase hợp lệ không. Sai → mục Cloud tự ẩn phần đăng nhập. */
  configured: boolean;
  user: User | null;
  loading: boolean;
}

/**
 * Phiên đăng nhập Supabase, nếu có cấu hình đám mây.
 *
 * ⚠️ `loading` KHỞI ĐẦU LÀ `isCloudConfigured()`, KHÔNG PHẢI `true`.
 *
 * Bản trước luôn bắt đầu ở `true` rồi `if (loading) return null` — nên khi
 * không cấu hình đám mây, effect thoát sớm, `loading` không bao giờ về `false`,
 * và cả mục Đồng bộ biến mất khỏi Cài đặt mà không để lại chữ nào. Người dùng
 * không có cách nào biết là tính năng tồn tại nhưng chưa được cấu hình.
 */
export function useSupabaseUser(): CloudAuthState {
  const configured = isCloudConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;

    let alive = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const supabase = await getSupabase();
      if (!supabase || !alive) return;

      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoading(false);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      // Component có thể đã unmount trong lúc chờ hai await ở trên; khi đó
      // hàm dọn dẹp đã chạy xong và sẽ không chạy lần nữa.
      if (!alive) unsubscribe();
    })();

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [configured]);

  return { configured, user, loading };
}
