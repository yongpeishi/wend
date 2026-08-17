import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ItineraryItem } from '../../api/types';
import { BundleBand } from './BundleBand';
import { TimeEditor } from './TimeEditor';

function renderEditor(props: Partial<Parameters<typeof TimeEditor>[0]> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <TimeEditor
      startsAtMinutes={props.startsAtMinutes ?? 8 * 60}
      endsAtMinutes={props.endsAtMinutes ?? 12 * 60 + 30}
      onSave={props.onSave ?? onSave}
      onCancel={props.onCancel ?? onCancel}
      title={props.title}
    />,
  );
  return { onSave, onCancel };
}

/** Both fields, cleared and retyped — the editor opens prefilled. */
async function retype(user: ReturnType<typeof userEvent.setup>, start: string, end: string, suffix = '') {
  await user.clear(screen.getByLabelText(`Starts${suffix}`));
  if (start) await user.type(screen.getByLabelText(`Starts${suffix}`), start);
  await user.clear(screen.getByLabelText(`Ends${suffix}`));
  if (end) await user.type(screen.getByLabelText(`Ends${suffix}`), end);
}

describe('TimeEditor', () => {
  it('opens on the hours the item already has, in 24-hour form', () => {
    renderEditor();

    expect(screen.getByLabelText('Starts')).toHaveValue('08:00');
    expect(screen.getByLabelText('Ends')).toHaveValue('12:30');
  });

  it('names the item it is editing, so two open editors are told apart', () => {
    renderEditor({ title: 'Nishiki Market' });

    expect(screen.getByLabelText('Starts for Nishiki Market')).toBeInTheDocument();
  });

  it('saves the hours as minutes from midnight', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '09:15', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(9 * 60 + 15, 11 * 60);
  });

  it('takes a time without its colon, and one without its leading zero', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '9:05', '1400');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(9 * 60 + 5, 14 * 60);
  });

  it('reads a bare hour as that hour, on the hour', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '12', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(12 * 60, null);
  });

  it('reads a single digit as an hour too', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '9', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(9 * 60, null);
  });

  it('reads a lone zero as midnight, not as nothing typed', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '0', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(0, null);
  });

  it('still reads three digits and four the way it always has', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '900', '0900');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(9 * 60, 9 * 60);
  });

  it('shows what it understood once the field is left', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), '12');
    await user.tab();

    expect(screen.getByLabelText('Starts')).toHaveValue('12:00');
  });

  it('settles the ending the same way', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText('Ends'));
    await user.type(screen.getByLabelText('Ends'), '900');
    await user.tab();

    expect(screen.getByLabelText('Ends')).toHaveValue('09:00');
  });

  it('leaves a refused field showing the characters that were typed into it', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), '25:00');
    await user.tab();

    expect(screen.getByLabelText('Starts')).toHaveValue('25:00');
  });

  it('saves on Enter, since the whole editor is two fields', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '10:00', '11:00');
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledWith(10 * 60, 11 * 60);
  });

  it('lets an item start without ending', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '12:00', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(12 * 60, null);
  });

  it('clears both when both are emptied — a thing can sit on a day without hours', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(null, null);
  });

  it('refuses something that is not a time rather than guessing at it', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, 'morning', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Times read like 09:40.');
  });

  // An hour that does not exist, a minute that does not exist, letters, and half
  // a time — reading a bare hour did not widen what counts as one.
  it.each(['25:00', '25', '12:60', 'ab', '12:3', '1:2'])('refuses %s and says so on the box', async (typed) => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, typed, '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Starts')).toHaveAccessibleDescription('Times read like 09:40.');
  });

  it('names the ending when the ending is the unreadable one', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '09:00', '12:60');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ends')).toHaveAccessibleDescription('Times read like 09:40.');
    expect(screen.getByLabelText('Starts')).not.toHaveAttribute('aria-invalid');
  });

  it('refuses an ending that comes before its start', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '14:00', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end comes before the start.');
  });

  it('says so the moment the pair goes backwards, without waiting to be saved', async () => {
    const user = userEvent.setup();
    renderEditor();

    await retype(user, '14:00', '11:00');

    expect(screen.getByRole('alert')).toHaveTextContent('The end comes before the start.');
    expect(screen.getByRole('button', { name: 'Set the hours' })).toBeDisabled();
  });

  it('will not save a backwards pair on Enter either', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '14:00', '11:00');
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('hangs the message off the field at fault, so the box is marked too', async () => {
    const user = userEvent.setup();
    renderEditor();

    await retype(user, '14:00', '11:00');

    const ends = screen.getByLabelText('Ends');
    expect(ends).toHaveAttribute('aria-invalid', 'true');
    expect(ends).toHaveAccessibleDescription('The end comes before the start.');
    expect(screen.getByLabelText('Starts')).not.toHaveAttribute('aria-invalid');
  });

  it('takes the message back once the ending is moved past the start', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '14:00', '11:00');
    await user.clear(screen.getByLabelText('Ends'));
    await user.type(screen.getByLabelText('Ends'), '16:00');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Set the hours' }));
    expect(onSave).toHaveBeenCalledWith(14 * 60, 16 * 60);
  });

  it('lets an ending land on its start — a zero-length thing is a plan, not a mistake', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '11:00', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(11 * 60, 11 * 60);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses an ending with no start', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('An ending needs a start.');
  });

  it('holds its tongue while a time is still being typed', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), '9');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the hours alone on cancel, and on Escape', async () => {
    const user = userEvent.setup();
    const { onCancel, onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Leave it' }));
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

/**
 * A bundle's hours are changed from the band, not from a member line — so the
 * band is the second way into this editor, and the rules have to hold on that
 * way in too. DayCard.test.tsx covers the loose-idea way in.
 */
const BUNDLE: ItineraryItem = {
  id: 50,
  trip_id: 1,
  entry_id: 20,
  chosen_entry_id: null,
  day: '2026-10-13',
  day_version_id: 1,
  starts_at_minutes: 8 * 60,
  ends_at_minutes: 12 * 60 + 30,
  note: null,
  position: 0,
  entry: {
    id: 20,
    kind: 'bundle',
    title: 'Tuesday south',
    category: 'place',
    duration_minutes: 240,
    location_name: 'Kyoto south',
  },
  members: [
    { id: 21, kind: 'idea', title: 'Fushimi Inari', category: 'place', duration_minutes: 120, location_name: null },
  ],
};

describe('TimeEditor, opened from a bundle band', () => {
  async function openBand(onEditTime: ReturnType<typeof vi.fn>) {
    const user = userEvent.setup();
    render(<BundleBand item={BUNDLE} onEditTime={onEditTime} />);
    await user.click(screen.getByRole('button', { name: /Change the hours for Tuesday south/ }));
    return user;
  }

  it('refuses an ending that comes before the start of the bundle', async () => {
    const onEditTime = vi.fn();
    const user = await openBand(onEditTime);

    await retype(user, '14:00', '11:00', ' for Tuesday south');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onEditTime).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end comes before the start.');
  });

  it('sets the band’s hours once they run the right way round', async () => {
    const onEditTime = vi.fn();
    const user = await openBand(onEditTime);

    await retype(user, '09:00', '17:00', ' for Tuesday south');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onEditTime).toHaveBeenCalledWith(9 * 60, 17 * 60);
  });
});
