import { useId, useMemo, useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { Button } from '../../design/components/core/Button';
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
  /** The bundles query is still in flight. */
  loading: boolean;
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
 */
export function BundlePanel({ tripId, bundles, archivedBundles, members, loading, onToast }: BundlePanelProps) {
  const restoreEntry = useRestoreEntry();
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

      <div className={styles.cta}>
        <Button variant="secondary" size="small" onClick={() => setNaming(true)}>
          + New bundle
        </Button>
      </div>

      <div className={styles.stack}>
        {naming && <NewBundleForm tripId={tripId} onToast={onToast} onClose={() => setNaming(false)} />}

        {loading ? (
          <Spinner label="Finding your bundles" />
        ) : newestFirst.length === 0 ? (
          <p className={styles.empty}>
            No bundles yet. Start one from the top of this rail — an empty bundle is a fine place to start.
          </p>
        ) : (
          newestFirst.map((bundle) => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              members={members.get(bundle.id) ?? []}
              onToast={onToast}
            />
          ))
        )}
      </div>

      <SetAsideSection
        entries={archivedBundles}
        onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => onToast('Picked back up.') })}
      />
    </aside>
  );
}
