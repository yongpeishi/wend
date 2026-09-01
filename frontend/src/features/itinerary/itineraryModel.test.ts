import { describe, expect, it } from 'vitest';
import type { DayVersion, EntrySummary, ItineraryItem, TripDay } from '../../api/types';
import {
  buildDayList,
  bundleMemberSpans,
  dayHours,
  daySummary,
  formatDuration,
  formatSpan,
  nextFreeSlot,
  suggestSlots,
  versionSpan,
  UNSAVED_VERSION_ID,
  withGaps,
} from './itineraryModel';

let nextId = 1;

function summary(overrides: Partial<EntrySummary> = {}): EntrySummary {
  return {
    id: nextId++,
    kind: 'idea',
    title: 'Fushimi Inari',
    category: 'place',
    duration_minutes: 120,
    ...overrides,
  };
}

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: nextId++,
    trip_id: 1,
    entry_id: 7,
    chosen_entry_id: null,
    day: '2026-10-12',
    day_version_id: 3,
    starts_at_minutes: null,
    ends_at_minutes: null,
    note: null,
    position: 0,
    entry: summary(),
    members: [],
    ...overrides,
  };
}

function version(overrides: Partial<DayVersion> = {}): DayVersion {
  return {
    id: nextId++,
    trip_day_id: 1,
    name: 'Version A',
    position: 0,
    archived_at: null,
    schedule_items: [],
    ...overrides,
  };
}

function tripDay(overrides: Partial<TripDay> = {}): TripDay {
  return {
    id: nextId++,
    trip_id: 1,
    day: '2026-10-12',
    lodging_entry_id: null,
    lodging_label: null,
    lodging_title: null,
    versions: [version()],
    archived_versions: [],
    ...overrides,
  };
}

/** `09:00` -> minutes from midnight, so the tests read like the screen does. */
function at(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h as number) * 60 + (m as number);
}

describe('buildDayList', () => {
  it('gives one day per date in the trip, inclusive of both ends', () => {
    const days = buildDayList({ starts_on: '2026-10-12', ends_on: '2026-10-14' }, []);

    expect(days.map((d) => d.day)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(days.map((d) => d.number)).toEqual([1, 2, 3]);
  });

  it('labels a day by its number and its weekday', () => {
    const [first] = buildDayList({ starts_on: '2026-10-12', ends_on: '2026-10-12' }, []);

    expect(first?.label).toBe('Day 1 · Mon 12');
  });

  it('is empty when the trip has no dates — that is the gate, not a fault', () => {
    expect(buildDayList({ starts_on: null, ends_on: null }, [])).toEqual([]);
    expect(buildDayList({ starts_on: '2026-10-12', ends_on: null }, [])).toEqual([]);
    expect(buildDayList({ starts_on: null, ends_on: '2026-10-14' }, [])).toEqual([]);
  });

  it('merges the fetched rows onto the dates they belong to', () => {
    const saved = tripDay({ day: '2026-10-13', lodging_title: 'Machiya near Yasaka', lodging_label: 'Machiya near Yasaka' });

    const days = buildDayList({ starts_on: '2026-10-12', ends_on: '2026-10-13' }, [saved]);

    expect(days[0]?.tripDay).toBeNull();
    expect(days[1]?.tripDay).toBe(saved);
    expect(days[1]?.lodgingTitle).toBe('Machiya near Yasaka');
    expect(days[1]?.lodgingLabel).toBe('Machiya near Yasaka');
  });

  it('gives an untouched date one implicit, unsaved version rather than none', () => {
    const [only] = buildDayList({ starts_on: '2026-10-12', ends_on: '2026-10-12' }, []);

    expect(only?.versions).toHaveLength(1);
    expect(only?.versions[0]?.id).toBe(UNSAVED_VERSION_ID);
    expect(only?.versions[0]?.name).toBe('Version A');
    expect(only?.versions[0]?.schedule_items).toEqual([]);
    expect(only?.archivedVersions).toEqual([]);
  });

  it('falls back to the implicit version when a saved row somehow has none live', () => {
    const days = buildDayList(
      { starts_on: '2026-10-12', ends_on: '2026-10-12' },
      [tripDay({ versions: [], archived_versions: [version({ archived_at: 'now' })] })],
    );

    expect(days[0]?.versions[0]?.id).toBe(UNSAVED_VERSION_ID);
    expect(days[0]?.archivedVersions).toHaveLength(1);
  });

  it('refuses to build a list longer than a year, whatever the dates say', () => {
    const days = buildDayList({ starts_on: '2026-01-01', ends_on: '2126-01-01' }, []);

    expect(days).toHaveLength(366);
  });
});

describe('withGaps', () => {
  it('opens a gap between two things that leave a hole', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('13:00'), ends_at_minutes: at('14:15') }),
      item({ starts_at_minutes: at('18:30'), ends_at_minutes: at('20:00') }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'gap', 'item']);
    expect(rows[1]).toMatchObject({ kind: 'gap', startsAtMinutes: at('14:15'), endsAtMinutes: at('18:30') });
  });

  it('never opens one before the first thing or after the last', () => {
    const rows = withGaps([item({ starts_at_minutes: at('13:00'), ends_at_minutes: at('14:00') })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('item');
  });

  it('counts a hole of exactly the minimum', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('11:00') }),
      item({ starts_at_minutes: at('11:15'), ends_at_minutes: at('12:00') }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'gap', 'item']);
  });

  it('ignores a hole one minute under it — that is the walk between two things', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('11:00') }),
      item({ starts_at_minutes: at('11:14'), ends_at_minutes: at('12:00') }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'item']);
  });

  it('opens nothing between things that touch', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('11:00') }),
      item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00') }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'item']);
  });

  it('opens nothing between things that overlap', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('13:00') }),
      item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00') }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'item']);
  });

  it('measures the hole from the latest end so far, not the previous row', () => {
    // A long morning swallows a short one inside it; the afternoon gap is
    // measured from 13:00, not from the 12:00 the middle item ends at.
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('13:00') }),
      item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00') }),
      item({ starts_at_minutes: at('15:00'), ends_at_minutes: at('16:00') }),
    ]);

    expect(rows[2]).toMatchObject({ kind: 'gap', startsAtMinutes: at('13:00'), endsAtMinutes: at('15:00') });
  });

  it('treats a thing with a start but no end as occupying that instant', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('12:00'), ends_at_minutes: null }),
      item({ starts_at_minutes: at('14:00'), ends_at_minutes: at('15:00') }),
    ]);

    expect(rows[1]).toMatchObject({ kind: 'gap', startsAtMinutes: at('12:00'), endsAtMinutes: at('14:00') });
  });

  it('passes untimed things through without inventing holes around them', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('11:00') }),
      item({ starts_at_minutes: null, ends_at_minutes: null }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['item', 'item']);
  });

  it('sorts by the clock before measuring, whatever order it is handed', () => {
    const rows = withGaps([
      item({ starts_at_minutes: at('18:00'), ends_at_minutes: at('19:00') }),
      item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('10:00') }),
    ]);

    expect(rows[0]).toMatchObject({ kind: 'item' });
    expect((rows[0] as { item: ItineraryItem }).item.starts_at_minutes).toBe(at('09:00'));
    expect(rows[1]).toMatchObject({ kind: 'gap', startsAtMinutes: at('10:00'), endsAtMinutes: at('18:00') });
  });

  it('has nothing to say about an empty day', () => {
    expect(withGaps([])).toEqual([]);
  });
});

describe('dayHours', () => {
  it('adds up what is placed, not the span from first to last', () => {
    expect(
      dayHours([
        item({ starts_at_minutes: at('14:00'), ends_at_minutes: at('16:00') }),
        item({ starts_at_minutes: at('18:00'), ends_at_minutes: at('22:00') }),
      ]),
    ).toBe('6 hr');
  });

  it('shows the trailing minutes without spelling out "min"', () => {
    expect(
      dayHours([
        item({ starts_at_minutes: at('08:00'), ends_at_minutes: at('12:30') }),
        item({ starts_at_minutes: at('13:00'), ends_at_minutes: at('16:00') }),
      ]),
    ).toBe('7 hr 30');
  });

  it('says nothing at all when nothing on the day carries hours', () => {
    expect(dayHours([])).toBe('');
    expect(dayHours([item({ starts_at_minutes: at('12:00'), ends_at_minutes: null })])).toBe('');
  });
});

describe('daySummary', () => {
  it('joins the titles with middots, in clock order', () => {
    expect(
      daySummary([
        item({ starts_at_minutes: at('13:00'), entry: summary({ title: 'Nishiki Market' }) }),
        item({ starts_at_minutes: at('08:00'), entry: summary({ title: 'Fushimi Inari' }) }),
      ]),
    ).toBe('Fushimi Inari · Nishiki Market');
  });

  it('is empty for an empty day, and skips an item whose entry is gone', () => {
    expect(daySummary([])).toBe('');
    expect(daySummary([item({ entry: null })])).toBe('');
  });
});

describe('formatSpan', () => {
  it('writes a range with an en-dash and 24-hour times', () => {
    expect(formatSpan(at('08:00'), at('12:30'))).toBe('08:00–12:30');
  });

  it('writes just the start when there is no end yet', () => {
    expect(formatSpan(at('12:00'), null)).toBe('12:00');
  });

  it('is empty when there is no time at all', () => {
    expect(formatSpan(null, null)).toBe('');
    expect(formatSpan(null, at('12:00'))).toBe('');
  });
});

describe('formatDuration', () => {
  it('writes minutes under the hour', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(0)).toBe('0 min');
  });

  it('writes whole hours plainly and part hours as trailing minutes', () => {
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(255)).toBe('4 hr 15');
    expect(formatDuration(300)).toBe('5 hr');
  });

  // The rail and the picker read a nullable duration off an EntrySummary, and
  // an empty string drops out of joinMeta the same way null does.
  it('says nothing at all about a thing with no estimate', () => {
    expect(formatDuration(null)).toBe('');
  });
});

describe('versionSpan', () => {
  it('runs from the first thing to the last, holes and all', () => {
    const span = versionSpan([
      item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('10:00') }),
      item({ starts_at_minutes: at('15:30'), ends_at_minutes: at('18:00') }),
    ]);

    expect(span).toBe('09:00–18:00');
  });

  it('reads in clock order however the list arrived', () => {
    const span = versionSpan([
      item({ starts_at_minutes: at('15:30'), ends_at_minutes: at('18:00') }),
      item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('10:00') }),
    ]);

    expect(span).toBe('09:00–18:00');
  });

  it('gives just the start when one untimed-ended thing is all there is', () => {
    expect(versionSpan([item({ starts_at_minutes: at('09:00'), ends_at_minutes: null })])).toBe('09:00');
  });

  it('is empty when nothing in it carries hours', () => {
    expect(versionSpan([item(), item()])).toBe('');
    expect(versionSpan([])).toBe('');
  });
});

/**
 * These are display-only times — a bundle sits on a day as one row with one
 * span, and its members have no rows, and so no hours, of their own at all.
 * The rules below are the whole definition of what a member's hours are: every
 * member's share adds back up to the band above it, exactly.
 */
describe('bundleMemberSpans', () => {
  function bundle(start: string, end: string, durations: (number | null)[]): ItineraryItem {
    return item({
      starts_at_minutes: at(start),
      ends_at_minutes: at(end),
      members: durations.map((duration_minutes) => summary({ duration_minutes })),
    });
  }

  it('divides the span in duration proportion when every member has one', () => {
    // 3 hours split 60/120 -> 1 hour, then 2 hours.
    expect(bundleMemberSpans(bundle('09:00', '12:00', [60, 120]))).toEqual([
      { startsAtMinutes: at('09:00'), endsAtMinutes: at('10:00') },
      { startsAtMinutes: at('10:00'), endsAtMinutes: at('12:00') },
    ]);
  });

  it('divides it evenly when any member has no estimate at all', () => {
    expect(bundleMemberSpans(bundle('09:00', '12:00', [60, null]))).toEqual([
      { startsAtMinutes: at('09:00'), endsAtMinutes: at('10:30') },
      { startsAtMinutes: at('10:30'), endsAtMinutes: at('12:00') },
    ]);
  });

  it('divides it evenly when an estimate is zero, which weighs nothing', () => {
    expect(bundleMemberSpans(bundle('09:00', '11:00', [0, 60]))).toEqual([
      { startsAtMinutes: at('09:00'), endsAtMinutes: at('10:00') },
      { startsAtMinutes: at('10:00'), endsAtMinutes: at('11:00') },
    ]);
  });

  it('hands the last member the exact end, so rounding never loses a minute', () => {
    const spans = bundleMemberSpans(bundle('09:00', '10:00', [null, null, null]));

    expect(spans[0].startsAtMinutes).toBe(at('09:00'));
    expect(spans[2].endsAtMinutes).toBe(at('10:00'));
    // Consecutive and non-overlapping: each one starts where the last stopped.
    expect(spans[1].startsAtMinutes).toBe(spans[0].endsAtMinutes);
    expect(spans[2].startsAtMinutes).toBe(spans[1].endsAtMinutes);
  });

  it('gives an untimed bundle members with no times either', () => {
    const spans = bundleMemberSpans(
      item({ starts_at_minutes: null, ends_at_minutes: null, members: [summary(), summary()] }),
    );

    expect(spans).toEqual([
      { startsAtMinutes: null, endsAtMinutes: null },
      { startsAtMinutes: null, endsAtMinutes: null },
    ]);
  });

  it('has nothing to say about a thing with no members', () => {
    expect(bundleMemberSpans(bundle('09:00', '12:00', []))).toEqual([]);
  });

  it('never runs a member backwards, even on a zero-length bundle', () => {
    const spans = bundleMemberSpans(bundle('09:00', '09:00', [30, 90]));

    for (const span of spans) {
      expect(span.endsAtMinutes!).toBeGreaterThanOrEqual(span.startsAtMinutes!);
    }
  });
});

describe('nextFreeSlot', () => {
  it('lands after the last thing already placed', () => {
    const slot = nextFreeSlot([item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('12:00') })], 90);

    expect(slot).toEqual({ start: at('12:00'), end: at('13:30') });
  });

  it('starts the day at 09:00 when nothing is placed yet', () => {
    expect(nextFreeSlot([], 60)).toEqual({ start: at('09:00'), end: at('10:00') });
  });

  it('gives an hour to something that says nothing about how long it takes', () => {
    expect(nextFreeSlot([], null)).toEqual({ start: at('09:00'), end: at('10:00') });
    expect(nextFreeSlot([], 0)).toEqual({ start: at('09:00'), end: at('10:00') });
  });

  it('follows the latest end, not the last item in the list', () => {
    const slot = nextFreeSlot(
      [
        item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('18:00') }),
        item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00') }),
      ],
      60,
    );

    expect(slot.start).toBe(at('18:00'));
  });

  it('uses a start when the last thing has no end', () => {
    const slot = nextFreeSlot([item({ starts_at_minutes: at('20:00'), ends_at_minutes: null })], 30);

    expect(slot).toEqual({ start: at('20:00'), end: at('20:30') });
  });

  it('never runs past the end of the day', () => {
    const slot = nextFreeSlot([item({ starts_at_minutes: at('22:00'), ends_at_minutes: at('23:30') })], 120);

    expect(slot.end).toBe(at('23:59'));
    expect(slot.start).toBe(at('23:59') - 120);
  });
});

describe('suggestSlots', () => {
  it('offers just the morning on an empty day', () => {
    expect(suggestSlots([], 90)).toEqual([{ start: at('09:00'), end: at('10:30'), label: 'morning' }]);
  });

  it('offers just the morning when nothing on the day carries a time', () => {
    const slots = suggestSlots([item(), item()], 60);

    expect(slots).toEqual([{ start: at('09:00'), end: at('10:00'), label: 'morning' }]);
  });

  it('gives an hour to something that says nothing about how long it takes', () => {
    expect(suggestSlots([], null)).toEqual([{ start: at('09:00'), end: at('10:00'), label: 'morning' }]);
    expect(suggestSlots([], 0)).toEqual([{ start: at('09:00'), end: at('10:00'), label: 'morning' }]);
  });

  it('offers a hole it fits in and stays quiet about one it does not', () => {
    // 10:00–12:00 takes an hour whole; the 20 minutes at 12:30 cannot.
    const slots = suggestSlots(
      [
        item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('10:00'), entry: summary({ title: 'Shrine' }) }),
        item({ starts_at_minutes: at('12:00'), ends_at_minutes: at('12:30'), entry: summary({ title: 'Lunch' }) }),
        item({ starts_at_minutes: at('12:50'), ends_at_minutes: at('13:30'), entry: summary({ title: 'Market' }) }),
      ],
      60,
    );

    expect(slots).toEqual([
      { start: at('10:00'), end: at('11:00'), label: 'fits this hole' },
      { start: at('13:30'), end: at('14:30'), label: 'right after Market' },
      { start: at('18:00'), end: at('19:00'), label: 'evening' },
    ]);
  });

  it('offers no hole chips when the thing is longer than every hole', () => {
    // A two-hour hole cannot take three hours; only after-last and evening remain.
    const slots = suggestSlots(
      [
        item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('10:00'), entry: summary({ title: 'Shrine' }) }),
        item({ starts_at_minutes: at('12:00'), ends_at_minutes: at('13:00'), entry: summary({ title: 'Lunch' }) }),
      ],
      180,
    );

    expect(slots).toEqual([
      { start: at('13:00'), end: at('16:00'), label: 'right after Lunch' },
      { start: at('18:00'), end: at('21:00'), label: 'evening' },
    ]);
  });

  it('names the after-last chip for the thing the day ends on', () => {
    const slots = suggestSlots(
      [item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('12:00'), entry: summary({ title: 'Nishiki Market' }) })],
      60,
    );

    expect(slots[0]).toEqual({ start: at('12:00'), end: at('13:00'), label: 'right after Nishiki Market' });
  });

  it('falls back to "the last thing" when that item has no entry any more', () => {
    const slots = suggestSlots([item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('12:00'), entry: null })], 60);

    expect(slots[0]?.label).toBe('right after the last thing');
  });

  it('follows the latest end, not the last item in the list', () => {
    const slots = suggestSlots(
      [
        item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('16:00'), entry: summary({ title: 'Long museum' }) }),
        item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00'), entry: summary({ title: 'Quick lunch' }) }),
      ],
      60,
    );

    expect(slots[0]).toEqual({ start: at('16:00'), end: at('17:00'), label: 'right after Long museum' });
  });

  it('breaks a tie on the same end minute toward the later-placed thing', () => {
    const slots = suggestSlots(
      [
        item({ starts_at_minutes: at('09:00'), ends_at_minutes: at('12:00'), position: 0, entry: summary({ title: 'First placed' }) }),
        item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('12:00'), position: 1, entry: summary({ title: 'Second placed' }) }),
      ],
      60,
    );

    expect(slots[0]?.label).toBe('right after Second placed');
  });

  it('offers the evening only while the day still winds down before 18:00', () => {
    const early = suggestSlots(
      [item({ starts_at_minutes: at('10:00'), ends_at_minutes: at('12:00'), entry: summary({ title: 'Shrine' }) })],
      60,
    );
    const late = suggestSlots(
      [item({ starts_at_minutes: at('17:00'), ends_at_minutes: at('18:30'), entry: summary({ title: 'Dinner' }) })],
      60,
    );

    expect(early.map((slot) => slot.label)).toContain('evening');
    expect(late.map((slot) => slot.label)).not.toContain('evening');
  });

  it('drops the evening when the after-last chip already starts at 18:00', () => {
    // A day ending exactly at 18:00 would otherwise offer two buttons for one minute.
    const slots = suggestSlots(
      [item({ starts_at_minutes: at('16:00'), ends_at_minutes: at('18:00'), entry: summary({ title: 'Castle' }) })],
      60,
    );

    expect(slots).toEqual([{ start: at('18:00'), end: at('19:00'), label: 'right after Castle' }]);
  });

  it('stops at three — the prompt is a nudge, not a menu', () => {
    // Two fitting holes, an after-last and an evening make four; the evening loses.
    const slots = suggestSlots(
      [
        item({ starts_at_minutes: at('08:00'), ends_at_minutes: at('09:00'), entry: summary({ title: 'Breakfast' }) }),
        item({ starts_at_minutes: at('11:00'), ends_at_minutes: at('12:00'), entry: summary({ title: 'Shrine' }) }),
        item({ starts_at_minutes: at('14:00'), ends_at_minutes: at('15:00'), entry: summary({ title: 'Market' }) }),
      ],
      60,
    );

    expect(slots).toEqual([
      { start: at('09:00'), end: at('10:00'), label: 'fits this hole' },
      { start: at('12:00'), end: at('13:00'), label: 'fits this hole' },
      { start: at('15:00'), end: at('16:00'), label: 'right after Market' },
    ]);
  });

  it('drops an after-last that would run past 23:59, and clamps the evening there', () => {
    // Eight hours after 17:00 is tomorrow, so that chip goes; the evening
    // still stands, shortened to end at 23:59 rather than spilling over.
    const slots = suggestSlots(
      [item({ starts_at_minutes: at('15:00'), ends_at_minutes: at('17:00'), entry: summary({ title: 'Onsen' }) })],
      480,
    );

    expect(slots).toEqual([{ start: at('18:00'), end: at('23:59'), label: 'evening' }]);
  });
});
