import styles from './EntryRow.module.css';

export interface EntryRowProps {
  title: string;
  /** Rendered joined by middots, e.g. ["Temple", "east", "40 min"] -> "Temple · east · 40 min". */
  metadata?: string[];
  /** Filled circle = kept. Empty ring = still open. Never struck through. */
  kept: boolean;
  onToggleKeep?: (nextKept: boolean) => void;
  /** Opens the entry detail. Omit to render a non-interactive row (e.g. inside a picker). */
  onSelect?: () => void;
  /**
   * May you change the thing this row stands for? A prop rather than
   * `useCanEdit()` because the row already takes its verbs as callbacks — the
   * capability arrives beside the action it governs. Defaults to true, matching
   * a null role. Only the keep toggle answers to it: opening the entry is
   * reading, and reading is what a viewer came for.
   */
  canEdit?: boolean;
  className?: string;
}

/**
 * Generalised from the "Place row" specimen into a real row: title + middot
 * metadata, and a keep toggle whose tap target is 48x48 even though the visible
 * dot is 28px. The specimen itself came from `Wend Design System.dc.html` §06,
 * which no longer exists in the tree (removed with wend-design-v2/ in 730f840);
 * its successor is the `PlaceCard` unit named in the current bundle's
 * `_ds/.../readme.md`, which this export does not ship either.
 */
export function EntryRow({
  title,
  metadata = [],
  kept,
  onToggleKeep,
  onSelect,
  canEdit = true,
  className,
}: EntryRowProps) {
  const metaText = metadata.join(' · ');
  const main = (
    <span className={styles.body}>
      <p className={styles.title}>{title}</p>
      {metaText && <p className={styles.metadata}>{metaText}</p>}
    </span>
  );

  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      {onSelect ? (
        <button type="button" className={styles.mainButton} onClick={onSelect}>
          {main}
        </button>
      ) : (
        <div className={styles.mainButton} style={{ cursor: 'default' }}>
          {main}
        </div>
      )}
      {onToggleKeep && canEdit && (
        <button
          type="button"
          className={styles.keepToggle}
          aria-pressed={kept}
          aria-label={kept ? `Kept: ${title}. Set open.` : `Keep ${title}`}
          onClick={() => onToggleKeep(!kept)}
        >
          <span className={[styles.keepDot, kept ? styles.kept : styles.open].join(' ')} />
        </button>
      )}
    </div>
  );
}
