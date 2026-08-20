import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Chip } from '../../design/components/core/Chip';
import { TabBar } from '../../components/TabBar';
import { useCanEdit } from '../../auth/TripRoleContext';
import { CATEGORY_LABELS, CATEGORY_ORDER, GROUP_MODES, toggleCategory } from './filters';
import type { GroupMode, IdeaFilters } from './filters';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  filters: IdeaFilters;
  onChange: (filters: IdeaFilters) => void;
  /** How many ideas the current level is actually showing after the filters. */
  visibleCount: number;
  /** How many ideas the current level holds before any narrowing. */
  totalCount: number;
  groupMode: GroupMode;
  onGroupModeChange: (mode: GroupMode) => void;
  /**
   * The map/list controls. Each is optional and drawn only when its handler is
   * wired, so a caller with no map (or no notion of picking several ideas)
   * gets exactly the bar it asks for rather than dead controls.
   */
  mapOpen?: boolean;
  onToggleMap?: () => void;
  selectMode?: boolean;
  onSelectModeChange?: (selecting: boolean) => void;
  /**
   * Whether the counts are facts yet. While the ideas query is still pending or
   * has failed, "Showing 0 of 0" is not a report, it is a guess dressed as one —
   * the region below the bar is already saying "loading" or "didn't load", so
   * the count line steps aside rather than contradicting it. Defaults to true:
   * a caller with no query to wait on has counts the moment it has ideas.
   */
  countKnown?: boolean;
}

/** One active narrowing, as the removable chips under the row draw it. */
interface ActiveFilter {
  key: string;
  label: string;
  /** The filters with this one narrowing lifted and everything else kept. */
  cleared: IdeaFilters;
}

/**
 * The narrowings that live behind the Filter button, flattened for the chip
 * row under the bar. Search text is deliberately not among them: it is already
 * visible in the search box, and a chip repeating what a live input says would
 * be two controls fighting over one piece of state. Each chip carries the
 * filters-with-itself-removed, so removal is a plain onChange with no
 * arithmetic at the click site.
 */
function activeFilters(filters: IdeaFilters): ActiveFilter[] {
  const active: ActiveFilter[] = filters.categories.map((category) => ({
    key: `category-${category}`,
    label: CATEGORY_LABELS[category],
    cleared: { ...filters, categories: toggleCategory(filters.categories, category) },
  }));
  if (filters.hasLocation) {
    active.push({ key: 'hasLocation', label: 'Has location', cleared: { ...filters, hasLocation: false } });
  }
  if (filters.scheduleState === 'scheduled') {
    active.push({ key: 'scheduled', label: 'Scheduled', cleared: { ...filters, scheduleState: 'all' } });
  }
  if (filters.scheduleState === 'potential') {
    active.push({ key: 'potential', label: 'Potential', cleared: { ...filters, scheduleState: 'all' } });
  }
  return active;
}

/**
 * The board's controls: what to show, and how to stack it.
 *
 * Filtering and grouping are orthogonal and stay visually apart for that
 * reason. The chips narrow the list; the grouping control only decides what
 * headings the survivors sit under. Every chip keeps working in every group
 * mode — filtering by Food while grouped by place is a normal thing to want,
 * not a mode conflict — which falls out of the two controls writing to two
 * different pieces of state, never to each other's.
 *
 * The row runs, per the redesign: the way back to the map (only while it is
 * hidden — the pane carries its own "Hide map" once it is up, so a second
 * toggle here would be the same switch drawn twice), then the search box,
 * then the Filter button, then the grouping pill. Search gets the flexible
 * middle because it is the narrowing you reach for most and the only one that
 * is typed rather than clicked.
 *
 * "+ New idea" is gone from this bar entirely. Capture replaced it: the way
 * to add an idea is the CaptureBar the board mounts above this row, which is
 * always there for an editor and lands the idea at the level being read —
 * a button here would be a second, worse copy of it.
 *
 * Filters hide, never delete. The chips behind the Filter button narrow; the
 * ACTIVE ones are echoed under the row as removable "NAME ✕" chips with one
 * muted sentence saying nothing is gone — so the way out of each narrowing is
 * on the surface, never behind the button that caused it, and undoing one is
 * one click on the thing itself rather than a trip through the panel. The
 * count line below is the other half of that honesty and never folds away
 * while the counts are known.
 *
 * The Filter button still carries the lit-chip count out — a badge for the
 * eye, and the same number in the accessible name for anyone not reading
 * badges — because the chip row says WHICH filters are on but a folded panel
 * still needs its "how much is switched on" answer at the trigger itself.
 */
export function FilterBar({
  filters,
  onChange,
  visibleCount,
  totalCount,
  groupMode,
  onGroupModeChange,
  mapOpen = false,
  onToggleMap,
  selectMode = false,
  onSelectModeChange,
  countKnown = true,
}: FilterBarProps) {
  // The hook, not a prop: this bar reaches for its capability the way it
  // reaches for the toast — from the tree — and outside a trip the context
  // hands back the editable default. See `IdeaRow` for the components that
  // take the prop instead, and why.
  const canEdit = useCanEdit();
  const active = activeFilters(filters);

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstChipRef = useRef<HTMLButtonElement>(null);
  const whatLabelId = useId();
  const stateLabelId = useId();

  // Opening moves focus into the popover so a keyboard reaches the chips
  // without tabbing past the trigger, and Escape hands it straight back. A
  // document listener rather than a full-screen invisible catcher element,
  // because a catcher swallows the first click anywhere on the page, and
  // dismissing a filter panel should not also cost you the click you were
  // making. Same pair of listeners as IdeaActionsMenu.
  useEffect(() => {
    if (!open) return;
    firstChipRef.current?.focus();
    function onDocPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
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

  return (
    <div className={styles.bar}>
      <div className={styles.controlRow}>
        {/* Only while the map is down. Once it is up, the pane's own header
            carries "Hide map", and a live toggle here too would be the same
            switch in two places, free to disagree about what it looks like. */}
        {!mapOpen && onToggleMap && (
          <button type="button" className={styles.toggleButton} onClick={onToggleMap}>
            <span className={styles.dot} aria-hidden="true" />
            Show map
          </button>
        )}

        <input
          type="search"
          className={styles.search}
          placeholder="Search ideas"
          aria-label="Search ideas"
          value={filters.text}
          onChange={(event) => onChange({ ...filters, text: event.target.value })}
        />

        <div className={styles.filterWrap}>
          <button
            type="button"
            ref={triggerRef}
            className={active.length > 0 ? `${styles.toggleButton} ${styles.toggleButtonOn}` : styles.toggleButton}
            aria-haspopup="true"
            aria-expanded={open}
            // The badge is the fast visual answer, but it is a small number in
            // a coloured pill — colour and shape are the whole of it. The
            // accessible name says the same thing in words so the state is not
            // badge-only, and the badge itself is hidden to avoid announcing
            // the digit twice.
            aria-label={active.length > 0 ? `Filter (${active.length} active)` : 'Filter'}
            onClick={() => setOpen((value) => !value)}
          >
            Filter
            {active.length > 0 && (
              <span className={styles.count} aria-hidden="true">
                {active.length}
              </span>
            )}
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
          </button>

          {/* Closing on a chip click would make setting two filters take two
              trips through the button, so the panel stays open until you
              dismiss it. The list behind it updates live, which is the whole
              reason to leave it open: you can see what each chip did. */}
          {open && (
            <div className={styles.popover} ref={popoverRef} role="group" aria-label="Filter ideas">
              <div className={styles.section}>
                <p className={styles.label} id={whatLabelId}>
                  What
                </p>
                {/* Any number of these can be lit at once, and the list shows
                    ideas in ANY of them — each chip is an independent on/off,
                    so "food or places" is two clicks with nothing thrown away
                    in between. `Chip` renders a real button with
                    `aria-pressed`, the right announcement for a multi-select
                    set. */}
                <div className={styles.chips} role="group" aria-labelledby={whatLabelId}>
                  {CATEGORY_ORDER.map((category, index) => (
                    <Chip
                      key={category}
                      ref={index === 0 ? firstChipRef : undefined}
                      selected={filters.categories.includes(category)}
                      onClick={() =>
                        onChange({ ...filters, categories: toggleCategory(filters.categories, category) })
                      }
                    >
                      {CATEGORY_LABELS[category]}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Same chip language, their own label, because "What" belongs
                  to the categories above and these narrow by state. */}
              <div className={styles.section}>
                <p className={styles.label} id={stateLabelId}>
                  State
                </p>
                <div className={styles.chips} role="group" aria-labelledby={stateLabelId}>
                  <Chip
                    selected={filters.hasLocation}
                    onClick={() => onChange({ ...filters, hasLocation: !filters.hasLocation })}
                  >
                    Has location
                  </Chip>
                  <Chip
                    selected={filters.scheduleState === 'scheduled'}
                    onClick={() =>
                      onChange({
                        ...filters,
                        scheduleState: filters.scheduleState === 'scheduled' ? 'all' : 'scheduled',
                      })
                    }
                  >
                    Scheduled
                  </Chip>
                  <Chip
                    selected={filters.scheduleState === 'potential'}
                    onClick={() =>
                      onChange({
                        ...filters,
                        scheduleState: filters.scheduleState === 'potential' ? 'all' : 'potential',
                      })
                    }
                  >
                    Potential
                  </Chip>
                </div>
              </div>
            </div>
          )}
        </div>

        {/*
          Every grouping is one click from every other — a segmented control
          shows all three states at once, so none of them is a dead end
          (screens.md: every narrowing carries its own way out, and grouping
          is no different). It reuses the app's own TabBar rather than
          dressing up three buttons: the arrow-key handling comes with it, and
          there is one copy of that behaviour rather than two.
        */}
        <div className={styles.groupControl}>
          <TabBar
            aria-label="Group ideas"
            variant="compact"
            tabs={GROUP_MODES}
            activeKey={groupMode}
            onChange={(key) => onGroupModeChange(key as GroupMode)}
          />
        </div>
      </div>

      {/* The lit filters, out from behind the button. Each chip is its own
          undo; the sentence is the promise every narrowing on this board
          makes. Search text is not echoed here — it is already on screen in
          the box that holds it. */}
      {active.length > 0 && (
        <div className={styles.activeRow}>
          <div className={styles.activeChips} role="group" aria-label="Active filters">
            {active.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={styles.activeChip}
                aria-label={`Remove ${filter.label} filter`}
                onClick={() => onChange(filter.cleared)}
              >
                {filter.label}
                <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
          <p className={styles.activeNote}>Filtered, not gone — clear a chip to widen again.</p>
        </div>
      )}

      {/* One line, two ends: what you are looking at, and the mode you are
          looking at it in. "Select several" belongs here rather than up on the
          control row because it acts on the rows below it, not on which rows
          there are. */}
      <div className={styles.summaryRow}>
        {/* No count line while the counts aren't known — see countKnown. An
            empty spacer keeps the row's shape (space-between would otherwise
            slide the select toggle across), so nothing jumps when the numbers
            arrive. */}
        {countKnown ? (
          <p className={styles.summary}>
            Showing {visibleCount} of {totalCount}
          </p>
        ) : (
          <p className={styles.summary} aria-hidden="true" />
        )}

        {/* No aria-pressed: the label itself is the state. A control that says
            "Done selecting" AND reports itself as pressed announces the same
            fact twice, and the second telling reads backwards. */}
        {/* Select mode exists to feed BulkBar, and every verb on that bar is an
            edit — for a viewer the mode would lead to a bar with nothing on
            it, so the way in goes too. The filters, the grouping and the map
            toggle all stay: they decide what is on screen, which is the whole
            of what reading along is. */}
        {onSelectModeChange && canEdit && (
          <button
            type="button"
            className={selectMode ? `${styles.toggleButton} ${styles.toggleButtonOn}` : styles.toggleButton}
            onClick={() => onSelectModeChange(!selectMode)}
          >
            {selectMode ? 'Done selecting' : 'Select several'}
          </button>
        )}
      </div>
    </div>
  );
}
