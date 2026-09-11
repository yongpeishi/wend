import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetAsideSection } from './SetAsideSection';
import buttonStyles from '../../design/components/core/Button.module.css';
import styles from './SetAsideSection.module.css';
import type { Entry } from '../../api/types';

function entry(id: number, title: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    kind: 'idea',
    title,
    description: null,
    category: 'food',
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
    // Everything this section is ever handed has already been set aside — that
    // is what puts it in the list.
    archived_at: '2026-02-02T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

/** Yours to delete: you wrote it, and you can edit the trip it is in. */
const MINE = entry(1, 'Ramen Ichiran', { my_role: 'member', created_by_me: true });
/** Somebody else's, on a trip you are only a member of. */
const THEIRS = entry(2, 'Kaiseki counter', { my_role: 'member', created_by_me: false });

function renderSection(overrides: Partial<Parameters<typeof SetAsideSection>[0]> = {}) {
  const onRestore = vi.fn();
  render(<SetAsideSection entries={[MINE]} onRestore={onRestore} {...overrides} />);
  return { onRestore };
}

/** The disclosure starts closed everywhere, so every assertion is behind this. */
async function open(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(screen.getByRole('button', { name }));
}

describe('SetAsideSection', () => {
  it('discloses what was set aside, with the count in the label', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderSection({ entries: [MINE, THEIRS] });

    await open(user, 'Set aside · 2');
    expect(screen.getByText('Ramen Ichiran')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Pick it back up' })[0]);
    expect(onRestore).toHaveBeenCalledWith(MINE.id);
  });

  // What a trip set aside is part of reading the trip, so a viewer keeps the
  // list and the titles in it. Only the buttons go.
  it('keeps the list for a viewer and takes away both verbs', async () => {
    const user = userEvent.setup();
    renderSection({ canEdit: false, onDeleteForGood: vi.fn() });

    await open(user, 'Set aside · 1');
    expect(screen.getByText('Ramen Ichiran')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick it back up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
  });

  // The empty state used to be no state at all: the section returned null, so
  // the one road to getting rid of something was invisible to the only person
  // who needed to find it.
  describe('with nothing set aside', () => {
    it('still shows the disclosure, and drops the count from the label', () => {
      renderSection({ entries: [] });

      const toggle = screen.getByRole('button', { name: 'Set aside' });
      expect(toggle).toBeInTheDocument();
      // Collapsed: it says the place exists without spending room on it.
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(/^Set aside · /)).not.toBeInTheDocument();
    });

    it('promises the delete verb only where the delete verb is offered', async () => {
      const user = userEvent.setup();
      renderSection({ entries: [], onDeleteForGood: vi.fn() });

      await open(user, 'Set aside');
      expect(
        screen.getByText(
          'Nothing set aside. Things you set aside land here, and you can delete them for good from here.',
        ),
      ).toBeInTheDocument();
    });

    it('stops at where things land when there is no delete verb', async () => {
      const user = userEvent.setup();
      renderSection({ entries: [] });

      await open(user, 'Set aside');
      expect(
        screen.getByText('Nothing set aside. Things you set aside land here.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/delete them for good/)).not.toBeInTheDocument();
    });
  });

  describe('the delete verb', () => {
    it('sits beside the way back and hands the whole entry over', async () => {
      const user = userEvent.setup();
      const onDeleteForGood = vi.fn();
      renderSection({ onDeleteForGood });

      await open(user, 'Set aside · 1');
      await user.click(screen.getByRole('button', { name: 'Delete for good' }));
      expect(onDeleteForGood).toHaveBeenCalledWith(MINE);
    });

    /**
     * The stronger verb has to be the quieter one. These two used to be the
     * same button: both `quiet`, so the same leaf ink at the same bold weight
     * and the same rendered size — the only difference was a small-vs-medium
     * class that changes nothing you can see, which is not a difference at all.
     * The way back is bordered now, and the destroy carries this section's own
     * muted-text hook, which is the pairing the trips list and the entry detail
     * already make.
     */
    it('is drawn quieter than the way back, not identically to it', async () => {
      const user = userEvent.setup();
      renderSection({ onDeleteForGood: vi.fn() });

      await open(user, 'Set aside · 1');
      const restore = screen.getByRole('button', { name: 'Pick it back up' });
      const destroy = screen.getByRole('button', { name: 'Delete for good' });

      expect(restore).toHaveClass(buttonStyles.secondary);
      expect(restore).not.toHaveClass(styles.deleteForGood);

      expect(destroy).toHaveClass(styles.deleteForGood);
      expect(destroy).not.toHaveClass(buttonStyles.secondary);
    });

    // Absent means absent: a surface that does not hand the section this
    // callback behaves exactly as it did before the verb existed.
    it('is not there at all without the callback', async () => {
      const user = userEvent.setup();
      renderSection();

      await open(user, 'Set aside · 1');
      expect(screen.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
    });

    // canEdit is about the trip; canDeleteForGood is about the thing. A member
    // may set aside what somebody else wrote, and may put it back, but ending
    // it is not theirs to do.
    it('is offered per row, not per screen', async () => {
      const user = userEvent.setup();
      renderSection({ entries: [MINE, THEIRS], onDeleteForGood: vi.fn() });

      await open(user, 'Set aside · 2');
      expect(screen.getAllByRole('button', { name: 'Pick it back up' })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: 'Delete for good' })).toHaveLength(1);
    });
  });
});
