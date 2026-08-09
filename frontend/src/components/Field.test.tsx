import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('associates its label with the input via a generated id', () => {
    render(<Field label="Destination" placeholder="Where are you going?" onChange={() => {}} />);
    const input = screen.getByLabelText('Destination');
    expect(input).toHaveAttribute('placeholder', 'Where are you going?');
  });

  it('shows an error message, marks the input invalid, and links them with aria-describedby', () => {
    render(<Field label="Destination" error="This one needs a name." onChange={() => {}} />);
    const input = screen.getByLabelText('Destination');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('This one needs a name.');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
  });

  it('shows description text (not an error) when there is no error', () => {
    render(<Field label="Destination" description="Where you're starting from." onChange={() => {}} />);
    expect(screen.getByText("Where you're starting from.")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
