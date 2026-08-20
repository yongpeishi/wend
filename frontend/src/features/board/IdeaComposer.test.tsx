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
});

describe('IdeaComposer — the category row', () => {
  it('offers the six categories with place already answered', () => {
    renderComposer();

    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(group).toBeInTheDocument();
    for (const label of ['Place', 'Food', 'Activity', 'Lodging', 'Transport', 'Other']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'Place' })).toHaveAttribute('aria-checked', 'true');
  });

  it('is one of six — picking a category unpicks the last one', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('radio', { name: 'Food' }));

    expect(screen.getByRole('radio', { name: 'Food' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Place' })).toHaveAttribute('aria-checked', 'false');
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

  it('keeps the choice cloud shut until "+ add parent" asks for it', () => {
    renderComposer();
    expect(screen.queryByRole('button', { name: 'Kyoto day' })).not.toBeInTheDocument();
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

  it('adds the picked parent and puts the cloud away — one pick per opening', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.click(screen.getByRole('button', { name: 'Food crawl' }));

    expect(screen.getByRole('button', { name: 'Remove from Food crawl' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onsen trip' })).not.toBeInTheDocument();
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

  it('defaults the easy answers — place, and only the parents it was given', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ initialTitle: 'Onsen day' });

    await user.click(screen.getByRole('button', { name: 'Add idea' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Onsen day',
      description: '',
      address: '',
      category: 'place',
      parentIds: [],
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
    expect(screen.getByRole('radio', { name: 'Place' })).toHaveAttribute('aria-checked', 'true');
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
