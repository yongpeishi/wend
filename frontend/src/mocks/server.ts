import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * jsdom's Blob is the 2015 one: `slice`, `size`, `type`, and nothing else — no
 * `arrayBuffer`, no `text`, no `stream`. Node's fetch (undici) is what actually
 * sends requests under Vitest, and it consumes a multipart body by streaming
 * each part, so a FormData carrying a jsdom File hands undici an object it has
 * no way to read. It does not throw: the request body stream simply never
 * produces anything, and `await request.formData()` inside a handler hangs
 * until the test times out. Every file-upload test in the app would fail that
 * way, with no error to explain it.
 *
 * jsdom does implement FileReader, so the missing three are one adapter away.
 * This lives here rather than in a test file because it has to run once per
 * test environment before anything uploads, and src/test/setup.ts imports this
 * module for every test file. It is a no-op in a real browser and in any jsdom
 * new enough to have grown the methods itself.
 */
function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return readBlobBytes(this);
  };
  Blob.prototype.text = async function text() {
    return new TextDecoder().decode(await readBlobBytes(this));
  };
  Blob.prototype.stream = function stream() {
    const bytes = readBlobBytes(this);
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array(await bytes));
        controller.close();
      },
    }) as unknown as ReturnType<Blob['stream']>;
  };
}

/** Node MSW server for Vitest — started in src/test/setup.ts. */
export const server = setupServer(...handlers);
