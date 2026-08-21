import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntrySummary } from '../../api/types';
import { LodgingEditor } from './LodgingEditor';
import type { LodgingValue } from './LodgingEditor';

function place(id: number, title: string): EntrySummary {
  return { id, kind: 'idea', title, category: 'lodging', duration_minutes: null};
}

const CHOICES = [place(11, 'Machiya near Yasaka'), place(12, 'Hotel in Namba')];

function renderEditor(current: LodgingValue | null = null) {
  const onPick = vi.fn();
  const onClear = vi.fn();
  const onFreeText = vi.fn();
  render(
    <LodgingEditor
      choices={CHOICES}
      current={current}
      onPick={onPick}
      onClear={onClear}
      onFreeText={onFreeText}
    />,
  );
  return { onPick, onClear, onFreeText };
}

describe('LodgingEditor', () => {
  it('offers the kept places, and marks the one already chosen', () => {
    renderEditor({ entryId: 12, label: null });

    expect(screen.getByRole('button', { name: 'Machiya near Yasaka' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Hotel in Namba' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picks a kept place by its id', async () => {
    const user = userEvent.setup();
    const { onPick } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Machiya near Yasaka' }));

    expect(onPick).toHaveBeenCalledWith(11);
  });

  it('takes your own words, which is a real answer to where you sleep', async () => {
    const user = userEvent.setup();
    const { onFreeText } = renderEditor();

    await user.type(screen.getByLabelText('Where you sleep, in your own words'), 'Sleeping on the plane');
    await user.click(screen.getByRole('button', { name: 'Use what I wrote' }));

    expect(onFreeText).toHaveBeenCalledWith('Sleeping on the plane');
  });

  it('takes them on Enter too', async () => {
    const user = userEvent.setup();
    const { onFreeText } = renderEditor();

    await user.type(screen.getByLabelText('Where you sleep, in your own words'), 'Night bus{Enter}');

    expect(onFreeText).toHaveBeenCalledWith('Night bus');
  });

  it('will not save an empty answer', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: 'Use what I wrote' })).toBeDisabled();
  });

  it('offers "Same as last night" as words, since nothing resolves it yet', async () => {
    const user = userEvent.setup();
    const { onFreeText } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Same as last night' }));

    expect(onFreeText).toHaveBeenCalledWith('Same as last night');
  });

  it('offers to clear the night only when there is something to clear', async () => {
    const user = userEvent.setup();
    const { onClear } = renderEditor({ entryId: null, label: 'Night bus' });

    await user.click(screen.getByRole('button', { name: 'Clear it' }));

    expect(onClear).toHaveBeenCalled();
  });

  it('keeps the clear action away while the night is unspoken for', () => {
    renderEditor(null);

    expect(screen.queryByRole('button', { name: 'Clear it' })).not.toBeInTheDocument();
  });
});
