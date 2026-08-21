import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureBar } from './CaptureBar';

function renderBar() {
  const onQuickAdd = vi.fn();
  const onOpenComposer = vi.fn();
  render(
    <CaptureBar placeholder="Add an idea…" onQuickAdd={onQuickAdd} onOpenComposer={onOpenComposer} />,
  );
  return { onQuickAdd, onOpenComposer, input: screen.getByRole('textbox', { name: 'Add an idea…' }) };
}

/**
 * The bar's whole contract is two keys: Enter keeps the words as an idea,
 * Tab trades up to the composer. Everything here pins one of the two — plus
 * the blank Enter that must do nothing at all.
 */
describe('CaptureBar', () => {
  it('wears the placeholder the board chose, and says what the keys do', () => {
    renderBar();
    expect(screen.getByPlaceholderText('Add an idea…')).toBeInTheDocument();
    expect(screen.getByText('enter to add · tab for details')).toBeInTheDocument();
  });

  it('keeps the idea on Enter, trimmed, and clears the line for the next one', async () => {
    const user = userEvent.setup();
    const { onQuickAdd, onOpenComposer, input } = renderBar();

    await user.type(input, '  Fushimi Inari  {Enter}');

    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onQuickAdd).toHaveBeenCalledWith('Fushimi Inari');
    expect(onOpenComposer).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('does nothing at all on a blank Enter — leaning on the key is not a save', async () => {
    const user = userEvent.setup();
    const { onQuickAdd, input } = renderBar();

    await user.click(input);
    await user.keyboard('{Enter}');
    await user.type(input, '   {Enter}');

    expect(onQuickAdd).not.toHaveBeenCalled();
  });

  it('hands the draft to the composer on Tab, trimmed, and clears the line', async () => {
    const user = userEvent.setup();
    const { onQuickAdd, onOpenComposer, input } = renderBar();

    await user.type(input, ' Onsen day ');
    await user.tab();

    expect(onOpenComposer).toHaveBeenCalledOnce();
    expect(onOpenComposer).toHaveBeenCalledWith('Onsen day');
    expect(onQuickAdd).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  // Tab is the promotion gesture even with nothing typed: "I want the full
  // form" is a fine first move, and the composer opens with a blank name.
  it('opens the composer on an empty Tab too, with an empty draft', async () => {
    const user = userEvent.setup();
    const { onOpenComposer, input } = renderBar();

    await user.click(input);
    await user.tab();

    expect(onOpenComposer).toHaveBeenCalledOnce();
    expect(onOpenComposer).toHaveBeenCalledWith('');
  });

  // The hijack is one-directional on purpose: forwards is the promotion,
  // backwards is still the keyboard leaving. A bar that trapped both
  // directions would seal a keyboard user in.
  it('keeps the Tab to itself — focus stays while the composer opens', async () => {
    const user = userEvent.setup();
    const { input } = renderBar();

    await user.type(input, 'Onsen day');
    await user.tab();

    expect(input).toHaveFocus();
  });

  it('lets Shift+Tab leave, without opening anything', async () => {
    const user = userEvent.setup();
    const { onOpenComposer, input } = renderBar();

    await user.click(input);
    await user.tab({ shift: true });

    expect(onOpenComposer).not.toHaveBeenCalled();
    expect(input).not.toHaveFocus();
  });
});
