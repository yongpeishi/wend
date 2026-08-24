import type { ReactNode } from 'react';
import styles from './PageTitle.module.css';

export interface PageTitleProps {
  /** The screen's own name — "Itinerary", "Ideas". Matches its sidebar tab. */
  children: ReactNode;
  /** Passed through for the id an aria-labelledby elsewhere points at. */
  id?: string;
}

/**
 * A trip screen's own name, drawn the same way on every one of them.
 *
 * It is an `<h2>` on purpose and takes no level prop: TripLayout above prints
 * the trip's title as the page's one `<h1>`, so a screen's name is always a
 * section heading under it, and letting a caller pick the level is how five
 * screens end up disagreeing about the outline again.
 *
 * The point of the component is that PageTitle.module.css is the ONLY place the
 * page-title type lives. It exists because it had drifted: the itinerary drew
 * the settled style, the final schedule drew a --text-title-size heading, and
 * the map and the checklist drew no title at all — three answers to a question
 * that should only have one. Adding a screen means calling this; restyling
 * every page title means editing one rule.
 */
export function PageTitle({ children, id }: PageTitleProps) {
  return (
    <h2 className={styles.title} id={id}>
      {children}
    </h2>
  );
}
