import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('is a real, typeable <input> (the design bundle prototype was a static div)', async () => {
    const onChange = vi.fn();
    render(<Input placeholder="Where are you going?" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Where are you going?');
    expect(input.tagName).toBe('INPUT');
    await userEvent.type(input, 'Kyoto');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders the trailing hint affordance, e.g. the return glyph', () => {
    render(<Input value="Kyoto" hint="↵" onChange={() => {}} />);
    expect(screen.getByText('↵')).toBeInTheDocument();
  });

  it('marks itself invalid via aria-invalid when error is set, for screen readers', () => {
    render(<Input error onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('overlays a literal dd/mm/yyyy placeholder on an empty date field (the native ghost text is browser chrome — Safari paints today\'s date)', () => {
    render(<Input type="date" value="" onChange={() => {}} />);
    const overlay = screen.getByText('dd/mm/yyyy');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('drops the overlay once the date field has a value', () => {
    render(<Input type="date" value="2026-09-01" onChange={() => {}} />);
    expect(screen.queryByText('dd/mm/yyyy')).not.toBeInTheDocument();
  });

  it('never overlays non-date inputs, even empty ones', () => {
    render(<Input value="" onChange={() => {}} />);
    expect(screen.queryByText('dd/mm/yyyy')).not.toBeInTheDocument();
  });

  it('is disableable and forwards a ref to the input element', () => {
    let ref: HTMLInputElement | null = null;
    render(
      <Input
        disabled
        ref={(el) => {
          ref = el;
        }}
      />,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(ref).toBeInstanceOf(HTMLInputElement);
  });
});
