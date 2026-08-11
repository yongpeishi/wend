import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';
import styles from './Select.module.css';

function Categories() {
  return (
    <>
      <option value="">Not sure yet</option>
      <option value="food">Food</option>
      <option value="place">Place</option>
    </>
  );
}

describe('Select', () => {
  it('is a real, native <select> — keyboard, mobile and screen-reader behaviour come free', async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="What kind of thing?" defaultValue="" onChange={onChange}>
        <Categories />
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'What kind of thing?' });
    expect(select.tagName).toBe('SELECT');
    await userEvent.selectOptions(select, 'food');
    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue('food');
  });

  it('renders a decorative chevron that is hidden from assistive tech', () => {
    const { container } = render(
      <Select aria-label="Kind">
        <Categories />
      </Select>,
    );
    const chevron = container.querySelector(`.${styles.chevron}`);
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the class holding the appearance reset and the single-ring focus rule', async () => {
    render(
      <Select aria-label="Kind">
        <Categories />
      </Select>,
    );
    const select = screen.getByRole('combobox');
    // jsdom computes no pseudo-class styles, so — as with Button and Input —
    // we assert the class contract. `.select` owns `appearance: none` (no
    // native chrome) and `.select:focus-visible` at (0,2,0), which outranks
    // global.css's `select:focus-visible` at (0,1,1) and so replaces its
    // offset solid ring with the border + wash pair: one ring, not two.
    expect(select).toHaveClass(styles.select);
    await userEvent.tab();
    expect(document.activeElement).toBe(select);
  });

  it('forwards arbitrary props onto the <select> so it still works as a <Field> child', () => {
    render(
      <Select aria-label="Kind" id="category-field" aria-describedby="category-help">
        <Categories />
      </Select>,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'category-field');
    expect(select).toHaveAttribute('aria-describedby', 'category-help');
  });

  it('marks itself invalid via aria-invalid when error is set, for screen readers', () => {
    render(
      <Select aria-label="Kind" error>
        <Categories />
      </Select>,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass(styles.error);
  });

  it('is disableable and forwards a ref to the select element', () => {
    let ref: HTMLSelectElement | null = null;
    render(
      <Select
        aria-label="Kind"
        disabled
        ref={(el) => {
          ref = el;
        }}
      >
        <Categories />
      </Select>,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(ref).toBeInstanceOf(HTMLSelectElement);
  });
});
