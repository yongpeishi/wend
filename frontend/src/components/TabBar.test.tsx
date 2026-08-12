import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from './TabBar';

const tabs = [
  { key: 'board', label: 'Board' },
  { key: 'map', label: 'Map' },
  { key: 'schedule', label: 'Schedule' },
];

describe('TabBar', () => {
  it('renders a tablist with the active tab marked aria-selected', () => {
    render(<TabBar aria-label="Trip sections" tabs={tabs} activeKey="map" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Trip sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'false');
  });

  it('only the active tab is in the natural Tab order (roving tabindex)', () => {
    render(<TabBar aria-label="Trip sections" tabs={tabs} activeKey="board" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('tabindex', '-1');
  });

  it('clicking a tab calls onChange with its key', async () => {
    const onChange = vi.fn();
    render(<TabBar aria-label="Trip sections" tabs={tabs} activeKey="board" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    expect(onChange).toHaveBeenCalledWith('schedule');
  });

  it('ArrowRight moves selection to the next tab, wrapping at the end', async () => {
    const onChange = vi.fn();
    render(<TabBar aria-label="Trip sections" tabs={tabs} activeKey="schedule" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Schedule' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('board');
  });

  // `compact` is a skin. If it ever costs the roving tabindex or the arrow keys
  // it has stopped being one, and the second user of this component is worse off
  // than if it had built three buttons of its own.
  it('the compact variant keeps the same semantics and keyboard contract', async () => {
    const onChange = vi.fn();
    render(<TabBar aria-label="Group ideas" variant="compact" tabs={tabs} activeKey="board" onChange={onChange} />);

    expect(screen.getByRole('tablist', { name: 'Group ideas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('tabindex', '-1');

    screen.getByRole('tab', { name: 'Board' }).focus();
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('schedule');
  });
});
