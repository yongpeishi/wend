import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Guard against `var(--typo)`.

   An unresolved custom property does not fall back to "ignore that one value" —
   it voids the ENTIRE declaration at computed-value time. `padding: var(--space-5)
   var(--space-8) var(--space-12)` with no --space-5 in the scale does not lose one
   side of the padding, it loses all of it, silently, with no console warning. That
   shipped once (TripItinerary's day list rendered flush against the sidebar).

   No component test can see this: jsdom does not compute custom properties, so the
   whole suite stayed green while the page was visibly broken, and it took a manual
   browser pass to find. This file is the only thing standing between a one-character
   typo and a regression that only a human eye can catch. */

// import.meta.dirname, not `new URL('..', import.meta.url)` — vite rewrites the
// latter as an asset reference and it comes back as a non-file URL under vitest.
const SRC = `${resolve(import.meta.dirname, '../..')}/`;
const DECLARED = /(--[\w-]+)\s*:/g;
const REFERENCED = /var\(\s*(--[\w-]+)\s*(,?)/g;

/* Custom properties a file may reference without defining, because an ancestor
   component sets them. Deliberately empty: today every inherited-looking local is
   also defined in the file that reads it (TripLayout defines AND reads
   --screen-measure; TripBoard defines AND reads --board-rail-height — the screens
   that override them only write, never read). Keep it that way if you can; a
   cross-file property is a real dependency the CSS cannot express. */
const INHERITED_FROM_ANCESTOR: string[] = [];

const cssFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.css'))
  .map((name) => `${SRC}${name}`);

const tokens = new Set(
  cssFiles
    .filter((path) => path.includes('/design/tokens/'))
    .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(DECLARED)].map((m) => m[1])),
);

describe('CSS custom properties', () => {
  it('finds the token files and the stylesheets that use them', () => {
    expect(tokens.size).toBeGreaterThan(50);
    expect(cssFiles.length).toBeGreaterThan(50);
  });

  it.each(cssFiles.map((path) => [path.slice(SRC.length), path]))('%s resolves every var()', (rel, path) => {
    const css = readFileSync(path, 'utf8');
    const local = new Set([...css.matchAll(DECLARED)].map((m) => m[1]));

    for (const [, name, fallback] of css.matchAll(REFERENCED)) {
      // `var(--x, 12px)` is safe even when --x is undefined: the fallback keeps the
      // declaration valid, so it renders as written rather than vanishing. Allowed.
      if (fallback) continue;
      if (tokens.has(name) || local.has(name) || INHERITED_FROM_ANCESTOR.includes(name)) continue;

      expect.fail(
        `${rel} references var(${name}), which is not a design token, is not defined in this ` +
          `file, and is not on the inherited-from-ancestor allowlist in tokens.test.ts.\n\n` +
          `This is not a style nit. An unresolved custom property invalidates the WHOLE ` +
          `declaration it appears in, so the browser drops that property entirely — a bad ` +
          `--space-5 in a three-value padding shorthand removes all the padding, not one edge. ` +
          `It fails silently: no console error, and no component test can catch it because ` +
          `jsdom does not compute custom properties. Only a human looking at a real browser will.\n\n` +
          `Fix by using a real token (check src/design/tokens/ — the spacing scale skips 5), ` +
          `defining ${name} in this file, or giving it a fallback: var(${name}, <value>).`,
      );
    }
  });
});
