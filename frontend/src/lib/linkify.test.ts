import { describe, expect, it } from 'vitest';
import { linkifyText, truncateUrl } from './linkify';

/** The invariant the whole feature rests on, as a helper so every case can assert it. */
function rejoin(input: string): string {
  return linkifyText(input)
    .map((segment) => segment.text)
    .join('');
}

const links = (input: string) => linkifyText(input).filter((s) => s.kind === 'link');

describe('linkifyText', () => {
  it('returns nothing for an empty string', () => {
    expect(linkifyText('')).toEqual([]);
  });

  it('returns one text segment when there is no URL', () => {
    expect(linkifyText('book the ferry first')).toEqual([
      { kind: 'text', text: 'book the ferry first' },
    ]);
  });

  it('splits a URL out of the prose around it', () => {
    expect(linkifyText('see https://wend.app/trips for the list')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://wend.app/trips', href: 'https://wend.app/trips' },
      { kind: 'text', text: ' for the list' },
    ]);
  });

  it('matches http as well as https', () => {
    expect(links('http://example.com')).toEqual([
      { kind: 'link', text: 'http://example.com', href: 'http://example.com' },
    ]);
  });

  it('keeps a bare www URL as typed and adds the scheme only to the href', () => {
    expect(links('www.example.com/a')).toEqual([
      { kind: 'link', text: 'www.example.com/a', href: 'https://www.example.com/a' },
    ]);
  });

  it('finds several URLs in one string', () => {
    expect(links('a https://one.com b www.two.com c').map((s) => s.text)).toEqual([
      'https://one.com',
      'www.two.com',
    ]);
  });

  it('is case-insensitive about the scheme', () => {
    expect(links('HTTPS://Example.COM')).toHaveLength(1);
  });

  describe('what stays plain text', () => {
    it.each([
      ['a bare domain', 'go to example.com today'],
      ['a bare domain with a path', 'example.com/trips'],
      ['an email address', 'write to ana@example.com'],
      ['a mailto link', 'mailto:ana@example.com'],
      ['an email at a www host', 'ana@www.example.com'],
      ['a javascript scheme', 'javascript:alert(1)'],
      ['a data scheme', 'data:text/html,<script>alert(1)</script>'],
      ['a file scheme', 'file:///Users/ana/notes.txt'],
      ['a lone www.', 'the www. prefix is optional'],
      ['a scheme with nothing after it', 'https:// and then nothing'],
    ])('%s', (_name, input) => {
      expect(links(input)).toEqual([]);
      expect(linkifyText(input)).toEqual([{ kind: 'text', text: input }]);
    });

    it('does not rescue a URL glued behind another scheme', () => {
      expect(links('javascript:https://evil.example')).toEqual([]);
    });
  });

  describe('trailing punctuation', () => {
    it.each(['.', ',', '!', '?', ':', ';', "'", '"', '>', ']'])(
      'leaves a trailing %s outside the link',
      (mark) => {
        expect(links(`see https://example.com/a${mark}`)[0]?.text).toBe('https://example.com/a');
      },
    );

    it('strips a run of trailing punctuation', () => {
      expect(links('really?! https://example.com/a?!')[0]?.text).toBe('https://example.com/a');
    });

    it('drops a closing paren that nothing inside the URL opened', () => {
      expect(links('(see https://example.com/a)')[0]?.text).toBe('https://example.com/a');
    });

    it('keeps a closing paren that the URL itself opened', () => {
      const input = 'https://en.wikipedia.org/wiki/Fjord_(landform)';
      expect(links(input)[0]?.text).toBe(input);
    });

    it("keeps the URL's own paren but drops the wrapping one", () => {
      expect(links('(https://en.wikipedia.org/wiki/Fjord_(landform))')[0]?.text).toBe(
        'https://en.wikipedia.org/wiki/Fjord_(landform)',
      );
    });

    it('unwraps a URL written in angle brackets', () => {
      expect(links('<https://example.com/a>')[0]?.text).toBe('https://example.com/a');
    });

    it('does not strip punctuation from the middle of a URL', () => {
      const input = 'https://example.com/a?q=1&b=2#top';
      expect(links(input)[0]?.text).toBe(input);
    });
  });

  describe('the round-trip invariant', () => {
    it.each([
      '',
      'no url here',
      'https://example.com',
      'see https://example.com.',
      'a https://one.com b www.two.com c',
      'ana@example.com and www.example.com',
      '(https://example.com/a) — <https://example.com/b>',
      'https://example.com/a\nwww.example.com/b\n',
      '  leading and trailing spaces  ',
      'emoji 🚡 and https://example.com/🚡 together',
      'javascript:alert(1) https://ok.example',
    ])('rejoins %j byte for byte', (input) => {
      expect(rejoin(input)).toBe(input);
    });
  });

  it('never emits an href outside http(s)', () => {
    const inputs = [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'mailto:a@b.com',
      'https://ok.example',
      'www.ok.example',
      'HTTP://ok.example',
    ];
    for (const input of inputs) {
      for (const link of links(input)) {
        expect(link.href).toMatch(/^https?:\/\//i);
      }
    }
  });

  it('does not throw on hostile or malformed input', () => {
    const inputs = [
      '(((',
      'https://',
      'www.',
      '://',
      'https://a'.repeat(500),
      '<script>alert(1)</script>',
      '\u0000\uFFFD',
      null as unknown as string,
      undefined as unknown as string,
    ];
    for (const input of inputs) {
      expect(() => linkifyText(input)).not.toThrow();
    }
  });

  it('starts clean on every call despite the shared global regex', () => {
    const input = 'https://example.com/a';
    expect(linkifyText(input)).toEqual(linkifyText(input));
  });
});

describe('truncateUrl', () => {
  it('returns a short URL unchanged', () => {
    expect(truncateUrl('https://example.com')).toBe('https://example.com');
  });

  it('returns a URL of exactly the maximum unchanged', () => {
    const url = 'x'.repeat(48);
    expect(truncateUrl(url)).toBe(url);
  });

  it('middle-truncates past the maximum, to exactly the maximum', () => {
    const url = `https://example.com/${'a'.repeat(80)}/end`;
    const short = truncateUrl(url);
    expect(short).toHaveLength(48);
    expect(short).toContain('…');
    expect(short.startsWith('https://exam')).toBe(true);
    expect(short.endsWith('/end')).toBe(true);
  });

  it('honours a custom maximum', () => {
    expect(truncateUrl('https://example.com/a/very/long/path', 12)).toHaveLength(12);
  });

  it('leaves the URL whole when the budget is too small to say anything', () => {
    const url = 'https://example.com/a';
    expect(truncateUrl(url, 2)).toBe(url);
  });
});
