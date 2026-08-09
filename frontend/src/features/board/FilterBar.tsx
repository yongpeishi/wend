import { Chip } from '../../design/components/core/Chip';
import { Input } from '../../design/components/core/Input';
import { Row } from '../../components/layout/Stack';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER, EMPTY_FILTERS, isNarrowed } from './filters';
import type { IdeaFilters } from './filters';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  filters: IdeaFilters;
  onChange: (filters: IdeaFilters) => void;
  visibleCount: number;
  totalCount: number;
}

/**
 * Filters hide, never delete: the "Showing N of M" line and its "widen again"
 * escape are always rendered, narrowed or not — every narrowing carries its
 * own way out, per screens.md.
 */
export function FilterBar({ filters, onChange, visibleCount, totalCount }: FilterBarProps) {
  const narrowed = isNarrowed(filters);

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
        <Chip selected={filters.hasLocation} onClick={() => onChange({ ...filters, hasLocation: !filters.hasLocation })}>
          Has location
        </Chip>
        <Chip
          selected={filters.scheduleState === 'scheduled'}
          onClick={() =>
            onChange({ ...filters, scheduleState: filters.scheduleState === 'scheduled' ? 'all' : 'scheduled' })
          }
        >
          Scheduled
        </Chip>
        <Chip
          selected={filters.scheduleState === 'potential'}
          onClick={() =>
            onChange({ ...filters, scheduleState: filters.scheduleState === 'potential' ? 'all' : 'potential' })
          }
        >
          Potential
        </Chip>
      </Row>

      <Input
        placeholder="Search ideas"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        aria-label="Search ideas"
      />

      <p className={styles.summary}>
        Showing {visibleCount} of {totalCount}
        {MIDDOT}
        <button
          type="button"
          className={styles.widen}
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={!narrowed}
        >
          widen again
        </button>
      </p>
    </div>
  );
}
