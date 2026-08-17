import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { db } from './db';
import type { Entry, ScheduleItem, TripDay } from '../api/types';

// Regression tests for a bug that reached a real browser.
//
// The 014 Itinerary feature gave every day one or more `day_versions`, so a day
// can carry two plans side by side while they are compared, plus the archived
// ones the user rejected. `GET /trips/:id/schedule` — which powers the older
// Final schedule screen, the dark surface people read while actually
// travelling — kept returning every schedule_item on the day whatever version
// it belonged to. Two things a user saw:
//
//   1. Fork a day and every item came back twice, stacked on the same grid.
//   2. A day whose Version B had been archived still showed Version B's items.
//      A plan explicitly rejected reappeared on the travelling screen.
//
// The rule now: the Final schedule reads exactly one plan per day — the day's
// FIRST LIVE version (lowest `position` among those with no `archived_at`) —
// plus any item with a null `day_version_id`, which are legacy rows predating
// the feature.
//
// These mirror backend/test/requests/api/final_schedule_versions_test.rb. The
// mock is the only backend the UI tests and the dev server see, so if the two
// drift the browser gets a bug the test suite cannot see. Change both together.

const TRIP_ID = 1;
const SINGLE_VERSION_DAY = '2026-11-02'; // one live version: Nanzen-ji + the market bundle
const TWO_VERSION_DAY = '2026-11-03'; // Version A and Version B, both live
const ARCHIVED_DAY = '2026-11-04'; // Version A live, Version B archived

function schedule(day?: string): Promise<{ schedule_items: ScheduleItem[] }> {
  return api.get(`/trips/${TRIP_ID}/schedule${day ? `?day=${day}` : ''}`);
}

async function scheduleTitles(day?: string): Promise<string[]> {
  const { schedule_items } = await schedule(day);
  return schedule_items.map((item) => db.entries.find((e) => e.id === item.entry_id)?.title ?? '?');
}

async function dayFor(date: string): Promise<TripDay> {
  const { trip_days } = await api.get<{ trip_days: TripDay[] }>(`/trips/${TRIP_ID}/itinerary`);
  const day = trip_days.find((d) => d.day === date);
  if (!day) throw new Error(`no seeded trip day for ${date}`);
  return day;
}

async function entries(query = ''): Promise<Entry[]> {
  const { entries: rows } = await api.get<{ entries: Entry[] }>(`/entries?trip_id=${TRIP_ID}${query}`);
  return rows;
}

async function scheduledFlag(title: string): Promise<boolean | undefined> {
  return (await entries()).find((e) => e.title === title)?.scheduled;
}

describe('GET /trips/:id/schedule — one plan per day', () => {
  it('returns a forked day once, not twice', async () => {
    const before = await scheduleTitles(SINGLE_VERSION_DAY);
    expect(before).toEqual(['Nanzen-ji', 'Nishiki market crawl']);

    await api.post(`/trips/${TRIP_ID}/days/${SINGLE_VERSION_DAY}/versions`, {});

    // The fork copied both items, so the day now holds four rows...
    expect(db.scheduleItems.filter((s) => s.day === SINGLE_VERSION_DAY)).toHaveLength(4);
    // ...and the Final schedule still shows two. This is the stacked-duplicates bug.
    expect(await scheduleTitles(SINGLE_VERSION_DAY)).toEqual(before);
  });

  it('shows the first live version of a two-version day, not both', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    expect(day.versions).toHaveLength(2);

    const titles = await scheduleTitles(TWO_VERSION_DAY);
    expect(titles).toEqual(['Nanzen-ji', 'Teramachi arcade']); // Version A
    expect(titles).not.toContain('Kamo river walk'); // Version B
  });

  it('never shows an archived version’s items', async () => {
    const day = await dayFor(ARCHIVED_DAY);
    const archived = day.archived_versions[0];
    expect(archived?.name).toBe('Version B');
    // Archived does not mean emptied — the rejected plan is kept, just not read.
    expect(archived?.schedule_items.map((i) => i.entry?.title)).toEqual(['Coffee at Weekenders']);

    expect(await scheduleTitles(ARCHIVED_DAY)).toEqual(['A night out in Pontocho']);
  });

  it('drops the loser when a version is kept', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    const [versionA, versionB] = day.versions;
    expect(await scheduleTitles(TWO_VERSION_DAY)).toEqual(['Nanzen-ji', 'Teramachi arcade']);

    await api.post(`/day_versions/${versionB?.id}/keep`, {});

    // B won, so B is what the travelling screen now reads — and A's items,
    // archived rather than deleted, are gone from it.
    expect(await scheduleTitles(TWO_VERSION_DAY)).toEqual(['Kamo river walk', 'Yakitori under the tracks']);
    expect((await dayFor(TWO_VERSION_DAY)).archived_versions.map((v) => v.id)).toEqual([versionA?.id]);
  });

  it('hands over to the next live version when the first one is archived', async () => {
    const [versionA] = (await dayFor(TWO_VERSION_DAY)).versions;

    await api.delete(`/day_versions/${versionA?.id}`); // archives, never deletes

    expect(await scheduleTitles(TWO_VERSION_DAY)).toEqual(['Kamo river walk', 'Yakitori under the tracks']);
  });

  it('does not put a restored version’s items back into the plan', async () => {
    const archived = (await dayFor(ARCHIVED_DAY)).archived_versions[0];

    await api.post(`/day_versions/${archived?.id}/restore`, {});

    // Restored means "back on the table to compare", not "back in the plan":
    // it is appended after the first live version, which still wins.
    expect((await dayFor(ARCHIVED_DAY)).versions).toHaveLength(2);
    expect(await scheduleTitles(ARCHIVED_DAY)).toEqual(['A night out in Pontocho']);
  });

  it('keeps legacy items with a null day_version_id', async () => {
    // Rows that predate day_versions. They belong to no version and must not
    // vanish from the one screen that shows them.
    db.scheduleItems.push({
      id: 9001,
      trip_id: TRIP_ID,
      entry_id: 3, // Kiyamachi
      chosen_entry_id: null,
      day: TWO_VERSION_DAY,
      day_version_id: null,
      starts_at_minutes: 8 * 60,
      ends_at_minutes: 9 * 60,
      note: null,
      position: 0,
    });

    expect(await scheduleTitles(TWO_VERSION_DAY)).toContain('Kiyamachi');
    // Still there after the day is forked and a version is archived around it.
    await api.post(`/trips/${TRIP_ID}/days/${TWO_VERSION_DAY}/versions`, {});
    expect(await scheduleTitles(TWO_VERSION_DAY)).toContain('Kiyamachi');
  });

  it('applies the same one-plan rule with no ?day= filter', async () => {
    const { schedule_items } = await schedule();
    const perDay = (day: string) => schedule_items.filter((s) => s.day === day).length;

    expect(perDay(SINGLE_VERSION_DAY)).toBe(2);
    expect(perDay(TWO_VERSION_DAY)).toBe(2); // not 4
    expect(perDay(ARCHIVED_DAY)).toBe(1); // not 2
  });
});

describe('GET /entries?scheduled= — an archived placement does not count', () => {
  it('frees an entry whose only placement was archived', async () => {
    // The seed puts Coffee at Weekenders in the archived Version B and nowhere
    // else, which is why the unplaced rail counts three things.
    expect(await scheduledFlag('Coffee at Weekenders')).toBe(false);

    const unscheduled = await entries('&scheduled=false');
    expect(unscheduled.map((e) => e.title)).toContain('Coffee at Weekenders');
    const scheduled = await entries('&scheduled=true');
    expect(scheduled.map((e) => e.title)).not.toContain('Coffee at Weekenders');
  });

  it('still counts an entry sitting in a second LIVE version', async () => {
    // Kamo river walk is in Version B of the undecided day. The Final schedule
    // does not show it yet, but it is placed — putting it back on the unplaced
    // rail while it sits in a live plan would be the opposite mistake.
    expect(await scheduledFlag('Kamo river walk')).toBe(true);
    expect(await scheduleTitles(TWO_VERSION_DAY)).not.toContain('Kamo river walk');
  });

  it('frees it again the moment its version is archived', async () => {
    const versionB = (await dayFor(TWO_VERSION_DAY)).versions[1];
    expect(await scheduledFlag('Yakitori under the tracks')).toBe(true);

    await api.delete(`/day_versions/${versionB?.id}`);

    expect(await scheduledFlag('Yakitori under the tracks')).toBe(false);
    expect(db.scheduleItems.some((s) => s.entry_id === 11)).toBe(true); // kept, not deleted
  });

  it('treats a chosen bundle member the same way', async () => {
    const versionA = (await dayFor(TWO_VERSION_DAY)).versions[0];
    db.scheduleItems.push({
      id: 9002,
      trip_id: TRIP_ID,
      entry_id: 4, // Nishiki market crawl (bundle)
      chosen_entry_id: 7, // Nishiki market
      day: TWO_VERSION_DAY,
      day_version_id: versionA?.id ?? null,
      starts_at_minutes: 14 * 60,
      ends_at_minutes: 15 * 60,
      note: null,
      position: 2,
    });
    expect(await scheduledFlag('Nishiki market')).toBe(true);

    await api.delete(`/day_versions/${versionA?.id}`);

    expect(await scheduledFlag('Nishiki market')).toBe(false);
  });
});
