import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Switch.module.css';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /**
   * The words beside the track. They ARE the control's accessible name — there
   * is no separate label element and no `aria-label` to keep in step with what
   * is on screen.
   */
  children: ReactNode;
}

/**
 * A two-state setting that takes effect the moment it is flipped.
 *
 * This is the first switch in the product, and it is a component rather than a
 * one-off because of the house rule that produced `TabBar`'s compact variant:
 * the second copy of a control is the one that starts drifting. "Follow the
 * map" is the first setting of this shape; the next one gets this, not a second
 * hand-rolled track.
 *
 * A switch, not a Chip and not a checkbox. `Chip` is a filter — it narrows a
 * list and answers "is this one of the things I am looking at". A checkbox is a
 * value you are about to submit, and it lives in a form with something to press
 * afterwards. This is neither: it changes how the screen behaves, immediately,
 * with nothing to confirm. `role="switch"` is the only role that says that, and
 * screen readers announce it as "on/off" rather than "checked", which is the
 * distinction a reader actually needs here.
 *
 * A `<button>` underneath rather than an `<input type="checkbox">` wearing the
 * role. The visual is a track and a knob, which no native checkbox renders
 * without being hidden and redrawn anyway — and a hidden input brings a label
 * association to keep correct for no gain, since a button's own text content is
 * already its accessible name. Space and Enter both activate a button, so the
 * keyboard contract arrives intact.
 *
 * Colour is never alone: the knob's POSITION is the primary signal (left/right
 * is legible without seeing green at all), the track colour is the second, and
 * `aria-checked` is the third. Anyone who cannot tell leaf from a neutral grey
 * still reads the state from where the knob sits.
 *
 * The label sits to the right of the track, always. A switch reads
 * "state — thing", the way a light switch does; putting the words first would
 * make the eye travel back left to find out what happened when it moved.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, children, className, type = 'button', onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      className={[styles.switch, className].filter(Boolean).join(' ')}
      onClick={(event) => {
        onClick?.(event);
        onCheckedChange(!checked);
      }}
      {...rest}
    >
      {/* Decorative: aria-checked already carries the state, and the track has
          no text of its own to contribute to the accessible name. */}
      <span className={[styles.track, checked ? styles.trackOn : ''].filter(Boolean).join(' ')} aria-hidden="true">
        <span className={[styles.knob, checked ? styles.knobOn : ''].filter(Boolean).join(' ')} />
      </span>
      <span className={styles.label}>{children}</span>
    </button>
  );
});
