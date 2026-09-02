import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { CloseButton } from '../../components/CloseButton';
import styles from './SwapDayMenu.module.css';

/** One day of the trip as the menu offers it. */
export interface SwapDayChoice {
  /** ISO `YYYY-MM-DD`. */
  day: string;
  /** `Day 3 · Wed 4` — the same label the day wears on the screen. */
  label: string;
}

export interface SwapDayMenuProps {
  /** ISO date of the day this menu belongs to. Never offered as a target. */
  day: string;
  /** That day's label, for what the trigger says out loud. */
  dayLabel: string;
  /** Every day of the trip, in order. */
  choices: SwapDayChoice[];
  onSwap: (otherDay: string) => void;
  /** Laid on the trigger, so a row can place it without knowing this file. */
  className?: string;
}

/**
 * "Move Day 2 to be Day 3" — an exchange of two dates, offered on the day
 * itself.
 *
 * SWAP, not reorder: the day picked here comes back to this one. Both plans
 * survive, which is the whole reason it is not a drag: dragging a day into a
 * list of days reads as an insert, and nothing here inserts.
 *
 * The same popup the rail's ⋯ menu is (UnplacedRail's RailItem) and for the
 * same reasons — `role="group"` rather than `role="menu"`, because Tab walking
 * the days one by one is a route worth keeping, with the arrow keys added on
 * top for anyone who reaches for them first. A fourteen-day trip makes this a
 * long list either way.
 */
export function SwapDayMenu({ day, dayLabel, choices, onSwap, className }: SwapDayMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A day cannot swap with itself, so it is not in the list at all rather than
  // in it and refusing.
  const others = choices.filter((choice) => choice.day !== day);

  /**
   * Leaving without choosing: Escape and the X both come here, so focus lands
   * back on the trigger either way rather than falling to the body when the
   * popup it was in disappears.
   */
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Opening moves focus into the popup so a keyboard reaches the days without
  // tabbing past the trigger, and Escape hands it straight back.
  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    function onDocPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /**
   * Up and Down walk the days and wrap; Home and End jump to the ends. Only
   * the days: the X shares the popup but is not a choice, and an arrow walk
   * that stopped on it would make "the last day" mean "close". Tab still
   * reaches it.
   */
  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-swap-item]') ?? [],
    );
    if (buttons.length === 0) return;

    const here = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = here < 0 ? 0 : (here + 1) % buttons.length;
        break;
      case 'ArrowUp':
        next = here < 0 ? buttons.length - 1 : (here - 1 + buttons.length) % buttons.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    buttons[next].focus();
  }

  return (
    <span className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Swap ${dayLabel} with another day`}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowUpDown size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="group"
          aria-label={`Days to swap ${dayLabel} with`}
          onKeyDown={moveFocus}
        >
          <CloseButton onClick={close} />
          {others.length === 0 ? (
            <p className={styles.empty}>A one-day trip has nothing to swap with.</p>
          ) : (
            others.map((choice, index) => (
              <button
                key={choice.day}
                type="button"
                ref={index === 0 ? firstItemRef : undefined}
                className={styles.item}
                data-swap-item
                onClick={() => {
                  setOpen(false);
                  onSwap(choice.day);
                }}
              >
                Swap with {choice.label}
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
