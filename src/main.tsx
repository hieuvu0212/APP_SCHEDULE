import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { seedIfEmpty } from './db/seed';
import { UndoProvider } from './undo/UndoProvider';

void seedIfEmpty();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UndoProvider>
      <App />
    </UndoProvider>
  </StrictMode>,
);
