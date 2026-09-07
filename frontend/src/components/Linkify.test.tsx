import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Linkify } from './Linkify';

/** Every case renders inside a host <p>, because that is how call sites use it. */
function renderInParagraph(text: string) {
  render(
    <p data-testid="host">
      <Linkify>{text}</Linkify>
    </p>,
  );
  return screen.getByTestId('host');
}

describe('Linkify', () => {
  it('adds no element of its own to text with no URL in it', () => {
    const host = renderInParagraph('book the ferry first');
    expect(host).toHaveTextContent('book the ferry first');
    expect(host.querySelector('*')).toBeNull();
  });

  it('leaves the prose around a link exactly as it was', () => {
    const host = renderInParagraph('see https://wend.app/trips for the list');
    expect(host.textContent).toBe('see https://wend.app/trips for the list');
  });

  it('opens links in a new tab, without handing it a reference back', () => {
    renderInParagraph('see https://wend.app/trips');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://wend.app/trips');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a bare www URL as typed but navigates to the https form', () => {
    renderInParagraph('www.example.com/a');
    const link = screen.getByRole('link', { name: 'www.example.com/a' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/a');
  });

  it('renders one anchor per URL', () => {
    renderInParagraph('a https://one.example b www.two.example c');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('does not link an email address', () => {
    renderInParagraph('write to ana@example.com');
    expect(screen.queryByRole('link')).toBeNull();
  });

  describe('long URLs', () => {
    const long = `https://example.com/${'a'.repeat(80)}/end`;

    it('middle-truncates the label and keeps the whole URL in the href and title', () => {
      renderInParagraph(long);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', long);
      expect(link).toHaveAttribute('title', long);
      expect(link.textContent).toHaveLength(48);
      expect(link.textContent).toContain('…');
    });

    it('gives a short URL no title, since it would only repeat the label', () => {
      renderInParagraph('https://wend.app/a');
      expect(screen.getByRole('link')).not.toHaveAttribute('title');
    });
  });

  it('does not fire a surrounding row handler when a link is clicked', async () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <p data-testid="prose">
          <Linkify>book https://wend.app/trips today</Linkify>
        </p>
      </div>,
    );

    await userEvent.click(screen.getByRole('link'));
    expect(onRowClick).not.toHaveBeenCalled();

    // The row itself still responds to a click on its own prose.
    await userEvent.click(screen.getByTestId('prose'));
    expect(onRowClick).toHaveBeenCalledOnce();
  });

  describe('pasted markup is text, not markup', () => {
    it('renders a script tag literally', () => {
      const host = renderInParagraph('<script>alert(1)</script>');
      expect(host.textContent).toBe('<script>alert(1)</script>');
      expect(host.querySelector('script')).toBeNull();
      expect(host.innerHTML).not.toContain('<script');
    });

    it('renders an img onerror payload literally', () => {
      const payload = '<img src=x onerror=alert(1)>';
      const host = renderInParagraph(payload);
      expect(host.textContent).toBe(payload);
      expect(host.querySelector('img')).toBeNull();
    });

    it('renders an anchor payload as text rather than a second link', () => {
      const host = renderInParagraph('<a href="javascript:alert(1)">click</a>');
      expect(screen.queryByRole('link')).toBeNull();
      expect(host.textContent).toBe('<a href="javascript:alert(1)">click</a>');
    });
  });

  it('renders an empty string as nothing at all', () => {
    const host = renderInParagraph('');
    expect(host.textContent).toBe('');
    expect(host.childNodes).toHaveLength(0);
  });
});
