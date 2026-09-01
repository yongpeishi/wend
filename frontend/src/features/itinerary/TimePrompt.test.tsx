import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SlotSuggestion } from './itineraryModel';
import { TimePrompt } from './TimePrompt';

const OPENINGS: SlotSuggestion[] = [
  { start: 9 * 60, end: 10 * 60 + 30, label: 'the morning gap' },
  { start: 14 * 60, end: 16 * 60, label: 'after lunch' },
];

function renderPrompt(props: Partial<Parameters<typeof TimePrompt>[0]> = {}) {
  const onSave = vi.fn();
  const onDismiss = vi.fn();
  render(
    <TimePrompt
      title={props.title ?? 'Nishiki Market'}
      dayName={props.dayName ?? 'Wed 15'}
      suggestions={props.suggestions ?? OPENINGS}
      onSave={props.onSave ?? onSave}
      onDismiss={props.onDismiss ?? onDismiss}
    />,
  );
  return { onSave, onDismiss };
}

/** Both fields, cleared and retyped — the prompt opens prefilled. */
async function retype(user: ReturnType<typeof userEvent.setup>, start: string, end: string) {
  await user.clear(screen.getByLabelText('Starts for Nishiki Market'));
  if (start) await user.type(screen.getByLabelText('Starts for Nishiki Market'), start);
  await user.clear(screen.getByLabelText('Ends for Nishiki Market'));
  if (end) await user.type(screen.getByLabelText('Ends for Nishiki Market'), end);
}

describe('TimePrompt', () => {
  it('asks about the day by name', () => {
    renderPrompt({ dayName: 'Thu 16' });

    expect(screen.getByText('On the day. When on Thu 16?')).toBeInTheDocument();
  });

  it('opens on the best opening — chip pressed, fields already filled', () => {
    renderPrompt();

    expect(screen.getByRole('button', { name: /the morning gap/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Starts for Nishiki Market')).toHaveValue('09:00');
    expect(screen.getByLabelText('Ends for Nishiki Market')).toHaveValue('10:30');
  });

  it('fills both fields when another opening is picked', async () => {
    const user = userEvent.setup();
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /after lunch/ }));

    expect(screen.getByRole('button', { name: /after lunch/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /the morning gap/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Starts for Nishiki Market')).toHaveValue('14:00');
    expect(screen.getByLabelText('Ends for Nishiki Market')).toHaveValue('16:00');
  });

  it('clears both fields on "no time yet", and saving then places it loose', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPrompt();

    await user.click(screen.getByRole('button', { name: 'no time yet' }));

    expect(screen.getByLabelText('Starts for Nishiki Market')).toHaveValue('');
    expect(screen.getByLabelText('Ends for Nishiki Market')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(null, null);
  });

  it('saves typed hours as minutes from midnight', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPrompt();

    await retype(user, '11:15', '12:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).toHaveBeenCalledWith(11 * 60 + 15, 12 * 60);
  });

  it('saves on Enter, since the whole prompt is one question', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPrompt();

    await retype(user, '10:00', '11:00');
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledWith(10 * 60, 11 * 60);
  });

  it('takes the chip selection back the moment either field is typed in', async () => {
    const user = userEvent.setup();
    renderPrompt();

    await user.type(screen.getByLabelText('Starts for Nishiki Market'), '5');

    expect(screen.getByRole('button', { name: /the morning gap/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'no time yet' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('refuses something that is not a time rather than guessing at it', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPrompt();

    await retype(user, 'morning', '');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Times read like 09:40.');
  });

  it('says so the moment the pair goes backwards, and holds the save shut', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPrompt();

    await retype(user, '14:00', '11:00');

    expect(screen.getByRole('alert')).toHaveTextContent('The end comes before the start.');
    expect(screen.getByRole('button', { name: 'Set the hours' })).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('dismisses on Escape without saving anything', async () => {
    const user = userEvent.setup();
    const { onDismiss, onSave } = renderPrompt();

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('dismisses from "Leave it loose" the same way', async () => {
    const user = userEvent.setup();
    const { onDismiss, onSave } = renderPrompt();

    await user.click(screen.getByRole('button', { name: 'Leave it loose' }));

    expect(onDismiss).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('still offers "no time yet" on a day with no openings, with the fields empty', () => {
    renderPrompt({ suggestions: [] });

    expect(screen.getByRole('button', { name: 'no time yet' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Starts for Nishiki Market')).toHaveValue('');
    expect(screen.getByLabelText('Ends for Nishiki Market')).toHaveValue('');
  });
});
