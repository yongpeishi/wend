import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useToast } from '../../components/Toast';
import type { Entry } from '../../api/types';
import { useLinkMutations } from '../board/useLinkMutations';
import { NewBundleModal } from '../board/NewBundleModal';
import styles from './MapSelectionBar.module.css';

export interface MapSelectionBarProps {
  selectedIds: readonly number[];
  /** The trip's plans. */
  bundles: Entry[];
  /**
   * bundleId → what is already in it, from useBundleMembers. Read twice: for
   * the "{count} ideas" meta on each popover row, and to skip linking an idea
   * to a plan it is already in — that link is unique per (parent, child) and a
   * second one is a 422, not a no-op.
   */
  members: Map<number, Entry[]>;
  /** The trip a brand-new plan nests under. */
  tripId: number;
  /**
   * The first selected idea's title. Part of the frozen contract for naming a
   * new plan, but deliberately unread: NewBundleModal asks for a name rather
   * than being seeded with one — a plan named after whichever idea happened to
   * be ticked first is the "New bundle" problem wearing a disguise.
   */
  firstSelectedTitle: string | null;
  /** Governs rendering; the parent never offers selection to viewers anyway. */
  canEdit: boolean;
  onClear: () => void;
  onToast: (message: string) => void;
}

/** "2 ideas" / "1 idea" — the count is always spoken, never left to a bare digit. */
function ideaCount(count: number): string {
  return `${count} ${count === 1 ? 'idea' : 'ideas'}`;
}

/**
 * The bar under the map: what a selection is FOR. Empty, it teaches the
 * gesture in one sentence; holding a selection, it offers the one verb worth
 * doing to several pins at once — send them to a plan.
 *
 * The popover is BulkBar's idiom to the letter: opening moves focus onto the
 * first row, Escape closes and hands focus straight back to the trigger, a
 * click anywhere else lands on an invisible catcher. Same membership-skip
 * (already-in ideas are not re-linked), same finish order — clear, close,
 * toast last, because the toast describes something already finished — and
 * the same split for outcomes: success goes up through the parent's callback,
 * failure goes straight to the house error toast.
 *
 * A viewer with a selection (defensive — the parent should never produce one)
 * gets the count and Clear: nothing on this bar reads, so there is nothing
 * else to leave them.
 */
export function MapSelectionBar({
  selectedIds,
  bundles,
  members,
  tripId,
  canEdit,
  onClear,
  onToast,
}: MapSelectionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [namingOpen, setNamingOpen] = useState(false);
  const { show } = useToast();
  const { addLink } = useLinkMutations();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuLabelId = useId();

  // Same contract as BulkBar's popover: opening moves focus into the panel,
  // Escape closes it and hands focus straight back to the trigger.
  useEffect(() => {
    if (!menuOpen) return;
    firstItemRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // The naming modal is one route away — a cancelled menu must not close it too.
      event.stopPropagation();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeNaming = useCallback(() => setNamingOpen(false), []);

  if (selectedIds.length === 0) {
    // One sentence for everyone, viewers included: the map-dragging half is
    // true for them, and two variants of a hint is more state than a hint is
    // worth.
    return (
      <p className={styles.hint}>
        Tick ideas in the list or click their pins, then send them to a plan. Drag the map to look
        around.
      </p>
    );
  }

  if (!canEdit) {
    return (
      <div className={styles.bar}>
        <span className={styles.count}>{ideaCount(selectedIds.length)} selected</span>
        <button type="button" className={styles.quiet} onClick={onClear}>
          Clear
        </button>
      </div>
    );
  }

  const failed = () => show("That didn't save. It's still here — try again.", 'error');

  /**
   * Links every selected idea into `bundle`, skipping the ones already there,
   * then stands the bar down in BulkBar's order: clear, close, toast last.
   * The toast counts the whole selection, not just the newly linked — "added"
   * describes where the ideas ARE now, which is true either way.
   */
  async function linkAllTo(bundle: Entry) {
    const already = new Set((members.get(bundle.id) ?? []).map((member) => member.id));
    const toLink = selectedIds.filter((id) => !already.has(id));
    await Promise.all(toLink.map((id) => addLink.mutateAsync({ parentId: bundle.id, childId: id })));
    onClear();
    setMenuOpen(false);
    onToast(`Added ${ideaCount(selectedIds.length)} to ${bundle.title}. Still on your board too.`);
  }

  async function addAllTo(bundle: Entry) {
    try {
      await linkAllTo(bundle);
    } catch {
      failed();
    }
  }

  return (
    <div className={styles.bar}>
      <span className={styles.count}>{ideaCount(selectedIds.length)} selected</span>

      <div className={styles.actions}>
        <button type="button" className={styles.quiet} onClick={onClear}>
          Clear
        </button>
        <button
          type="button"
          ref={triggerRef}
          className={styles.primary}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          Add to plan <span aria-hidden="true">⌄</span>
        </button>
      </div>

      {menuOpen && (
        <>
          {/* Click anywhere else and the menu goes away. Hidden from assistive
              tech and out of the tab order — a pointer convenience; Escape is
              the keyboard's way out. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles.catcher}
            onClick={() => setMenuOpen(false)}
          />

          {/* Not role="menu": that role promises arrow-key traversal and a
              single tab stop, and these are ordinary buttons Tab already
              walks in order. */}
          <div className={styles.panel} role="group" aria-labelledby={menuLabelId}>
            <p className={styles.panelLabel} id={menuLabelId}>
              Add to
            </p>

            {bundles.map((bundle, index) => (
              <button
                key={bundle.id}
                type="button"
                ref={index === 0 ? firstItemRef : undefined}
                className={styles.panelItem}
                onClick={() => addAllTo(bundle)}
              >
                <span className={styles.panelItemTitle}>{bundle.title}</span>
                <span className={styles.panelItemMeta}>
                  {ideaCount((members.get(bundle.id) ?? []).length)}
                </span>
              </button>
            ))}

            {/* The last row, styled like the plans above it — starting one is
                the same kind of choice as picking one. */}
            <button
              type="button"
              ref={bundles.length === 0 ? firstItemRef : undefined}
              className={styles.panelItem}
              onClick={() => {
                setMenuOpen(false);
                setNamingOpen(true);
              }}
            >
              <span className={styles.panelItemTitle}>New plan from these</span>
            </button>
          </div>
        </>
      )}

      {/* Reused, not rebuilt — and the name field starts empty on purpose:
          asking is the app's deliberate naming behaviour (a plan's name is the
          decision), so nothing is prefilled. */}
      <NewBundleModal
        open={namingOpen}
        onClose={closeNaming}
        tripId={tripId}
        onCreated={(bundle) => {
          setNamingOpen(false);
          // A plan that has just been created has no members, so this is the
          // plain link path — nothing to skip.
          linkAllTo(bundle).catch(failed);
        }}
      />
    </div>
  );
}
