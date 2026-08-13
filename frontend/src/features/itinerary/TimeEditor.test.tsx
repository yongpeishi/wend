import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
async function retype(user: ReturnType<typeof userEvent.setup>, start: string, end: string) {
  await user.clear(screen.getByLabelText('Starts'));
  if (start) await user.type(screen.getByLabelText('Starts'), start);
  await user.clear(screen.getByLabelText('Ends'));
  if (end) await user.type(screen.getByLabelText('Ends'), end);
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

  it('refuses an hour that does not exist', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '25:00', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses an ending that comes before its start', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '14:00', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end comes before the start.');
  });

  it('refuses an ending with no start', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await retype(user, '', '11:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('An ending needs a start.');
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
