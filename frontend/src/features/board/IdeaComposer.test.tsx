import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdeaComposer } from './IdeaComposer';
import type { IdeaComposerProps } from './IdeaComposer';
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
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

const KYOTO = makeEntry({ id: 11, title: 'Kyoto day' });
const FOOD_CRAWL = makeEntry({ id: 12, title: 'Food crawl' });
const ONSEN = makeEntry({ id: 13, title: 'Onsen trip' });
const CHOICES = [KYOTO, FOOD_CRAWL, ONSEN];

/** A two-level set: the market lives inside the Busan trip, so it has a path. */
const BUSAN = makeEntry({ id: 21, title: 'Travel to Busan' });
const MARKET = makeEntry({ id: 22, title: 'Jagalchi market', parent_ids: [21] });
const NESTED_CHOICES = [BUSAN, MARKET];

function renderComposer(overrides: Partial<IdeaComposerProps> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const props: IdeaComposerProps = {
    open: true,
    initialTitle: '',
    initialParentIds: [],
    parentChoices: CHOICES,
    onSubmit,
    onCancel,
    ...overrides,
  };
  const view = render(<IdeaComposer {...props} />);
  return {
    onSubmit,
    onCancel,
    /** Re-render with new props — same instance, for open/close/reopen flows. */
    update: (next: Partial<IdeaComposerProps>) =>
      view.rerender(<IdeaComposer {...props} {...next} onSubmit={onSubmit} onCancel={onCancel} />),
  };
}

describe('IdeaComposer — the card', () => {
  it('renders nothing while closed — a form nobody asked for is not content', () => {
    renderComposer({ open: false });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('arrives with the bar’s draft as the name, and focus on it to carry on typing', () => {
    renderComposer({ initialTitle: 'Onsen day' });

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Onsen day');
    expect(name).toHaveFocus();
  });

  it('asks for the details in plain placeholders, nothing required-looking', () => {
    renderComposer();
    expect(screen.getByPlaceholderText('Name it — even vaguely')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Short description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Address — leave empty if it isn't a place")).toBeInTheDocument();
  });

  it('starts blank and says "Add idea" when nobody seeds it — the create path unchanged', () => {
    renderComposer();

    expect(screen.getByRole('button', { name: 'Add idea' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Short description' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('');
  });

  it('shows the whole form and no reveal link when it is not trimmed', () => {
    renderComposer();

    expect(screen.getByRole('textbox', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Category' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '＋ address, category, parents' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Opened inside an idea's row, the card is several rows down the page and its
 * position no longer says what it will be filed under — so it says so in words.
 */
describe('IdeaComposer — opened inside an idea', () => {
  it('names the host it landed in', () => {
    renderComposer({ hostTitle: 'Kyoto day' });

    expect(screen.getByText('NEW IDEA INSIDE')).toBeInTheDocument();
    expect(screen.getByText('Kyoto day')).toBeInTheDocument();
  });

  it('wears no heading at all when there is no host — the top-of-list card', () => {
    renderComposer();

    expect(screen.queryByText('NEW IDEA INSIDE')).not.toBeInTheDocument();
  });
});

/**
 * Adding an idea inside another is usually the fast half of a thought: the
 * parent is already chosen by where you clicked, so only the two fields that
 * cannot be inferred are asked up front.
 */
describe('IdeaComposer — trimmed', () => {
  it('asks for the name and the description, and nothing else', () => {
    renderComposer({ trimmed: true, hostTitle: 'Kyoto day' });

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Short description' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Address' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ add parent' })).not.toBeInTheDocument();
  });

  it('unfolds the rest when the link asks for it', async () => {
    const user = userEvent.setup();
    renderComposer({ trimmed: true });

    await user.click(screen.getByRole('button', { name: '＋ address, category, parents' }));

    expect(screen.getByRole('textbox', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ add parent' })).toBeInTheDocument();
  });

  it('stays unfolded — nobody has fields taken back off them mid-thought', async () => {
    const user = userEvent.setup();
    renderComposer({ trimmed: true });

    await user.click(screen.getByRole('button', { name: '＋ address, category, parents' }));
    await user.type(screen.getByRole('textbox', { name: 'Address' }), '68 Fukakusa');

    expect(
      screen.queryByRole('button', { name: '＋ address, category, parents' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('68 Fukakusa');
  });

  it('folds again on the next opening, not on the re-render in between', async () => {
    const user = userEvent.setup();
    const view = renderComposer({ trimmed: true });

    await user.click(screen.getByRole('button', { name: '＋ address, category, parents' }));
    view.update({ open: false });
    view.update({ open: true });

    expect(screen.queryByRole('textbox', { name: 'Address' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ address, category, parents' })).toBeInTheDocument();
  });
});

/**
 * The card's second wearer: seeded with an existing idea's values and a
 * renamed button, it is the inline edit form. Same gathering, same draft.
 */
describe('IdeaComposer — worn as the edit form', () => {
  it('arrives dressed in the idea being edited — every field pre-answered', () => {
    renderComposer({
      initialTitle: 'Fushimi Inari',
      initialDescription: 'Torii gates',
      initialAddress: '68 Fukakusa',
      initialCategory: 'activity',
      initialParentIds: [11],
    });

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Fushimi Inari');
    expect(screen.getByRole('textbox', { name: 'Short description' })).toHaveValue('Torii gates');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('68 Fukakusa');
    expect(screen.getByRole('radio', { name: 'Activity' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Remove from Kyoto day' })).toBeInTheDocument();
  });

  it('wears whatever label the caller puts on the primary button', () => {
    renderComposer({ submitLabel: 'Save changes' });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add idea' })).not.toBeInTheDocument();
  });

  it('hands the seeded values back untouched when nothing was changed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({
      initialTitle: 'Fushimi Inari',
      initialDescription: 'Torii gates',
      initialAddress: '68 Fukakusa',
      initialCategory: 'activity',
      submitLabel: 'Save changes',
    });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fushimi Inari',
      description: 'Torii gates',
      address: '68 Fukakusa',
      category: 'activity',
      parentIds: [],
    });
  });
});

describe('IdeaComposer — the category row', () => {
  // Nothing lit: a pre-lit chip is an answer the writer never gave, and most
  // of what people keep is not a place.
  it('offers the six categories with none of them answered', () => {
    renderComposer();

    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(group).toBeInTheDocument();
    for (const label of ['Place', 'Food', 'Activity', 'Lodging', 'Transport', 'Other']) {
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('is one of six — picking a category unpicks the last one', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('radio', { name: 'Place' }));
    await user.click(screen.getByRole('radio', { name: 'Food' }));

    expect(screen.getByRole('radio', { name: 'Food' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Place' })).toHaveAttribute('aria-checked', 'false');
  });

  it('lights whichever chip the caller seeds', () => {
    renderComposer({ initialCategory: 'lodging' });

    expect(screen.getByRole('radio', { name: 'Lodging' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('IdeaComposer — the Inside row', () => {
  it('wears the pre-chosen parents as removable chips, named not numbered', () => {
    renderComposer({ initialParentIds: [11] });

    expect(screen.getByRole('button', { name: 'Remove from Kyoto day' })).toHaveTextContent('Kyoto day ✕');
  });

  it('takes a parent off when its chip is clicked', async () => {
    const user = userEvent.setup();
    renderComposer({ initialParentIds: [11, 12] });

    await user.click(screen.getByRole('button', { name: 'Remove from Kyoto day' }));

    expect(screen.queryByRole('button', { name: 'Remove from Kyoto day' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from Food crawl' })).toBeInTheDocument();
  });

  it('keeps the picker shut until "+ add parent" asks for it', () => {
    renderComposer();
    expect(screen.queryByRole('button', { name: 'Kyoto day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search ideas' })).not.toBeInTheDocument();
  });

  it('offers only the parents not already chosen', async () => {
    const user = userEvent.setup();
    renderComposer({ initialParentIds: [11] });

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    expect(screen.getByRole('button', { name: 'Food crawl' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Onsen trip' })).toBeInTheDocument();
    // Already chosen — only its remove chip is on the card, not a candidate.
    expect(screen.queryByRole('button', { name: 'Kyoto day' })).not.toBeInTheDocument();
  });

  it('adds the picked parent and puts the picker away — one pick per opening', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.click(screen.getByRole('button', { name: 'Food crawl' }));

    expect(screen.getByRole('button', { name: 'Remove from Food crawl' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onsen trip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search ideas' })).not.toBeInTheDocument();
  });

  it('says so plainly when there is nothing left to nest inside', async () => {
    const user = userEvent.setup();
    renderComposer({ initialParentIds: [11, 12, 13] });

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    expect(screen.getByText('Every idea it could nest in already holds it.')).toBeInTheDocument();
  });
});

/**
 * The picker is a search, not a wall of chips: past a handful of ideas a flat
 * list has no order and no way to tell two same-named ideas apart.
 */
describe('IdeaComposer — the parent picker', () => {
  /** Ten candidates, more than the picker will ever draw at once. */
  const MANY = Array.from({ length: 10 }, (_, index) =>
    makeEntry({ id: 100 + index, title: `Idea ${index + 1}` }),
  );

  it('takes the caret on opening, so the first keystroke lands in the search', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    expect(screen.getByRole('textbox', { name: 'Search ideas' })).toHaveFocus();
  });

  it('narrows to what was typed, ignoring case', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.type(screen.getByRole('textbox', { name: 'Search ideas' }), 'kYo');

    expect(screen.getByRole('button', { name: 'Kyoto day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Food crawl' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onsen trip' })).not.toBeInTheDocument();
  });

  it('draws at most eight matches — the search field reaches the rest', async () => {
    const user = userEvent.setup();
    renderComposer({ parentChoices: MANY });

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    expect(screen.getAllByRole('button', { name: /^Idea \d+$/ })).toHaveLength(8);

    await user.type(screen.getByRole('textbox', { name: 'Search ideas' }), 'Idea 10');

    expect(screen.getAllByRole('button', { name: /^Idea \d+$/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Idea 10' })).toBeInTheDocument();
  });

  it('says nothing matched in one sentence, not an empty box', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.type(screen.getByRole('textbox', { name: 'Search ideas' }), 'zzz');

    expect(screen.getByText('Nothing by that name yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kyoto day' })).not.toBeInTheDocument();
  });

  it('keeps the chip and drops the query when a result is picked', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.type(screen.getByRole('textbox', { name: 'Search ideas' }), 'onsen');
    await user.click(screen.getByRole('button', { name: 'Onsen trip' }));

    expect(screen.getByRole('button', { name: 'Remove from Onsen trip' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search ideas' })).not.toBeInTheDocument();

    // Reopened, it is a fresh search rather than the last one still narrowed.
    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    expect(screen.getByRole('textbox', { name: 'Search ideas' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Kyoto day' })).toBeInTheDocument();
  });

  // The line that tells two same-named ideas apart.
  it('writes where a nested candidate lives underneath its name', async () => {
    const user = userEvent.setup();
    renderComposer({ parentChoices: NESTED_CHOICES });

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    const row = screen.getByRole('button', { name: /Jagalchi market/ });
    expect(row).toHaveTextContent('Jagalchi market');
    expect(row).toHaveTextContent('Travel to Busan ›');
    // A root idea has nowhere to be placed and gets no line saying so.
    expect(screen.getByRole('button', { name: 'Travel to Busan' })).toHaveTextContent(
      /^Travel to Busan$/,
    );
  });

  it('reads the path off `allIdeas`, which may hold ideas that are not offerable', async () => {
    const user = userEvent.setup();
    renderComposer({ parentChoices: [MARKET], allIdeas: NESTED_CHOICES });

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    expect(screen.getByRole('button', { name: /Jagalchi market/ })).toHaveTextContent(
      'Travel to Busan ›',
    );
  });
});

describe('IdeaComposer — submit and cancel', () => {
  it('hands the whole draft over, trimmed, in the shape the board expects', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ initialParentIds: [11] });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Fushimi Inari  ');
    await user.type(screen.getByRole('textbox', { name: 'Short description' }), ' Torii gates ');
    await user.type(screen.getByRole('textbox', { name: 'Address' }), ' 68 Fukakusa ');
    await user.click(screen.getByRole('radio', { name: 'Activity' }));
    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.click(screen.getByRole('button', { name: 'Food crawl' }));
    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fushimi Inari',
      description: 'Torii gates',
      address: '68 Fukakusa',
      category: 'activity',
      parentIds: [11, 12],
    });
  });

  // An untouched category travels as null, not as a guess: nothing downstream
  // needs one, and inventing "place" would put words in the writer's mouth.
  it('answers nothing it was not told — a null category and only the given parents', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ initialTitle: 'Onsen day' });

    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Onsen day',
      description: '',
      address: '',
      category: null,
      parentIds: [],
    });
  });

  it('submits from a trimmed card without ever unfolding it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ trimmed: true, hostTitle: 'Kyoto day', initialParentIds: [11] });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Nishiki market');
    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Nishiki market',
      description: '',
      address: '',
      category: null,
      parentIds: [11],
    });
  });

  it('refuses a blank title outright — there is nothing to keep', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ initialTitle: '' });

    await user.click(screen.getByRole('button', { name: 'Add idea' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Deleting the prefill and hitting "Add idea" reads as "keep what I tabbed
  // in", not "keep nothing" — the seed survives an emptied field.
  it('falls back to the seeded title when the name field was emptied', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ initialTitle: 'Onsen day' });

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Onsen day' }));
  });

  it('cancels without submitting anything', async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = renderComposer();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/**
 * The composer stays mounted across opens the way NewIdeaModal does, so a
 * fresh Tab must not resurrect the half-draft someone cancelled — the reset
 * rides on `open` flipping true, seeded from whatever the bar sends this time.
 */
describe('IdeaComposer — a fresh form every open', () => {
  it('forgets a cancelled draft and takes the new seed', async () => {
    const user = userEvent.setup();
    const view = renderComposer({ initialTitle: 'Onsen day', initialParentIds: [11] });

    await user.type(screen.getByRole('textbox', { name: 'Short description' }), 'Half a thought');
    await user.click(screen.getByRole('radio', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: 'Remove from Kyoto day' }));

    view.update({ open: false });
    view.update({ open: true, initialTitle: 'Nishiki market', initialParentIds: [12] });

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Nishiki market');
    expect(screen.getByRole('textbox', { name: 'Short description' })).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Food' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Remove from Food crawl' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from Kyoto day' })).not.toBeInTheDocument();
  });

  it('keeps a live draft alone while it stays open', async () => {
    const user = userEvent.setup();
    const view = renderComposer({ initialTitle: 'Onsen day' });

    await user.type(screen.getByRole('textbox', { name: 'Short description' }), 'Mid-thought');
    // The board re-renders for its own reasons; the composer must not re-seed.
    view.update({ initialTitle: 'Something else' });

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Onsen day');
    expect(screen.getByRole('textbox', { name: 'Short description' })).toHaveValue('Mid-thought');
  });
});
