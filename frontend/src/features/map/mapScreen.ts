import type { Entry } from '../../api/types';
import type { EntryGroup, GroupMode } from '../board/filters';
import { groupEntries } from '../board/filters';
import { subtreeIdeaIds } from '../board/tree';
import { MIDDOT, joinMeta } from '../../lib/formatDates';

/**
 * Pure readings for the map screen — the list beside the map, the meta line
 * under each row, the counter that says what the viewport is doing to the
 * list, and the small matching helpers the add-place flow leans on.
 *
 * Everything here is a function of the trip's flat idea list; nothing touches
 * Leaflet, React, or the network. That is the point: the map screen composes
 * a viewport (stateful, owned by the map component) with a list (derived,
 * owned by these functions), and keeping the derivations pure is what lets the
 * screen's most subtle behaviour — "the map narrows the list only while you
 * let it" — be tested as arithmetic instead of as a browser session.
 */

/**
 * An entry the map can actually place. Same narrowing pins.ts performs in
 * `entriesWithCoordinates` — the type exists so downstream helpers can demand
 * coordinates in their signature instead of re-checking null at every use.
 */
export type LocatedEntry = Entry & { lat: number; lng: number };

/**
 * The ideas the map CANNOT show — either coordinate missing.
 *
 * The complement of pins.ts's `entriesWithCoordinates`, kept as its own
 * function rather than a `!` in a component: the map screen shows these in a
 * dedicated "no place yet" strip, and the two lists must partition the input
 * exactly — an idea with a lat but no lng (half-geocoded, or hand-edited)
 * belongs here, not silently in neither list.
 */
export function placelessIdeas(ideas: Entry[]): Entry[] {
  return ideas.filter((entry) => entry.lat === null || entry.lng === null);
}

/**
 * How many distinct ideas under `id` the map can place — the number behind
 * "{n} inside are on the map".
 *
 * Walks the same links as the board's "N inside" pill (tree.ts
 * subtreeIdeaIds, which never includes the idea itself and is cycle-safe),
 * then keeps only the located ones: the map's version of the count answers
 * "what would drilling in put on the map", not "how big is the subtree". A
 * bundle of ten unplaced ideas is 0 here on purpose — promising pins that
 * cannot appear is worse than saying nothing.
 */
export function locatedDescendantCount(allIdeas: Entry[], id: number): number {
  const byId = new Map(allIdeas.map((entry) => [entry.id, entry]));
  let count = 0;
  for (const descendantId of subtreeIdeaIds(allIdeas, id)) {
    const descendant = byId.get(descendantId);
    if (descendant !== undefined && descendant.lat !== null && descendant.lng !== null) count += 1;
  }
  return count;
}

/**
 * The one-line metadata under a row in the map's list:
 * `{address} · in {parentA} · {parentB} · {n} inside are on the map`.
 *
 * Three facts, each earning its place only when it says something:
 *
 *   - The address, when the entry has a non-empty one. It is the fact that
 *     ties the row to its pin, so it leads.
 *   - `in {titles}` — the idea parents this trip can vouch for. `parent_ids`
 *     is unfiltered (it carries the trip entry, bundles, ideas elsewhere), so
 *     only ids present in `ideaById` are named: a title the screen cannot
 *     resolve is a parent it has no business claiming — same discipline as
 *     tree.ts. One `in ` prefix for the whole run, titles joined with the
 *     middot, because "in Rome · in Old Town" reads as a stutter.
 *   - The located-descendant count, only when it is more than zero — a zero
 *     here is silence, not "0 inside", because most ideas have nothing inside
 *     and the line would drown in noise.
 *
 * Parts joined with the house MIDDOT via joinMeta, and the empty string when
 * nothing qualifies, so the row can skip rendering the line entirely.
 *
 * `ideaById` is taken pre-built rather than derived from `allIdeas` because
 * the caller renders this per row over the same list — building the map once
 * is theirs to do; `allIdeas` is still needed for the descendant walk.
 */
export function metaLineFor(entry: Entry, allIdeas: Entry[], ideaById: Map<number, Entry>): string {
  const address = entry.address !== null && entry.address.trim() !== '' ? entry.address : null;

  const parentTitles = entry.parent_ids
    .map((parentId) => ideaById.get(parentId))
    .filter((parent): parent is Entry => parent !== undefined)
    .map((parent) => parent.title);
  const inside = parentTitles.length > 0 ? `in ${parentTitles.join(MIDDOT)}` : null;

  const located = locatedDescendantCount(allIdeas, entry.id);
  const insideCount =
    located > 0 ? (located === 1 ? '1 inside is on the map' : `${located} inside are on the map`) : null;

  return joinMeta(address, inside, insideCount);
}

/**
 * Whether `entry` sits inside another idea — the rows the map's list indents
 * or badges as nested. `ideaIds` rather than the entries themselves because
 * the caller already holds the set (it is the same one every tree.ts function
 * builds), and membership is the whole question: `parent_ids` is unfiltered,
 * so a parent id outside the set is a bundle or the trip, not nesting.
 */
export function isNestedIdea(entry: Entry, ideaIds: ReadonlySet<number>): boolean {
  return entry.parent_ids.some((parentId) => ideaIds.has(parentId));
}

/**
 * How the map's list is sectioned. A subset of the board's GroupMode on
 * purpose — the map has no third grouping today, and naming its own type
 * means adding one to the board later cannot silently appear here.
 */
export type MapGroupMode = 'none' | 'category';

/**
 * Sections the located list for rendering. Delegates to the board's
 * groupEntries rather than re-implementing it: the map's "By category" must
 * be the board's "By category" — same order, same labels, same
 * uncategorised-last rule — and one implementation is how they stay that way.
 * The board's EntryGroup shape comes back unchanged, so a shared list
 * component needs no idea which screen produced its sections.
 */
export function groupLocated(entries: LocatedEntry[], mode: MapGroupMode): EntryGroup[] {
  return groupEntries(entries, mode satisfies GroupMode);
}

/**
 * The line over the list that says what the map is doing to it.
 *
 * Two modes, two sentences, chosen so the narrowing is never ambient: while
 * the list follows the viewport it says so as a fraction ("2 of 5 ideas on
 * the map are in view"), and while it does not, it says so in words — because
 * a list that is silently narrowed by a pan you made minutes ago is the map
 * screen's version of a filter you forgot was on.
 *
 * Grammar choices, so the tests can hold them still:
 *   - The noun and its verb agree with `located`, the count that heads the
 *     phrase: "1 of 1 idea is in view", but "1 of 3 ideas are in view" — the
 *     sentence is about the located ideas as a set, and re-agreeing the verb
 *     with `inView` would make the line jitter between is/are as you pan.
 *   - Same rule unfollowed: "1 idea has a place", "3 ideas have a place".
 *   - Zero is plural in English ("0 ideas"), which both branches inherit for
 *     free by special-casing only `located === 1`.
 */
export function counterLine(inView: number, located: number, following: boolean): string {
  if (following) {
    return located === 1
      ? `${inView} of 1 idea on the map is in view`
      : `${inView} of ${located} ideas on the map are in view`;
  }
  return located === 1
    ? `1 idea has a place · the map is not narrowing the list`
    : `${located} ideas have a place · the map is not narrowing the list`;
}

/**
 * How close two points must be, per axis, to read as "the same place" —
 * roughly 15 m of latitude, and about that of longitude at mid-latitudes. A
 * square rather than a circle because the question is "did we already add
 * this?", where the honest answer at these distances is the same either way
 * and the square needs no trigonometry.
 */
const DUPLICATE_EPSILON_DEGREES = 1.5e-4;

/**
 * The already-placed idea a new place would duplicate, or undefined.
 *
 * Candidates must be within DUPLICATE_EPSILON_DEGREES on BOTH axes — a pin
 * 10 m north but 500 m east is a different place. Among candidates the
 * nearest wins, by squared degree distance: squared because ordering is all
 * that is asked of the number (sqrt is monotonic, so it could only cost),
 * and degrees because at epsilon scale the lat/lng anisotropy cannot reorder
 * anything the epsilon box already admitted.
 *
 * This is a nudge, not a constraint — the caller shows "you already have X
 * here", it does not block the add. Which is why undefined (nothing near) is
 * a normal return, not an error.
 */
export function findDuplicateIdea(
  place: { lat: number; lng: number },
  located: LocatedEntry[],
): LocatedEntry | undefined {
  let best: LocatedEntry | undefined;
  let bestDistance = Infinity;
  for (const entry of located) {
    const dLat = entry.lat - place.lat;
    const dLng = entry.lng - place.lng;
    if (Math.abs(dLat) > DUPLICATE_EPSILON_DEGREES || Math.abs(dLng) > DUPLICATE_EPSILON_DEGREES) continue;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The located ideas a search query names — the map's "jump to an idea" box.
 *
 * Case-insensitive substring on the title, the same rule as every text filter
 * in the app, because a second matching rule would make the same query mean
 * two things on one screen. The query is trimmed first and an
 * empty-after-trim query returns [], not everything: this feeds a suggestion
 * dropdown, where "no query" must mean "no suggestions", not "all of them" —
 * the opposite polarity from applyMapFilters, where no query means no
 * narrowing, and the reason this is not just a call to it.
 *
 * `max` caps the list because a dropdown longer than the screen is not a
 * suggestion; order within the cap is input order, which is the caller's
 * (serializer) order — stable, and not pretending to rank by relevance.
 *
 * `near` — when the caller knows where the map is currently looking — changes
 * that last sentence and nothing else: matches are ordered nearest-first from
 * that point and only THEN capped. The ordering matters less than the interaction
 * with the cap. A trip with six "Temple ..." ideas across three cities, capped
 * at three, would otherwise show whichever three the serializer happened to
 * emit first — quite possibly none of the ones you can see on screen, which is
 * exactly the complaint this answers. Sorting before the cap means the survivors
 * are the near ones.
 *
 * Distance is squared degrees, no trigonometry, for the same reason as
 * findDuplicateIdea above: only the ordering is asked of the number, sqrt is
 * monotonic so it could only cost, and at the scale of one viewport the
 * lat/lng anisotropy cannot plausibly reorder a suggestion list. If this ever
 * needs to rank places continents apart, that is the point to reach for real
 * distance — not before.
 *
 * Without `near`, behaviour is byte-for-byte what it was: input order, cap
 * applied while scanning.
 */
export function matchIdeas(
  query: string,
  located: LocatedEntry[],
  max: number,
  near?: { lat: number; lng: number },
): LocatedEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return [];

  if (near) {
    // Collect everything first — capping while scanning would throw away the
    // near matches sitting late in the input, which is the whole bug.
    const matches = located.filter((entry) => entry.title.toLowerCase().includes(trimmed));
    const distanceOf = (entry: LocatedEntry) => {
      const dLat = entry.lat - near.lat;
      const dLng = entry.lng - near.lng;
      return dLat * dLat + dLng * dLng;
    };
    // Sorting the copy filter already made, so `located` stays the caller's.
    // Equal distances keep input order — Array.sort is stable in every engine
    // we ship to, so ties read the same way they did before `near` existed.
    matches.sort((a, b) => distanceOf(a) - distanceOf(b));
    // slice, not splice-while-scanning: max <= 0 still means "no suggestions".
    return matches.slice(0, Math.max(0, max));
  }

  const matches: LocatedEntry[] = [];
  for (const entry of located) {
    // Checked before matching, not after pushing, so max <= 0 means "no
    // suggestions" rather than sneaking one past the cap.
    if (matches.length >= max) break;
    if (entry.title.toLowerCase().includes(trimmed)) matches.push(entry);
  }
  return matches;
}
