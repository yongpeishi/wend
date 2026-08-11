import { Link, NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useAuth } from '../auth/AuthContext';
import { FeedbackButton } from '../features/feedback/FeedbackButton';
import styles from './AppLayout.module.css';

/**
 * Shell for every authenticated route: a fixed 246px sidebar on deep leaf, then
 * the route's own content. The sidebar is sticky full-height on desktop and
 * folds into a horizontal bar on narrow viewports so it never crushes the page.
 */
export function AppLayout() {
  const { signOut } = useAuth();

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Main">
        <div className={styles.brandRow}>
          <Link to="/" className={styles.brandLink}>
            <Logo variant="reversed" size={28} />
          </Link>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Explore</div>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.navItemActive : ''].filter(Boolean).join(' ')
            }
          >
            All trips
          </NavLink>
        </div>

        {/* The design's PLAN block — the current trip with its sub-nav and the
            people planning it — goes here. Out of scope for this pass. */}

        <button type="button" className={styles.signOut} onClick={() => signOut()}>
          Sign out
        </button>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Inside the authenticated shell so feedback always has an author, and
          outside <Outlet> so it survives route changes. */}
      <FeedbackButton />
    </div>
  );
}
