import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import type { AdminFeedback, Feedback } from '../api/types';

// The mock's job here is to be wrong in the same places the backend is wrong.
// A composer that can attach six files, or a 20 MB PNG, or a PDF, is a bug the
// UI can only discover if mock mode refuses them exactly as Rails will — so
// every limit in the contract gets a failing request of its own.

const DEMO = 1;
const SARAH = 2;

function signIn(userId: number | null) {
  db.currentUserId = userId;
}

function file(name: string, type: string, bytes = 8) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function postMultipart(fields: Record<string, string>, files: File[]) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(`feedback[${key}]`, value);
  for (const f of files) form.append('feedback[screenshots][]', f);
  // No Content-Type header: fetch writes multipart's boundary itself, which is
  // the same thing api.postForm relies on.
  return fetch('/api/feedbacks', { method: 'POST', headers: { Accept: 'application/json' }, body: form });
}

function postJson(feedback: Record<string, unknown>) {
  return fetch('/api/feedbacks', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback }),
  });
}

beforeEach(() => signIn(DEMO));

describe('POST /api/feedbacks with screenshots', () => {
  it('stores what was attached and serializes it back', async () => {
    const response = await postMultipart(
      { message: 'The pin is in the sea', url: 'http://localhost:5173/trips/1/map' },
      [file('shot.png', 'image/png', 64), file('other.webp', 'image/webp', 32)],
    );

    expect(response.status).toBe(201);
    const { feedback } = (await response.json()) as { feedback: Feedback };
    expect(feedback.message).toBe('The pin is in the sea');
    expect(feedback.url).toBe('http://localhost:5173/trips/1/map');
    expect(feedback.screenshots).toHaveLength(2);
    expect(feedback.screenshots[0]).toMatchObject({
      filename: 'shot.png',
      content_type: 'image/png',
      byte_size: 64,
    });
    expect(feedback.screenshots[0].url).not.toBe('');
    expect(feedback.screenshots[1].filename).toBe('other.webp');
    // Distinct ids, the way separate blob records would be.
    expect(feedback.screenshots[0].id).not.toBe(feedback.screenshots[1].id);
  });

  it('keeps the JSON path exactly as it was, with an empty array', async () => {
    const response = await postJson({ message: 'Just words' });

    expect(response.status).toBe(201);
    const { feedback } = (await response.json()) as { feedback: Feedback };
    expect(feedback.screenshots).toEqual([]);
  });

  it('still normalises orphan element classes when the body is multipart', async () => {
    const response = await postMultipart({ message: 'A capture with no selector', element_classes: '_chip_7ilc4_44' }, [
      file('shot.png', 'image/png'),
    ]);

    const { feedback } = (await response.json()) as { feedback: Feedback };
    expect(feedback.element_selector).toBeNull();
    expect(feedback.element_classes).toBeNull();
  });

  it('still rejects a blank message when the files themselves are fine', async () => {
    const response = await postMultipart({ message: '   ' }, [file('shot.png', 'image/png')]);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ errors: { message: ["can't be blank"] } });
  });

  it('answers with everything wrong at once, each complaint said once', async () => {
    const pdfs = Array.from({ length: 6 }, (_, i) => file(`report-${i}.pdf`, 'application/pdf'));
    const response = await postMultipart({ message: '' }, pdfs);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      errors: {
        message: ["can't be blank"],
        screenshots: ['are limited to 5 per report', 'must be a PNG, JPEG, WebP or GIF image'],
      },
    });
  });

  it('rejects a sixth file', async () => {
    const six = Array.from({ length: 6 }, (_, i) => file(`shot-${i}.png`, 'image/png'));
    const response = await postMultipart({ message: 'Six of them' }, six);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { screenshots: string[] } };
    expect(body.errors.screenshots).toHaveLength(1);
    expect(body.errors.screenshots[0]).toMatch(/5/);
    expect(db.feedbacks.some((f) => f.message === 'Six of them')).toBe(false);
  });

  it('accepts exactly five', async () => {
    const five = Array.from({ length: 5 }, (_, i) => file(`shot-${i}.png`, 'image/png'));
    const response = await postMultipart({ message: 'Five of them' }, five);

    expect(response.status).toBe(201);
    const { feedback } = (await response.json()) as { feedback: Feedback };
    expect(feedback.screenshots).toHaveLength(5);
  });

  it('rejects a file over 5 MB', async () => {
    const tooBig = file('huge.png', 'image/png', 5 * 1024 * 1024 + 1);
    const response = await postMultipart({ message: 'One huge one' }, [tooBig]);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { screenshots: string[] } };
    expect(body.errors.screenshots[0]).toMatch(/5 MB/);
  });

  it('rejects a content type that is not one of the four image formats', async () => {
    const response = await postMultipart({ message: 'A PDF, actually' }, [file('report.pdf', 'application/pdf')]);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { screenshots: string[] } };
    expect(body.errors.screenshots[0]).toMatch(/PNG/);
  });

  it('is still 401 when signed out, files or no files', async () => {
    signIn(null);

    const response = await postMultipart({ message: 'Anonymous' }, [file('shot.png', 'image/png')]);

    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/admin/feedbacks/:id', () => {
  function destroy(id: number) {
    return fetch(`/api/admin/feedbacks/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  }

  it('removes a rejected note and answers 204 with no body', async () => {
    const response = await destroy(903);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(db.feedbacks.some((f) => f.id === 903)).toBe(false);
  });

  it('takes a done note too — the other finished status', async () => {
    expect((await destroy(904)).status).toBe(204);
    expect(db.feedbacks.some((f) => f.id === 904)).toBe(false);
  });

  it('refuses a note triage has not finished with, in the contract words', async () => {
    const response = await destroy(901);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Only done or rejected feedback can be deleted' });
    // Refused means kept: the row is exactly where it was.
    expect(db.feedbacks.some((f) => f.id === 901)).toBe(true);
  });

  it('is 404 for an id that was never here', async () => {
    expect((await destroy(999)).status).toBe(404);
  });

  it('turns an ordinary signed-in user away, note untouched', async () => {
    signIn(SARAH);

    const response = await destroy(903);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Admin access required' });
    expect(db.feedbacks.some((f) => f.id === 903)).toBe(true);
  });
});

describe('screenshots on the way out', () => {
  it('reaches the reporter through GET /api/feedbacks', async () => {
    signIn(SARAH);

    const body = (await (await fetch('/api/feedbacks', { headers: { Accept: 'application/json' } })).json()) as {
      feedbacks: Feedback[];
    };

    const seeded = body.feedbacks.find((f) => f.id === 901);
    expect(seeded?.screenshots.map((s) => s.id)).toEqual([9011, 9012]);
    expect(seeded?.screenshots[0].url).toMatch(/^data:image\/png;base64,/);
    // A row that never had any is an empty array, never undefined.
    expect(body.feedbacks.find((f) => f.id === 903)?.screenshots).toHaveLength(1);
  });

  it('reaches the admin table through GET /api/admin/feedbacks', async () => {
    const body = (await (await fetch('/api/admin/feedbacks', { headers: { Accept: 'application/json' } })).json()) as {
      feedbacks: AdminFeedback[];
    };

    expect(body.feedbacks.find((f) => f.id === 901)?.screenshots).toHaveLength(2);
    expect(body.feedbacks.find((f) => f.id === 902)?.screenshots).toEqual([]);
  });
});
