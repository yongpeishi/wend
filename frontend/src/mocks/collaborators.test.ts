import { beforeEach, describe, expect, it } from 'vitest';
import { collaboratorsFor, db, roleFor, setRole } from './db';
import type { Collaborator, CollaboratorsResponse } from '../api/types';

const TRIP = 1;
const DEMO = 1;
const SARAH = 2;

function signIn(userId: number | null) {
  db.currentUserId = userId;
}

function get(path: string) {
  return fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
}

function send(method: string, path: string, body?: unknown) {
  return fetch(`/api${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function add(email: string, role = 'member') {
  return send('POST', `/trips/${TRIP}/collaborators`, { email, role });
}

/** Status line and body bytes — the pair the POST must not vary. */
async function fingerprint(response: Response) {
  return { status: response.status, body: await response.text() };
}

beforeEach(() => signIn(DEMO));

describe('GET /api/trips/:id/collaborators', () => {
  it('lists who is on the trip, with your own role alongside', async () => {
    const body = (await (await get(`/trips/${TRIP}/collaborators`)).json()) as CollaboratorsResponse;

    expect(body.my_role).toBe('owner');
    expect(body.collaborators).toHaveLength(1);
    expect(body.collaborators[0]).toMatchObject({
      user_id: DEMO,
      name: 'Demo Traveler',
      email: 'demo@wend.app',
      role: 'owner',
      is_you: true,
    });
    expect(Date.parse(body.collaborators[0].added_at)).not.toBeNaN();
  });

  it('hides email addresses from a viewer, but not who is here', async () => {
    setRole(TRIP, DEMO, 'viewer');
    setRole(TRIP, SARAH, 'owner');

    const body = (await (await get(`/trips/${TRIP}/collaborators`)).json()) as CollaboratorsResponse;

    expect(body.my_role).toBe('viewer');
    expect(body.collaborators.map((c: Collaborator) => c.name).sort()).toEqual(['Demo Traveler', 'Sarah']);
    expect(body.collaborators.every((c: Collaborator) => c.email === null)).toBe(true);
  });

  it('is 401 when you are not signed in', async () => {
    signIn(null);
    expect((await get(`/trips/${TRIP}/collaborators`)).status).toBe(401);
  });

  it('is 404, not 403, for a trip you are not on', async () => {
    setRole(TRIP, DEMO, null);
    expect((await get(`/trips/${TRIP}/collaborators`)).status).toBe(404);
  });

  it('is 404 for a trip that does not exist', async () => {
    expect((await get('/trips/9999/collaborators')).status).toBe(404);
  });
});

describe('POST /api/trips/:id/collaborators', () => {
  it('answers identically whether or not the address matched anyone', async () => {
    const matched = await fingerprint(await add('sarah@wend.app'));
    const unmatched = await fingerprint(await add('nobody@nowhere.test'));

    expect(matched).toEqual(unmatched);
    expect(matched).toEqual({ status: 202, body: '{"status":"accepted"}' });
  });

  it('answers identically again when they are already here, or when they are you', async () => {
    const first = await fingerprint(await add('sarah@wend.app'));
    const already = await fingerprint(await add('sarah@wend.app'));
    const yourself = await fingerprint(await add('demo@wend.app'));

    expect(already).toEqual(first);
    expect(yourself).toEqual(first);
  });

  it('actually brings a matched person along, at the role you chose', async () => {
    await add('sarah@wend.app', 'viewer');
    expect(roleFor(TRIP, SARAH)).toBe('viewer');
  });

  it('leaves the trip alone when the address matched nobody', async () => {
    await add('nobody@nowhere.test');
    expect(collaboratorsFor(TRIP)).toHaveLength(1);
  });

  it('does not quietly change what someone already here can do', async () => {
    setRole(TRIP, SARAH, 'viewer');
    await add('sarah@wend.app', 'member');
    expect(roleFor(TRIP, SARAH)).toBe('viewer');
  });

  it('does not add you to your own trip twice', async () => {
    await add('demo@wend.app');
    expect(collaboratorsFor(TRIP)).toHaveLength(1);
  });

  it('is 422 on a blank or malformed address', async () => {
    expect((await add('')).status).toBe(422);
    expect((await add('   ')).status).toBe(422);
    expect((await add('not-an-address')).status).toBe(422);
  });

  it('rejects a second owner — handing over is its own door', async () => {
    const response = await add('sarah@wend.app', 'owner');
    expect(response.status).toBe(422);
    expect(roleFor(TRIP, SARAH)).toBeNull();
  });

  it('is 403 for a viewer: they can see the trip, they just may not do this', async () => {
    setRole(TRIP, DEMO, 'viewer');
    expect((await add('sarah@wend.app')).status).toBe(403);
  });

  it('is 404 for a trip you are not on, whatever you send', async () => {
    setRole(TRIP, DEMO, null);
    expect((await add('sarah@wend.app')).status).toBe(404);
  });

  it('is 401 when you are not signed in', async () => {
    signIn(null);
    expect((await add('sarah@wend.app')).status).toBe(401);
  });
});

describe('PATCH /api/trips/:id/collaborators/:user_id', () => {
  beforeEach(() => setRole(TRIP, SARAH, 'member'));

  it('changes what someone can do', async () => {
    const response = await send('PATCH', `/trips/${TRIP}/collaborators/${SARAH}`, { role: 'viewer' });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { collaborator: Collaborator }).collaborator).toMatchObject({
      user_id: SARAH,
      role: 'viewer',
    });
    expect(roleFor(TRIP, SARAH)).toBe('viewer');
  });

  it('will not make a second owner', async () => {
    const response = await send('PATCH', `/trips/${TRIP}/collaborators/${SARAH}`, { role: 'owner' });
    expect(response.status).toBe(422);
    expect(roleFor(TRIP, SARAH)).toBe('member');
  });

  it('will not let the owner demote themselves out of the job', async () => {
    const response = await send('PATCH', `/trips/${TRIP}/collaborators/${DEMO}`, { role: 'member' });
    expect(response.status).toBe(403);
    expect(roleFor(TRIP, DEMO)).toBe('owner');
  });

  it('is 403 for a member', async () => {
    setRole(TRIP, DEMO, 'member');
    setRole(TRIP, SARAH, 'viewer');
    const response = await send('PATCH', `/trips/${TRIP}/collaborators/${SARAH}`, { role: 'member' });
    expect(response.status).toBe(403);
  });

  it('is 404 for someone who is not on the trip', async () => {
    setRole(TRIP, SARAH, null);
    const response = await send('PATCH', `/trips/${TRIP}/collaborators/${SARAH}`, { role: 'viewer' });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/trips/:id/collaborators/:user_id', () => {
  beforeEach(() => setRole(TRIP, SARAH, 'member'));

  it('takes someone off when the owner says so', async () => {
    const response = await send('DELETE', `/trips/${TRIP}/collaborators/${SARAH}`);

    expect(response.status).toBe(204);
    expect(roleFor(TRIP, SARAH)).toBeNull();
  });

  it('lets you leave a trip you did not start', async () => {
    signIn(SARAH);
    const response = await send('DELETE', `/trips/${TRIP}/collaborators/${SARAH}`);

    expect(response.status).toBe(204);
    expect(roleFor(TRIP, SARAH)).toBeNull();
  });

  it('will not let the owner leave — they hand it over first', async () => {
    const response = await send('DELETE', `/trips/${TRIP}/collaborators/${DEMO}`);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe(
      'You started this trip, so it needs you until someone else takes it on.',
    );
    expect(roleFor(TRIP, DEMO)).toBe('owner');
  });

  it('will not let a member take someone else off', async () => {
    setRole(TRIP, DEMO, 'member');
    setRole(TRIP, SARAH, 'viewer');
    const response = await send('DELETE', `/trips/${TRIP}/collaborators/${SARAH}`);

    expect(response.status).toBe(403);
    expect(roleFor(TRIP, SARAH)).toBe('viewer');
  });

  it('is 404 for someone who was never here', async () => {
    setRole(TRIP, SARAH, null);
    expect((await send('DELETE', `/trips/${TRIP}/collaborators/${SARAH}`)).status).toBe(404);
  });
});

describe('POST /api/trips/:id/collaborators/:user_id/hand_over', () => {
  beforeEach(() => setRole(TRIP, SARAH, 'member'));

  it('swaps the two of you: they take the trip, you stay on as an editor', async () => {
    const response = await send('POST', `/trips/${TRIP}/collaborators/${SARAH}/hand_over`);

    expect(response.status).toBe(200);
    expect(((await response.json()) as CollaboratorsResponse).my_role).toBe('member');
    expect(roleFor(TRIP, SARAH)).toBe('owner');
    expect(roleFor(TRIP, DEMO)).toBe('member');
  });

  it('leaves exactly one owner behind', async () => {
    await send('POST', `/trips/${TRIP}/collaborators/${SARAH}/hand_over`);
    expect(collaboratorsFor(TRIP).filter((m) => m.role === 'owner')).toHaveLength(1);
  });

  it('is 403 for anyone but the owner', async () => {
    signIn(SARAH);
    expect((await send('POST', `/trips/${TRIP}/collaborators/${DEMO}/hand_over`)).status).toBe(403);
  });

  it('is 404 for someone who is not on the trip', async () => {
    setRole(TRIP, SARAH, null);
    expect((await send('POST', `/trips/${TRIP}/collaborators/${SARAH}/hand_over`)).status).toBe(404);
  });
});

describe('GET /api/entries with a role', () => {
  it('shows you the trip you are on, and its ideas', async () => {
    const body = (await (await get('/entries')).json()) as { entries: { id: number }[] };
    expect(body.entries.map((e) => e.id)).toContain(TRIP);
  });

  it('hides a trip you are not on, but leaves the library alone', async () => {
    setRole(TRIP, DEMO, null);
    const body = (await (await get('/entries')).json()) as { entries: { id: number; title: string }[] };
    const ids = body.entries.map((e) => e.id);

    expect(ids).not.toContain(TRIP);
    // Entry 5 is a library idea under no trip — nobody's but yours.
    expect(ids).toContain(5);
  });

  it('reports your role on the trip and nothing on its ideas', async () => {
    const body = (await (await get('/entries')).json()) as {
      entries: { id: number; my_role: string | null }[];
    };

    expect(body.entries.find((e) => e.id === TRIP)?.my_role).toBe('owner');
    expect(body.entries.find((e) => e.id === 2)?.my_role).toBeNull();
  });

  it('counts the people on a trip in its detail payload', async () => {
    setRole(TRIP, SARAH, 'viewer');
    const body = (await (await get(`/entries/${TRIP}`)).json()) as { collaborators_count: number };
    expect(body.collaborators_count).toBe(2);
  });
});
