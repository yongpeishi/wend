import { Spinner } from '../../components/Spinner';
import { useRestoreEntry } from '../../api';
import type { Entry } from '../../api/types';
import { BundleCard } from './BundleCard';
import { NewBundleBox } from './NewBundleBox';
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
 * chrome that promises somewhere to go and then has nowhere. When those views
 * come back the strip comes back with them, above this component, not inside
 * it. The rail names itself through the landmark label instead.
 *
 * Order is the reading order of the job: what a bundle IS, then how to start
 * one, then the ones you have, then the ones you set aside. The set-aside
 * disclosure stays at the foot and now carries more weight than it did:
 * removing a bundle from a card archives it, so this disclosure is the undo
 * for the strongest action on the rail. Nothing here is destroyed, so the way
 * back has to be visible on the same screen as the way out.
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

  return (
    <aside className={styles.panel} aria-label="Bundles">
      <div className={styles.stack}>
        <p className={styles.intro}>
          A bundle is a group of things that go well together. Bundles can be used to form your itinerary.
        </p>

        <NewBundleBox tripId={tripId} onToast={onToast} />

        {loading ? (
          <Spinner label="Finding your bundles" />
        ) : bundles.length === 0 ? (
          <p className={styles.empty}>
            No bundles yet. Drop an idea above, or name one — an empty bundle is a fine place to start.
          </p>
        ) : (
          bundles.map((bundle) => (
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
