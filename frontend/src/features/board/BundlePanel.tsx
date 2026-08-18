import { useId, useMemo, useState } from 'react';
import { QueryGate } from '../../components/QueryGate';
import type { QueryGateSource } from '../../components/QueryGate';
import { Button } from '../../design/components/core/Button';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useRestoreEntry } from '../../api';
import type { Entry } from '../../api/types';
import { BundleCard } from './BundleCard';
import { NewBundleForm } from './NewBundleForm';
import { SetAsideSection } from './SetAsideSection';
import styles from './BundlePanel.module.css';

export interface BundlePanelProps {
  /** The trip new bundles nest under. */
  tripId: number;
  /** Live bundles, already filtered of archived ones by the board. */
  bundles: Entry[];
  /** Archived bundles — the set-aside disclosure at the foot of the rail. */
  archivedBundles: Entry[];
  /** bundleId -> members in entry_links.position order (useBundleMembers). */
  members: Map<number, Entry[]>;
  /**
   * The bundles query itself, not a `loading` boolean: the rail gates its own
   * list on it, so a failed load says so and offers a way back instead of
   * falling through to "No bundles yet" — a claim about the trip the rail has
   * no right to make about a request that never answered.
   */
  query: QueryGateSource;
  /** Open a member idea in place. Omitted, the card falls back to navigating. */
  onOpen?: (id: number) => void;
  onToast: (message: string) => void;
}

/**
 * The right-hand rail: bundles, and only bundles.
 *
 * The design mockup put a three-tab pill at the top of this rail — Bundles |
 * Map | This idea. The product owner scoped map and "this idea" out, so that
 * strip is deliberately absent rather than stubbed: a tab bar with one tab is
 * chrome that promises somewhere to go and then has nowhere. What the rail does
 * have now is a header of its own — the design's uppercase "Bundles" label, and
 * the one action the rail owns pinned to the far end of it. A region with a
 * hairline down its edge and no title read as an overflow of the idea list; a
 * named header is what makes it a place. It is a real `<h2>`, so `aria-label`
 * on the landmark would now be a second, competing name for the same region —
 * `aria-labelledby` points at the visible heading instead, and the two can
 * never drift apart.
 *
 * "+ New bundle" is secondary, not primary: the primary act of this whole
 * screen is adding an idea, and the rail is where you organise the ideas you
 * already have. It is medium rather than the small size the header rhythm would
 * suggest, because it is now the ONLY route to a new bundle — the dashed drop
 * target that used to be the other one is gone, see NewBundleForm — and Button
 * is explicit that `small` sits under the 48px tap minimum and must never be
 * the only way to reach an action. Clicking it while the form is already open
 * does nothing, by design: the form is right there, and it took focus when it
 * arrived.
 *
 * Order is the reading order of the job: what this rail is, what a bundle IS,
 * then the ones you have, then the ones you set aside. Starting a bundle is no
 * longer a step in that sequence — it is an action in the header, and the row
 * it opens lands at the TOP of the list, where the bundle it creates will also
 * appear. Anything you just made should be the first thing you see; the list is
 * sorted newest-first here rather than in the API, because `/entries` orders by
 * id for every kind on the board and ideas are deliberately oldest-first.
 *
 * The set-aside disclosure stays at the foot and now carries more weight than
 * it did: removing a bundle from a card archives it, so this disclosure is the
 * undo for the strongest action on the rail. Nothing here is destroyed, so the
 * way back has to be visible on the same screen as the way out. It is pinned to
 * the foot in the layout sense too — the bundle list between the intro and it
 * scrolls on its own rather than growing the page, so the way back does not
 * drift below the fold as the rail fills up. See BundlePanel.module.css.
 *
 * The panel takes no compare selection any more. Compare was a card action
 * and went with the rest of that row — see BundleCard's doc comment.
 *
 * Restoring is handled here rather than handed up as a prop: the panel already
 * takes `onToast` for its wording, and every other bundle mutation on this
 * rail (rename, remove) already lives inside these components. Routing just
 * this one back through the board would be the odd one out.
 *
 * `onOpen` is the exception, and it is a pass-through rather than a decision:
 * opening a bundle member is the board's business, because the drawer it opens
 * belongs to the board. Handing it down means a member opens over the page
 * instead of at a route of its own, which is what keeps the page beneath the
 * drawer's scrim and keeps the idea inside the trip's role — a viewer opening a
 * member gets it read-only. The rail adds nothing to it and takes nothing from
 * it; where it is absent the cards navigate as they always did.
 */
export function BundlePanel({ tripId, bundles, archivedBundles, members, query, onOpen, onToast }: BundlePanelProps) {
  const restoreEntry = useRestoreEntry();
  const canEdit = useCanEdit();
  const [naming, setNaming] = useState(false);
  const headingId = useId();

  // Newest first. Entry ids are the backend's own ordering key — `/entries`
  // sorts by id ascending — so reversing that is "most recently made" in the
  // same terms, without inventing a comparison on created_at that would say the
  // same thing one field further from the truth.
  const newestFirst = useMemo(() => [...bundles].sort((a, b) => b.id - a.id), [bundles]);

  return (
    <aside className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Bundles
      </h2>

      <p className={styles.intro}>
        A bundle is a group of things that go well together. Bundles can be used to form your itinerary.
      </p>

      {/* The rail keeps its name, its intro and every bundle in it for a
          viewer — this is where a trip's thinking is grouped, and reading it is
          the point. Only the one action the header owns goes. */}
      {canEdit && (
        <div className={styles.cta}>
          <Button variant="secondary" size="small" onClick={() => setNaming(true)}>
            + New bundle
          </Button>
        </div>
      )}

      <div className={styles.stack}>
        {/* The form stays outside the gate: naming a new bundle needs nothing
            from the list below it, and taking the way forward away because a
            read failed would turn one problem into two. */}
        {naming && <NewBundleForm tripId={tripId} onToast={onToast} onClose={() => setNaming(false)} />}

        <QueryGate
          query={query}
          loadingLabel="Finding your bundles"
          errorMessage="Your bundles didn't load. Nothing is lost — every group you've made is still here."
        >
          {newestFirst.length === 0 ? (
            // An editor's empty rail is a prompt: the header's action is right
            // there, so the copy points at it. A viewer has no such action, and
            // pointing at one that was never rendered is a dead end — for them an
            // empty rail is a normal, permanent state, so it is stated and left
            // alone. Same treatment as the schedule's empty day.
            <p className={styles.empty}>
              {canEdit
                ? 'No bundles yet. Start one from the top of this rail — an empty bundle is a fine place to start.'
                : 'No bundles on this trip yet.'}
            </p>
          ) : (
            newestFirst.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                members={members.get(bundle.id) ?? []}
                onOpen={onOpen}
                onToast={onToast}
              />
            ))
          )}
        </QueryGate>
      </div>

      <SetAsideSection
        entries={archivedBundles}
        onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => onToast('Picked back up.') })}
        canEdit={canEdit}
      />
    </aside>
  );
}
