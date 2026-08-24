import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The app's stacking order, held as a rule rather than as a habit.
 *
 * Almost nothing in this app creates a stacking context, so a z-index written
 * anywhere in a route's CSS is not scoped to that route — it lands in the ROOT
 * context and competes with the app shell directly. Twice now that has put page
 * furniture over the phone's open nav drawer: the board's map pill at 1000,
 * left over from before MapView sealed Leaflet into a stacking context of its
 * own, and the schedule's now bar at 20 — level with the shell, which is not a
 * tie but a win, because an equal z-index is settled by document order and the
 * page comes after the nav.
 *
 * So: the shell's chrome sits at 20, and page content stays BELOW it. Above the
 * shell there are only the few surfaces that are MEANT to cover it, and they
 * are named here one at a time. A new four-figure z-index is almost always
 * someone reaching for a number big enough to win an argument they have not
 * actually had — and this test is where that stops.
 */

/** The shell's own chrome: the sidebar, and the phone bar and drawer it becomes. */
const SHELL = 20;

/** The one stylesheet allowed to write the shell's own level. */
const SHELL_STYLESHEET = join('src', 'routes', 'AppLayout.module.css');

/**
 * The only things allowed to paint over the shell, each with the reason it is.
 * Keyed by value so a second surface arriving at the same level has to say so.
 */
const ABOVE_SHELL = new Map([
  [30, 'NearbyPanel: the phone takeover sheet over the schedule'],
  [100, "Modal and Drawer's shared overlay"],
  [150, "the feedback element picker's highlight"],
  [200, 'the toast stack'],
]);

/** Every .module.css under src/, walked rather than globbed. */
function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.module.css') ? [path] : [];
  });
}

interface Layer {
  file: string;
  value: number;
}

function declaredLayers(): Layer[] {
  return stylesheets('src').flatMap((file) => {
    const css = readFileSync(file, 'utf8');
    // Declarations only. A `z-index` mentioned in a comment is prose, and
    // several of these files explain themselves at length.
    return Array.from(css.matchAll(/^\s*z-index:\s*(-?\d+);/gm)).map((match) => ({
      file,
      value: Number(match[1]),
    }));
  });
}

describe('stacking layers', () => {
  it('finds the stylesheets it is meant to be policing', () => {
    // A walk that silently found nothing would pass every assertion below.
    expect(declaredLayers().length).toBeGreaterThan(20);
  });

  it('keeps page content below the shell', () => {
    const tooHigh = declaredLayers()
      .filter((layer) => layer.file !== SHELL_STYLESHEET)
      .filter((layer) => layer.value >= SHELL && !ABOVE_SHELL.has(layer.value))
      .map((layer) => `${layer.file}: z-index ${layer.value}`);

    // If this fails, the fix is almost never a bigger number on the shell. It
    // is either a smaller number here — page content rarely needs to clear
    // anything but its own siblings — or, if the surface really does belong
    // over the whole app, a new entry in ABOVE_SHELL saying why.
    //
    // Note the >=. Matching the shell exactly is the subtler of the two ways
    // to break this, and the one that looks deliberate in a diff.
    expect(tooHigh).toEqual([]);
  });

  it('lets the shell own its own level and nothing higher', () => {
    const shellLayers = declaredLayers()
      .filter((layer) => layer.file === SHELL_STYLESHEET)
      .map((layer) => layer.value);

    expect(shellLayers).toContain(SHELL);
    expect(Math.max(...shellLayers)).toBe(SHELL);
  });

  it('leaves every documented layer above the shell in use', () => {
    const declared = new Set(declaredLayers().map((layer) => layer.value));
    const unused = Array.from(ABOVE_SHELL.keys()).filter((value) => !declared.has(value));

    // A list of exceptions nobody takes any more is a list nobody reads.
    expect(unused).toEqual([]);
  });
});
