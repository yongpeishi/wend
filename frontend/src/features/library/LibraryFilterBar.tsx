import { Chip } from '../../design/components/core/Chip';
import { Input } from '../../design/components/core/Input';
import { Row } from '../../components/layout/Stack';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../board/filters';
import { EMPTY_LIBRARY_FILTERS, isLibraryFiltersNarrowed } from './libraryFilters';
import type { LibraryFilters } from './libraryFilters';
import styles from './LibraryFilterBar.module.css';

export interface LibraryFilterBarProps {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  visibleCount: number;
  totalCount: number;
}

/**
 * Same idiom as the board's and map's filter bars: filters hide, never
 * delete, the "Showing N of M" line is always rendered, and "See all" appears
 * beside it for as long as something is narrowed. This is one of the three
 * ways screens.md names for selecting library entries — chip filter, map
 * region, or by hand.
 */
export function LibraryFilterBar({ filters, onChange, visibleCount, totalCount }: LibraryFilterBarProps) {
  const narrowed = isLibraryFiltersNarrowed(filters);

  return (
    <div className={styles.bar}>
      <Row wrap gap={2}>
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

      <Input
        placeholder="Search what you've kept"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        aria-label="Search what you've kept"
      />

      <p className={styles.summary}>
        Showing {visibleCount} of {totalCount}
        {narrowed && (
          <>
            {MIDDOT}
            <button type="button" className={styles.widen} onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}>
              See all
            </button>
          </>
        )}
      </p>
    </div>
  );
}
