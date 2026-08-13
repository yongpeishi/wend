import { useEffect, useId, useRef, useState } from 'react';
import { Chip } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import { Switch } from '../../design/components/core/Switch';
import { TabBar } from '../../components/TabBar';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER, EMPTY_FILTERS, GROUP_MODES, isNarrowed, toggleCategory } from './filters';
import type { GroupMode, IdeaFilters } from './filters';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  filters: IdeaFilters;
  onChange: (filters: IdeaFilters) => void;
  /** How many ideas the list is actually showing right now — after the filters AND after the map's viewport. */
  visibleCount: number;
  totalCount: number;
  groupMode: GroupMode;
  onGroupModeChange: (mode: GroupMode) => void;
  /** Omit to leave the "+ New idea" button out and render the controls alone. */
  onNewIdea?: () => void;
  /**
   * The map/list controls. Every one of them is optional, and each is drawn only
   * when its handler is wired: a caller with no map (or no notion of picking
   * several ideas) gets exactly the bar it had before, rather than a row of
   * controls that do nothing.
   */
  mapOpen?: boolean;
  onToggleMap?: () => void;
  followMap?: boolean;
  onFollowMapChange?: (following: boolean) => void;
  selectMode?: boolean;
  onSelectModeChange?: (selecting: boolean) => void;
  /**
   * The map's viewport is currently narrowing the list, so the count line
   * switches to the in-view phrasing. Separate from `mapOffCount > 0` because
   * "following the map, and everything happens to be in it" is a real state and
   * still deserves the in-view words.
   */
  mapNarrowing?: boolean;
  /**
   * How many otherwise-visible ideas the viewport is cutting away. The filtered
   * total is `visibleCount + mapOffCount` rather than a prop of its own: the
   * viewport cut is the only thing standing between the two numbers, so a third
   * count would be a fact this bar could be told twice and get wrong once.
   */
  mapOffCount?: number;
}

/**
 * How many chips are lit — what the badge on the Filter button counts.
 *
 * Deliberately here and not in filters.ts beside `isNarrowed`. The model's
 * question is binary — is this list narrowed, yes or no — and everything that
 * acts on filters (the query, the "See all" hatch) only ever asks that. "Two"
 * is a fact about how many chips are lit, which is a fact about this bar, so it
 * is computed where it is drawn.
 *
 * Each selected category counts on its own, so three lit category chips read
 * as 3 and not as 1. The badge answers "how much of this panel is switched on",
 * which is the question you ask when the panel is folded away — counting the
 * whole category section as one narrowing would let two chips hide behind a
 * number that never moved when you lit the second.
 */
function activeFilterCount(filters: IdeaFilters): number {
  return (
    filters.categories.length + (filters.hasLocation ? 1 : 0) + (filters.scheduleState !== 'all' ? 1 : 0)
  );
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
 * The chips used to be laid out flat across the top of the board: two rows of
 * them, a WHAT row and a STATE row, on screen at all times. That was nine
 * always-visible controls above a list you had come to read, and on a narrow
 * desk they wrapped into a third row and pushed the ideas below the fold. They
 * are also, by their nature, rarely touched — you narrow a list once and then
 * work in it — so the space they held was permanently rented to an occasional
 * job. They now live behind one Filter button, which is a single control that
 * says what it is, and the row they vacated holds the thing that actually
 * belongs at the top of a list of ideas: the button that adds one.
 *
 * Folding them away costs visibility of what is currently on, so the button
 * carries the count back out: a badge for the eye, and the same number in the
 * button's accessible name for anyone who is not reading badges. The count line
 * underneath ("Showing 8 of 21") is the other half of that answer and never
 * folds away.
 *
 * Filters hide, never delete: every narrowing carries its own way out, per
 * screens.md. The "Showing N of M" line is always there, but "See all"
 * appears only while something is narrowed — with the whole list already on
 * screen there is nothing to widen back to, and a permanently greyed-out escape
 * hatch just reads as a broken control. It sits OUTSIDE the popover on purpose:
 * the way out of a narrowing must never be behind the control that caused it.
 * Grouping needs no such escape at all, because it hides nothing: a collapsed
 * section still counts its ideas in its own header.
 *
 * Multi-select raises the stakes on that hatch rather than changing it. A
 * narrowing can now be four lit chips instead of one, so unpicking it by hand
 * is four clicks through a panel you have to open first — "See all" stays the
 * single move that undoes all of it at once, however much is on.
 *
 * Text search was removed here (it lives on the library screen) but the escape
 * hatch stays wired exactly the same: categories, "has location" and
 * scheduled/potential still narrow, and "See all" clears whatever is set.
 *
 * The map controls join the same row rather than starting a strip of their own,
 * because they do the same job the chips do: they decide which ideas are on
 * screen. "Show map" is on the right with "+ New idea" — it changes the shape of
 * the screen, which is a different kind of act from narrowing a list — and
 * "Follow the map" sits with the narrowing controls on the left, behind its own
 * rule, appearing only once there is a map for it to follow. A switch that
 * governs something not on screen is a control with nothing to say.
 *
 * There is exactly ONE count line. The map's viewport is a third narrowing on
 * top of the chips and the grouping, and the honest place to report it is the
 * line that already answers "how much of this am I looking at" — a second line
 * under it would make the reader add two numbers together to find out.
 */
export function FilterBar({
  filters,
  onChange,
  visibleCount,
  totalCount,
  groupMode,
  onGroupModeChange,
  onNewIdea,
  mapOpen = false,
  onToggleMap,
  followMap = true,
  onFollowMapChange,
  selectMode = false,
  onSelectModeChange,
  mapNarrowing = false,
  mapOffCount = 0,
}: FilterBarProps) {
  const narrowed = isNarrowed(filters);
  const activeCount = activeFilterCount(filters);

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstChipRef = useRef<HTMLButtonElement>(null);
  const whatLabelId = useId();
  const stateLabelId = useId();

  // Opening moves focus into the popover so a keyboard reaches the chips
  // without tabbing past the trigger, and Escape hands it straight back. The
  // design has only the outside-click catcher; without the Escape half a
  // keyboard user who opens this has no way to shut it again. Same pair of
  // listeners as IdeaActionsMenu — a document listener rather than a
  // full-screen invisible catcher element, because a catcher swallows the first
  // click anywhere on the page, and dismissing a filter panel should not also
  // cost you the click you were making.
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
        <div className={styles.leftGroup}>
          <div className={styles.filterWrap}>
            <button
              type="button"
              ref={triggerRef}
              className={narrowed ? `${styles.toggleButton} ${styles.toggleButtonOn}` : styles.toggleButton}
              aria-haspopup="true"
              aria-expanded={open}
              // The badge is the fast visual answer, but it is a small number in
              // a coloured pill — colour and shape are the whole of it. The
              // accessible name says the same thing in words so the state is not
              // badge-only, and the badge itself is hidden to avoid announcing
              // the digit twice.
              aria-label={activeCount > 0 ? `Filter (${activeCount} active)` : 'Filter'}
              onClick={() => setOpen((value) => !value)}
            >
              Filter
              {activeCount > 0 && (
                <span className={styles.count} aria-hidden="true">
                  {activeCount}
                </span>
              )}
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
                      ideas in ANY of them. Each chip is its own independent
                      on/off — clicking Place while Food is on adds places to
                      the list rather than swapping the list over to them, so
                      building up "food or places" is two clicks with nothing
                      thrown away in between. `Chip` renders a real button with
                      `aria-pressed`, which is already the right announcement
                      for a multi-select set: each chip reports its own pressed
                      state, so there is no single-choice promise to break. */}
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

          {/* A drawn rule rather than a gap: filtering and grouping are two
              different jobs that happen to share a row, and the eye needs
              something to say so. Decorative, so it is hidden from the
              accessibility tree — the two controls already name themselves. */}
          <span className={styles.divider} aria-hidden="true" />

          {/*
            Every grouping is one click from every other. This used to be a
            two-state toggle — "Group by place" on, off — which made grouping by
            category unreachable once you had grouped by place: the way back led
            only to a flat list. A segmented control shows all three states at
            once, so none of them is a dead end (screens.md: every narrowing
            carries its own way out, and grouping is no different).

            It reuses the app's own TabBar rather than dressing up three buttons —
            the arrow-key handling comes with it, and there is one copy of that
            behaviour rather than two. `compact` is the opt-in variant that fits
            it into a control row; see TabBar.module.css for why it is quieter
            than the trip's own sub-navigation.
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

          {/* Only while there is a map. Off-screen the setting would still be
              true, but it would govern nothing, and a live-looking switch that
              changes nothing is worse than no switch at all. */}
          {mapOpen && onFollowMapChange && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <Switch checked={followMap} onCheckedChange={onFollowMapChange}>
                Follow the map
              </Switch>
            </>
          )}
        </div>

        <div className={styles.rightGroup}>
          {/* Same box as the Filter button beside it — this opens a pane rather
              than doing anything to the data, so it takes the quiet outlined
              shape rather than a Button variant. The dot is decoration: the
              label already says which way the toggle will go, so nothing here
              rests on colour. */}
          {onToggleMap && (
            <button
              type="button"
              className={mapOpen ? `${styles.toggleButton} ${styles.toggleButtonOn}` : styles.toggleButton}
              onClick={onToggleMap}
            >
              <span className={styles.dot} aria-hidden="true" />
              {mapOpen ? 'Hide map' : 'Show map'}
            </button>
          )}

          {/* The one forward action of this screen, at the end of the row that
              controls the list it adds to. It used to sit beside the count line
              below, which put the primary button on the quietest line of the bar. */}
          {onNewIdea && (
            <Button variant="primary" size="small" onClick={onNewIdea}>
              + New idea
            </Button>
          )}
        </div>
      </div>

      {/* One line, two ends: what you are looking at, and the mode you are
          looking at it in. "Select" belongs here rather than up on the control
          row because it acts on the rows below it, not on which rows there are. */}
      <div className={styles.summaryRow}>
        <p className={styles.summary}>
          {mapNarrowing ? (
            <>
              {visibleCount} of {visibleCount + mapOffCount} ideas in view
              {mapOffCount > 0 && `${MIDDOT}${mapOffCount} just off-screen`}
            </>
          ) : (
            <>
              Showing {visibleCount} of {totalCount}
            </>
          )}
          {narrowed && (
            <>
              {MIDDOT}
              <button type="button" className={styles.widen} onClick={() => onChange(EMPTY_FILTERS)}>
                See all
              </button>
            </>
          )}
        </p>

        {/* No aria-pressed on the button below: the label itself is the state,
            exactly as on the map button beside it. A control that says "Done
            selecting" AND reports itself as pressed announces the same fact
            twice, and the second telling is the one that reads backwards. */}
        {onSelectModeChange && (
          <button
            type="button"
            className={selectMode ? `${styles.toggleButton} ${styles.toggleButtonOn}` : styles.toggleButton}
            onClick={() => onSelectModeChange(!selectMode)}
          >
            {selectMode ? 'Done selecting' : 'Select'}
          </button>
        )}
      </div>
    </div>
  );
}
