// ═══════════════════════════════════════════════════════════════════════════
//  components/ErrorBoundary.tsx
//
//  Bốn màn hình đi qua React.lazy. Một lỗi lúc NẠP CHUNK — module ném ngay khi
//  được đánh giá, mạng đứt giữa chừng, file băm tên không còn sau lần deploy
//  mới — sẽ nổi lên qua Suspense và, nếu không có ranh giới nào chặn, React 19
//  gỡ toàn bộ cây. Kết quả là trang trắng không một dòng chữ, và người dùng
//  không có đường nào ngoài việc tự đoán ra phải tải lại trang.
//
//  Chuyện này đã xảy ra thật: db/cloud.ts từng ném ở cấp module khi thiếu biến
//  môi trường, và nó kéo sập cả app chứ không riêng mục Cloud.
//
//  ⚠️ NHẬN `fallback` QUA PROP, KHÔNG TỰ DỊCH.
//  Ranh giới lỗi bắt buộc phải là class component, mà class thì không gọi được
//  useTranslation(). Tự nhúng chuỗi vào đây là hard-code tiếng Việt trong
//  component — đúng thứ quy ước cấm. Nơi gọi vốn đã là function component nên
//  nó dịch sẵn rồi truyền vào.
// ═══════════════════════════════════════════════════════════════════════════

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nhận `reset` để nút "thử lại" render được ở phía người gọi */
  fallback: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Không có máy chủ nào để gửi log tới, nên console là nơi duy nhất còn
    // lại. Giữ nguyên component stack: với lỗi nạp chunk, thông điệp của lỗi
    // gần như vô dụng còn stack thì chỉ ra đúng màn hình nào không nạp được.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) return this.props.fallback(error, this.reset);
    return this.props.children;
  }
}
