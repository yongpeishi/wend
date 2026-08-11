import { describe, expect, it } from 'vitest';
import { entriesWithCoordinates, entryToPin, pinStateForEntry, pinStateLabel } from './pins';
import type { Entry } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    location_name: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

describe('pinStateForEntry', () => {
  it('is destination for lodging, regardless of schedule state', () => {
    expect(pinStateForEntry(makeEntry({ category: 'lodging', scheduled: false }))).toBe('destination');
    expect(pinStateForEntry(makeEntry({ category: 'lodging', scheduled: true }))).toBe('destination');
  });

  it('is scheduled once a schedule_item places it', () => {
    expect(pinStateForEntry(makeEntry({ category: 'place', scheduled: true }))).toBe('scheduled');
  });

  it('is potential otherwise', () => {
    expect(pinStateForEntry(makeEntry({ category: 'place', scheduled: false }))).toBe('potential');
  });
});

describe('pinStateLabel', () => {
  it('gives every state a plain word — colour never carries meaning alone', () => {
    expect(pinStateLabel('scheduled')).toBe('Scheduled');
    expect(pinStateLabel('potential')).toBe('Potential');
    expect(pinStateLabel('destination')).toBe('Lodging anchor');
  });
});

describe('entriesWithCoordinates / entryToPin', () => {
  it('drops entries with no lat or no lng', () => {
    const entries = [
      makeEntry({ id: 1, lat: 1, lng: 1 }),
      makeEntry({ id: 2, lat: null, lng: 1 }),
      makeEntry({ id: 3, lat: 1, lng: null }),
    ];
    expect(entriesWithCoordinates(entries).map((e) => e.id)).toEqual([1]);
  });

  it('carries id, title, position and state onto the pin', () => {
    const entry = makeEntry({ id: 5, title: 'Nanzen-ji', lat: 35.01, lng: 135.76, scheduled: true });
    expect(entryToPin(entry as Entry & { lat: number; lng: number })).toEqual({
      id: 5,
      title: 'Nanzen-ji',
      lat: 35.01,
      lng: 135.76,
      state: 'scheduled',
    });
  });
});
