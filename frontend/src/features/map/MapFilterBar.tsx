import { Chip } from '../../design/components/core/Chip';
import { Row } from '../../components/layout/Stack';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../board/filters';
import { EMPTY_MAP_FILTERS, isMapFiltersNarrowed, toggleMapCategory } from './mapFilters';
import type { MapFilters } from './mapFilters';
import styles from './MapFilterBar.module.css';

export interface MapFilterBarProps {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
  visibleCount: number;
  totalCount: number;
}

/**
 * Same idiom as the board's FilterBar (src/features/board/FilterBar.tsx):
 * filters hide, never delete, and the "Showing N of M" line is always
 * rendered, with "See all" beside it so every narrowing carries its own way
 * back out. With every pin already on the map there is nothing to widen back
 * to, so the button goes away rather than sitting there greyed out.
 *
 * The category chips are a multi-select: any number can be lit, and the map
 * shows the union of them. Nothing about the row says so in words, and it does
 * not need to — a row of independently pressable toggles is already how a
 * multi-select looks, and it was only the old behaviour (clicking one silently
 * unlit another) that contradicted the appearance. `aria-pressed` comes from
 * Chip, so each chip announces its own on/off state and the row reads as a set
 * of switches rather than a set of radio buttons.
 *
 * The chips stay inline here rather than folding into the board's Filter
 * popover. The board's row was crowding a list you had come to read; the map's
 * sits above a map, where the chips are the only controls and hiding them would
 * cost a click to answer "what am I looking at" — the very question a map is
 * for.
 */
export function MapFilterBar({ filters, onChange, visibleCount, totalCount }: MapFilterBarProps) {
  const narrowed = isMapFiltersNarrowed(filters);

  return (
    <div className={styles.bar}>
      <Row wrap gap={2}>
        <Chip
          selected={filters.scheduleState === 'scheduled'}
          onClick={() => onChange({ ...filters, scheduleState: filters.scheduleState === 'scheduled' ? 'all' : 'scheduled' })}
        >
          Scheduled
        </Chip>
        <Chip
          selected={filters.scheduleState === 'potential'}
          onClick={() => onChange({ ...filters, scheduleState: filters.scheduleState === 'potential' ? 'all' : 'potential' })}
        >
          Potential
        </Chip>
        {CATEGORY_ORDER.map((category) => (
          <Chip
            key={category}
            selected={filters.categories.includes(category)}
            onClick={() => onChange(toggleMapCategory(filters, category))}
          >
            {CATEGORY_LABELS[category]}
          </Chip>
        ))}
      </Row>

      <p className={styles.summary}>
        Showing {visibleCount} of {totalCount}
        {narrowed && (
          <>
            {MIDDOT}
            <button type="button" className={styles.widen} onClick={() => onChange(EMPTY_MAP_FILTERS)}>
              See all
            </button>
          </>
        )}
      </p>
    </div>
  );
}
