import { describe, expect, it } from 'vitest';
import type { Active, ClientRect, DroppableContainer, Over, SensorContext } from '@dnd-kit/core';
import { UNSAVED_VERSION_ID } from './itineraryModel';
import { dayDroppableId, itineraryDragStrategy, versionDroppableId } from './useDayDrop';
import type { ItineraryDropData } from './useDayDrop';

/**
 * The drag machinery on its own, without a browser under it.
 *
 * Rectangles are the only part of @dnd-kit that jsdom cannot produce for itself:
 * every element it lays out measures 0×0 at the origin. Stating the geometry
 * here is what lets the three rules that fix feedback 014#2 — the innermost
 * target wins, the arrow keys stop on every version column, and the drop lands
 * on the stop they walked to — be checked exactly rather than approximately.
 */

const SPLIT_DAY = '2026-11-03';
const PLAIN_DAY = '2026-11-04';

/** @dnd-kit re-exports this from @dnd-kit/utilities; its own index does not. */
interface Coordinates {
  x: number;
  y: number;
}

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function centre(of: ClientRect): Coordinates {
  return { x: of.left + of.width / 2, y: of.top + of.height / 2 };
}

function target(id: string, data: ItineraryDropData, at: ClientRect): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    data: { current: data },
    node: { current: null },
    rect: { current: at },
  };
}

// A split day: the whole card, and the two columns laid inside it. The card
// encloses both, which is the shape that made the day swallow every drop.
const DAY_CARD = rect(0, 100, 600, 360);
const COLUMN_A = rect(20, 160, 280, 280);
const COLUMN_B = rect(310, 160, 280, 280);
// One untouched date further down, whose only version is the synthetic one.
const PLAIN_CARD = rect(0, 500, 600, 80);

const splitTargets = [
  target(dayDroppableId(SPLIT_DAY), { day: SPLIT_DAY, versionId: null }, DAY_CARD),
  target(versionDroppableId(SPLIT_DAY, 2), { day: SPLIT_DAY, versionId: 2 }, COLUMN_A),
  target(versionDroppableId(SPLIT_DAY, 3), { day: SPLIT_DAY, versionId: 3 }, COLUMN_B),
];

const plainTarget = target(dayDroppableId(PLAIN_DAY), { day: PLAIN_DAY, versionId: null }, PLAIN_CARD);

const ALL = [...splitTargets, plainTarget];

/** Collision detection reads none of this, but the signature asks for it. */
const ACTIVE = {
  id: 'itinerary-unplaced-4',
  data: { current: { entryId: 4, title: 'Kiyamachi' } },
  rect: { current: { initial: null, translated: null } },
} as unknown as Active;

function whatIsUnder(
  containers: DroppableContainer[],
  { pointer, dragged }: { pointer?: Coordinates; dragged: ClientRect },
  strategy = itineraryDragStrategy(),
): string[] {
  return strategy
    .collisionDetection({
      active: ACTIVE,
      collisionRect: dragged,
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current as ClientRect])),
      droppableContainers: containers,
      pointerCoordinates: pointer ?? null,
    })
    .map((collision) => String(collision.id));
}

describe('itineraryDragStrategy — which target a drag is over', () => {
  // Feedback 014#2. The day encloses both columns, and its centre can be the
  // nearer one, so left to itself the day wins and the drop lands in Version A.
  it('gives a column the drop over the day around it, even when the day reads as closer', () => {
    // Just inside Version B's left edge — nearer to the day card's centre than
    // to Version B's own.
    const pointer = { x: 312, y: 200 };
    const [first] = whatIsUnder(splitTargets, { pointer, dragged: rect(300, 190, 240, 60) });

    expect(first).toBe(versionDroppableId(SPLIT_DAY, 3));
  });

  it('leaves the day itself the target when the drop lands beside the columns', () => {
    // The day's header strip, above where the columns start.
    const [first] = whatIsUnder(splitTargets, { pointer: { x: 300, y: 120 }, dragged: rect(200, 110, 240, 60) });

    expect(first).toBe(dayDroppableId(SPLIT_DAY));
  });

  it('never lets one day’s column steal a drop meant for another day', () => {
    // Squarely on the untouched day at the foot of the list. A split day is on
    // screen, so a blanket "columns beat days" rule would send it there.
    const [first] = whatIsUnder(ALL, { pointer: centre(PLAIN_CARD), dragged: rect(180, 520, 240, 40) });

    expect(first).toBe(dayDroppableId(PLAIN_DAY));
  });

  it('resolves a keyboard drag, which has no pointer at all, to what it is parked on', () => {
    const parked = rect(COLUMN_B.left + 20, COLUMN_B.top + 100, 240, 60);
    const [first] = whatIsUnder(ALL, { dragged: parked });

    expect(first).toBe(versionDroppableId(SPLIT_DAY, 3));
  });

  it('says nothing when there is nothing to say', () => {
    expect(whatIsUnder([], { pointer: { x: 10, y: 10 }, dragged: rect(0, 0, 100, 100) })).toEqual([]);
  });
});

/** The dragged card, so the getter has a width and height to centre. */
const DRAGGED = rect(900, 40, 240, 60);

function press(
  code: string,
  over: DroppableContainer | null,
  containers = ALL,
  strategy = itineraryDragStrategy(),
): Coordinates | void {
  const context = {
    collisionRect: DRAGGED,
    droppableContainers: { toArray: () => containers },
    droppableRects: new Map(containers.map((c) => [c.id, c.rect.current as ClientRect])),
    over: over && ({ id: over.id, rect: over.rect.current, disabled: false, data: over.data } as Over),
  } as unknown as SensorContext;

  return strategy.coordinateGetter(new KeyboardEvent('keydown', { code }), {
    active: ACTIVE.id,
    currentCoordinates: { x: DRAGGED.left, y: DRAGGED.top },
    context,
  });
}

/** Where the getter parks the dragged card: its centre on the target's centre. */
function centredOn(on: ClientRect): Coordinates {
  return { x: centre(on).x - DRAGGED.width / 2, y: centre(on).y - DRAGGED.height / 2 };
}

/** Presses one key over and over, from `start`, and says where it stopped. */
function walk(code: string, start: DroppableContainer, times: number, containers = ALL): Coordinates[] {
  const strategy = itineraryDragStrategy();
  const stops: Coordinates[] = [];
  for (let i = 0; i < times; i += 1) {
    // `start` is only read on the first press: after that the walk knows where
    // it has got to, and that is deliberately not something `over` can contradict.
    stops.push(press(code, start, containers, strategy) as Coordinates);
  }
  return stops;
}

describe('itineraryDragStrategy — the arrow keys', () => {
  const [dayCard, columnA, columnB] = splitTargets;

  it('lands on the first target of the page from a drag that is over nothing', () => {
    // The split day's own card is not one of them — see below.
    expect(press('ArrowDown', null)).toEqual(centredOn(COLUMN_A));
    expect(press('ArrowUp', null)).toEqual(centredOn(PLAIN_CARD));
  });

  // The whole point: without this, Version B is a place only a mouse can reach.
  it('stops on each version column of a split day in turn', () => {
    expect(press('ArrowRight', columnA)).toEqual(centredOn(COLUMN_B));
    expect(press('ArrowLeft', columnB)).toEqual(centredOn(COLUMN_A));
    expect(press('ArrowDown', columnA)).toEqual(centredOn(COLUMN_B));
  });

  // Stopping on the day would be stopping on "Version A by default" one press
  // before Version A itself.
  it('walks past the day itself once its columns are on screen', () => {
    const openSplitDay = [...splitTargets, plainTarget];
    // Down from Version B is the next day, not the card the columns sit in.
    expect(press('ArrowDown', columnB, openSplitDay)).toEqual(centredOn(PLAIN_CARD));
    expect(press('ArrowUp', plainTarget, openSplitDay)).toEqual(centredOn(COLUMN_B));
  });

  it('keeps a day that is not split as the one stop it is', () => {
    const collapsed = [
      target(dayDroppableId(SPLIT_DAY), { day: SPLIT_DAY, versionId: null }, DAY_CARD),
      plainTarget,
    ];

    expect(press('ArrowDown', collapsed[0], collapsed)).toEqual(centredOn(PLAIN_CARD));
  });

  it('stays put at either end rather than wrapping round', () => {
    expect(press('ArrowUp', columnA)).toEqual(centredOn(COLUMN_A));
    expect(press('ArrowDown', plainTarget)).toEqual(centredOn(PLAIN_CARD));
  });

  /**
   * The other half of feedback 014#2's browser check: from Day 1, Down did not
   * leave Day 1 however many times it was pressed, and only Right got back into
   * the day below. One key that does nothing is a walk with a hole in it, and a
   * version column on the far side of the hole is unreachable again.
   */
  it('has no dead end: one key reaches every stop past it, one at a time, and then holds', () => {
    expect(walk('ArrowDown', columnA, 3)).toEqual([
      centredOn(COLUMN_B),
      centredOn(PLAIN_CARD),
      centredOn(PLAIN_CARD),
    ]);
    expect(walk('ArrowUp', plainTarget, 3)).toEqual([
      centredOn(COLUMN_B),
      centredOn(COLUMN_A),
      centredOn(COLUMN_A),
    ]);
  });

  // The card of a split day is a target the walk skips but the *pointer* can
  // still be over, so the first arrow of a drag can be pressed from there.
  it('carries on into a day’s own columns from the card the walk skips', () => {
    expect(press('ArrowDown', dayCard)).toEqual(centredOn(COLUMN_A));
    expect(press('ArrowUp', dayCard)).toEqual(centredOn(COLUMN_B));
  });

  it('leaves every other key to the page', () => {
    expect(press('KeyA', columnA)).toBeUndefined();
    expect(press('Space', columnA)).toBeUndefined();
  });

  it('does nothing before the context has measured anything', () => {
    expect(press('ArrowDown', null, [])).toBeUndefined();
  });

  it('treats the synthetic version of an untouched day as a target like any other', () => {
    const unsaved = [
      plainTarget,
      target(
        versionDroppableId(PLAIN_DAY, UNSAVED_VERSION_ID),
        { day: PLAIN_DAY, versionId: UNSAVED_VERSION_ID },
        rect(20, 540, 560, 30),
      ),
    ];

    // versionId 0 is a real answer, not a missing one: the day drops out of the
    // walk and its column is the stop.
    expect(press('ArrowDown', null, unsaved)).toEqual(centredOn(rect(20, 540, 560, 30)));
  });
});

/** Where the getter leaves the dragged card once it has parked it on a target. */
function parkedOn(on: ClientRect): ClientRect {
  const { x, y } = centredOn(on);
  return rect(x, y, DRAGGED.width, DRAGGED.height);
}

/** The same page, scrolled down by `pixels`: everything on it has moved up. */
function scrolledBy(pixels: number, containers = ALL): DroppableContainer[] {
  return containers.map((container) => {
    const at = container.rect.current as ClientRect;
    return target(String(container.id), dropDataOf(container), rect(at.left, at.top - pixels, at.width, at.height));
  });
}

function dropDataOf(container: DroppableContainer): ItineraryDropData {
  return container.data.current as ItineraryDropData;
}

/**
 * The invariant the screen rests on: **the target named in the announcement is
 * the target that receives the drop.**
 *
 * It is not free. @dnd-kit's keyboard sensor, asked for a coordinate that is
 * off-screen, leaves the drag where it is and scrolls the page instead — so
 * "the rectangles moved and the drag did not" is what a normal arrow press
 * *does*, not an edge case. Anything reading the rectangles at the moment the
 * key comes up is therefore reading a different page from the one that was
 * announced, and drops the thing on the wrong day without saying so.
 */
describe('itineraryDragStrategy — what was announced is what takes the drop', () => {
  const [, columnA] = splitTargets;

  it('holds the stop the arrow keys walked to, however far the page has scrolled since', () => {
    const strategy = itineraryDragStrategy();
    press('ArrowRight', columnA, ALL, strategy);
    const drag = parkedOn(COLUMN_B);

    expect(whatIsUnder(ALL, { dragged: drag }, strategy)).toEqual([versionDroppableId(SPLIT_DAY, 3)]);

    // A day's worth of scroll puts the untouched day below where Version B was.
    const moved = scrolledBy(340);
    // Left to the rectangles alone, that is where the drop would land — which
    // is the wrong day, silently, and was feedback 014#2 all over again.
    expect(whatIsUnder(moved, { dragged: drag })[0]).toBe(dayDroppableId(PLAIN_DAY));
    expect(whatIsUnder(moved, { dragged: drag }, strategy)).toEqual([versionDroppableId(SPLIT_DAY, 3)]);
  });

  it('reads the page again once the target it was holding has gone off it', () => {
    const strategy = itineraryDragStrategy();
    press('ArrowRight', columnA, ALL, strategy);

    // The day list came back from the server without the split day on it.
    expect(whatIsUnder([plainTarget], { dragged: parkedOn(PLAIN_CARD) }, strategy)).toEqual([
      dayDroppableId(PLAIN_DAY),
    ]);
  });

  it('forgets the walk when the drag ends, so the next one starts where it is picked up', () => {
    const strategy = itineraryDragStrategy();
    press('ArrowRight', columnA, ALL, strategy);
    strategy.release();

    expect(whatIsUnder(ALL, { dragged: parkedOn(PLAIN_CARD) }, strategy)[0]).toBe(dayDroppableId(PLAIN_DAY));
  });

  it('leaves a pointer drag to the pointer, which has a page under it to read', () => {
    const strategy = itineraryDragStrategy();
    press('ArrowRight', columnA, ALL, strategy);

    expect(
      whatIsUnder(ALL, { pointer: centre(PLAIN_CARD), dragged: parkedOn(PLAIN_CARD) }, strategy)[0],
    ).toBe(dayDroppableId(PLAIN_DAY));
  });
});
