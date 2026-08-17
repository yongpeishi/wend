import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatesGate } from './DatesGate';

function renderGate(props: Partial<Parameters<typeof DatesGate>[0]> = {}) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  render(
    <DatesGate
      tripTitle="Kyoto with mum"
      keptCount={41}
      onConfirm={onConfirm}
      onBack={onBack}
      {...props}
    />,
  );
  return { onConfirm, onBack };
}

/** Date inputs are typed into by the browser's own control, not by keystrokes. */
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('DatesGate — what it asks for', () => {
  it('asks the question plainly, and says rough is fine without promising more than that', () => {
    renderGate();

    // Level 2: the trip's title in TripLayout is the page's only <h1>, and the
    // eyebrow above the question is a plain paragraph, not a heading of its own.
    expect(screen.getByRole('heading', { level: 2, name: 'When are you going?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    // Changing the dates now carries the plan along — every day and everything
    // on it shifts by the same delta. The copy says that, and no more: a
    // shorter trip can still lose the days off its end, which is the warning
    // modal's job to say rather than this line's.
    expect(
      screen.getByText(
        'Days come from your dates. Rough is fine — you can change them later, and your plan moves with them, so Day 2 stays Day 2.',
      ),
    ).toBeInTheDocument();
  });

  it('says what is already kept, and for which trip', () => {
    renderGate();

    expect(screen.getByText(/You've kept 41 things for Kyoto with mum/)).toBeInTheDocument();
  });

  it('counts one kept thing as one thing', () => {
    renderGate({ keptCount: 1 });

    expect(screen.getByText(/You've kept 1 thing for/)).toBeInTheDocument();
  });

  it('opens the days anyway when nothing is kept yet', () => {
    renderGate({ keptCount: 0 });

    expect(screen.getByText(/Nothing is kept for Kyoto with mum yet/)).toBeInTheDocument();
  });
});

describe('DatesGate — setting the dates', () => {
  it('will not open the days until both ends are known', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGate();
    const open = screen.getByRole('button', { name: 'Open the days' });

    expect(open).toBeDisabled();

    setDate('First day', '2026-10-12');
    expect(open).toBeDisabled();

    setDate('Last day', '2026-10-17');
    expect(open).toBeEnabled();

    await user.click(open);
    expect(onConfirm).toHaveBeenCalledWith('2026-10-12', '2026-10-17');
  });

  it('refuses a last day that comes before the first, and says so', () => {
    renderGate();

    setDate('First day', '2026-10-17');
    setDate('Last day', '2026-10-12');

    expect(screen.getByRole('alert')).toHaveTextContent('The last day comes before the first.');
    expect(screen.getByRole('button', { name: 'Open the days' })).toBeDisabled();
  });

  it('sets the last day from a length, counting the first day as day one', async () => {
    const user = userEvent.setup();
    renderGate({ initialStart: '2026-10-12' });

    await user.click(screen.getByRole('button', { name: '3 days' }));

    expect(screen.getByLabelText('Last day')).toHaveValue('2026-10-14');
  });

  it('counts a week as seven days, not eight', async () => {
    const user = userEvent.setup();
    renderGate({ initialStart: '2026-10-12' });

    await user.click(screen.getByRole('button', { name: 'A week' }));

    expect(screen.getByLabelText('Last day')).toHaveValue('2026-10-18');
  });

  it('fills the first day itself when a length is picked without one', async () => {
    const user = userEvent.setup();
    renderGate();

    await user.click(screen.getByRole('button', { name: '5 days' }));

    expect(screen.getByLabelText('First day')).not.toHaveValue('');
    expect(screen.getByLabelText('Last day')).not.toHaveValue('');
    expect(screen.getByRole('button', { name: 'Open the days' })).toBeEnabled();
  });

  it('comes back prefilled when the dates are being changed rather than set', () => {
    renderGate({ initialStart: '2026-10-12', initialEnd: '2026-10-17' });

    expect(screen.getByLabelText('First day')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-10-17');
  });

  it('holds the door shut while the dates are saving', () => {
    renderGate({ initialStart: '2026-10-12', initialEnd: '2026-10-17', saving: true });

    expect(screen.getByRole('button', { name: 'Open the days' })).toBeDisabled();
  });

  it('offers the way back to the ideas', async () => {
    const user = userEvent.setup();
    const { onBack } = renderGate();

    await user.click(screen.getByRole('button', { name: 'Back to ideas' }));

    expect(onBack).toHaveBeenCalled();
  });

  // Reached by "Change dates", backing out lands on the day list it was opened
  // over, so the button may not go on promising the ideas board.
  it('names what backing out actually does when the dates are only being changed', async () => {
    const user = userEvent.setup();
    const { onBack } = renderGate({ initialStart: '2026-10-12', initialEnd: '2026-10-17' });

    expect(screen.queryByRole('button', { name: 'Back to ideas' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to your days' }));

    expect(onBack).toHaveBeenCalled();
  });

  // Half-set dates are not a day list to return to.
  it('still offers the ideas when only one of the two dates is known', () => {
    renderGate({ initialStart: '2026-10-12', initialEnd: null });

    expect(screen.getByRole('button', { name: 'Back to ideas' })).toBeInTheDocument();
  });
});

/**
 * There is only one way to be at this gate as a viewer — the trip has no dates,
 * and "Change dates" is not on a viewer's header to reopen it with — so the
 * card says which of the two situations this is rather than handing over a form
 * whose confirm button could never be pressed.
 */
describe('DatesGate — read only', () => {
  it('says why there are no days, and offers no form to open them with', () => {
    renderGate({ readOnly: true });

    expect(screen.getByRole('heading', { level: 2, name: 'No days yet' })).toBeInTheDocument();
    expect(
      screen.getByText("The dates aren't set yet. Only someone editing this trip can open the days."),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText('First day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Last day')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the days' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A week' })).not.toBeInTheDocument();
    // The trip's title in TripLayout is still the page's only <h1>.
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  // A screen with nothing on it and nowhere to go is a dead end.
  it('keeps the way out', async () => {
    const user = userEvent.setup();
    const { onBack } = renderGate({ readOnly: true });

    await user.click(screen.getByRole('button', { name: 'Back to ideas' }));

    expect(onBack).toHaveBeenCalled();
  });
});
