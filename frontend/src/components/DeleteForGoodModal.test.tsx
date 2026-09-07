import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteForGoodModal } from './DeleteForGoodModal';
import type { DeleteForGoodPreview } from '../api/entries';

/** All zeroes by default, so each test names only the count it is about. */
function preview(overrides: Partial<DeleteForGoodPreview> = {}): DeleteForGoodPreview {
  return {
    title: 'Ramen Ichiran',
    kind: 'idea',
    votesCount: 0,
    todosCount: 0,
    tripTitles: [],
    descendantsDestroyedCount: 0,
    descendantsSurvivingCount: 0,
    descendantsLeftBehindCount: 0,
    ...overrides,
  };
}

function renderModal(
  overrides: Partial<DeleteForGoodPreview> = {},
  props: { currentTripTitle?: string | null; deleting?: boolean } = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DeleteForGoodModal
      open
      preview={preview(overrides)}
      currentTripTitle={props.currentTripTitle}
      deleting={props.deleting}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onCancel, onConfirm };
}

const line = (text: string) => expect(screen.getByText(text)).toBeInTheDocument();

describe('DeleteForGoodModal — what it says', () => {
  // The design's own example, whole: an idea in two trips, viewed from one of
  // them.
  it('states the idea case exactly', () => {
    renderModal(
      {
        votesCount: 3,
        todosCount: 2,
        tripTitles: ['Japan, spring', 'Malaysia 2027'],
      },
      { currentTripTitle: 'Japan, spring' },
    );

    expect(screen.getByRole('heading', { name: 'Delete "Ramen Ichiran" for good?' })).toBeInTheDocument();
    line("This one can't be undone — unlike setting aside, there is no way back.");
    line('3 votes and 2 to-dos on it go too.');
    line('It\'s also in "Malaysia 2027", and it goes from there as well.');
    expect(screen.getByRole('button', { name: 'No, keep it set aside' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete it for good' })).toBeInTheDocument();
  });

  // The design's trip example, whole. It carries the same contrast as the idea
  // case, in the verb its own surface uses: the trips list says "Saved for
  // later" where a board says "Set aside".
  it('states the trip case exactly', () => {
    renderModal({
      title: 'Japan, spring',
      kind: 'trip',
      descendantsDestroyedCount: 14,
      descendantsSurvivingCount: 6,
    });

    expect(screen.getByRole('heading', { name: 'Delete "Japan, spring" for good?' })).toBeInTheDocument();
    line("This one can't be undone — unlike saving for later, there is no way back.");
    line('14 things live only in this trip and go with it.');
    line('6 more are also in other trips and stay where they are.');
    expect(screen.getByRole('button', { name: 'No, keep it saved for later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete the trip and 14 things' })).toBeInTheDocument();
  });
});

// The wire carries one total per bucket and no breakdown by kind, and a real
// subtree mixes ideas with plans — the seeded Japan trip destroys 12 ideas and
// 4 bundles, which the product calls plans. "16 ideas" would be false in the
// one sentence read before an irreversible act, so every descendant line says
// "things", on both branches. Ideas can contain plans too, so the non-trip
// branch needs it just as much.
describe('DeleteForGoodModal — a subtree of more than one kind', () => {
  it('calls a trip\'s mixed descendants things, not ideas', () => {
    renderModal({ title: 'Japan, spring', kind: 'trip', descendantsDestroyedCount: 16 });

    line('16 things live only in this trip and go with it.');
    expect(screen.queryByText(/ideas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete the trip and 16 things' })).toBeInTheDocument();
  });

  it('calls an idea\'s mixed descendants things too', () => {
    renderModal({
      descendantsDestroyedCount: 5,
      descendantsSurvivingCount: 2,
      descendantsLeftBehindCount: 3,
    });

    line('5 things inside it live nowhere else and go with it.');
    line('2 more are also in other trips and stay where they are.');
    line('3 things inside were added by someone else and stay in your library.');
    expect(screen.queryByText(/ideas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete it and 5 things' })).toBeInTheDocument();
  });
});

describe('DeleteForGoodModal — the counts', () => {
  // A dialog standing in front of a destroy has to be readable at a glance, so
  // a count of zero produces no line at all rather than "0 votes go too".
  it('says nothing at all about a count of zero', () => {
    renderModal();

    line("This one can't be undone — unlike setting aside, there is no way back.");
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/go too/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stay where/)).not.toBeInTheDocument();
    expect(screen.queryByText(/your library/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete it for good' })).toBeInTheDocument();
  });

  it('writes one of each out in the singular, verb and all', () => {
    renderModal({
      votesCount: 1,
      descendantsDestroyedCount: 1,
      descendantsSurvivingCount: 1,
      descendantsLeftBehindCount: 1,
    });

    line('1 vote on it goes too.');
    line('1 thing inside it lives nowhere else and goes with it.');
    line('1 more is also in another trip and stays where it is.');
    line('1 thing inside was added by someone else and stays in your library.');
    expect(screen.getByRole('button', { name: 'Yes, delete it and 1 thing' })).toBeInTheDocument();
  });

  // The verb agrees with the two counts together, not with either alone.
  it('counts one vote and one to-do as two things', () => {
    renderModal({ votesCount: 1, todosCount: 1 });

    line('1 vote and 1 to-do on it go too.');
  });

  it('drops the half of the votes line that is zero', () => {
    renderModal({ votesCount: 0, todosCount: 4 });

    line('4 to-dos on it go too.');
  });

  // The counts are of everything that goes, target and descendants together,
  // so a trip cannot say they are "on it".
  it('puts a trip\'s votes in it rather than on it', () => {
    renderModal({ kind: 'trip', title: 'Japan, spring', votesCount: 3, todosCount: 2 });

    line('3 votes and 2 to-dos in it go too.');
  });

  // "6 more" only counts on from a line that named some. With nothing
  // destroyed there is nothing for these to be more than.
  it('names the survivors outright when nothing is destroyed alongside them', () => {
    renderModal({ descendantsSurvivingCount: 6 });

    line('6 things inside it are also in other trips and stay where they are.');
    expect(screen.queryByText(/more are/)).not.toBeInTheDocument();
  });

  it('promises the left-behind ones a landing place', () => {
    renderModal({ descendantsDestroyedCount: 3, descendantsLeftBehindCount: 2 });

    line('3 things inside it live nowhere else and go with it.');
    line('2 things inside were added by someone else and stay in your library.');
  });

  it('names the descendants on a trip\'s confirm button too, in the singular', () => {
    renderModal({ kind: 'trip', title: 'Japan, spring', descendantsDestroyedCount: 1 });

    line('1 thing lives only in this trip and goes with it.');
    expect(screen.getByRole('button', { name: 'Yes, delete the trip and 1 thing' })).toBeInTheDocument();
  });

  it('drops the count from the confirm button when there is nothing inside', () => {
    renderModal({ kind: 'trip', title: 'Japan, spring' });

    expect(screen.getByRole('button', { name: 'Yes, delete the trip for good' })).toBeInTheDocument();
  });
});

describe('DeleteForGoodModal — the other trips', () => {
  // The server sends every trip the entry hangs under, because it has no idea
  // which board the request came from. Naming the one you are standing on back
  // to you is the mistake this filter exists to prevent.
  it('says nothing when the only trip is the one you are on', () => {
    renderModal({ tripTitles: ['Japan, spring'] }, { currentTripTitle: 'Japan, spring' });

    expect(screen.queryByText(/It's also in/)).not.toBeInTheDocument();
  });

  it('names every trip when you are on none of them — the library case', () => {
    renderModal({ tripTitles: ['Japan, spring', 'Malaysia 2027'] }, { currentTripTitle: null });

    line('It\'s also in "Japan, spring" and "Malaysia 2027", and it goes from all of them as well.');
  });

  // The same join as DateShiftWarningModal: no comma before the "and". Titles
  // are quoted because a trip called "spring, maybe" would otherwise read as
  // two trips.
  it('runs three or more as a list, with only the last pair joined by the word', () => {
    renderModal({ tripTitles: ['Malaysia 2027', 'Bali', 'Hanoi'] });

    line('It\'s also in "Malaysia 2027", "Bali" and "Hanoi", and it goes from all of them as well.');
  });
});

describe('DeleteForGoodModal — answering it', () => {
  it('confirms with the button that names the outcome', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Yes, delete it for good' }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('backs out to the place the thing stays', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: 'No, keep it set aside' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('stops a second press while the destroy is in flight', () => {
    renderModal({}, { deleting: true });

    expect(screen.getByRole('button', { name: 'Yes, delete it for good' })).toBeDisabled();
  });

  // The counts arrive with the refusal, so this is the state between asking
  // and being told. There is nothing honest to say yet.
  it('renders nothing before the counts have come back', () => {
    render(<DeleteForGoodModal open preview={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
