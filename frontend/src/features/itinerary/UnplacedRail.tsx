import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import { EmptyState } from '../../components/EmptyState';
import type { EntrySummary } from '../../api/types';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import type { ItineraryDay } from './itineraryModel';
import styles from './UnplacedRail.module.css';

const DRAGGABLE_PREFIX = 'itinerary-unplaced-';

export interface UnplacedRailProps {
  /** `Not placed yet · 4`. */
  title: string;
  /** The sentence under it, explaining both ways onto a day. */
  line: string;
  /** Kept ideas and bundles that sit in no live version of any day. */
  items: EntrySummary[];
  /** Every day of the trip, for the ⋯ menu's targets. */
  days: ItineraryDay[];
  onAddToDay: (entryId: number, day: string) => void;
  /** One of these started moving. Must be inside a `<DndContext>`. */
  onDragStart?: (entryId: number) => void;
  /** The foot of the rail — where the archived panel goes. */
  children?: ReactNode;
}

/**
 * The right rail: everything kept for this trip that no day holds yet.
 *
 * Nothing here is used up. Placing a bundle on Tuesday does not take it off
 * this list for Wednesday — the list is only "in no live version", which is a
 * fact about the days, not a stock level. The closing line says so, because it
 * is the one thing about this screen people assume wrongly.
 */
export function UnplacedRail({ title, line, items, days, onAddToDay, onDragStart, children }: UnplacedRailProps) {
  useDndMonitor({
    onDragStart({ active }) {
      if (!onDragStart || !String(active.id).startsWith(DRAGGABLE_PREFIX)) return;
      const data = active.data.current as { entryId?: number } | undefined;
      if (typeof data?.entryId === 'number') onDragStart(data.entryId);
    },
  });

  return (
    <aside className={styles.rail} aria-label="Kept and not placed yet">
      <p className={styles.title}>{title}</p>
      <p className={styles.line}>{line}</p>

      {items.length === 0 ? (
        <EmptyState message="Everything you've kept is on a day. Keep something new and it waits here." />
      ) : (
        items.map((item) => <RailItem key={item.id} item={item} days={days} onAddToDay={onAddToDay} />)
      )}

      {children}

      <p className={styles.note}>Nothing here is used up. A bundle can sit in two days at once until you decide.</p>
    </aside>
  );
}

interface RailItemProps {
  item: EntrySummary;
  days: ItineraryDay[];
  onAddToDay: (entryId: number, day: string) => void;
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
 * Not `role="menu"` — as on the board's ⋯ menu, that role promises arrow-key
 * traversal and a single tab stop. This is a labelled group of ordinary
 * buttons, and Tab already walks it in order.
 */
function RailItem({ item, days, onAddToDay }: RailItemProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

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
    item.kind === 'bundle' ? 'Bundle' : null,
    item.location_name,
    formatDuration(item.duration_minutes),
  );

  return (
    <div
      className={styles.item}
      data-bundle={item.kind === 'bundle' || undefined}
      data-dragging={isDragging || undefined}
      ref={containerRef}
    >
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

      <span className={styles.body}>
        <span className={styles.name}>{item.title}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>

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
          <div className={styles.menu} role="group" aria-label={`Days to add ${item.title} to`}>
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
    </div>
  );
}
