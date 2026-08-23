import { toggleCategory } from '../board/filters';
import type { Entry, EntryCategory } from '../../api/types';

export type MapScheduleFilter = 'all' | 'scheduled' | 'potential';

/**
 * What the map's chip row narrows by.
 *
 * `categories` is a list rather than one value because the question a map
 * actually invites is a union: "where could we eat or sleep around here" is
 * two kinds at once, and it is one question, not two. A one-at-a-time chip row
 * cannot answer it — each click silently discards the previous answer, so the
 * only way to see food and lodging together is to give up on narrowing at all
 * and read the whole map. Widening the field to a list makes the union
 * expressible without adding a second control to learn: the chips look and
 * behave the same, they just stop cancelling each other.
 *
 * The list is the set of categories to keep, so an EMPTY list means "no
 * category narrowing", never "match nothing" — see EMPTY_MAP_FILTERS.
 *
 * `scheduleState` stays a single value on purpose. Its options are mutually
 * exclusive states of one idea ("already on a day" vs "still just a maybe"),
 * so a union of both is exactly "all", which the enum already spells. Categories
 * are independent labels, which is why only they became a list.
 */
export interface MapFilters {
  categories: EntryCategory[];
  scheduleState: MapScheduleFilter;
  /**
   * Free-text narrowing on the title — a case-insensitive substring, nothing
   * cleverer, the same rule the board's filter bar applies. It is a filter
   * like the chips, not a mode of its own: it stacks with the categories and
   * the schedule state, and clearing it is deleting what you typed.
   * Whitespace-only text narrows nothing, so a stray space in the box cannot
   * quietly blank the map.
   */
  text: string;
  /**
   * The plan the list is narrowed to, or null for every plan.
   *
   * An id and not the plan itself, and emphatically not the plan's membership:
   * MapFilters is a plain serialisable description of what the reader ASKED
   * for — the sort of thing that can live in a URL, a saved view, or a
   * useState without dragging half the trip along with it. Which entries
   * belong to plan 7 is a server-loaded relation that changes when somebody
   * else edits the plan, and a filter object that carried it would be a cache
   * with no invalidation story pretending to be a form value. So the ids
   * arrive as a separate argument to applyMapFilters instead — see there for
   * what happens while they are still in flight.
   */
  planId: number | null;
}

/**
 * The unnarrowed map: every located pin on screen.
 *
 * Empty `categories` is the widest state, not the narrowest. Reading it as "an
 * empty allow-list, therefore show nothing" would make the map go blank the
 * moment you deselected your last chip — a filter that punishes you for
 * undoing it. The one rule in applyMapFilters keeps the two readings from ever
 * diverging.
 *
 * `planId: null` is the same reasoning in a different shape. Null is the
 * WIDEST plan state — "every plan", not "no plan" — because the neutral
 * position of a dropdown you have not touched has to show you everything. A
 * null that meant "entries belonging to no plan" would make the untouched map
 * a narrowed one, and there would be no value left to spell "all".
 */
export const EMPTY_MAP_FILTERS: MapFilters = { categories: [], scheduleState: 'all', text: '', planId: null };

export function isMapFiltersNarrowed(filters: MapFilters): boolean {
  // Text counts as narrowing exactly when applyMapFilters would act on it —
  // trimmed, so the whitespace that narrows nothing also lights nothing up.
  // Same rule as the board's isNarrowed, and for the same reason: "narrowed"
  // must mean "some pin could be hidden", or the escape hatch it gates would
  // appear and disappear out of step with the map.
  //
  // A picked plan counts on its own terms, and deliberately without consulting
  // any membership set: the reader has asked a narrowing question, so the
  // widen affordance belongs on screen even during the beat where the answer
  // has not arrived and applyMapFilters is still showing everything. Flickering
  // the escape hatch in and out on a network round-trip would be worse than
  // offering it a moment early.
  return (
    filters.categories.length > 0 ||
    filters.scheduleState !== 'all' ||
    filters.text.trim() !== '' ||
    filters.planId !== null
  );
}

/**
 * Adds or removes one category, leaving the rest of the selection alone — the
 * whole difference between a multi-select chip row and the single-value one it
 * replaced.
 *
 * The array work is the board's `toggleCategory` rather than a copy of it: the
 * three chip rows are meant to be one behaviour, and a second implementation is
 * just somewhere for them to drift apart. That also inherits its ordering rule —
 * the result is in canonical CATEGORY_ORDER, the order the chips are drawn in,
 * so the same SET of lit chips always produces the same array however it was
 * arrived at. Equal selections compare equal, memoised derivations don't re-run
 * on a difference that isn't one, and tests can assert on the array without
 * encoding a click sequence. Nothing on screen moves either way: matching asks
 * only about membership.
 */
export function toggleMapCategory(filters: MapFilters, category: EntryCategory): MapFilters {
  return { ...filters, categories: toggleCategory(filters.categories, category) };
}

/**
 * Filters hide pins, never delete entries — same rule as the board's filter bar.
 *
 * `planMemberIds` is the membership of the plan named by `filters.planId`, and
 * it is a separate argument for the reason spelled out on MapFilters.planId:
 * the filters are what the reader asked for, this is what the server answered.
 * Keeping them apart is what lets the same filter object be applied before and
 * after the membership loads without ever being wrong about itself.
 *
 * Which leaves one genuine asymmetry, and it is deliberate:
 *
 *   - NOT SUPPLIED (undefined) means "the caller has not loaded membership
 *     yet". We narrow nothing by plan. The reader sees the whole map for a
 *     beat and then watches it settle onto their plan — mildly late. The
 *     alternative is an empty map on every plan selection, which reads as "this
 *     plan is empty" and is a lie we would be telling on every single pick.
 *     Showing too much briefly is recoverable; claiming there is nothing there
 *     is not.
 *   - SUPPLIED BUT EMPTY means "we asked, and this plan genuinely has no
 *     members". No entries is the correct, honest answer, and the reader can
 *     tell it apart from a loading map because it stops changing.
 *
 * So the test below is `planMemberIds !== undefined` and NOT a truthiness or
 * `.size` check. An empty Set is truthy in JS but a `.size > 0` guard would
 * quietly collapse these two states back into one and hand the "still loading"
 * behaviour to a plan that has finished loading and is simply empty. If you
 * ever find yourself simplifying this condition, that is the bug you are
 * writing.
 */
export function applyMapFilters(
  entries: Entry[],
  filters: MapFilters,
  planMemberIds?: ReadonlySet<number>,
): Entry[] {
  // Hoisted out of the loop for the same reason the query is: whether plan
  // narrowing applies at all is a property of this call, not of each entry.
  // Undefined here means "do not narrow by plan", collapsing both no-plan-picked
  // and plan-picked-but-membership-not-loaded into the one thing the loop needs
  // to know — and, because it is the value rather than a boolean beside it, the
  // narrowed type inside the loop is the check.
  const memberIds = filters.planId === null ? undefined : planMemberIds;
  // Trimmed once, outside the loop: the query is the same for every entry, and
  // trimming here is also the whitespace-only rule — a query of spaces trims to
  // '' and the text check below never fires, same as the board's applyFilters.
  const query = filters.text.trim().toLowerCase();
  return entries.filter((entry) => {
    // Stacks with the chips, the schedule state and the text rather than
    // replacing them: picking a plan asks "of the things I can already see,
    // which are in this plan", so an entry has to pass all of them.
    if (memberIds !== undefined && !memberIds.has(entry.id)) return false;
    if (query !== '' && !entry.title.toLowerCase().includes(query)) return false;
    // Selected categories are OR'd, not AND'd: an entry carries exactly one
    // category, so intersecting them could only ever return nothing. Union is
    // the only reading of several lit chips that means anything here.
    const matchesCategory =
      filters.categories.length === 0 ||
      (entry.category !== null && filters.categories.includes(entry.category));
    if (!matchesCategory) return false;
    if (filters.scheduleState === 'scheduled' && !entry.scheduled) return false;
    if (filters.scheduleState === 'potential' && entry.scheduled) return false;
    return true;
  });
}
