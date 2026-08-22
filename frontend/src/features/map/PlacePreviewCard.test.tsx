import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlacePreviewCard } from './PlacePreviewCard';
import type { Entry } from '../../api/types';
import type { GeocodeResult } from './types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
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
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

const place: GeocodeResult = {
  lat: 35.0116,
  lng: 135.7681,
  label: 'Nanzen-ji, Sakyo Ward, Kyoto, Japan',
  kind: 'attraction',
};

const noop = () => undefined;

function renderCard(overrides: Partial<Parameters<typeof PlacePreviewCard>[0]> = {}) {
  const props = {
    place,
    plans: [] as Entry[],
    canEdit: true,
    onAddAsIdea: noop,
    onAddToPlan: noop as (planId: number) => void,
    onShowInList: noop,
    onKeepSeparately: noop,
    onDismiss: noop,
    ...overrides,
  };
  return render(<PlacePreviewCard {...props} />);
}

describe('PlacePreviewCard', () => {
  it('shows the place name strong, the address · kind meta, and the keep-it-light line', () => {
    renderCard();

    expect(screen.getByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji, Sakyo Ward, Kyoto, Japan · attraction')).toBeInTheDocument();
    expect(
      screen.getByText('Adding keeps the name and the address. Category, notes and who is keen can wait.'),
    ).toBeInTheDocument();
  });

  it('omits the kind from the meta line when the geocoder gave none', () => {
    renderCard({ place: { ...place, kind: undefined } });
    expect(screen.getByText('Nanzen-ji, Sakyo Ward, Kyoto, Japan')).toBeInTheDocument();
  });

  it('wires the normal-state actions: Add as idea, and Dismiss', async () => {
    const user = userEvent.setup();
    const onAddAsIdea = vi.fn();
    const onDismiss = vi.fn();
    renderCard({ onAddAsIdea, onDismiss });

    await user.click(screen.getByRole('button', { name: 'Add as idea' }));
    expect(onAddAsIdea).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('opens the plans popover and picking a plan calls onAddToPlan with its id', async () => {
    const user = userEvent.setup();
    const onAddToPlan = vi.fn();
    const plans = [makeEntry({ id: 21, kind: 'bundle', title: 'Day in Kyoto' }), makeEntry({ id: 22, kind: 'bundle', title: 'Rainy day' })];
    renderCard({ plans, onAddToPlan });

    expect(screen.queryByText('Day in Kyoto')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to a plan' }));
    await user.click(screen.getByRole('button', { name: 'Day in Kyoto' }));

    expect(onAddToPlan).toHaveBeenCalledWith(21);
    // Picking closes the popover.
    expect(screen.queryByText('Rainy day')).not.toBeInTheDocument();
  });

  it('says "No plans yet." in the popover when there are none', async () => {
    const user = userEvent.setup();
    renderCard({ plans: [] });

    await user.click(screen.getByRole('button', { name: 'Add to a plan' }));
    expect(screen.getByText('No plans yet.')).toBeInTheDocument();
  });

  it('disables the create actions while busy, but never Dismiss', () => {
    renderCard({ busy: true });

    expect(screen.getByRole('button', { name: 'Add as idea' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to a plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });

  it('gives viewers only the name, the meta, and Dismiss', () => {
    renderCard({ canEdit: false });

    expect(screen.getByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add as idea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to a plan' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Adding keeps the name/)).not.toBeInTheDocument();
  });

  it('in the duplicate state shows the jade chip, the kept-already meta with votes, and the redirect actions', async () => {
    const user = userEvent.setup();
    const onShowInList = vi.fn();
    const onKeepSeparately = vi.fn();
    const idea = makeEntry({ id: 5, title: 'Nanzen-ji', vote_tally: { total: 3, count: 2, average: 1.5 } });
    renderCard({ duplicate: { idea }, onShowInList, onKeepSeparately });

    expect(screen.getByText('already on your map')).toBeInTheDocument();
    expect(
      screen.getByText('Nanzen-ji, Sakyo Ward, Kyoto, Japan · attraction · kept already, ▲3 keen'),
    ).toBeInTheDocument();
    // The duplicate card offers no create actions.
    expect(screen.queryByRole('button', { name: 'Add as idea' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show in list' }));
    expect(onShowInList).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Keep separately' }));
    expect(onKeepSeparately).toHaveBeenCalledTimes(1);
  });

  it('omits the votes clause when the tally is zero', () => {
    const idea = makeEntry({ id: 5, title: 'Nanzen-ji' });
    renderCard({ duplicate: { idea } });

    expect(screen.getByText('Nanzen-ji, Sakyo Ward, Kyoto, Japan · attraction · kept already')).toBeInTheDocument();
    expect(screen.queryByText(/keen/)).not.toBeInTheDocument();
  });

  it('hides Keep separately from viewers in the duplicate state', () => {
    const idea = makeEntry({ id: 5, title: 'Nanzen-ji' });
    renderCard({ duplicate: { idea }, canEdit: false });

    expect(screen.getByRole('button', { name: 'Show in list' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep separately' })).not.toBeInTheDocument();
  });
});
