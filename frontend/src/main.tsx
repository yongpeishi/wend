import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/styles.css';
import './design/global.css';
import { App } from './App.tsx';

async function enableMocksIfNeeded() {
  // Dev/design-only: lets the app and its design gallery run standalone before
  // (or without) the Rails API. Opt-in only — `npm run dev` talks to the real
  // Rails API by default, so signing up creates a real, persistent account
  // instead of an in-memory one that vanishes on reload. Set
  // VITE_USE_MOCKS=true to run against the fixture store instead. Never
  // bundled into a production build. Unaffected: `src/test/setup.ts` starts
  // its own node MSW server directly from `src/mocks/server.ts`, not through
  // this function.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
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
