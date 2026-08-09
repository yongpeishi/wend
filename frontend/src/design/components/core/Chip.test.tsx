import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, Tag } from './Chip';
import styles from './Chip.module.css';

describe('Chip', () => {
  it('renders as a real button and reports aria-pressed for the default tone', () => {
    render(<Chip selected>Temples</Chip>);
    const chip = screen.getByRole('button', { name: 'Temples' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass(styles.selected);
  });

  it('toggles selected styling in response to a click handler supplied by the caller', async () => {
    const onClick = vi.fn();
    render(
      <Chip selected={false} onClick={onClick}>
        Food
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Food' });
    expect(chip).toHaveClass(styles.unselected);
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('the "saved" tone omits aria-pressed since it is not a default filter toggle', () => {
    render(
      <Chip tone="saved" onClick={() => {}}>
        Saved · 12
      </Chip>,
    );
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });
});

describe('Tag', () => {
  it('renders as a non-interactive span, not a button, for static labels', () => {
    render(<Tag tone="saved">Saved · 12</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Saved · 12').tagName).toBe('SPAN');
  });
});
