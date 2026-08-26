import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Entry } from '../../api/types';
import styles from './PlansDropdown.module.css';

export interface PlansDropdownProps {
  /** The trip's plans. */
  bundles: Entry[];
  /** bundleId → members, from useBundleMembers — read for the counts. */
  members: Map<number, Entry[]>;
  /** The plan the map is narrowed to, or null for every plan. */
  selectedId: number | null;
  /** Picking a plan, or null to widen back to all of them. */
  onSelect: (id: number | null) => void;
}

/** "2 ideas" / "1 idea" — the count is always spoken, never left to a bare digit. */
function ideaCount(count: number): string {
  return `${count} ${count === 1 ? 'idea' : 'ideas'}`;
}

/**
 * The trip's plans, on the map's control row: which plans exist, how full each
 * one is, and which one the map is currently reading.
 *
 * Picking a plan NARROWS the screen to it — the list drops to that plan's ideas
 * and the map fits itself around them. That makes this a filter wearing a
 * dropdown's clothes, and it belongs on the control row for the same reason the
 * Filter button does: it is a way of READING the map. It is still emphatically
 * not a way of EDITING a plan. Nothing here adds, removes or reorders anything;
 * putting ideas INTO a plan remains the selection bar's single job, so the two
 * controls never disagree about what a plan row means.
 *
 * Every row is a real button, including "All plans" at the top, because every
 * row now does something — and the way out of a narrowing sits in the same
 * place as the way in. Clicking the plan you are already on clears it too: the
 * lit row is a toggle, so the gesture that got you here undoes itself.
 *
 * The current row is marked three ways over: `aria-current` says it in words to
 * a screen reader, a ✓ says it in a glyph, and the lit-chip leaf edge says it
 * in colour. Nothing rides on the hue alone.
 *
 * The popover keeps the house closing contract — Escape closes and returns
 * focus to the trigger, a click anywhere else lands on the invisible catcher —
 * and now takes focus on opening, onto the first row, because there is finally
 * something operable inside to give it to.
 */
export function PlansDropdown({ bundles, members, selectedId, onSelect }: PlansDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRowRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  const selected = bundles.find((bundle) => bundle.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    firstRowRef.current?.focus();
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

  /** Every pick closes: the question was answered, and the map is about to move. */
  function pick(id: number | null) {
    onSelect(id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={styles.wrap}>
      {/* The trigger reads what the map is reading: the plan's own title once
          one is picked, the plan count while none is. It keeps saying "Plans"
          either way — the title alone would be a control that has forgotten to
          name itself, and the word is what makes the accessible name a
          sentence rather than a noun with no owner.

          The chevron is the same drawn `ChevronDown` the Filter button beside
          it wears, in the same trailing slot, rather than the `⌄` glyph this
          used to print: the two controls sit on one row and open the same kind
          of panel, and a typographic caret next to a stroked icon read as two
          different mechanisms. Label, then value, then the mark that says
          "there is more under here" — Filter's order exactly. */}
      <button
        type="button"
        ref={triggerRef}
        className={selected ? `${styles.trigger} ${styles.triggerOn}` : styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {/* The explicit space is load-bearing: flex `gap` draws the visible one,
            but the accessible name is textContent, and without it a screen
            reader hears "Plans2". */}
        Plans{' '}
        {selected ? (
          <span className={styles.triggerValue}>{selected.title}</span>
        ) : (
          <span className={styles.triggerCount}>{bundles.length}</span>
        )}
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
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

            {/* The widest reading, said out loud rather than left as "whatever
                happens when you un-pick the lit row". A narrowing whose way out
                is only "click the thing you clicked before" is a narrowing with
                a door you have to remember. */}
            <button
              type="button"
              ref={firstRowRef}
              className={selectedId === null ? `${styles.item} ${styles.itemOn}` : styles.item}
              aria-current={selectedId === null ? 'true' : undefined}
              onClick={() => pick(null)}
            >
              <span className={styles.itemTitle}>All plans</span>
              {selectedId === null && (
                <span className={styles.tick} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>

            {bundles.length === 0 ? (
              // Points at the one place a plan can start from here.
              <p className={styles.empty}>No plans yet. Select ideas below to start one.</p>
            ) : (
              bundles.map((bundle) => {
                const on = bundle.id === selectedId;
                return (
                  <button
                    key={bundle.id}
                    type="button"
                    className={on ? `${styles.item} ${styles.itemOn}` : styles.item}
                    aria-current={on ? 'true' : undefined}
                    // The lit row is a toggle: picking it again widens back to
                    // every plan, so the gesture undoes itself in place.
                    onClick={() => pick(on ? null : bundle.id)}
                  >
                    <span className={styles.itemTitle}>{bundle.title}</span>
                    <span className={styles.itemMeta}>
                      {ideaCount((members.get(bundle.id) ?? []).length)}
                      {on && (
                        <span className={styles.tick} aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
