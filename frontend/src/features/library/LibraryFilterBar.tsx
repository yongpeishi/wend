import { Chip } from '../../design/components/core/Chip';
import { Input } from '../../design/components/core/Input';
import { Row } from '../../components/layout/Stack';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../board/filters';
import { EMPTY_LIBRARY_FILTERS, isLibraryFiltersNarrowed, toggleLibraryCategory } from './libraryFilters';
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
 *
 * The category chips are a multi-select: light as many as you like and the
 * library shows the union. That matters most on this screen, because the chips
 * are how you sift a pile you are browsing rather than searching, and "food and
 * places" is one thought, not two searches. They are independently pressable
 * toggles carrying `aria-pressed` from Chip, which is what a set of switches
 * looks like — the old one-at-a-time behaviour was the part that read as radio
 * buttons wearing the wrong clothes.
 *
 * Chips and search narrow together (AND): the chips say what kind of thing, the
 * box says what it is called, and asking both is asking for the overlap. Only
 * the chips union among themselves.
 *
 * They stay inline rather than folding into the board's Filter popover: this
 * bar sits above a split list-and-map that the chips are the primary way of
 * driving, and it carries the search box already, so the controls here are the
 * point of the row rather than an occasional visitor to it.
 */
export function LibraryFilterBar({ filters, onChange, visibleCount, totalCount }: LibraryFilterBarProps) {
  const narrowed = isLibraryFiltersNarrowed(filters);

  return (
    <div className={styles.bar}>
      <Row wrap gap={2}>
        {CATEGORY_ORDER.map((category) => (
          <Chip
            key={category}
            selected={filters.categories.includes(category)}
            onClick={() => onChange(toggleLibraryCategory(filters, category))}
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
