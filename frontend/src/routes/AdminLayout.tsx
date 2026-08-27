import { Link, Navigate, NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import styles from './AdminLayout.module.css';

/**
 * Shell for /admin: AppLayout's sidebar idea, simplified — wordmark with an
 * Admin badge, one nav section, and the pair at the foot. The whole point of a
 * second shell is the recolour: the sidebar is deep plum rather than deep leaf,
 * so you can never mistake a screen that shows everyone's feedback for the app
 * you plan trips in. Desktop-first: below 860px it stacks into a plain bar with
 * the nav under it — no drawer, admin work happens at a desk.
 *
 * The admin guard lives here rather than in a wrapper route because this is the
 * only admin surface there is. ProtectedRoute has already handled "signed out";
 * the two checks before it are kept anyway so this component is safe wherever
 * it is mounted: while the session is still loading it shows the same spinner
 * ProtectedRoute does, and a signed-in non-admin is turned back to the app —
 * silently, because the sidebar never offered them the door they just tried.
 */
export function AdminLayout() {
  const { user, isLoading, signOut, isSigningOut } = useAuth();
  const { show } = useToast();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  if (!user.admin) return <Navigate to="/" replace />;

  // Same treatment as AppLayout: the rejection is caught and said out loud in
  // the place that was clicked, and success needs no navigation of its own —
  // ProtectedRoute redirects the moment `user` goes null.
  const handleSignOut = () => {
    signOut().catch(() => show('Could not sign you out. Check your connection and try again.', 'error'));
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Admin">
        <div className={styles.brandRow}>
          <Link to="/admin" className={styles.brandLink}>
            <Logo variant="reversed" size={28} />
          </Link>
          {/* Not decoration: with the same wordmark at the top of both shells,
              this word plus the plum ground is what says which one you are in. */}
          <span className={styles.badge}>Admin</span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Manage</div>
          <NavLink
            to="/admin/feedback"
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.navItemActive : ''].filter(Boolean).join(' ')
            }
          >
            Feedback
          </NavLink>
        </div>

        {/* The pair at the foot, as in AppLayout — except the first control is
            the way home: the admin area is a place you visit, not where you
            live, and the door back must never need finding. */}
        <div className={styles.utilities}>
          <Link to="/" className={`${styles.utilityButton} ${styles.utilityLink}`}>
            Back to app
          </Link>
          <button
            type="button"
            className={`${styles.utilityButton} ${styles.signOut}`}
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
