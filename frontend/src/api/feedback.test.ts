import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { server } from '../mocks/server';
import { api } from './client';
import { buildFeedbackFormData, useCreateFeedback } from './feedback';
import type { User } from './types';

// The encoding seam. A report is JSON or multipart depending on one thing —
// whether the reporter attached anything — and the two halves have different
// failure modes: JSON that quietly grew a `screenshots` key the backend does
// not read, and multipart whose field names or Content-Type the server cannot
// parse. Both are invisible in the UI and only show up as an empty report.

function png(name: string, bytes = 8) {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

/** The MSW fixtures start signed out (src/mocks/db.ts). */
async function signIn() {
  await api.post<{ user: User }>('/session', { email: 'demo@wend.app', password: 'password' });
}

/** Swap the POST for a handler that hands the raw request back to the test. */
function captureCreate() {
  const seen: { contentType: string | null; body: Promise<unknown> }[] = [];
  server.use(
    http.post('/api/feedbacks', ({ request }) => {
      const contentType = request.headers.get('content-type');
      const clone = request.clone();
      seen.push({
        contentType,
        body: contentType?.includes('multipart/form-data') ? clone.formData() : clone.json(),
      });
      return HttpResponse.json({ feedback: null }, { status: 201 });
    }),
  );
  return seen;
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useCreateFeedback(), { wrapper });
}

describe('buildFeedbackFormData', () => {
  it('uses the bracketed field names, one part per screenshot', () => {
    const form = buildFeedbackFormData({
      message: 'The pin is in the sea',
      url: 'http://localhost:5173/trips/1/map',
      element_selector: 'button.pin',
      element_classes: '_pin_7ilc4_44',
      screenshots: [png('one.png'), png('two.png')],
    });

    expect(form.get('feedback[message]')).toBe('The pin is in the sea');
    expect(form.get('feedback[url]')).toBe('http://localhost:5173/trips/1/map');
    expect(form.get('feedback[element_selector]')).toBe('button.pin');
    expect(form.get('feedback[element_classes]')).toBe('_pin_7ilc4_44');
    const files = form.getAll('feedback[screenshots][]') as File[];
    expect(files.map((f) => f.name)).toEqual(['one.png', 'two.png']);
  });

  it('omits absent optional fields rather than posting the string "undefined"', () => {
    const form = buildFeedbackFormData({ message: 'Just words', element_selector: null });

    expect(form.has('feedback[url]')).toBe(false);
    expect(form.has('feedback[element_selector]')).toBe(false);
    expect(form.has('feedback[element_classes]')).toBe(false);
    expect([...form.keys()]).toEqual(['feedback[message]']);
  });
});

describe('useCreateFeedback', () => {
  it('posts JSON when nothing is attached, with no screenshots key at all', async () => {
    await signIn();
    const seen = captureCreate();
    const { result } = setup();

    await act(() => result.current.mutateAsync({ message: 'Just words', screenshots: [] }));

    expect(seen[0].contentType).toBe('application/json');
    expect(await seen[0].body).toEqual({ feedback: { message: 'Just words' } });
  });

  it('switches to multipart as soon as there is a file', async () => {
    await signIn();
    const seen = captureCreate();
    const { result } = setup();

    await act(() =>
      result.current.mutateAsync({ message: 'Look at this', url: 'http://localhost:5173/', screenshots: [png('a.png')] }),
    );

    expect(seen[0].contentType).toMatch(/^multipart\/form-data;/);
    const form = (await seen[0].body) as FormData;
    expect(form.get('feedback[message]')).toBe('Look at this');
    expect(form.get('feedback[url]')).toBe('http://localhost:5173/');
    expect(form.getAll('feedback[screenshots][]')).toHaveLength(1);
  });
});

describe('api.postForm', () => {
  it('lets the browser set multipart/form-data, boundary and all', async () => {
    await signIn();
    const seen = captureCreate();

    await api.postForm('/feedbacks', buildFeedbackFormData({ message: 'With a shot', screenshots: [png('a.png')] }));

    expect(seen[0].contentType).toMatch(/^multipart\/form-data; boundary=.+/);
    const form = (await seen[0].body) as FormData;
    expect(form.get('feedback[message]')).toBe('With a shot');
    expect((form.getAll('feedback[screenshots][]') as File[]).map((f) => f.name)).toEqual(['a.png']);
  });

  it('reports a 422 as the same ApiError the JSON posts produce', async () => {
    await signIn();
    server.use(
      http.post('/api/feedbacks', () =>
        HttpResponse.json({ errors: { screenshots: ['are limited to 5 per report'] } }, { status: 422 }),
      ),
    );

    await expect(
      api.postForm('/feedbacks', buildFeedbackFormData({ message: 'Too many', screenshots: [png('a.png')] })),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { screenshots: ['are limited to 5 per report'] },
    });
  });
});
