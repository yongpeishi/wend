import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';
import styles from './Switch.module.css';

describe('Switch', () => {
  it('is a real switch to assistive tech, named by the words beside the track', () => {
    render(
      <Switch checked onCheckedChange={() => {}}>
        Follow the map
      </Switch>,
    );
    const control = screen.getByRole('switch', { name: 'Follow the map' });
    expect(control).toHaveAttribute('aria-checked', 'true');
  });

  it('reports the state it was given, not one it keeps for itself', () => {
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={() => {}}>
        Follow the map
      </Switch>,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(
      <Switch checked onCheckedChange={() => {}}>
        Follow the map
      </Switch>,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('asks for the opposite of its current state when clicked', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch checked onCheckedChange={onCheckedChange}>
        Follow the map
      </Switch>,
    );
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  // A switch that only works with a pointer is not a switch. Both keys that
  // activate a button have to reach it, which is the whole reason this is a
  // <button> rather than a styled <div>.
  it.each(['[Space]', '[Enter]'])('is operable from the keyboard with %s', async (key) => {
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={onCheckedChange}>
        Follow the map
      </Switch>,
    );
    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await userEvent.keyboard(key);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  // Where the knob sits is the signal that survives colour blindness and a
  // greyscale screen, so it is asserted rather than left to the track's fill.
  it('moves the knob rather than relying on the track colour alone', () => {
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={() => {}}>
        Follow the map
      </Switch>,
    );
    const knob = () => document.querySelector(`.${styles.knob}`);
    expect(knob()).not.toHaveClass(styles.knobOn);
    rerender(
      <Switch checked onCheckedChange={() => {}}>
        Follow the map
      </Switch>,
    );
    expect(knob()).toHaveClass(styles.knobOn);
  });

  it('still calls a caller-supplied onClick, so it composes like any other button', async () => {
    const onClick = vi.fn();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} onClick={onClick} onCheckedChange={onCheckedChange}>
        Follow the map
      </Switch>,
    );
    await userEvent.click(screen.getByRole('switch'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onCheckedChange).toHaveBeenCalledOnce();
  });
});
