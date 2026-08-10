import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../design/components/core/Button';

export function NotFound() {
  return (
    <div style={{ padding: 'var(--gutter-screen)' }}>
      <EmptyState
        message="There's nothing down this path. It might have wandered off, or never existed."
        action={
          <Link to="/">
            <Button variant="secondary">Back to your trips</Button>
          </Link>
        }
      />
    </div>
  );
}
