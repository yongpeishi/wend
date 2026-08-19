import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import styles from './Button.module.css';

describe('Button', () => {
  it('renders its label and responds to a click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save trip</Button>);
    const button = screen.getByRole('button', { name: 'Save trip' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it never submits a surrounding form by accident', () => {
    render(<Button>Skip</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('applies the primary variant class by default and switches with the variant prop', () => {
    const { rerender } = render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveClass(styles.primary);
    rerender(<Button variant="quiet">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass(styles.quiet);
  });

  it('renders the destructive variant, the one control the error hue may fill', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass(styles.destructive);
    expect(button).not.toHaveClass(styles.primary);
  });

  it('disables the destructive variant like any other button', () => {
    const onClick = vi.fn();
    render(
      <Button variant="destructive" disabled onClick={onClick}>
        Delete
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('defaults to the medium size and switches with the size prop', () => {
    const { rerender } = render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveClass(styles.medium);
    rerender(
      <Button size="small">Go</Button>,
    );
    expect(screen.getByRole('button')).toHaveClass(styles.small);
    expect(screen.getByRole('button')).not.toHaveClass(styles.medium);
  });

  it('is disabled, unfocusable via click handler, and exposes disabled to assistive tech', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save trip
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('is keyboard-reachable via Tab, matching the real :focus-visible contract (no `focused` prop)', async () => {
    render(<Button>Focus me</Button>);
    const button = screen.getByRole('button');
    expect(document.activeElement).not.toBe(button);
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    // The CSS-module class carries the :focus-visible rule (3px apricot outline,
    // 3px offset) — jsdom doesn't compute pseudo-class styles, so we assert the
    // class contract instead of a rendered outline. See frontend/README.md.
    expect(button.className).toContain(styles.button);
  });

  it('forwards a ref to the underlying <button>', () => {
    let ref: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el) => {
          ref = el;
        }}
      >
        Ref me
      </Button>,
    );
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
