import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Renders the rust error border (--border-error). Rust is reserved for
   * problems and means nothing else in this product, so set this only when the
   * selection is actually wrong — not to draw attention. Pair with a <Field>
   * error message: the border says "something here", the text says what.
   */
  error?: boolean;
  /** Escape hatch for the positioning wrapper — e.g. `flex: 1` inside a row. */
  wrapperClassName?: string;
}

/**
 * Choosing one of a short, fixed set — a category, a parent entry, a trip.
 *
 * Deliberately a real, native `<select>`. A JS listbox would let us style the
 * option list, but it would also mean re-implementing type-ahead, Home/End,
 * PageUp/PageDown, the mobile wheel picker and the screen-reader announcements
 * that the platform gives us for free — and getting one of them subtly wrong is
 * worse than an OS-drawn menu. So: the *closed* control is ours, the *open*
 * menu stays the operating system's. That is the accepted trade.
 *
 * Owning the closed control means killing the UA's own rendering first. The
 * whole reason this component exists is that every select in the app was
 * showing macOS's grey gradient pill with system arrows: the modules set
 * `background`/`border`/`border-radius`, but without `appearance: none` the
 * UA stylesheet's control painting wins and none of it lands. See
 * Select.module.css for that reset and for the chevron that replaces the
 * native arrows.
 *
 * Structurally this is the mirror image of <Input>. Input puts its border on a
 * wrapper and makes the inner `<input>` transparent, because it also hosts a
 * trailing hint glyph that has to sit inside the same box. A select's text is
 * painted by the control itself and cannot be moved into a sibling, so here the
 * `<select>` carries the field geometry and the wrapper is a bare positioning
 * context for the chevron. The two end up visually identical — same surface,
 * border, radius, min-height and focus treatment — which is what matters.
 *
 * Every remaining prop is spread onto the `<select>`, so this works unchanged
 * as a <Field> child: Field clones its child to inject `id` and
 * `aria-describedby`, and both land on the real control that the `<label>`
 * points at.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error = false, className, wrapperClassName, children, ...rest },
  ref,
) {
  const wrapperClasses = [styles.wrapper, wrapperClassName].filter(Boolean).join(' ');
  const selectClasses = [styles.select, error ? styles.error : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapperClasses}>
      <select ref={ref} className={selectClasses} aria-invalid={error || undefined} {...rest}>
        {children}
      </select>
      {/* Decorative: the accessible control is the <select> underneath, which
          announces its own expanded/collapsed state. `pointer-events: none` in
          the module keeps a click on the glyph falling through to the control,
          so the chevron looks like part of the field but never intercepts it. */}
      <ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
});
