import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';
import { Stack, Row } from './Stack';

describe('Card', () => {
  it('renders children with the 16px default padding token', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toHaveStyle({ padding: 'var(--space-4)' });
  });

  it('accepts a padding token from the 4px scale', () => {
    render(<Card padding={8}>content</Card>);
    expect(screen.getByText('content')).toHaveStyle({ padding: 'var(--space-8)' });
  });
});

describe('Stack and Row', () => {
  it('Stack lays out children in a column with a 4px-scale gap', () => {
    render(
      <Stack gap={2} data-testid="stack">
        <span>a</span>
      </Stack>,
    );
    expect(screen.getByTestId('stack')).toHaveStyle({ flexDirection: 'column', gap: 'var(--space-2)' });
  });

  it('Row lays out children in a row', () => {
    render(
      <Row gap={2} data-testid="row">
        <span>a</span>
      </Row>,
    );
    expect(screen.getByTestId('row')).toHaveStyle({ flexDirection: 'row', gap: 'var(--space-2)' });
  });
});
