import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntrySummary } from '../../api/types';
import { AddPicker } from './AddPicker';

function idea(id: number, title: string): EntrySummary {
  return { id, kind: 'idea', title, category: 'place', duration_minutes: 90 };
}

const CHOICES = [idea(21, 'Fushimi Inari'), idea(22, 'Nishiki Market')];

function renderPicker() {
  const onPick = vi.fn();
  const onCreate = vi.fn();
  const onClose = vi.fn();
  render(<AddPicker choices={CHOICES} onPick={onPick} onCreate={onCreate} onClose={onClose} />);
  return { onPick, onCreate, onClose };
}

describe('AddPicker', () => {
  it('closes from the X without picking or keeping anything', async () => {
    const user = userEvent.setup();
    const { onPick, onCreate, onClose } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('still says "Not now" in words, and that closes too', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
