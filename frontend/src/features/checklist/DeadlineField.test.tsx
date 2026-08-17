import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeadlineField } from './DeadlineField';

const LABEL = 'Deadline for Buy the JR regional pass';

function renderField(props: Partial<Parameters<typeof DeadlineField>[0]> = {}) {
  const onChange = vi.fn();
  render(<DeadlineField value={null} onChange={onChange} label={LABEL} {...props} />);
  return { onChange };
}

/** Date inputs are filled in by the browser's own control, not by keystrokes. */
function pick(value: string) {
  fireEvent.change(screen.getByLabelText(LABEL), { target: { value } });
}

describe('DeadlineField — a deadline you can read', () => {
  it('says nothing at all when a read-only row has no deadline', () => {
    const { container } = render(<DeadlineField value={null} readOnly label={LABEL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints the deadline as plain text when the row cannot be edited', () => {
    renderField({ value: '2026-10-03', readOnly: true });

    expect(screen.getByText('by 3 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names itself for screen readers without printing the name on the page', () => {
    renderField({ value: '2026-10-03' });

    expect(screen.getByRole('button', { name: LABEL })).toHaveTextContent('by 3 Oct');
    expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
  });
});

describe('DeadlineField — a deadline you can set', () => {
  it('offers to add one, rather than showing an empty date field', () => {
    renderField();

    expect(screen.getByRole('button', { name: LABEL })).toHaveTextContent('+ Deadline');
    expect(document.querySelector('input')).toBeNull();
  });

  it('opens a date picker on the deadline it already has, ready to type into', async () => {
    const user = userEvent.setup();
    renderField({ value: '2026-10-03' });

    await user.click(screen.getByRole('button', { name: LABEL }));

    const input = screen.getByLabelText(LABEL);
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-10-03');
    expect(input).toHaveFocus();
  });

  it('reports the day the picker returns, then closes again', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(screen.getByRole('button', { name: LABEL }));
    pick('2026-10-03');

    expect(onChange).toHaveBeenCalledWith('2026-10-03');
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();
  });

  it('reports null when the picker is emptied, which is how a deadline is cleared', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: '2026-10-03' });

    await user.click(screen.getByRole('button', { name: LABEL }));
    pick('');

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('leaves the deadline alone when Escape closes the picker', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: '2026-10-03' });

    await user.click(screen.getByRole('button', { name: LABEL }));
    await user.keyboard('{Escape}');

    expect(onChange).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: LABEL });
    expect(button).toHaveTextContent('by 3 Oct');
    expect(button).toHaveFocus();
  });

  it('leaves the deadline alone when the picker loses focus', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: '2026-10-03' });

    await user.click(screen.getByRole('button', { name: LABEL }));
    fireEvent.blur(screen.getByLabelText(LABEL));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();
  });
});
