import { describe, expect, it } from 'vitest';
import { api, ApiError } from '../api/client';
import { db } from './db';
import { resetDb } from './handlers';
import type { ScheduleItem, TripDay } from '../api/types';

// The MSW itinerary routes are the only backend the UI tests and the browser
// dev server see, so the rules they stand in for — fork letters, keep/restore,
// version resolution — are worth testing on their own. Everything here goes
// through the real api client, exactly as the hooks do.

const TRIP_ID = 1;
const BUNDLE_DAY = '2026-11-02'; // Nishiki market crawl, 11:00–13:00
const TWO_VERSION_DAY = '2026-11-03';
const ARCHIVED_DAY = '2026-11-04';
const EMPTY_DAY = '2026-11-06'; // inside the trip, no row seeded

function itinerary(): Promise<{ trip_days: TripDay[] }> {
  return api.get(`/trips/${TRIP_ID}/itinerary`);
}

async function dayFor(date: string): Promise<TripDay> {
  const { trip_days } = await itinerary();
  const day = trip_days.find((d) => d.day === date);
  if (!day) throw new Error(`no seeded trip day for ${date}`);
  return day;
}

const names = (day: TripDay) => day.versions.map((v) => v.name);

describe('GET /trips/:id/itinerary', () => {
  it('returns only the dates that have a row, in date order', async () => {
    const { trip_days } = await itinerary();
    expect(trip_days.map((d) => d.day)).toEqual([BUNDLE_DAY, TWO_VERSION_DAY, ARCHIVED_DAY]);
  });

  it('splits live versions from archived ones and orders items by time', async () => {
    const day = await dayFor(ARCHIVED_DAY);
    expect(names(day)).toEqual(['Version A']);
    expect(day.archived_versions.map((v) => v.name)).toEqual(['Version B']);
    // Archived does not mean emptied — what was planned is still in there.
    expect(day.archived_versions[0]?.schedule_items).toHaveLength(1);

    const versionB = (await dayFor(TWO_VERSION_DAY)).versions[1];
    expect(versionB?.schedule_items.map((i) => i.starts_at_minutes)).toEqual([600, 750]);
  });

  it('inlines each item’s entry, and a bundle’s members in link order', async () => {
    const day = await dayFor(BUNDLE_DAY);
    const [nanzenji, bundle] = day.versions[0]?.schedule_items ?? [];
    expect(nanzenji?.entry?.title).toBe('Nanzen-ji');
    expect(nanzenji?.members).toEqual([]);
    expect(bundle?.entry?.kind).toBe('bundle');
    expect(bundle?.members.map((m) => m.title)).toEqual(['Coffee at Weekenders', 'Nishiki market', 'Teramachi arcade']);
  });

  it('resolves lodging_title from the entry first, then the free-text label', async () => {
    expect((await dayFor(BUNDLE_DAY)).lodging_title).toBe('Machiya near Gion');
    expect((await dayFor(TWO_VERSION_DAY)).lodging_title).toBeNull();

    const { trip_day } = await api.patch<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${TWO_VERSION_DAY}`, {
      trip_day: { lodging_entry_id: 2, lodging_label: 'ignored while an entry is set' },
    });
    expect(trip_day.lodging_title).toBe('Nanzen-ji');

    const cleared = await api.patch<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${TWO_VERSION_DAY}`, {
      trip_day: { lodging_entry_id: null, lodging_label: null },
    });
    expect(cleared.trip_day.lodging_title).toBeNull();
  });

  it('creates the row on demand for a date that had none', async () => {
    const { trip_day } = await api.patch<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${EMPTY_DAY}`, {
      trip_day: { lodging_label: 'Ryokan by the river' },
    });
    expect(names(trip_day)).toEqual(['Version A']);
    expect((await itinerary()).trip_days.map((d) => d.day)).toContain(EMPTY_DAY);
  });

  it('404s a malformed date rather than inventing a day for it', async () => {
    await expect(api.patch(`/trips/${TRIP_ID}/days/next-tuesday`, { trip_day: {} })).rejects.toMatchObject({ status: 404 });
  });
});

describe('fork', () => {
  it('letters versions A -> B -> C and copies the last live one’s items', async () => {
    const first = await api.post<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${BUNDLE_DAY}/versions`);
    expect(names(first.trip_day)).toEqual(['Version A', 'Version B']);

    const copied = first.trip_day.versions[1]?.schedule_items ?? [];
    const source = first.trip_day.versions[0]?.schedule_items ?? [];
    expect(copied.map((i) => [i.entry_id, i.starts_at_minutes, i.ends_at_minutes])).toEqual(
      source.map((i) => [i.entry_id, i.starts_at_minutes, i.ends_at_minutes]),
    );
    // Copies, not moves: the originals stay where they were.
    expect(copied.map((i) => i.id)).not.toEqual(source.map((i) => i.id));

    const second = await api.post<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${BUNDLE_DAY}/versions`);
    expect(names(second.trip_day)).toEqual(['Version A', 'Version B', 'Version C']);
  });

  it('counts every version the day has ever had, archived ones included', async () => {
    // This day is seeded with a live A and an archived B, so the next letter
    // is C — the count is of versions ever, not of live ones.
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${ARCHIVED_DAY}/versions`);
    expect(names(trip_day)).toEqual(['Version A', 'Version C']);
  });

  it('creates the day and its Version A first when the date is untouched', async () => {
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/trips/${TRIP_ID}/days/${EMPTY_DAY}/versions`);
    expect(names(trip_day)).toEqual(['Version A', 'Version B']);
    expect(trip_day.versions.flatMap((v) => v.schedule_items)).toEqual([]);
  });
});

describe('keep, archive and restore', () => {
  it('keeping a version archives its live siblings and renames the survivor', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    const versionB = day.versions[1];
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/day_versions/${versionB?.id}/keep`);

    expect(names(trip_day)).toEqual(['Version A']);
    expect(trip_day.versions[0]?.id).toBe(versionB?.id);
    expect(trip_day.versions[0]?.position).toBe(0);
    // The one that lost keeps its name and its items, set aside not deleted.
    expect(trip_day.archived_versions.map((v) => v.name)).toEqual(['Version A']);
    expect(trip_day.archived_versions[0]?.schedule_items).toHaveLength(2);
  });

  it('keeping the only live version changes nothing', async () => {
    const day = await dayFor(ARCHIVED_DAY);
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/day_versions/${day.versions[0]?.id}/keep`);
    expect(names(trip_day)).toEqual(['Version A']);
    expect(trip_day.archived_versions.map((v) => v.name)).toEqual(['Version B']);
  });

  it('restoring appends at the end of the live list with the first free letter', async () => {
    const day = await dayFor(ARCHIVED_DAY);
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/day_versions/${day.archived_versions[0]?.id}/restore`);

    expect(names(trip_day)).toEqual(['Version A', 'Version B']);
    expect(trip_day.versions[1]?.position).toBe(1);
    expect(trip_day.archived_versions).toEqual([]);
    expect(trip_day.versions[1]?.schedule_items).toHaveLength(1);
  });

  it('gives a restored version the first free letter, not the next one', async () => {
    // Fork twice so the day runs A, B, C; archive B; restoring it should take
    // the freed "Version B" back rather than becoming "Version D".
    await api.post(`/trips/${TRIP_ID}/days/${BUNDLE_DAY}/versions`);
    await api.post(`/trips/${TRIP_ID}/days/${BUNDLE_DAY}/versions`);
    const day = await dayFor(BUNDLE_DAY);
    const versionB = day.versions[1];

    await api.delete(`/day_versions/${versionB?.id}`);
    expect(names(await dayFor(BUNDLE_DAY))).toEqual(['Version A', 'Version C']);

    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/day_versions/${versionB?.id}/restore`);
    expect(names(trip_day)).toEqual(['Version A', 'Version C', 'Version B']);
  });

  it('archives rather than deletes, and refuses to take the last live version', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    const { trip_day } = await api.delete<{ trip_day: TripDay }>(`/day_versions/${day.versions[1]?.id}`);
    expect(names(trip_day)).toEqual(['Version A']);
    expect(trip_day.archived_versions.map((v) => v.name)).toEqual(['Version B']);

    const error = await api.delete(`/day_versions/${trip_day.versions[0]?.id}`).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    // Still there, still live.
    expect(names(await dayFor(TWO_VERSION_DAY))).toEqual(['Version A']);
  });
});

describe('version resolution on schedule writes', () => {
  it('puts an item with no day_version_id in the day’s first live version', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    const { schedule_item } = await api.post<{ schedule_item: ScheduleItem }>(`/trips/${TRIP_ID}/schedule`, {
      schedule_item: { entry_id: 3, day: TWO_VERSION_DAY, starts_at_minutes: 960, ends_at_minutes: 1020 },
    });
    expect(schedule_item.day_version_id).toBe(day.versions[0]?.id);
  });

  it('creates the day and its Version A when the date has no row yet', async () => {
    const { schedule_item } = await api.post<{ schedule_item: ScheduleItem }>(`/trips/${TRIP_ID}/schedule`, {
      schedule_item: { entry_id: 3, day: EMPTY_DAY, starts_at_minutes: 540, ends_at_minutes: 600 },
    });
    const day = await dayFor(EMPTY_DAY);
    expect(names(day)).toEqual(['Version A']);
    expect(day.versions[0]?.id).toBe(schedule_item.day_version_id);
    expect(day.versions[0]?.schedule_items.map((i) => i.id)).toEqual([schedule_item.id]);
  });

  it('takes the date from the version when only a version is named', async () => {
    const day = await dayFor(ARCHIVED_DAY);
    const { schedule_item } = await api.post<{ schedule_item: ScheduleItem }>(`/trips/${TRIP_ID}/schedule`, {
      schedule_item: { entry_id: 3, day_version_id: day.versions[0]?.id, starts_at_minutes: 600, ends_at_minutes: 660 },
    });
    expect(schedule_item.day).toBe(ARCHIVED_DAY);
  });

  it('rejects a version id that points at nothing', async () => {
    await expect(
      api.post(`/trips/${TRIP_ID}/schedule`, { schedule_item: { entry_id: 3, day: EMPTY_DAY, day_version_id: 987654 } }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('re-resolves the version when a PATCH moves an item to another date', async () => {
    const from = await dayFor(BUNDLE_DAY);
    const item = from.versions[0]?.schedule_items[0];
    const { schedule_item } = await api.patch<{ schedule_item: ScheduleItem }>(`/schedule_items/${item?.id}`, {
      schedule_item: { day: ARCHIVED_DAY },
    });
    expect(schedule_item.day_version_id).toBe((await dayFor(ARCHIVED_DAY)).versions[0]?.id);
  });

  it('honours a day_version_id given alongside the day', async () => {
    const day = await dayFor(TWO_VERSION_DAY);
    const item = day.versions[0]?.schedule_items[0];
    const { schedule_item } = await api.patch<{ schedule_item: ScheduleItem }>(`/schedule_items/${item?.id}`, {
      schedule_item: { day: TWO_VERSION_DAY, day_version_id: day.versions[1]?.id },
    });
    expect(schedule_item.day_version_id).toBe(day.versions[1]?.id);
  });
});

/**
 * Mirrors backend/app/models/trip_date_shift.rb and its request test. The
 * browser check drives this mock rather than Rails, so a mock that merely
 * saved the dates would make that check pass against a lie.
 */
describe('PATCH /entries/:id — moving the trip’s dates', () => {
  const days = async () => (await itinerary()).trip_days.map((d) => d.day);

  /** Every date the trip has anything on, trip_day row or not. */
  const itemDays = () => [...new Set(db.scheduleItems.filter((s) => s.trip_id === TRIP_ID).map((s) => s.day))].sort();

  async function setDates(starts_on: string, ends_on: string, confirm = false) {
    return api.patch(`/entries/${TRIP_ID}`, {
      entry: { starts_on, ends_on },
      ...(confirm ? { confirm_dropped_days: true } : {}),
    });
  }

  it('carries the whole plan by the same delta, so Day 2 stays Day 2', async () => {
    // 2–8 Nov becomes 5–11 Nov: three days later, and so is everything on it.
    await setDates('2026-11-05', '2026-11-11');

    expect(await days()).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(itemDays()).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
  });

  it('leaves a rename alone — naming neither date can never drop a day', async () => {
    await api.patch(`/entries/${TRIP_ID}`, { entry: { title: 'Seven days in Kyoto' } });

    expect(await days()).toEqual([BUNDLE_DAY, TWO_VERSION_DAY, ARCHIVED_DAY]);
  });

  it('refuses a shorter trip with the days it would clear, and writes nothing', async () => {
    // 2–3 Nov leaves the seeded 4 Nov outside: one dropped day, and the two
    // items on it (one live, one in the archived version).
    const error = await setDates('2026-11-02', '2026-11-03').catch((e: ApiError) => e);

    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).message).toBe('dropped_days_need_confirmation');
    // Nothing moved: the attempt is the preview, not the change.
    expect(await days()).toEqual([BUNDLE_DAY, TWO_VERSION_DAY, ARCHIVED_DAY]);
    const { entry } = await api.get<{ entry: { ends_on: string } }>(`/entries/${TRIP_ID}`);
    expect(entry.ends_on).toBe('2026-11-08');
  });

  it('names the dropped dates and how much is on them, so the warning can say it', async () => {
    const response = await fetch(`/api/entries/${TRIP_ID}`, {
      method: 'PATCH',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: { starts_on: '2026-11-02', ends_on: '2026-11-03' } }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'dropped_days_need_confirmation',
      dropped_days: [ARCHIVED_DAY],
      dropped_item_count: 2,
    });
  });

  it('clears the dropped days once confirmed, and keeps every entry they held', async () => {
    const entriesBefore = db.entries.length;
    await setDates('2026-11-02', '2026-11-03', true);

    expect(await days()).toEqual([BUNDLE_DAY, TWO_VERSION_DAY]);
    expect(itemDays()).toEqual([BUNDLE_DAY, TWO_VERSION_DAY]);
    // Placements only. The ideas are still there, which is what puts them back
    // under "Not placed yet".
    expect(db.entries).toHaveLength(entriesBefore);
    expect(db.dayVersions.filter((v) => v.trip_day_id === 3)).toEqual([]);
  });

  it('shifts and drops in one write, reading the plan before any of it moves', async () => {
    // 4–5 Nov: two days later, and two days long. The three planned days move
    // to 4, 5 and 6 Nov, and only the last of them is past the new end.
    const error = await setDates('2026-11-04', '2026-11-05').catch((e: ApiError) => e);
    expect((error as ApiError).status).toBe(422);

    await setDates('2026-11-04', '2026-11-05', true);
    expect(await days()).toEqual(['2026-11-04', '2026-11-05']);
    // The survivors are the first two days' plans, on their new dates.
    expect(itemDays()).toEqual(['2026-11-04', '2026-11-05']);
  });
});

describe('POST /trips/:id/itinerary/swap_days', () => {
  const swap = (a: string, b: string) => api.post<{ trip_days: TripDay[] }>(`/trips/${TRIP_ID}/itinerary/swap_days`, { a, b });

  it('exchanges two planned days, lodging and all', async () => {
    const { trip_days } = await swap(BUNDLE_DAY, ARCHIVED_DAY);

    const first = trip_days.find((d) => d.day === BUNDLE_DAY);
    const third = trip_days.find((d) => d.day === ARCHIVED_DAY);
    // The night train was on 4 Nov and the machiya on 2 Nov; they have traded.
    expect(first?.lodging_title).toBe('Sleeping on the night train');
    expect(third?.lodging_title).toBe('Machiya near Gion');
    // And so has everything placed on them, versions included.
    expect(first?.versions[0]?.schedule_items.map((i) => i.entry?.title)).toEqual(['A night out in Pontocho']);
    expect(first?.archived_versions).toHaveLength(1);
    expect(third?.versions[0]?.schedule_items.map((i) => i.entry?.title)).toEqual([
      'Nanzen-ji',
      'Nishiki market crawl',
    ]);
  });

  it('moves the plan when the other day is empty, rather than refusing', async () => {
    const { trip_days } = await swap(BUNDLE_DAY, EMPTY_DAY);

    expect(trip_days.map((d) => d.day)).toEqual([TWO_VERSION_DAY, ARCHIVED_DAY, EMPTY_DAY]);
    const moved = trip_days.find((d) => d.day === EMPTY_DAY);
    expect(moved?.lodging_title).toBe('Machiya near Gion');
    expect(moved?.versions[0]?.schedule_items).toHaveLength(2);
    expect(moved?.versions[0]?.schedule_items.every((i) => i.day === EMPTY_DAY)).toBe(true);
  });

  it('is a swap and not a reorder — the day it displaces comes back', async () => {
    await swap(TWO_VERSION_DAY, ARCHIVED_DAY);
    const { trip_days } = await itinerary();

    // Day 3's single version is now on Day 2's date, and Day 2's two versions
    // on Day 3's. Nothing was pushed along to a fourth date.
    expect(trip_days.map((d) => d.versions.length)).toEqual([1, 1, 2]);
    expect(trip_days.map((d) => d.day)).toEqual([BUNDLE_DAY, TWO_VERSION_DAY, ARCHIVED_DAY]);
  });

  it('refuses a date outside the trip, and a date that is not one', async () => {
    await expect(swap(BUNDLE_DAY, '2026-12-25')).rejects.toMatchObject({
      status: 422,
      message: 'day_outside_trip',
    });
    await expect(swap(BUNDLE_DAY, 'next-tuesday')).rejects.toMatchObject({
      status: 422,
      message: 'invalid_day',
    });
    // Refused means unchanged.
    expect((await itinerary()).trip_days.map((d) => d.day)).toEqual([BUNDLE_DAY, TWO_VERSION_DAY, ARCHIVED_DAY]);
  });
});

describe('seed()', () => {
  it('rebuilds the links instead of appending to them', async () => {
    // Regression: seed() reset db.entries but not db.links, so every resetDb()
    // duplicated the seeded links and leaked any a test had made.
    const before = db.links.length;
    await api.post('/entries/1/links', { child_id: 5 });
    resetDb();
    expect(db.links).toHaveLength(before);
    expect(db.links.filter((l) => l.parent_id === 1)).toHaveLength(3);
  });
});
