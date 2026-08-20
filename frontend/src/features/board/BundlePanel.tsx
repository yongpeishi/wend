import { useId, useMemo, useState } from 'react';
import { QueryGate } from '../../components/QueryGate';
import type { QueryGateSource } from '../../components/QueryGate';
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
 * The right-hand rail: plans (kind: 'bundle'), and only plans.
 *
 * The design mockup put a three-tab pill at the top of this rail — the product
 * owner scoped map and "this idea" out, so that strip is deliberately absent
 * rather than stubbed: a tab bar with one tab is chrome that promises
 * somewhere to go and then has nowhere. What the rail does have is a header of
 * its own — the design-system Label text "Plans". A region with a hairline
 * down its edge and no title read as an overflow of the idea list; a named
 * header is what makes it a place. It is a real `<h2>`, so `aria-label` on the
 * landmark would now be a second, competing name for the same region —
 * `aria-labelledby` points at the visible heading instead, and the two can
 * never drift apart.
 *
 * "+ New plan" sits directly under the label, full width, per the approved
 * mockup: it is the ONLY route to a new plan — the dashed drop target that
 * used to be the other one is gone, see NewBundleForm. Clicking it swaps it in
 * place for the naming input (NewBundleForm), which takes focus on mount, so
 * the swap and being ready to type are the same event; Escape puts the button
 * back.
 *
 * The new plan lands at the TOP of the list, where the input that made it sat.
 * Anything you just made should be the first thing you see; the list is sorted
 * newest-first here rather than in the API, because `/entries` orders by id
 * for every kind on the board and ideas are deliberately oldest-first.
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
        Plans
      </h2>

      {/* The rail keeps its name and every plan in it for a viewer — this is
          where a trip's thinking is grouped, and reading it is the point. Only
          the one action the rail owns goes.

          The button and the naming input trade the same slot, outside the gate:
          naming a new plan needs nothing from the list below it, and taking the
          way forward away because a read failed would turn one problem into
          two. */}
      {canEdit &&
        (naming ? (
          <NewBundleForm tripId={tripId} onToast={onToast} onClose={() => setNaming(false)} />
        ) : (
          <button type="button" className={styles.newPlan} onClick={() => setNaming(true)}>
            + New plan
          </button>
        ))}

      <div className={styles.stack}>
        <QueryGate
          query={query}
          loadingLabel="Finding your plans"
          errorMessage="Your plans didn't load. Nothing is lost — every group you've made is still here."
        >
          {newestFirst.length === 0 ? (
            // An editor's empty rail is a prompt: the header's action is right
            // there, so the copy points at it. A viewer has no such action, and
            // pointing at one that was never rendered is a dead end — for them an
            // empty rail is a normal, permanent state, so it is stated and left
            // alone. Same treatment as the schedule's empty day.
            <p className={styles.empty}>
              {canEdit
                ? 'No plans yet. Start one from the top of this rail — an empty plan is a fine place to start.'
                : 'No plans on this trip yet.'}
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
