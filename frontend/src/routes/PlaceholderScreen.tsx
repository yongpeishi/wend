import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

export interface PlaceholderScreenProps {
  title: string;
  description: string;
  message: string;
}

/**
 * Structural stand-in for a P0/P1 route. The next agent (Phase 3/4) replaces
 * the body with the real screen — the route, header and shell stay the same.
 */
export function PlaceholderScreen({ title, description, message }: PlaceholderScreenProps) {
  return (
    <div style={{ padding: 'var(--gutter-screen)' }}>
      <PageHeader title={title} description={description} />
      <EmptyState message={message} />
    </div>
  );
}
