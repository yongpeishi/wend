import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Entry } from '../../api/types';
import type { EntryGroup } from '../board/filters';
import { Button } from '../../design/components/core/Button';
import { Chip, Tag } from '../../design/components/core/Chip';
import { useToast } from '../../components/Toast';
import { useArchiveEntry } from '../../api';
import { IdeaPanel } from '../board/IdeaPanel';
import { VotePill } from '../board/VotePill';
import { useLinkMutations } from '../board/useLinkMutations';
import styles from './MapIdeaList.module.css';

/** The house sentence for a write that did not land. Same words everywhere. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

export interface MapIdeaListProps {
  /** Already filtered/grouped/ordered located rows — the parent owns all of that. */
  groups: EntryGroup[];
  /** id → muted meta line (may be ''), computed once by the parent via metaLineFor. */
  metaLines: ReadonlyMap<number, string>;
  selectedIds: readonly number[];
  onToggleSelect: (id: number) => void;
  /** Name click — the parent centres the map on this idea's pin. */
  onRowNameClick: (id: number) => void;
  /** Group header action — the parent fits the viewport to the group's pins. */
  onZoomGroup: (key: string) => void;
  justAddedId: number | null;
  /** Ideas with no coordinates — shown in the dashed footer, never as rows. */
  placeless: Entry[];
  /** Enters pin-drop mode in the parent. */
  onPutOnMap: (id: number) => void;
  canEdit: boolean;
  /**
   * The trip's plans, for the open row's "Add to plan" chips. Optional with an
   * empty default so the list still stands up on a screen (or in a test) that
   * has not loaded plans: no plans simply means the popover says so.
   */
  bundles?: Entry[];
  /** plan id → its members, the same map TripBoard hands IdeaRow. */
  members?: Map<number, Entry[]>;
  /** Where a plan add/remove is announced. Silent when the parent has no toaster. */
  onToast?: (message: string) => void;
}

/**
 * The list beside the map. Rows are deliberately FLAT — no indentation, no
 * parent-before-child ordering — because the map has already flattened the
 * trip into pins, and a hierarchy the pins cannot show would make the list
 * disagree with the picture it annotates. Nesting survives only as words, in
 * the meta line the parent computes ("in Rome · 2 inside are on the map").
 *
 * Grouping, filtering and ordering all happened upstream (mapScreen.ts
 * groupLocated), so the list decides nothing about WHICH rows it draws. What it
 * does own is how they are being read right now: which rows are unfolded, and
 * whether the place-less footer is open.
 *
 * Expansion is LOCAL state here — a `Set<number>`, so any number of rows can be
 * open at once. IdeaRow's expansion is controlled by TripBoard for a reason
 * that does not apply on this screen: the board has drill-down levels, and
 * changing level must fold every open row, which no single row can know. The
 * map's list is flat by design — there is no level to change and no second
 * component with an opinion about openness — so the set stays in here. Nothing
 * outside needs to know which rows are open; the map is told about the pin, not
 * about the panel.
 *
 * A click on a row's name therefore does TWO things, but only in one direction:
 * it unfolds the row AND centres the map on that idea's pin, and the centring
 * fires only when the click OPENS the row. Closing a row leaves the map where
 * it is. That keeps the design's "clicking a row's name centres and zooms to
 * that idea" intact while the same click also unfolds it — one click on an idea
 * means one coherent thing (this idea, here it is, on the map and in full) — and
 * it avoids the nonsense of folding a panel away while flying the map to a pin.
 *
 * Reading an idea is IdeaPanel's job, shared verbatim with the board so the
 * same idea makes the same claims on both screens. What differs is the verbs:
 * this screen offers "Add to plan" and "Move to Set aside" and stops there.
 * Editing an idea's full detail is out of scope for the map (the design
 * requirements say so), and "Add an idea inside" / "N inside ›" would put a
 * hierarchy back into a list that is flat on purpose.
 *
 * The "no ideas in view" message is the PARENT's: an empty groups array
 * renders nothing for the groups part, because only the parent knows whether
 * emptiness means "nothing located", "the viewport narrowed it away" or "a
 * filter did" — and each deserves a different sentence.
 */
export function MapIdeaList({
  groups,
  metaLines,
  selectedIds,
  onToggleSelect,
  onRowNameClick,
  onZoomGroup,
  justAddedId,
  placeless,
  onPutOnMap,
  canEdit,
  bundles = [],
  members = new Map(),
  onToast,
}: MapIdeaListProps) {
  // The footer's unfolded state. Local on purpose: it is a reading posture,
  // not a fact about the trip, and it resets when the screen does.
  const [placelessOpen, setPlacelessOpen] = useState(false);

  // Which rows are unfolded. See the component comment for why this lives here
  // and not above, unlike the board's.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());

  // One id per list, made into one id per panel below: `useId` is per component
  // instance, and every row on this list shares this one instance.
  const listId = useId();
  const panelIdFor = (id: number) => `${listId}-panel-${id}`;

  const selected = new Set(selectedIds);

  // Opening is the only direction that talks to the map. The `opening` decision
  // is taken out here rather than inside the updater because the updater must
  // stay pure — React may call it twice, and nobody wants the map flown to
  // twice for one click.
  function toggleRow(id: number) {
    const opening = !expandedIds.has(id);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (opening) next.add(id);
      else next.delete(id);
      return next;
    });
    if (opening) onRowNameClick(id);
  }

  // The ungrouped case: groupEntries('none') returns one group with an empty
  // label, and a heading with no words over the only section there is would
  // be chrome for its own sake.
  const soloUngrouped = groups.length === 1 && groups[0].label === '';

  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          {!soloUngrouped && (
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupCount}>{group.entries.length}</span>
              {/* Quiet, not primary: zooming reads the map, it changes nothing. */}
              <button type="button" className={styles.zoom} onClick={() => onZoomGroup(group.key)}>
                Zoom to {group.label}
              </button>
            </div>
          )}

          {group.entries.map((entry) => {
            const meta = metaLines.get(entry.id) ?? '';
            const justAdded = entry.id === justAddedId;
            const expanded = expandedIds.has(entry.id);
            const panelId = panelIdFor(entry.id);
            return (
              <div
                key={entry.id}
                className={styles.row}
                data-just-added={justAdded || undefined}
                data-expanded={expanded || undefined}
              >
                <div className={styles.rowHead}>
                  {/* Same pick idiom as the board's IdeaRow: a button wearing
                      role="checkbox", because the visual is a drawn circle no
                      native checkbox renders without being hidden and redrawn.
                      Its accessible name is the idea's title, so "select what?"
                      is answered by the name alone. A viewer gets no circle at
                      all — selection leads only to verbs they do not have.

                      It sits OUTSIDE the title button — a button inside a button
                      is invalid — and stops its own click, so picking a row
                      never also unfolds it or flies the map somewhere. */}
                  {canEdit && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected.has(entry.id)}
                      aria-label={entry.title}
                      className={[styles.pick, selected.has(entry.id) ? styles.pickOn : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleSelect(entry.id);
                      }}
                    >
                      {/* Colour is never the only signal — the tick says "picked"
                          as loudly as the fill. Decorative: aria-checked carries
                          the state. */}
                      {selected.has(entry.id) && (
                        <span className={styles.pickTick} aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  )}

                  <div className={styles.rowBody}>
                    <span className={styles.nameLine}>
                      {/* The name is the row's one click: it unfolds the row and
                          centres the map, in that order and only on the way
                          open. It does NOT toggle selection — that is the
                          circle's job. */}
                      <button
                        type="button"
                        className={styles.name}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => toggleRow(entry.id)}
                      >
                        {entry.title}
                      </button>
                      {/* Jade writes, it never fills: a confirmation as words. */}
                      {entry.scheduled && <span className={styles.onDay}>✓ on a day</span>}
                      {/* Category and appetite in the board's own plum pill —
                          "Shopping · 👍 6". Shared with IdeaRow rather than
                          drawn again here, because the same idea seen on two
                          screens must make the same claim; it draws nothing at
                          all when there is nothing to say. */}
                      <VotePill category={entry.category} total={entry.vote_tally.total} />
                      {/* The label half of the just-added signal; the border is
                          the other half. Apricot as shape only — border and
                          wash — the words stay ink. */}
                      {justAdded && <span className={styles.justAdded}>just added</span>}
                    </span>
                    {meta !== '' && <p className={styles.meta}>{meta}</p>}
                  </div>
                </div>

                {/* The panel is a SIBLING of the head, never a child of the
                    title button: nesting it would make every click inside — a
                    vote, a to-do tick, a plan chip — bubble up and shut the row
                    on the person using it.

                    Not rendered while closed rather than rendered hidden:
                    IdeaTodos fetches on mount, and a list of forty rows would
                    open with forty requests for lists nobody asked to see. */}
                {expanded && (
                  <IdeaPanel
                    entry={entry}
                    canEdit={canEdit}
                    id={panelId}
                    actions={
                      <MapIdeaActions
                        entry={entry}
                        bundles={bundles}
                        members={members}
                        canEdit={canEdit}
                        onToast={onToast}
                      />
                    }
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}

      {/* The place-less footer — ALWAYS present when anything qualifies,
          whatever the viewport is doing to the list above, because these ideas
          are invisible to the map no matter where it looks. Dashed border: the
          one block on the screen about things the map cannot draw. */}
      {placeless.length > 0 && (
        <div className={styles.placeless}>
          <div className={styles.placelessHead}>
            <span className={styles.placelessCount}>
              {placeless.length === 1
                ? '1 idea has no place yet'
                : `${placeless.length} ideas have no place yet`}
            </span>
            <button
              type="button"
              className={styles.placelessToggle}
              aria-expanded={placelessOpen}
              onClick={() => setPlacelessOpen((value) => !value)}
            >
              {placelessOpen ? 'Hide them' : 'Show them ›'}
            </button>
          </div>
          {/* Said out loud because a map that shows fewer ideas than the board
              looks like it lost some — the sentence is the reassurance. */}
          <p className={styles.placelessNote}>
            Not hidden — they are on your board, they just cannot be drawn here. Give one a place
            and it joins the map.
          </p>
          {placelessOpen &&
            placeless.map((entry) => (
              <div key={entry.id} className={styles.placelessRow}>
                <span className={styles.placelessTitle}>{entry.title}</span>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.putOnMap}
                    onClick={() => onPutOnMap(entry.id)}
                  >
                    Put it on the map
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

interface MapIdeaActionsProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  canEdit: boolean;
  onToast?: (message: string) => void;
}

/**
 * What this screen can DO about the idea it has just unfolded — the panel's
 * `actions` slot, and the whole of the map's vocabulary for an idea:
 *
 *   - "Add to plan", the same popover of plan chips IdeaRow carries, toggling
 *     the same links through the same mutations and saying the same two
 *     sentences. The map has no drag onto a plan rail, so these chips are not
 *     a pointer-free equivalent here — they are the only way.
 *   - "Move to Set aside", which names the list the idea is going to rather
 *     than the motion, so the way back is already in the words on the way out.
 *
 * And nothing else. "Edit" and "Add an idea inside" are the board's; the design
 * requirements put editing an idea's full detail out of scope for the map, and
 * a flat list has nowhere to put an inside.
 *
 * A separate component rather than a branch inside the list because it is what
 * makes "a closed row cannot keep a popover" true by construction: the panel is
 * not rendered while the row is closed, so this unmounts with it and the popover
 * state dies. IdeaRow needs an effect for the same guarantee only because it
 * stays mounted around its own panel. It also keeps the mutation hooks off the
 * forty rows nobody has opened.
 */
function MapIdeaActions({ entry, bundles, members, canEdit, onToast }: MapIdeaActionsProps) {
  const { show } = useToast();
  const plansLabelId = useId();
  const archiveEntry = useArchiveEntry();
  const { addLink, removeLink } = useLinkMutations();

  // The "Add to plan" popover: open/close state, a click-away listener, and
  // Escape handing focus back to the trigger — IdeaRow's, verbatim.
  const [plansOpen, setPlansOpen] = useState(false);
  const plansRef = useRef<HTMLDivElement>(null);
  const plansTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!plansOpen) return;
    function onDocPointerDown(event: MouseEvent) {
      if (plansRef.current && !plansRef.current.contains(event.target as Node)) setPlansOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setPlansOpen(false);
      plansTriggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [plansOpen]);

  // The plan names for a viewer's tags. Derived from the plan membership the
  // map screen already loads — no extra request.
  const bundleNames = useMemo(
    () =>
      bundles
        .filter((bundle) => (members.get(bundle.id) ?? []).some((member) => member.id === entry.id))
        .map((bundle) => bundle.title),
    [bundles, members, entry.id],
  );

  function isMember(bundleId: number): boolean {
    return (members.get(bundleId) ?? []).some((member) => member.id === entry.id);
  }

  // The same two mutations and the same two sentences as the board's chips,
  // because they are the same act — only reached from a different screen.
  function toggleBundle(bundle: Entry) {
    if (isMember(bundle.id)) {
      removeLink.mutate(
        { parentId: bundle.id, childId: entry.id },
        { onSuccess: () => onToast?.(`Removed from ${bundle.title}. Still kept.`) },
      );
    } else {
      addLink.mutate(
        { parentId: bundle.id, childId: entry.id },
        { onSuccess: () => onToast?.(`Added to ${bundle.title}.`) },
      );
    }
  }

  // A viewer gets the row's words and none of its verbs — not a greyed button,
  // just no button — and keeps the answer to "which plans?" as tags, the same
  // plum the plan names are written in everywhere else.
  if (!canEdit) {
    return bundleNames.length > 0 ? (
      <div className={styles.tags}>
        {bundleNames.map((name) => (
          <Tag key={name} tone="saved">
            {name}
          </Tag>
        ))}
      </div>
    ) : null;
  }

  return (
    <div className={styles.actionsRow}>
      <div className={styles.plansWrap} ref={plansRef}>
        <Button
          ref={plansTriggerRef}
          size="small"
          aria-haspopup="true"
          aria-expanded={plansOpen}
          onClick={() => setPlansOpen((value) => !value)}
        >
          Add to plan
        </Button>
        {plansOpen && (
          <div className={styles.plansMenu} role="group" aria-labelledby={plansLabelId}>
            <p className={styles.sectionLabel} id={plansLabelId}>
              Add to plan
            </p>
            {bundles.length === 0 ? (
              <p className={styles.empty}>No plans yet. Start one in the plans column.</p>
            ) : (
              <div className={styles.chips}>
                {bundles.map((bundle) => (
                  <Chip
                    key={bundle.id}
                    selected={isMember(bundle.id)}
                    onClick={() => toggleBundle(bundle)}
                  >
                    {bundle.title}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Set aside, never delete — the board's SetAsideSection is the way back,
          and the label names that list rather than the motion. */}
      <Button
        variant="quiet"
        size="small"
        onClick={() =>
          archiveEntry.mutate(entry.id, {
            onSuccess: () => show('Set aside.', 'success'),
            onError: () => show(SAVE_FAILED, 'error'),
          })
        }
      >
        Move to Set aside
      </Button>
    </div>
  );
}
