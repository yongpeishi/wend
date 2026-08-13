import { describe, expect, it } from 'vitest';
import { api, ApiError } from '../api/client';
import { db } from './db';
import { resetDb } from './handlers';
import type { ScheduleItem, TripDay } from '../api/types';

// The MSW itinerary routes are the only backend the UI tests and the browser
// dev server see, so the rules they stand in for — fork letters, keep/restore,
// ungroup, version resolution — are worth testing on their own. Everything
// here goes through the real api client, exactly as the hooks do.

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

describe('ungroup', () => {
  async function bundleItem(): Promise<ScheduleItem> {
    const day = await dayFor(BUNDLE_DAY);
    const item = day.versions[0]?.schedule_items.find((i) => i.members.length > 0);
    if (!item) throw new Error('no bundle item seeded');
    return item;
  }

  it('divides the span in duration proportion and destroys the bundle item', async () => {
    const item = await bundleItem();
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/schedule_items/${item.id}/ungroup`);
    const items = trip_day.versions[0]?.schedule_items ?? [];

    // 30 / 60 / 30 minutes of a 120-minute span, back to back, 11:00 to 13:00.
    expect(items.map((i) => [i.entry?.title, i.starts_at_minutes, i.ends_at_minutes])).toEqual([
      ['Nanzen-ji', 540, 580],
      ['Coffee at Weekenders', 660, 690],
      ['Nishiki market', 690, 750],
      ['Teramachi arcade', 750, 780],
    ]);
    expect(items.some((i) => i.id === item.id)).toBe(false);
    // The bundle Entry itself is untouched — only the placement went.
    expect(db.entries.some((e) => e.id === item.entry_id)).toBe(true);
  });

  it('divides evenly when a member has no duration of its own', async () => {
    const coffee = db.entries.find((e) => e.title === 'Coffee at Weekenders');
    if (coffee) coffee.duration_minutes = null;

    const item = await bundleItem();
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/schedule_items/${item.id}/ungroup`);
    const placed = (trip_day.versions[0]?.schedule_items ?? []).filter((i) => i.id !== item.id).slice(1);
    expect(placed.map((i) => [i.starts_at_minutes, i.ends_at_minutes])).toEqual([
      [660, 700],
      [700, 740],
      [740, 780],
    ]);
  });

  it('carries the bundle item’s note onto the first member', async () => {
    const item = await bundleItem();
    await api.patch(`/schedule_items/${item.id}`, { schedule_item: { note: 'Cash only' } });
    const { trip_day } = await api.post<{ trip_day: TripDay }>(`/schedule_items/${item.id}/ungroup`);
    expect((trip_day.versions[0]?.schedule_items ?? []).map((i) => i.note)).toEqual([null, 'Cash only', null, null]);
  });

  it('refuses a plain idea and a bundle with nothing in it', async () => {
    const day = await dayFor(BUNDLE_DAY);
    const loose = day.versions[0]?.schedule_items.find((i) => i.members.length === 0);
    await expect(api.post(`/schedule_items/${loose?.id}/ungroup`)).rejects.toMatchObject({ status: 422 });

    const { entry } = await api.post<{ entry: { id: number } }>('/entries', {
      entry: { kind: 'bundle', title: 'An empty bundle' },
    });
    const { schedule_item } = await api.post<{ schedule_item: ScheduleItem }>(`/trips/${TRIP_ID}/schedule`, {
      schedule_item: { entry_id: entry.id, day: BUNDLE_DAY, starts_at_minutes: 900, ends_at_minutes: 960 },
    });
    await expect(api.post(`/schedule_items/${schedule_item.id}/ungroup`)).rejects.toMatchObject({ status: 422 });
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
