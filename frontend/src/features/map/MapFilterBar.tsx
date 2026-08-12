import { Chip } from '../../design/components/core/Chip';
import { Row } from '../../components/layout/Stack';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../board/filters';
import { EMPTY_MAP_FILTERS, isMapFiltersNarrowed } from './mapFilters';
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
            selected={filters.category === category}
            onClick={() => onChange({ ...filters, category: filters.category === category ? null : category })}
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
