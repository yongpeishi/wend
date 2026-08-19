import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Chip } from '../../design/components/core/Chip';
import { useToast } from '../../components/Toast';
import { useCreateScheduleItem } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import { SAVE_FAILED, linkRefusalMessage } from './structureDrop';
import type { GraphTree } from './graphTree';
import styles from './StructureRowMenu.module.css';

export interface StructureRowMenuProps {
  /** The entry this row stands for. */
  entry: Entry;
  /** The whole graph — where the candidate parents and the nudge's children come from. */
  tree: GraphTree;
  /** The trip the panel is scoped to: the root candidate, the schedule's owner,
   * and the day the schedule item lands on (its first day). */
  trip: Entry;
}

/**
 * The ⋯ on a structure row: the copy path and the schedule path, in one popup.
 * Mirrors IdeaActionsMenu's mechanics exactly — not `role="menu"` (half of this
 * popup is toggles, not commands; Tab already walks a labelled group of
 * buttons), focus moves in on open and back to the trigger on Escape, and a
 * click outside closes it.
 *
 * Drag on the row MOVES; this menu is where the other verbs live:
 *
 * "Add to another parent…" is the COPY path — the DAG's whole point is that a
 * child may hang in several places, and these chips are the pointer-free way to
 * put it there (checking adds a link, unchecking removes one, the same bargain
 * as the bundle chips everywhere else on the board). Candidates are what the
 * graph can offer: the trip root, every bundle, every idea — minus this entry
 * and its own descendants, the cycle-obvious cases. Nothing else is
 * pre-validated: the server owns the graph's rules, and its 422 sentence is
 * surfaced as written.
 *
 * "Send to schedule" puts the entry on the trip's first day — everything in
 * this panel is in-trip by construction, so the backend's fks-belong-to-trip
 * rule is satisfied before the question is asked; the itinerary is where it
 * gets moved to the right day. One soft nudge on the way: an idea holding
 * options is usually a question ("visit Daiso" holding three branches), and
 * scheduling the question when you meant an answer is the likely slip — so the
 * menu offers the children first, with a quiet "anyway" that respects the
 * original ask. Bundles get NO nudge: scheduling a bundle is the designed
 * defer-the-choice-to-the-day flow, and leaf ideas have nothing to ask about.
 */
export function StructureRowMenu({ entry, tree, trip }: StructureRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [parentsOpen, setParentsOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const { show } = useToast();
  const { addLink, removeLink } = useLinkMutations();
  const createItem = useCreateScheduleItem(trip.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const firstNudgeRef = useRef<HTMLButtonElement>(null);
  const parentsLabelId = useId();
  const nudgeLabelId = useId();

  // Opening moves focus into the popup so a keyboard reaches the actions
  // without tabbing past the trigger, and Escape hands it straight back.
  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    function onDocPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // The nudge swaps the popup's content, so the focus that was on the menu
  // item it replaced has to land somewhere real.
  useEffect(() => {
    if (nudgeOpen) firstNudgeRef.current?.focus();
  }, [nudgeOpen]);

  function close() {
    setOpen(false);
    setParentsOpen(false);
    setNudgeOpen(false);
  }

  /** This entry and everything under it — the parents no chip may offer,
   * because each would be a cycle the server is only going to refuse. The
   * visited set doubles as the walker's cycle guard. */
  const excludedIds = useMemo(() => {
    const seen = new Set<number>();
    const stack = [entry.id];
    while (stack.length > 0) {
      const id = stack.pop() as number;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const child of tree.childrenOf(id)) stack.push(child.id);
    }
    return seen;
  }, [tree, entry.id]);

  // Root first — "file it at the top level" is the candidate a reader scans
  // for — then everything else in the graph's own order. Only containers-to-be:
  // bundles and ideas (an idea holding children is this feature's whole point).
  const candidates = useMemo(() => {
    const others = [...tree.entryById.values()].filter(
      (candidate) =>
        candidate.id !== tree.root.id &&
        (candidate.kind === 'bundle' || candidate.kind === 'idea') &&
        !candidate.archived_at &&
        !excludedIds.has(candidate.id),
    );
    return excludedIds.has(tree.root.id) ? others : [tree.root, ...others];
  }, [tree, excludedIds]);

  const parentIds = useMemo(() => new Set(tree.parentsOf(entry.id).map((parent) => parent.id)), [tree, entry.id]);

  function toggleParent(candidate: Entry) {
    if (parentIds.has(candidate.id)) {
      removeLink.mutate(
        { parentId: candidate.id, childId: entry.id },
        {
          onSuccess: () => show(`Removed from ${candidate.title}. Still kept.`, 'success'),
          onError: () => show(SAVE_FAILED, 'error'),
        },
      );
    } else {
      addLink.mutate(
        { parentId: candidate.id, childId: entry.id },
        {
          onSuccess: () => show(`Added to ${candidate.title}.`, 'success'),
          // The cycle sentence, as the server wrote it — see linkRefusalMessage.
          onError: (error) => show(linkRefusalMessage(error), 'error'),
        },
      );
    }
  }

  const children = tree.childrenOf(entry.id).filter((child) => !child.archived_at);
  // Only an idea holding options gets the question. A bundle scheduling whole
  // is the designed flow, and a leaf has nothing to pick between.
  const needsNudge = entry.kind === 'idea' && children.length > 0;

  function schedule(target: Entry) {
    // The trip's first day: a real day the backend will accept, and the
    // itinerary is one drag away from the right one. A dateless trip falls
    // back to today, which is the same "somewhere real, move it later" bargain.
    const day = trip.starts_on ?? new Date().toISOString().slice(0, 10);
    createItem.mutate(
      { entry_id: target.id, day },
      {
        onSuccess: () => {
          close();
          show(`Added ${target.title} to the schedule.`, 'success');
        },
        onError: () => show(SAVE_FAILED, 'error'),
      },
    );
  }

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Structure actions for ${entry.title}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="group" aria-label={`Structure actions for ${entry.title}`}>
          {nudgeOpen ? (
            /* The soft nudge, in place of the menu it grew out of: the same
               popup surface, so Escape and outside-click already work on it. */
            <div className={styles.section} role="group" aria-labelledby={nudgeLabelId}>
              <p className={styles.nudgeLine} id={nudgeLabelId}>
                This holds {children.length} {children.length === 1 ? 'option' : 'options'} — schedule a specific
                one?
              </p>
              {children.map((child, index) => (
                <button
                  key={child.id}
                  type="button"
                  ref={index === 0 ? firstNudgeRef : undefined}
                  className={styles.item}
                  onClick={() => schedule(child)}
                >
                  {child.title}
                </button>
              ))}
              <button type="button" className={[styles.item, styles.quiet].join(' ')} onClick={() => schedule(entry)}>
                Schedule “{entry.title}” anyway
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                ref={firstItemRef}
                className={styles.item}
                aria-expanded={parentsOpen}
                onClick={() => setParentsOpen((value) => !value)}
              >
                Add to another parent…
              </button>

              {parentsOpen && (
                <div className={styles.section}>
                  <p className={styles.sectionLabel} id={parentsLabelId}>
                    Also under
                  </p>
                  {candidates.length === 0 ? (
                    <p className={styles.empty}>Nowhere else to put this yet.</p>
                  ) : (
                    <div className={styles.chips} aria-labelledby={parentsLabelId}>
                      {candidates.map((candidate) => (
                        <Chip
                          key={candidate.id}
                          selected={parentIds.has(candidate.id)}
                          onClick={() => toggleParent(candidate)}
                        >
                          {candidate.title}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                className={styles.item}
                onClick={() => (needsNudge ? setNudgeOpen(true) : schedule(entry))}
              >
                Send to schedule
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
