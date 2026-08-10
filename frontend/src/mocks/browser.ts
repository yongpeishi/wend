import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Dev-only mock server — started from main.tsx when VITE_USE_MOCKS=true (see README). */
export const worker = setupWorker(...handlers);
