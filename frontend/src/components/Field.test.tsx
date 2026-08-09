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

  // Regression: Field used to render its own <Input> unconditionally and drop
  // `children` on the floor, so a supplied textarea/select vanished and the
  // user got an unwired empty input instead. The entry drawer is built out of
  // exactly that pattern, so every one of its fields was silently broken.
  it('renders a supplied control instead of the built-in input, and labels it', () => {
    render(
      <Field label="Notes">
        <textarea defaultValue="Kyoto in the rain" />
      </Field>,
    );

    const textarea = screen.getByLabelText('Notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('Kyoto in the rain');
    // The built-in input must not also appear.
    expect(screen.queryByRole('textbox', { name: '' })).not.toBeInTheDocument();
  });

  it('keeps a supplied control wired to its error message', () => {
    render(
      <Field label="Latitude" error="That doesn't look like a coordinate.">
        <input defaultValue="abc" />
      </Field>,
    );

    const input = screen.getByLabelText('Latitude');
    const error = screen.getByRole('alert');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
  });
});
