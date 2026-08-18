import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCanEdit } from '../auth/TripRoleContext';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
import { useEntries } from '../api/entries';
import { useNearby } from '../api/nearby';
import { useSchedule } from '../api/schedule';
import type { Entry } from '../api/types';
import { DayStrip } from '../features/schedule/DayStrip';
import { NearbyPanel } from '../features/schedule/NearbyPanel';
import type { NearbyPlace } from '../features/schedule/NearbyPanel';
import { NowBar } from '../features/schedule/NowBar';
import { RowOptions } from '../features/schedule/RowOptions';
import { ScheduleRow } from '../features/schedule/ScheduleRow';
import type { PlanRow } from '../features/schedule/dayPlan';
import { buildPlanRows, dayChips, nowLine, openingDay } from '../features/schedule/dayPlan';
import type { Coords } from '../features/schedule/useGeolocation';
import { useGeolocation } from '../features/schedule/useGeolocation';
import { formatWalk } from '../features/schedule/walkTime';
import { daysForTrip, entryFor, itemsForDay } from '../features/schedule/scheduleModel';
import { joinMeta } from '../lib/formatDates';
import styles from './TripSchedule.module.css';

/** The shell's own fold: below it the sidebar lies down, and so does this
 * screen. See AppLayout.module.css and §9 of the feature contract. */
const NARROW = '(max-width: 860px)';

/** `matchMedia` is missing in some test environments; without it the answer is
 * "wide", which is the layout with no overlay for anyone to be trapped in. */
function narrowQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null;
}

/**
 * Which of the two nearby layouts this width wants — the sheet or the rail.
 *
 * A media query in CSS cannot answer this one, because the answer decides what
 * is *mounted*, not how it looks. Rendering both and hiding one would put a
 * full-screen dialog underneath the desktop rail: same headings twice in the
 * accessibility tree, and a focus trap the user never opened.
 *
 * Local to this file on purpose. It is one route's layout question, and a
 * shared `useMediaQuery` invites every other screen to start branching its
 * markup on width instead of writing a media query.
 */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => narrowQuery()?.matches ?? false);

  useEffect(() => {
    const mql = narrowQuery();
    if (!mql) return;
    // Re-read once on mount as well as subscribing: a width that changed between
    // the initial state and this effect would otherwise stay wrong until the
    // next resize.
    setNarrow(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Three kept places within a short walk." Counting words rather than digits:
 * this is a sentence, and a numeral in it reads as data. */
function placesBlurb(count: number): string {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} kept ${count === 1 ? 'place' : 'places'} within a short walk.`;
}

function coordsOf(entries: Entry[], row: PlanRow | null): Coords | null {
  const entry = entryFor(entries, row?.entryId ?? null);
  if (!entry || entry.lat === null || entry.lng === null) return null;
  return { lat: entry.lat, lng: entry.lng };
}

/**
 * Where the plan says you are, for when the browser won't say: the row you are
 * standing in, or — before the day starts, or in a gap, or on a day you are
 * only reading ahead to — the next located row, and failing that the last one
 * you passed.
 *
 * This used to be the mean latitude and longitude of every located entry on the
 * trip, and a mean is not a place. On a trip that moves between two cities it
 * lands in open country somewhere between them: the two-kilometre search around
 * it comes back empty every time, and because the panel draws no map without
 * pins the whole feature goes dark — no map, no ring, no legend, no list. There
 * is no last-resort centroid here for that reason. A day with nothing located
 * on it says so instead, which is at least true.
 *
 * It is also the fact the panel's heading already names, so the sentence, the
 * heading and the map finally agree with each other.
 */
function planOriginRow(rows: PlanRow[], entries: Entry[]): PlanRow | null {
  const located = rows.filter((row) => coordsOf(entries, row) !== null);
  const here = located.find((row) => row.state === 'now');
  const ahead = located.find((row) => row.state !== 'past');
  return here ?? ahead ?? located[located.length - 1] ?? null;
}

/**
 * /trips/:id/schedule — "Final schedule". The plan you hold in one hand while
 * walking, and a read surface: nothing here rebuilds the plan. Placing an idea,
 * moving one back and the unscheduled tray all live on the Itinerary now, which
 * owns editing. What stays is the one decision you make in the street — which
 * of tonight's options you are actually going to (see RowOptions).
 *
 * On paper, not on the dark surface it used to invert to. Both mockups put this
 * screen on --wend-paper; see §2 of the feature contract.
 *
 * Two widths, one page. A phone gets a flat list under a scrolling day strip
 * with the now bar floating over it, and "what's nearby" as a full-screen
 * sheet. A desk gets the same rows in a card with the same nearby panel parked
 * beside them, always open — there is room for it, so it does not need asking
 * for.
 */
export function TripSchedule() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const canEdit = useCanEdit();
  const isNarrow = useIsNarrow();

  const scheduleQuery = useSchedule(trip.id);
  const entriesQuery = useEntries({ trip_id: trip.id });

  const items = useMemo(() => scheduleQuery.data ?? [], [scheduleQuery.data]);
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  const days = useMemo(
    () => daysForTrip(trip, items.map((i) => i.day)),
    [trip, items],
  );
  const [showNearby, setShowNearby] = useState(false);
  const geo = useGeolocation();
  // Pulled out of `geo` so the effect below can depend on the one stable
  // callback rather than on the whole hook result, which is new every fix.
  const requestLocation = geo.request;

  // Read once per render, and handed down explicitly, so every "now" on the
  // screen agrees with every other one and a test can freeze the clock.
  const now = new Date();

  // Today, when the trip is running; its first day otherwise. `activeDay` is
  // null until the reader picks a chip, and from then on it wins — the opening
  // day is chosen once, not re-imposed on every render.
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const day = activeDay ?? openingDay(days, now);

  const dayItems = useMemo(() => itemsForDay(items, day), [items, day]);
  const rows = buildPlanRows(dayItems, entries, { day, now });
  const line = nowLine(rows, { day, now });

  // The plan's answer to "where are you" stands in whenever the browser has
  // not given one — not only when it has refused. A refusal is one of several
  // ways to end up without a fix, and the others (never answering the prompt,
  // a fix that is still coming, a device that cannot) used to leave the panel
  // with no origin, which meant no map and no list on a screen whose whole
  // point is the map. The plan knows a place; it is used until the browser
  // knows a better one, and the blurb says which is which.
  const originRow = planOriginRow(rows, entries);
  const planOrigin = coordsOf(entries, originRow);
  const origin = geo.coords ?? planOrigin;
  const fromPlan = geo.coords === null && planOrigin !== null;

  // The rail is always on screen, so the desk asks for a fix on arrival. The
  // phone waits to be asked: a permission prompt nobody invited is the fastest
  // way to be told no for the rest of the session.
  useEffect(() => {
    if (isNarrow) return;
    requestLocation();
  }, [isNarrow, requestLocation]);

  const wantNearby = isNarrow ? showNearby : true;
  const nearbyQuery = useNearby(
    wantNearby && origin ? trip.id : undefined,
    { lat: origin?.lat ?? 0, lng: origin?.lng ?? 0, radius_km: 2, exclude_scheduled: true },
  );

  function askWhatsAround() {
    setShowNearby(true);
    requestLocation();
  }

  const nearbyEntries = nearbyQuery.data ?? [];
  const places: NearbyPlace[] = nearbyEntries.map((entry) => ({
    id: entry.id,
    name: entry.title,
    meta: joinMeta(entry.category, formatWalk(entry.distance_km)),
    lat: entry.lat,
    lng: entry.lng,
  }));

  // "Around you" until we can name where you are. The item you are standing in
  // is the only place-name this screen actually knows — we do not reverse
  // geocode, and guessing one from a coordinate is a second network call for a
  // heading.
  const hereRow = rows.find((row) => row.state === 'now');
  const heading = entryFor(entries, hereRow?.entryId ?? null)?.location_name ?? 'Around you';

  // Waiting on the browser is only worth saying when there is nothing to show
  // meanwhile: with the plan's origin standing in, the map and the list are
  // already up, and a spinner over them would be hiding an answer we have.
  const nearbyLoading = (geo.loading && !origin) || (origin !== null && nearbyQuery.isLoading);

  // What the fallback measures from, named the way the reader would name it —
  // so the sentence under the heading can say it out loud rather than claim a
  // middle-of-the-trip the map is not centred on.
  const originEntry = entryFor(entries, originRow?.entryId ?? null);
  const originName = originEntry?.location_name ?? originEntry?.title ?? null;

  // A note replaces the list; a blurb sits under the heading and explains it.
  // Both have to stay true about where the distances are measured from.
  const note = (() => {
    if (!origin) {
      return geo.denied
        ? "Your browser won't share your location, and nothing on this day has a place yet. Add a location to an idea and this will work."
        : 'Nothing on this day has a place yet, so there is nothing to measure from. Add a location to an idea and this will work.';
    }
    if (nearbyQuery.data && places.length === 0) {
      return 'Nothing unplaced within a short walk. A good moment for a detour.';
    }
    return null;
  })();

  const blurb = (() => {
    if (fromPlan && originName) {
      return geo.denied
        ? `Your browser won't share your location, so this is measured from ${originName}, where the plan has you.`
        : `Measured from ${originName}, where the plan has you.`;
    }
    return places.length > 0 ? placesBlurb(places.length) : '';
  })();

  const nearbyPanel = (layout: 'overlay' | 'rail') => (
    <NearbyPanel
      layout={layout}
      heading={heading}
      blurb={blurb}
      places={places}
      origin={origin}
      loading={nearbyLoading}
      note={note}
      onClose={layout === 'overlay' ? () => setShowNearby(false) : undefined}
    />
  );

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        {/* TripLayout above prints the trip's title as the page's one <h1>, so
            this screen's own name is a section heading under it — the same
            shape the itinerary uses. It keeps its size from .title; only the
            level changes. */}
        <h2 className={styles.title}>Final schedule</h2>
        {/* Shown even for a one-day trip: the head always carries the strip, and
            a page whose shape depends on how long the trip is is a page that
            moves under you when you add a day. */}
        <DayStrip chips={dayChips(days)} activeDay={day} onSelect={setActiveDay} />
      </div>

      <div className={styles.body}>
        <div className={styles.plan}>
          {/* Both queries, one gate: the plan is rows joined to entries, so a
              day drawn from half the pair would be wrong, not merely partial. */}
          <QueryGate
            query={[scheduleQuery, entriesQuery]}
            loadingLabel="Finding your plan"
            errorMessage="Your plan didn't load. Nothing is lost — everything you've placed is still in it."
          >
            {rows.length === 0 ? (
              <EmptyState
                message={
                  canEdit
                    ? 'Nothing placed yet. Drag something over from your ideas.'
                    : 'Nothing placed on this day yet.'
                }
              />
            ) : (
              <div className={styles.rows}>
                {rows.map((row) => (
                  <ScheduleRow
                    key={row.id}
                    row={row}
                    options={
                      row.bundleId === null ? undefined : (
                        <RowOptions
                          itemId={row.id}
                          bundleId={row.bundleId}
                          chosenEntryId={row.chosenEntryId}
                          canEdit={canEdit}
                        />
                      )
                    }
                  />
                ))}
              </div>
            )}
          </QueryGate>
        </div>

        {!isNarrow && <aside className={styles.rail}>{nearbyPanel('rail')}</aside>}
      </div>

      {/* Sticky, so it rides the bottom of the phone over the day. Hidden by a
          media query on the desk, where the rail already answers its question. */}
      <div className={styles.nowBarSlot}>
        <NowBar line={line} onOpenNearby={askWhatsAround} busy={geo.loading} />
      </div>

      {isNarrow && showNearby && nearbyPanel('overlay')}
    </div>
  );
}
