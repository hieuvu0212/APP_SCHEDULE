import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { seedIfEmpty } from './db/seed';
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
      <App />
    </UndoProvider>
  </StrictMode>,
);
