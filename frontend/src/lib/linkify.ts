/**
 * Finding the URLs inside a string the user typed.
 *
 * Deliberately not a URL parser and not a markdown reader: the product never
 * asked people to mark a link up, so the only job here is to notice the shapes
 * a person actually types — `https://…` and the bare `www.…` everyone still
 * writes — and hand them back alongside the prose, in order, unchanged.
 *
 * The one hard rule the rest of the app leans on: concatenating every
 * segment's `text` reproduces the input byte for byte. That is what lets a
 * caller swap a raw string for <Linkify> and know the reading experience of a
 * URL-less note has not moved a pixel.
 */

export type LinkifySegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * A run that starts with a scheme we trust or with `www.`, and continues to
 * whitespace. `<` ends a candidate because it cannot appear in a URL and is
 * the character a pasted fragment of HTML would butt up against; everything
 * else — closing brackets, sentence punctuation — is left in and trimmed off
 * the tail below, where we can weigh it against what opened inside the URL.
 */
const URL_CANDIDATE = /(?:https?:\/\/|www\.)[^\s<]+/gi;

/**
 * A candidate is only a URL if it starts on its own. Rejecting a match that
 * follows a word character, `@`, `.`, `:` or `/` is what keeps
 * `someone@www.example.com` and `mailto:www.example.com` as plain text: the
 * address as a whole is not something we want to open in a tab, and half of it
 * is worse than none of it.
 */
const GLUED_TO_SOMETHING = /[\w@.:/]/;

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING_NOISE = new Set(['.', ',', '!', '?', ':', ';', "'", '"', '>', ']']);

/** What has to survive the trimming for the run to still be a link. */
const STILL_A_URL = /^(?:https?:\/\/[^\s<]+|www\.[^\s<]+)$/i;

/**
 * Drop the punctuation the writer meant for the sentence, not the address.
 * A closing paren is the interesting case: `(see https://x.com/a)` ends a
 * parenthetical, but `https://en.wikipedia.org/wiki/Foo_(bar)` needs its
 * bracket, so a `)` only leaves if nothing inside the URL opened it.
 */
function trimTrailingPunctuation(candidate: string): string {
  let text = candidate;
  while (text.length > 0) {
    const last = text[text.length - 1] as string;
    if (TRAILING_NOISE.has(last)) {
      text = text.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opened = text.split('(').length - 1;
      const closed = text.split(')').length - 1;
      if (closed > opened) {
        text = text.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return text;
}

/**
 * The navigable form of a run, or null if we would not send anyone there.
 * `www.foo.com` is what people type and what they should keep seeing, so the
 * scheme is added here and only here. The final check is belt and braces: no
 * matter how the regex evolves, an href that is not http(s) never leaves this
 * function — a `javascript:` or `data:` string reaching an anchor's href is
 * the whole risk of linkifying text at all.
 */
function toHref(text: string): string | null {
  const href = /^www\./i.test(text) ? `https://${text}` : text;
  return /^https?:\/\//i.test(href) ? href : null;
}

/** Splits a string into plain-text and URL segments, in order. Never throws. */
export function linkifyText(input: string): LinkifySegment[] {
  if (typeof input !== 'string' || input.length === 0) return [];

  const segments: LinkifySegment[] = [];
  let cursor = 0;

  // A fresh lastIndex per call: the regex is module-level and /g is stateful.
  URL_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_CANDIDATE.exec(input)) !== null) {
    const start = match.index;
    const before = start > 0 ? (input[start - 1] as string) : '';
    const text = before !== '' && GLUED_TO_SOMETHING.test(before)
      ? ''
      : trimTrailingPunctuation(match[0]);
    const href = text !== '' && STILL_A_URL.test(text) ? toHref(text) : null;

    if (href === null) {
      // Not a link after all. Leave the run where it is and let it be swept up
      // by the next text segment rather than closing one off around it.
      continue;
    }

    if (start > cursor) segments.push({ kind: 'text', text: input.slice(cursor, start) });
    segments.push({ kind: 'link', text, href });
    cursor = start + text.length;
    // The trimmed tail is prose again, so resume scanning from there.
    URL_CANDIDATE.lastIndex = cursor;
  }

  if (cursor < input.length) segments.push({ kind: 'text', text: input.slice(cursor) });
  return segments;
}

const ELLIPSIS = '…';

/**
 * Middle-truncates a URL for display: "https://ex…/very-long". Returns text
 * unchanged when short.
 *
 * The middle is what goes because a URL's two ends are the parts a reader uses
 * — the host tells them where they are being sent, the tail tells them which
 * page — while the query string in between is machine noise. The full address
 * is still in the href and in the anchor's title, so nothing is lost.
 */
export function truncateUrl(text: string, max = 48): string {
  if (typeof text !== 'string') return '';
  // Below three characters there is no room for a head, a tail and the mark,
  // and a bare "…" tells the reader nothing; keep the URL whole instead.
  if (max < 3 || text.length <= max) return text;

  const budget = max - ELLIPSIS.length;
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  return `${text.slice(0, head)}${ELLIPSIS}${text.slice(text.length - tail)}`;
}
