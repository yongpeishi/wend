import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DroppedPinCard } from './DroppedPinCard';

const noop = () => undefined;

function renderCard(overrides: Partial<Parameters<typeof DroppedPinCard>[0]> = {}) {
  const props = {
    heading: 'New idea from the map',
    name: 'Nanzen-ji',
    nameEditable: true,
    lat: 35.0116,
    lng: 135.7681,
    ctaLabel: 'Add as idea',
    onConfirm: noop,
    onCancel: noop,
    ...overrides,
  };
  return render(<DroppedPinCard {...props} />);
}

describe('DroppedPinCard', () => {
  it('shows the heading, an editable Name field, the coordinates to five decimals, and the move hint', () => {
    renderCard();

    expect(screen.getByText('New idea from the map')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Nanzen-ji');
    expect(screen.getByText('Where')).toBeInTheDocument();
    expect(screen.getByText('35.01160, 135.76810')).toBeInTheDocument();
    expect(screen.getByText('click again to move it')).toBeInTheDocument();
  });

  it('reports typing through onNameChange', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    renderCard({ name: '', onNameChange });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'K');
    expect(onNameChange).toHaveBeenCalledWith('K');
  });

  it('renders the name as plain text when it is not editable', () => {
    renderCard({ heading: 'Putting Nanzen-ji on the map', nameEditable: false, ctaLabel: 'Save the place' });

    expect(screen.getByText('Putting Nanzen-ji on the map')).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save the place' })).toBeInTheDocument();
  });

  it('wires confirm and cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderCard({ onConfirm, onCancel });

    await user.click(screen.getByRole('button', { name: 'Add as idea' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the primary action while the name is blank', () => {
    renderCard({ name: '   ' });
    expect(screen.getByRole('button', { name: 'Add as idea' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('disables the primary action while busy', () => {
    renderCard({ busy: true });
    expect(screen.getByRole('button', { name: 'Add as idea' })).toBeDisabled();
  });
});
