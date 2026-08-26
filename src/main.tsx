import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { seedIfEmpty } from './db/seed';
import { SyncProvider } from './sync/SyncProvider';
import { UndoProvider } from './undo/UndoProvider';

void seedIfEmpty();

// Chỉ đăng ký service worker ở bản build.
//
// Ở chế độ dev, service worker sẽ chen vào giữa và phục vụ module cũ từ cache
// trong khi Vite đang cố nạp bản vừa sửa — hot reload trông như bị hỏng, và
// nguyên nhân thì gần như không thể lần ra.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UndoProvider>
      {/* SyncProvider nằm TRONG UndoProvider: nó không dùng Hoàn tác, nhưng
          đặt nó ở ngoài cùng cũng chẳng lợi gì, còn thứ tự này giữ cho lớp
          gần App nhất là lớp mới thêm — dễ gỡ ra hơn nếu cần. */}
      <SyncProvider>
        <App />
      </SyncProvider>
    </UndoProvider>
  </StrictMode>,
);
