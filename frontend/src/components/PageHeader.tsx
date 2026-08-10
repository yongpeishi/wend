import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  description?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

/** Section heading for a route: title, optional back button and description, actions right-aligned. */
export function PageHeader({ title, description, onBack, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {onBack && (
          <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
