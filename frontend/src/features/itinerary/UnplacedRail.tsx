import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import { EmptyState } from '../../components/EmptyState';
import { joinMeta } from '../../lib/formatDates';
// The itinerary's own short duration form ("30 min", "1 hr 30"), not
// lib/formatDates' longer one — one screen, one convention.
import { formatDuration } from './itineraryModel';
import type { ItineraryDay, PoolEntry } from './itineraryModel';
import styles from './UnplacedRail.module.css';

const DRAGGABLE_PREFIX = 'itinerary-unplaced-';

export interface UnplacedRailProps {
  /** `4 to place` — how many still have no day, not how long the list is. */
  title: string;
  /**
   * The sentence under it. For someone editing, both ways onto a day; for a
   * viewer, what the list is — see `readOnly`, and the container that picks.
   */
  line: string;
  /**
   * Everything kept for this trip that could go on a day — placed or not, from
   * `buildPool`. A placed one carries its marker and stays fully placeable.
   */
  items: PoolEntry[];
  /** Every day of the trip, for the ⋯ menu's targets. */
  days: ItineraryDay[];
  onAddToDay: (entryId: number, day: string) => void;
  /** One of these started moving. Must be inside a `<DndContext>`. */
  onDragStart?: (entryId: number) => void;
  /** The foot of the rail — where the archived panel goes. */
  children?: ReactNode;
  /**
   * A viewer's rail: the whole list, its count and its closing note, with the
   * two ways onto a day taken off each row. `line` is the caller's to match —
   * the sentence that names the grip and the ⋯ menu describes controls a
   * viewer cannot see, and only the container knows which sentence to pass.
   */
  readOnly?: boolean;
}

/**
 * The right rail: everything kept for this trip, whether a day holds it yet or
 * not.
 *
 * Nothing here is used up. Placing a bundle on Tuesday does not take it off
 * this list for Wednesday — it stays, wearing a quiet "placed · Day 2", so it
 * can be placed again. The list is a pool, not a stock level, and the closing
 * line says so, because it is the one thing about this screen people assume
 * wrongly. Lodging never appears: each day has its own lodging editor.
 */
export function UnplacedRail({
  title,
  line,
  items,
  days,
  onAddToDay,
  onDragStart,
  children,
  readOnly = false,
}: UnplacedRailProps) {
  useDndMonitor({
    onDragStart({ active }) {
      if (!onDragStart || !String(active.id).startsWith(DRAGGABLE_PREFIX)) return;
      const data = active.data.current as { entryId?: number } | undefined;
      if (typeof data?.entryId === 'number') onDragStart(data.entryId);
    },
  });

  return (
    <aside className={styles.rail} aria-label="Kept for this trip">
      <p className={styles.title}>{title}</p>
      <p className={styles.line}>{line}</p>

      {items.length === 0 ? (
        <EmptyState message="Nothing kept for this trip yet. Keep something on the Ideas board and it waits here." />
      ) : (
        items.map((item) => (
          <RailItem key={item.id} item={item} days={days} onAddToDay={onAddToDay} readOnly={readOnly} />
        ))
      )}

      {children}

      <p className={styles.note}>Nothing here is used up. A plan can sit in two days at once until you decide.</p>
    </aside>
  );
}

interface RailItemProps {
  item: PoolEntry;
  days: ItineraryDay[];
  onAddToDay: (entryId: number, day: string) => void;
  readOnly?: boolean;
}

/**
 * One waiting idea or bundle. The grip drags it onto a day; the ⋯ menu does
 * the same thing with a click or a keyboard, and is the route that has to work
 * on its own — dragging is the accelerator, never the only way in.
 *
 * The grip is a button beside the card rather than the whole card being
 * draggable (the prototype's approach): a draggable card that also contains a
 * menu button swallows the click meant for the menu.
 *
 * Still `role="group"` rather than `role="menu"`: that role promises a single
 * tab stop, and here Tab walking the days one by one is a route people already
 * have. What the group did not have was the arrow keys, which anyone who
 * reaches for a popup list reaches for first — and on a trip of fourteen days
 * this list is long. So Up and Down walk it and wrap, Home and End jump to its
 * ends, and Tab and Escape do exactly what they did before. This is the
 * keyboard's whole equivalent of dragging something onto a day.
 *
 * Read-only leaves the card and takes both of those away, which is the whole
 * difference: the title, what kind of thing it is and where it is are the
 * reasons the row exists, and none of them is a control. `useDraggable` is
 * still called — hooks cannot be skipped — but with nothing rendering its
 * listeners there is no grip to lift, and the screen above has taken the
 * sensors off the DndContext anyway.
 */
function RailItem({ item, days, onAddToDay, readOnly = false }: RailItemProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${DRAGGABLE_PREFIX}${item.id}`,
    data: { entryId: item.id, title: item.title },
  });

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
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const meta = joinMeta(
    item.kind === 'bundle' ? 'Plan' : null,
    formatDuration(item.duration_minutes),
  );

  /**
   * Up and Down walk the days and wrap round; Home and End jump to the first
   * and the last. The buttons are read out of the DOM rather than held in an
   * array of refs — the list is exactly the days prop, so the DOM is already
   * the single source of what is in it and in what order.
   */
  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const choices = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (choices.length === 0) return;

    const here = choices.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = here < 0 ? 0 : (here + 1) % choices.length;
        break;
      case 'ArrowUp':
        next = here < 0 ? choices.length - 1 : (here - 1 + choices.length) % choices.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = choices.length - 1;
        break;
      default:
        return;
    }

    // Only once a key we handle has been recognised, so the page still scrolls
    // on the keys this menu has no opinion about.
    event.preventDefault();
    choices[next].focus();
  }

  return (
    <div
      className={styles.item}
      data-bundle={item.kind === 'bundle' || undefined}
      data-dragging={isDragging || undefined}
      data-placed={item.placedMarker !== null || undefined}
      ref={containerRef}
    >
      {!readOnly && (
        <button
          type="button"
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          className={styles.grip}
          aria-label={`Drag ${item.title} onto a day`}
        >
          <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}

      <span className={styles.body}>
        <span className={styles.name}>{item.title}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
        {/* Where it already sits. A fact, not a warning: the row is still
            here precisely so it can go on another day too. */}
        {item.placedMarker && <span className={styles.placed}>{item.placedMarker}</span>}
      </span>

      {!readOnly && (
        <span className={styles.menuWrap}>
          <button
            type="button"
            ref={triggerRef}
            className={styles.trigger}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`Add ${item.title} to a day`}
            onClick={() => setOpen((value) => !value)}
          >
            <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>

          {open && (
            <div
              ref={menuRef}
              className={styles.menu}
              role="group"
              aria-label={`Days to add ${item.title} to`}
              onKeyDown={moveFocus}
            >
              {days.length === 0 ? (
                <p className={styles.menuEmpty}>Set the trip's dates and the days appear here.</p>
              ) : (
                days.map((day, index) => (
                  <button
                    key={day.day}
                    type="button"
                    ref={index === 0 ? firstItemRef : undefined}
                    className={styles.menuItem}
                    onClick={() => {
                      setOpen(false);
                      onAddToDay(item.id, day.day);
                    }}
                  >
                    Add to {day.label}
                  </button>
                ))
              )}
            </div>
          )}
        </span>
      )}
    </div>
  );
}
