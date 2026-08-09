import { Link, Outlet } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useAuth } from '../auth/AuthContext';
import { FeedbackButton } from '../features/feedback/FeedbackButton';
import styles from './AppLayout.module.css';

/** Shell for every authenticated route: a slim top bar, then the route's own content. */
export function AppLayout() {
  const { signOut } = useAuth();

  return (
    <div>
      <header className={styles.topBar}>
        <Link to="/" className={styles.brandLink}>
          <Logo size={32} />
        </Link>
        <button type="button" className={styles.signOut} onClick={() => signOut()}>
          Sign out
        </button>
      </header>
      <Outlet />
      {/* Inside the authenticated shell so feedback always has an author, and
          outside <Outlet> so it survives route changes. */}
      <FeedbackButton />
    </div>
  );
}
