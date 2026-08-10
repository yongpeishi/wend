import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { EmptyState } from './components/EmptyState';
import { Button } from './design/components/core/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Root-level crash guard. React error boundaries must be class components. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error', error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 'var(--gutter-screen)' }}>
          <EmptyState
            message="Something went sideways. Slowly is fine — try again."
            action={
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
