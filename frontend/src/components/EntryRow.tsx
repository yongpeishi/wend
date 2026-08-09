import { HatchPlaceholder } from './HatchPlaceholder';
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
  className?: string;
}

/**
 * The "Place row" specimen (Wend Design System.dc.html §06), generalised into a
 * real row: hatch thumbnail, title + middot metadata, and a keep toggle whose tap
 * target is 48x48 even though the visible dot is 28px.
 */
export function EntryRow({ title, metadata = [], kept, onToggleKeep, onSelect, className }: EntryRowProps) {
  const metaText = metadata.join(' · ');
  const main = (
    <>
      <HatchPlaceholder size={56} />
      <span className={styles.body}>
        <p className={styles.title}>{title}</p>
        {metaText && <p className={styles.metadata}>{metaText}</p>}
      </span>
    </>
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
      {onToggleKeep && (
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
