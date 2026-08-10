/**
 * Turning a picked DOM node into something a human can act on later.
 *
 * The hard constraint: CSS Modules hash every class name at build time
 * (`.chip` becomes `._chip_1x2y3`), so a selector built from class names is
 * worthless the moment the app is rebuilt — it would point at nothing by the
 * time anyone reads the feedback. So class names are never used. The selector
 * is built from stable anchors only, in descending order of durability:
 *
 *   1. `id`            — authored, survives rebuilds
 *   2. `data-testid`   — authored, and this app already uses it for tests
 *   3. `tag:nth-child` — positional, brittle under reordering but never wrong
 *                        about the shape of the tree at capture time
 *
 * The selector is a debugging aid, not a contract. `classes` is the second
 * reference sent alongside it: the raw class attribute, which under Vite reads
 * `_chip_7ilc4_44` — the authored name (`.chip`) survives the hash, so whoever
 * reads the report can grep `*.module.css` for it. It is not a *selector* (the
 * hash moves whenever the stylesheet changes), it is a breadcrumb.
 *
 * `label` — the human name of the thing, "the 'Set aside' button" — is computed
 * for the ON-SCREEN affordance only and is deliberately never persisted. It is
 * read from the page's own text, so it can contain whatever the user typed
 * (a trip name, a note, the contents of an input). A report should carry what
 * the user chose to write in the message box and nothing else they wrote
 * elsewhere. `FeedbackComposer` therefore builds its payload field by field
 * rather than spreading a capture; `FeedbackButton.test.tsx` guards it.
 */

/** Depth cap: a path longer than this is noise, not a locator. */
const MAX_DEPTH = 5;

/** Labels longer than this get elided — the message field carries the detail. */
export const MAX_LABEL_LENGTH = 80;

/** A class attribute longer than this is a utility-class pile-up, not a clue. */
export const MAX_CLASSES_LENGTH = 200;

export interface ElementCapture {
  selector: string;
  /** The element's raw class attribute. Sent to the server. */
  classes: string;
  /**
   * Display only — NEVER put this in a request body. It is page text, so it
   * can hold something the user typed. See the note at the top of this file.
   */
  label: string;
}

function isIdentifier(value: string): boolean {
  // Conservative: only unescaped, non-numeric-leading identifiers go in raw.
  return /^[A-Za-z][\w-]*$/.test(value);
}

/** One path segment for `element`, preferring stable anchors over position. */
function segmentFor(element: Element): { text: string; unique: boolean } {
  const tag = element.tagName.toLowerCase();

  const id = element.getAttribute('id');
  if (id && isIdentifier(id)) return { text: `#${id}`, unique: true };

  const testId = element.getAttribute('data-testid');
  if (testId) return { text: `${tag}[data-testid="${cssEscapeQuotes(testId)}"]`, unique: true };

  const parent = element.parentElement;
  if (!parent) return { text: tag, unique: false };

  // nth-child is 1-based and counts element siblings of any tag.
  const index = Array.prototype.indexOf.call(parent.children, element) + 1;
  return { text: `${tag}:nth-child(${index})`, unique: false };
}

function cssEscapeQuotes(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/**
 * A selector path from `element` upward, stopping early at the first anchor
 * that is unique on its own (an id makes every ancestor redundant).
 */
export function selectorFor(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement && parts.length < MAX_DEPTH) {
    if (current.tagName.toLowerCase() === 'body') break;

    const segment = segmentFor(current);
    parts.unshift(segment.text);
    if (segment.unique) break;

    current = current.parentElement;
  }

  return parts.join(' > ');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string): string {
  if (value.length <= MAX_LABEL_LENGTH) return value;
  return `${value.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}

/**
 * The human name for a node. Accessible names win over visible text, because
 * an icon-only button's `aria-label` is the only thing that describes it —
 * its text content is empty.
 */
export function labelFor(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && collapseWhitespace(ariaLabel)) return truncate(collapseWhitespace(ariaLabel));

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder && collapseWhitespace(placeholder)) {
      return truncate(collapseWhitespace(placeholder));
    }
  }

  if (element instanceof HTMLImageElement) {
    const alt = element.getAttribute('alt');
    if (alt && collapseWhitespace(alt)) return truncate(collapseWhitespace(alt));
  }

  const text = collapseWhitespace(element.textContent ?? '');
  if (text) return truncate(text);

  // Nothing nameable — fall back to the shape of the thing.
  return `<${element.tagName.toLowerCase()}>`;
}

/**
 * The element's class attribute, verbatim bar whitespace tidying.
 *
 * Read via `getAttribute` rather than `.className`, because on an SVG node
 * `className` is an `SVGAnimatedString`, not a string — and this app draws
 * icons as inline SVG, so pointing at one is entirely likely.
 */
export function classesFor(element: Element): string {
  const raw = collapseWhitespace(element.getAttribute('class') ?? '');
  if (raw.length <= MAX_CLASSES_LENGTH) return raw;
  return `${raw.slice(0, MAX_CLASSES_LENGTH - 1).trimEnd()}…`;
}

export function describeElement(element: Element): ElementCapture {
  return {
    selector: selectorFor(element),
    classes: classesFor(element),
    label: labelFor(element),
  };
}
