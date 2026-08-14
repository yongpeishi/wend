import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateShiftWarningModal } from './DateShiftWarningModal';

function renderModal(props: Partial<Parameters<typeof DateShiftWarningModal>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DateShiftWarningModal
      open
      droppedDays={props.droppedDays ?? ['2026-08-23', '2026-08-25']}
      droppedItemCount={props.droppedItemCount ?? 5}
      saving={props.saving}
      onCancel={props.onCancel ?? onCancel}
      onConfirm={props.onConfirm ?? onConfirm}
    />,
  );
  return { onCancel, onConfirm };
}

describe('DateShiftWarningModal — what it says', () => {
  it('counts one day as one day, and writes its date on its own', () => {
    renderModal({ droppedDays: ['2026-08-23'], droppedItemCount: 2 });

    expect(
      screen.getByRole('heading', { name: 'Change the dates and clear 1 day?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("23 Aug falls outside the new dates, so what you've placed on it comes off."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, clear that day' })).toBeInTheDocument();
  });

  it('joins two days with "and", and no comma before it', () => {
    renderModal({ droppedDays: ['2026-08-23', '2026-08-25'], droppedItemCount: 5 });

    expect(
      screen.getByRole('heading', { name: 'Change the dates and clear 2 days?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "23 Aug and 25 Aug fall outside the new dates, so what you've placed on them comes off.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, clear those days' })).toBeInTheDocument();
  });

  it('runs three or more as a list, with only the last pair joined by the word', () => {
    renderModal({ droppedDays: ['2026-08-23', '2026-08-25', '2026-08-27'], droppedItemCount: 9 });

    expect(
      screen.getByRole('heading', { name: 'Change the dates and clear 3 days?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "23 Aug, 25 Aug and 27 Aug fall outside the new dates, so what you've placed on them comes off.",
      ),
    ).toBeInTheDocument();
  });

  // The whole reason this is a question and not a refusal: nothing is deleted.
  // The placements go, the ideas come back to the rail. The count is of what
  // comes back — never "the 5 ideas on them", which would also be claiming
  // that five is all the days hold.
  it('says where the ideas go, and that moving them out first is the alternative', () => {
    renderModal({ droppedDays: ['2026-08-23', '2026-08-25'], droppedItemCount: 5 });

    expect(
      screen.getByText(
        '5 ideas go back to "Not placed yet", so nothing is lost — you can place them on another day.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "If you'd rather keep those plans, move the ideas onto days inside the new dates first, then change the dates.",
      ),
    ).toBeInTheDocument();
  });

  // A numeral even at the head of the sentence, the way the rest of the app
  // writes small counts ("Selected 1 idea near here.", "clear 1 day?").
  it('counts one idea as one idea', () => {
    renderModal({ droppedDays: ['2026-08-23'], droppedItemCount: 1 });

    expect(
      screen.getByText(
        '1 idea goes back to "Not placed yet", so nothing is lost — you can place it on another day.',
      ),
    ).toBeInTheDocument();
  });

  // Zero arrives two ways: a day with a row but nothing on it (lodging, an
  // empty version), and a day whose every idea is also on a day that survives.
  // One sentence has to be true of both, so it talks about what comes back
  // rather than about what is on the day — "nothing is placed on them" would
  // be a lie about the second, and inventing ideas a lie about the first.
  it('says nothing comes back, which is true of an empty day and a doubled-up one alike', () => {
    renderModal({ droppedDays: ['2026-08-23', '2026-08-25'], droppedItemCount: 0 });

    expect(screen.getByText('Nothing goes back to "Not placed yet", so nothing is lost.')).toBeInTheDocument();
    // And none of the promises that only hold when something really comes back.
    expect(screen.queryByText(/you can place/)).not.toBeInTheDocument();
    expect(screen.queryByText(/If you'd rather keep/)).not.toBeInTheDocument();
  });
});

describe('DateShiftWarningModal — answering it', () => {
  it('confirms with the button that says what confirming does', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Yes, clear those days' }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('backs out without confirming anything', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: "No, don't change the dates" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('treats Escape as backing out, the way every other dialog does', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('holds the door shut while the re-send is in flight', () => {
    renderModal({ saving: true });

    expect(screen.getByRole('button', { name: 'Yes, clear those days' })).toBeDisabled();
  });

  it('draws nothing at all when there is no day to lose', () => {
    renderModal({ droppedDays: [], droppedItemCount: 0 });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
