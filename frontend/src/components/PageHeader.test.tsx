import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as a heading and an optional description', () => {
    render(<PageHeader title="Six days in Kyoto" description="2 Nov – 8 Nov" />);
    expect(screen.getByRole('heading', { name: 'Six days in Kyoto' })).toBeInTheDocument();
    expect(screen.getByText('2 Nov – 8 Nov')).toBeInTheDocument();
  });

  it('renders no back button when onBack is omitted, and one with an accessible name when supplied', async () => {
    const { rerender } = render(<PageHeader title="Six days in Kyoto" />);
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    const onBack = vi.fn();
    rerender(<PageHeader title="Six days in Kyoto" onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders custom actions', () => {
    render(<PageHeader title="Six days in Kyoto" actions={<button type="button">Add idea</button>} />);
    expect(screen.getByRole('button', { name: 'Add idea' })).toBeInTheDocument();
  });
});
