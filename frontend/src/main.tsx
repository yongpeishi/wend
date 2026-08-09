import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/styles.css';
import './design/global.css';
import { App } from './App.tsx';

async function enableMocksIfNeeded() {
  // Dev/test-only: lets the app and its design gallery run standalone before
  // (or without) the Rails API. Never bundled into a production build.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
}

enableMocksIfNeeded().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
