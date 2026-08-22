import { useEffect, useId, useRef, useState } from 'react';
import type { Entry } from '../../api/types';
import styles from './PlansDropdown.module.css';

export interface PlansDropdownProps {
  /** The trip's plans. */
  bundles: Entry[];
  /** bundleId → members, from useBundleMembers — read only for the counts. */
  members: Map<number, Entry[]>;
}

/** "2 ideas" / "1 idea" — the count is always spoken, never left to a bare digit. */
function ideaCount(count: number): string {
  return `${count} ${count === 1 ? 'idea' : 'ideas'}`;
}

/**
 * A read-only glance at the trip's plans, for the map's control row: which
 * plans exist and how full each one is, without leaving the map. Deliberately
 * NOT a verb — adding to a plan is the selection bar's job, and a second door
 * to the same act would leave two controls disagreeing about what a plan row
 * means on one screen. So the rows are words, not buttons.
 *
 * The popover keeps BulkBar's closing contract — Escape closes and returns
 * focus to the trigger, a click anywhere else lands on the invisible catcher —
 * but takes no focus of its own on opening: there is nothing operable inside
 * to give it to, and pulling focus into a panel of plain text would strand the
 * keyboard on nothing.
 */
export function PlansDropdown({ bundles, members }: PlansDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Whatever else Escape means on this screen, a cancelled glance must
      // not also cancel it.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Plans <span aria-hidden="true">⌄</span>
        <span className={styles.triggerCount}>{bundles.length}</span>
      </button>

      {open && (
        <>
          {/* A pointer convenience, hidden from assistive tech and out of the
              tab order — Escape is the keyboard's way out. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles.catcher}
            onClick={() => setOpen(false)}
          />

          <div className={styles.panel} role="group" aria-labelledby={labelId}>
            <p className={styles.panelLabel} id={labelId}>
              Plans
            </p>

            {bundles.length === 0 ? (
              // Points at the one place a plan can start from here.
              <p className={styles.empty}>No plans yet. Select ideas below to start one.</p>
            ) : (
              bundles.map((bundle) => (
                <div key={bundle.id} className={styles.item}>
                  <span className={styles.itemTitle}>{bundle.title}</span>
                  <span className={styles.itemMeta}>
                    {ideaCount((members.get(bundle.id) ?? []).length)}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
