import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Entry } from '../../api/types';
import { Chip } from '../../design/components/core/Chip';
import { TabBar } from '../../components/TabBar';
import { CATEGORY_LABELS, CATEGORY_ORDER, GROUP_MODES } from '../board/filters';
import { toggleMapCategory } from './mapFilters';
import type { MapFilters } from './mapFilters';
import type { MapGroupMode } from './mapScreen';
import { PlansDropdown } from './PlansDropdown';
import styles from './MapFilterBar.module.css';

export interface MapFilterBarProps {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
  /** The trip's plans, and their members, for the Plans dropdown on this row. */
  bundles: Entry[];
  members: Map<number, Entry[]>;
  /** Picking a plan is a narrowing like any other — see the doc comment. */
  onSelectPlan: (id: number | null) => void;
  groupMode: MapGroupMode;
  onGroupModeChange: (mode: MapGroupMode) => void;
  /** Whether the viewport is allowed to cut the list. */
  followOn: boolean;
  onFollowChange: (following: boolean) => void;
}

/** One active narrowing, as the removable chips under the row draw it. */
interface ActiveMapFilter {
  key: string;
  label: string;
  /** The filters with this one narrowing lifted and everything else kept. */
  cleared: MapFilters;
}

/**
 * The narrowings that live behind the Filter button, flattened for the chip row
 * under the bar. Same shape as the board's, and the same two deliberate
 * omissions:
 *
 *  - Search text is not a chip. It is already visible in the box that holds it,
 *    and a chip repeating what a live input says would be two controls fighting
 *    over one piece of state.
 *  - The picked plan is not a chip either, for exactly that reason: the Plans
 *    trigger beside it already reads the plan's own title, and clearing it is
 *    one click on the row that is lit inside the dropdown. A second, disagreeing
 *    way to say "you are looking at Tuesday south" is one too many.
 *
 * Each chip carries the filters-with-itself-removed, so removal is a plain
 * onChange with no arithmetic at the click site.
 */
function activeFilters(filters: MapFilters): ActiveMapFilter[] {
  const active: ActiveMapFilter[] = filters.categories.map((category) => ({
    key: `category-${category}`,
    label: CATEGORY_LABELS[category],
    cleared: toggleMapCategory(filters, category),
  }));
  if (filters.scheduleState === 'scheduled') {
    active.push({ key: 'scheduled', label: 'Scheduled', cleared: { ...filters, scheduleState: 'all' } });
  }
  if (filters.scheduleState === 'potential') {
    active.push({ key: 'potential', label: 'Potential', cleared: { ...filters, scheduleState: 'all' } });
  }
  return active;
}

/**
 * The map screen's control row — the board's FilterBar's sibling, not its copy.
 *
 * The two screens now read the same way round, because a reader who has learnt
 * the board should not have to learn a second grammar one tab across: plans,
 * then the search box in the flexible middle, then Filter with its count badge,
 * then the follow pill, then the grouping segments. Beneath it, the lit filters
 * as removable "NAME ✕" chips with the promise that nothing is gone.
 *
 * It is a sibling rather than a shared component because the two bars narrow
 * different worlds. The board's `IdeaFilters` carries `hasLocation`, which on
 * this screen would be a chip that can never do anything — every row here is
 * located by definition. And this bar carries two controls the board has no use
 * for: the plans dropdown, and the follow switch that decides whether the
 * viewport may cut the list at all. Forking the vocabulary (the classes, the
 * chevron, the badge-plus-aria-label, the popover's focus and Escape contract)
 * while keeping each bar's own nouns is the honest split; one component with
 * six optional props pretending to be both would not be.
 *
 * The category and schedule chips sit BEHIND the Filter button here, where the
 * board keeps its own. They used to be inline, on the argument that a map's
 * chips answer "what am I looking at" and should not cost a click — but that
 * was written when this row held four things. It now holds the plans dropdown,
 * search, follow and grouping too, and a dozen inline chips under all of that
 * pushed the map itself down the page. The active ones are still on the surface
 * as their own undo, which is the half that actually needed to be visible.
 *
 * The faint-dot sentence went into the popover with them. It explains what the
 * chips do, so it belongs where the chips are — and it must not be deleted,
 * because it is this screen's promise that filtering is a way of READING the
 * map, never an edit to the board.
 */
export function MapFilterBar({
  filters,
  onChange,
  bundles,
  members,
  onSelectPlan,
  groupMode,
  onGroupModeChange,
  followOn,
  onFollowChange,
}: MapFilterBarProps) {
  const active = activeFilters(filters);

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstChipRef = useRef<HTMLButtonElement>(null);
  const whatLabelId = useId();
  const stateLabelId = useId();

  // The board's pair of listeners, verbatim in behaviour: opening moves focus
  // into the panel so a keyboard reaches the chips without tabbing past the
  // trigger, Escape hands it straight back, and a click outside dismisses. A
  // document listener rather than a full-screen catcher element, because a
  // catcher swallows the first click anywhere on the page — and on this screen
  // that click is very often one aimed at the map.
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
        <PlansDropdown
          bundles={bundles}
          members={members}
          selectedId={filters.planId}
          onSelect={onSelectPlan}
        />

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
            // The badge is the fast visual answer, but it is a small number in a
            // coloured pill — colour and shape are the whole of it. The
            // accessible name says the same thing in words so the state is not
            // badge-only, and the badge itself is hidden to avoid announcing the
            // digit twice.
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
              trips through the button, so the panel stays open until you dismiss
              it. The map behind it redraws live, which is the whole reason to
              leave it open: you can watch what each chip did to the pins. */}
          {open && (
            <div className={styles.popover} ref={popoverRef} role="group" aria-label="Filter ideas">
              <div className={styles.section}>
                <p className={styles.label} id={whatLabelId}>
                  What
                </p>
                {/* Any number of these can be lit at once, and the map shows the
                    union of them — each chip is an independent on/off, so "food
                    or places" is two clicks with nothing thrown away in between.
                    `Chip` renders a real button with `aria-pressed`, the right
                    announcement for a multi-select set. */}
                <div className={styles.chips} role="group" aria-labelledby={whatLabelId}>
                  {CATEGORY_ORDER.map((category, index) => (
                    <Chip
                      key={category}
                      ref={index === 0 ? firstChipRef : undefined}
                      selected={filters.categories.includes(category)}
                      onClick={() => onChange(toggleMapCategory(filters, category))}
                    >
                      {CATEGORY_LABELS[category]}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Same chip language, their own label, because "What" belongs to
                  the categories above and these narrow by state. Mutually
                  exclusive: an idea is either on a day or still a maybe, and
                  both lit is exactly "all", which clicking the lit one spells. */}
              <div className={styles.section}>
                <p className={styles.label} id={stateLabelId}>
                  State
                </p>
                <div className={styles.chips} role="group" aria-labelledby={stateLabelId}>
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

              {/* Said out loud beside the chips that cause it, because a faint
                  dot is easy to read as a bug. */}
              <p className={styles.note}>Filtered ideas keep a faint dot on the map. Nothing leaves your board.</p>
            </div>
          )}
        </div>

        {/* aria-pressed carries the state; toggling only changes what the list
            listens to — it NEVER moves the map, which is what makes turning it
            off feel safe. It lives on this row rather than over by the list
            because it is a control on the same footing as Filter: both decide
            which ideas the column beside the map is showing. */}
        <button
          type="button"
          className={styles.follow}
          aria-pressed={followOn}
          onClick={() => onFollowChange(!followOn)}
        >
          <span aria-hidden="true">◍</span> follow map
        </button>

        {/* The same segmented control the board groups with, so the two screens
            stack ideas the same way and by the same gesture. It reuses TabBar
            rather than a loose row of chips: the arrow-key contract comes with
            it, and a chip row would have said "several of these at once", which
            grouping is not. */}
        <div className={styles.groupControl}>
          <TabBar
            aria-label="Group ideas"
            variant="compact"
            tabs={GROUP_MODES}
            activeKey={groupMode}
            onChange={(key) => onGroupModeChange(key as MapGroupMode)}
          />
        </div>
      </div>

      {/* The lit filters, out from behind the button. Each chip is its own undo;
          the sentence is the promise every narrowing on this screen makes. */}
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
    </div>
  );
}
