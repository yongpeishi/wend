import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../api';
import type { Entry } from '../../api/types';
import type { EntryGroup } from '../board/filters';
import { MapIdeaList } from './MapIdeaList';
import type { MapIdeaListProps } from './MapIdeaList';

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

const COLOSSEUM = makeEntry({ id: 1, title: 'Colosseum', lat: 41.9, lng: 12.5 });
const TRATTORIA = makeEntry({ id: 2, title: 'Trattoria da Enzo', lat: 41.88, lng: 12.47 });

function ungrouped(entries: Entry[]): EntryGroup[] {
  return entries.length > 0 ? [{ key: 'all', label: '', entries }] : [];
}

/**
 * An open row shows IdeaPanel, which votes and fetches to-dos, and its verbs
 * archive and link — so the list needs a query client and a toaster around it
 * the moment anything unfolds. Wrapped for every test rather than only the
 * expanding ones: the harness should not have two shapes.
 */
function renderList(overrides: Partial<MapIdeaListProps> = {}) {
  const props: MapIdeaListProps = {
    groups: ungrouped([COLOSSEUM, TRATTORIA]),
    metaLines: new Map(),
    selectedIds: [],
    onToggleSelect: () => {},
    onRowNameClick: () => {},
    onZoomGroup: () => {},
    justAddedId: null,
    placeless: [],
    onPutOnMap: () => {},
    canEdit: true,
    ...overrides,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MapIdeaList {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The row's disclosure — the title button, which is also the map's centring. */
function rowToggle(title: string) {
  return screen.getByRole('button', { name: title });
}

/** The panel a row's toggle points at, or null while the row is closed. */
function panelFor(title: string) {
  const id = rowToggle(title).getAttribute('aria-controls');
  return id === null ? null : document.getElementById(id);
}

/** The plum category-and-tally pill, found by the scale it spells out. */
function tallyPills() {
  return screen.queryAllByTitle("Everyone's votes added up, from +2 to -2 each");
}

describe('MapIdeaList — rows', () => {
  it('renders a row per entry, the name as a button that centres the map', async () => {
    const user = userEvent.setup();
    const onRowNameClick = vi.fn();
    renderList({ onRowNameClick });

    await user.click(screen.getByRole('button', { name: 'Colosseum' }));

    expect(onRowNameClick).toHaveBeenCalledWith(1);
  });

  it('gives each row a checkbox named after the idea, and reports toggles', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderList({ onToggleSelect });

    await user.click(screen.getByRole('checkbox', { name: 'Trattoria da Enzo' }));

    expect(onToggleSelect).toHaveBeenCalledWith(2);
  });

  it('checks exactly the selected rows', () => {
    renderList({ selectedIds: [2] });
    expect(screen.getByRole('checkbox', { name: 'Colosseum' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: 'Trattoria da Enzo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('offers a viewer no checkboxes at all — the names still work', () => {
    renderList({ canEdit: false });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Colosseum' })).toBeInTheDocument();
  });

  it('shows the meta line under a row only when it says something', () => {
    renderList({
      metaLines: new Map([
        [1, 'Piazza del Colosseo · in Rome'],
        [2, ''],
      ]),
    });
    expect(screen.getByText('Piazza del Colosseo · in Rome')).toBeInTheDocument();
    // The empty string draws no element — no blank line under the second row.
    const rows = document.querySelectorAll('p');
    expect(Array.from(rows).filter((p) => p.textContent === '')).toHaveLength(0);
  });

  it('marks a scheduled idea with the "on a day" tick, and carries category and tally in the board\'s pill', () => {
    renderList({
      groups: ungrouped([
        makeEntry({ id: 1, title: 'Colosseum', scheduled: true }),
        makeEntry({
          id: 2,
          title: 'Trattoria',
          category: 'food',
          vote_tally: { total: 3, count: 2, average: 1.5 },
        }),
      ]),
    });
    expect(screen.getByText('✓ on a day')).toBeInTheDocument();
    // The thumb between them is aria-hidden SVG, so the pill's words are the
    // category and the number, side by side — VotePill, exactly as IdeaRow.
    expect(tallyPills()).toHaveLength(1);
    expect(tallyPills()[0]).toHaveTextContent('Food·3');
  });

  it('draws no scoreboard on an idea nobody has judged — the category stands alone', () => {
    renderList({ groups: ungrouped([makeEntry({ id: 1, title: 'Colosseum', category: 'place' })]) });
    expect(tallyPills()[0]).toHaveTextContent(/^Place$/);
  });

  it('draws neither pill when there is nothing to say', () => {
    renderList();
    expect(screen.queryByText('✓ on a day')).not.toBeInTheDocument();
    // No category and no votes: VotePill returns null rather than an empty box.
    expect(tallyPills()).toHaveLength(0);
  });

  it('labels only the just-added row', () => {
    renderList({ justAddedId: 2 });
    const labels = screen.getAllByText('just added');
    expect(labels).toHaveLength(1);
    expect(document.querySelector('[data-just-added]')).toHaveTextContent('Trattoria da Enzo');
  });

  it('renders nothing for the groups part when there are no groups', () => {
    renderList({ groups: [] });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

/**
 * A click on a row's name now does two things at once — unfolds the row and
 * centres the map — and the second one only on the way open. These pin down
 * both halves, and the fact that any number of rows can be open together.
 */
describe('MapIdeaList — unfolding a row', () => {
  const FULL = makeEntry({
    id: 1,
    title: 'Colosseum',
    lat: 41.9,
    lng: 12.5,
    description: 'Go early, before the queue',
    address: 'Piazza del Colosseo 1',
  });

  it('opens the panel on the idea itself — words, address, ballot and to-dos', async () => {
    const user = userEvent.setup();
    renderList({ groups: ungrouped([FULL, TRATTORIA]) });

    expect(screen.queryByText('Go early, before the queue')).not.toBeInTheDocument();

    await user.click(rowToggle('Colosseum'));

    expect(screen.getByText('Go early, before the queue')).toBeInTheDocument();
    expect(screen.getByText('Piazza del Colosseo 1')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How keen are you on Colosseum?' })).toBeInTheDocument();
    expect(screen.getByText('To-do')).toBeInTheDocument();
  });

  it('centres the map as it opens, and leaves it alone as it closes', async () => {
    const user = userEvent.setup();
    const onRowNameClick = vi.fn();
    renderList({ groups: ungrouped([FULL, TRATTORIA]), onRowNameClick });

    await user.click(rowToggle('Colosseum'));
    expect(onRowNameClick).toHaveBeenCalledWith(1);
    expect(onRowNameClick).toHaveBeenCalledTimes(1);

    // Folding a panel away is no reason to fly the map anywhere.
    await user.click(rowToggle('Colosseum'));
    expect(screen.queryByText('Go early, before the queue')).not.toBeInTheDocument();
    expect(onRowNameClick).toHaveBeenCalledTimes(1);
  });

  it('lets two ideas be read side by side', async () => {
    const user = userEvent.setup();
    renderList({ groups: ungrouped([FULL, TRATTORIA]) });

    await user.click(rowToggle('Colosseum'));
    await user.click(rowToggle('Trattoria da Enzo'));

    expect(rowToggle('Colosseum')).toHaveAttribute('aria-expanded', 'true');
    expect(rowToggle('Trattoria da Enzo')).toHaveAttribute('aria-expanded', 'true');
  });

  it('wires the disclosure to the panel it opens', async () => {
    const user = userEvent.setup();
    renderList({ groups: ungrouped([FULL]) });

    const toggle = rowToggle('Colosseum');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(panelFor('Colosseum')).toBeNull();

    await user.click(toggle);

    expect(rowToggle('Colosseum')).toHaveAttribute('aria-expanded', 'true');
    expect(panelFor('Colosseum')).toHaveTextContent('Go early, before the queue');
  });

  it('picks a row without unfolding it — the circle and the name mean different things', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onRowNameClick = vi.fn();
    renderList({ groups: ungrouped([FULL]), onToggleSelect, onRowNameClick });

    await user.click(screen.getByRole('checkbox', { name: 'Colosseum' }));

    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onRowNameClick).not.toHaveBeenCalled();
    expect(rowToggle('Colosseum')).toHaveAttribute('aria-expanded', 'false');
  });
});

/**
 * The map's vocabulary for an open idea is two verbs and no more: Edit and
 * "Add an idea inside" are the board's, and out of scope here.
 */
describe('MapIdeaList — the open row\'s verbs', () => {
  const PLAN = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south' });

  async function openRow(overrides: Partial<MapIdeaListProps> = {}) {
    const user = userEvent.setup();
    renderList({ groups: ungrouped([COLOSSEUM]), ...overrides });
    await user.click(rowToggle('Colosseum'));
    return user;
  }

  it('keeps every verb off the closed row', () => {
    renderList();
    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });

  it('offers an editor Add to plan and Move to Set aside, and nothing the board owns', async () => {
    await openRow({ bundles: [PLAN] });

    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add an idea inside' })).not.toBeInTheDocument();
  });

  it('gives a viewer the plan names as tags instead of verbs', async () => {
    await openRow({
      canEdit: false,
      bundles: [PLAN],
      members: new Map([[90, [COLOSSEUM]]]),
    });

    expect(screen.getByText('Tuesday south')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });

  it('keeps the chips behind the button until they are asked for', async () => {
    await openRow({ bundles: [PLAN] });
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
  });

  it('adds the idea to a plan it is not in yet, and says so', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const onToast = vi.fn();
    const user = await openRow({ bundles: [PLAN], members: new Map([[90, []]]), onToast });

    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    await waitFor(() => expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 1 }));
    expect(onToast).toHaveBeenCalledWith('Added to Tuesday south.');
    post.mockRestore();
  });

  it('takes it out again, and says it is still kept', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ ok: true });
    const onToast = vi.fn();
    const user = await openRow({ bundles: [PLAN], members: new Map([[90, [COLOSSEUM]]]), onToast });

    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/90/links/1'));
    expect(onToast).toHaveBeenCalledWith('Removed from Tuesday south. Still kept.');
    del.mockRestore();
  });

  it('says plainly when there is no plan to add to yet', async () => {
    const user = await openRow({ bundles: [] });
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));

    expect(screen.getByText('No plans yet. Start one in the plans column.')).toBeInTheDocument();
  });

  it('sets an idea aside rather than destroying it, and says so', async () => {
    const del = vi
      .spyOn(api, 'delete')
      .mockResolvedValue({ entry: makeEntry({ id: 1, archived_at: 'now' }) });
    const user = await openRow();

    await user.click(screen.getByRole('button', { name: 'Move to Set aside' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/1'));
    expect(await screen.findByText('Set aside.')).toBeInTheDocument();
    del.mockRestore();
  });

  // A closed row cannot keep a popover: the panel is not rendered while the row
  // is shut, so reopening it must never bring the chips back with it.
  it('drops the popover when the row folds away', async () => {
    const user = await openRow({ bundles: [PLAN] });
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(screen.getByRole('button', { name: 'Tuesday south' })).toBeInTheDocument();

    await user.click(rowToggle('Colosseum'));
    await user.click(rowToggle('Colosseum'));

    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
  });
});

describe('MapIdeaList — group headers', () => {
  const GROUPED: EntryGroup[] = [
    { key: 'place', label: 'Place', entries: [COLOSSEUM] },
    { key: 'food', label: 'Food', entries: [TRATTORIA] },
  ];

  it('heads each group with its label, count and a zoom action', async () => {
    const user = userEvent.setup();
    const onZoomGroup = vi.fn();
    renderList({ groups: GROUPED, onZoomGroup });

    expect(screen.getByText('Place')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zoom to Food' }));

    expect(onZoomGroup).toHaveBeenCalledWith('food');
  });

  it('shows how many ideas each group holds', () => {
    renderList({
      groups: [{ key: 'place', label: 'Place', entries: [COLOSSEUM, TRATTORIA] }],
    });
    const header = screen.getByText('Place').parentElement as HTMLElement;
    expect(within(header).getByText('2')).toBeInTheDocument();
  });

  it('draws no header at all for the single ungrouped section', () => {
    renderList();
    expect(screen.queryByRole('button', { name: /^Zoom to/ })).not.toBeInTheDocument();
  });
});

describe('MapIdeaList — the place-less footer', () => {
  const NO_PLACE = [
    makeEntry({ id: 10, title: 'Something local' }),
    makeEntry({ id: 11, title: 'That bakery' }),
  ];

  it('is absent while every idea has a place', () => {
    renderList();
    expect(screen.queryByText(/no place yet/)).not.toBeInTheDocument();
  });

  it('counts the place-less, in the singular when there is one', () => {
    renderList({ placeless: [NO_PLACE[0]] });
    expect(screen.getByText('1 idea has no place yet')).toBeInTheDocument();
  });

  it('counts the rest in the plural, and says why they are not on the map', () => {
    renderList({ placeless: NO_PLACE });
    expect(screen.getByText('2 ideas have no place yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Not hidden — they are on your board, they just cannot be drawn here. Give one a place and it joins the map.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the ideas folded until asked, then folds them back', async () => {
    const user = userEvent.setup();
    renderList({ placeless: NO_PLACE });

    expect(screen.queryByText('That bakery')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show them ›' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(screen.getByText('That bakery')).toBeInTheDocument();
    expect(screen.getByText('Something local')).toBeInTheDocument();

    const hide = screen.getByRole('button', { name: 'Hide them' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);

    expect(screen.queryByText('That bakery')).not.toBeInTheDocument();
  });

  it('offers "Put it on the map" per idea, reporting which one', async () => {
    const user = userEvent.setup();
    const onPutOnMap = vi.fn();
    renderList({ placeless: NO_PLACE, onPutOnMap });

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    const bakeryRow = screen.getByText('That bakery').parentElement as HTMLElement;
    await user.click(within(bakeryRow).getByRole('button', { name: 'Put it on the map' }));

    expect(onPutOnMap).toHaveBeenCalledWith(11);
  });

  it('lets a viewer see the list but not start placing', async () => {
    const user = userEvent.setup();
    renderList({ placeless: NO_PLACE, canEdit: false });

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));

    expect(screen.getByText('That bakery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put it on the map' })).not.toBeInTheDocument();
  });
});
