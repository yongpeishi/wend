import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useArchiveEntry, useLiftEntry } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import { NewBundleModal } from './NewBundleModal';
import styles from './BulkBar.module.css';

export interface BulkBarProps {
  selectedIds: number[];
  bundles: Entry[];
  /**
   * bundleId -> what is already in it, from `useBundleMembers`. Used only to
   * avoid asking the server to link an idea to a bundle it is already in — that
   * link is unique per (parent, child) and a second one is a 422, not a no-op.
   * Optional because a caller that hasn't got the map still gets a working bar;
   * it just leans on the server to say no.
   */
  members?: Map<number, Entry[]>;
  /**
   * The trip a brand-new bundle nests under. Without it the "A new bundle" row
   * is not offered — a bundle attached to nothing would be created and then be
   * invisible, which is worse than not offering it.
   */
  tripId?: number;
  onClear: () => void;
  /**
   * Leave select mode entirely. Called after a successful add, alongside
   * `onClear`: the ideas have gone where they were going, so the board should
   * be a board again rather than leaving a row of empty circles behind.
   */
  onExitSelectMode?: () => void;
  onToast: (message: string) => void;
}

/** "2 ideas" / "1 idea" — the count is always spoken, never left to a bare digit. */
function ideaCount(count: number): string {
  return `${count} ${count === 1 ? 'idea' : 'ideas'}`;
}

/**
 * What you can do to several ideas at once, as one pill at the foot of the list.
 *
 * It is in normal flow, not fixed and not sticky. A bar pinned to the bottom of
 * the viewport is the usual reflex here, and it is wrong for this screen: it
 * covers the last row of the very list you are picking from, and it hangs there
 * over unrelated parts of the page. This bar belongs to the list, so it sits at
 * the end of the list and scrolls away with it. Nothing is ever hidden behind
 * it.
 *
 * It renders nothing at all when nothing is picked, so there is no empty
 * chrome waiting to be used — select mode plus a selection is the only state
 * that puts it on screen.
 *
 * One primary verb, three quiet ones. "Add to a bundle" is the reason anyone
 * picks several ideas, so it is the only filled button on the bar; "Make
 * separate trips" and "Move to Set aside" keep working exactly as they did but
 * stop competing for the eye. They are deliberately still here — the design
 * only draws the bundle verb, but taking two working actions away to match a
 * picture is a regression, not a simplification.
 *
 * Both of those verbs name where the ideas end up rather than the motion that
 * gets them there: "Lift out" and "Set aside" read as jargon to anyone who has
 * not already been told what they do. There is no room for a line of
 * explanation in a pill this size, so the label carries the whole meaning — the
 * edit drawer, which has the room, adds the sentence.
 *
 * The "Add to" popover opens upward, above the bar, because the bar sits at the
 * bottom of a long column: a menu dropping down would land off-screen exactly
 * when the list is long enough to need it. It closes on a click anywhere else
 * (an invisible catcher behind it), on Escape, and after a choice — and Escape
 * hands focus back to the button that opened it, so a keyboard never loses its
 * place.
 *
 * Adding always ends the mode: clear the selection, close the menu, leave
 * select mode, then say what happened. The toast is last because it describes
 * something that has already finished.
 */
export function BulkBar({
  selectedIds,
  bundles,
  members,
  tripId,
  onClear,
  onExitSelectMode,
  onToast,
}: BulkBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [namingOpen, setNamingOpen] = useState(false);
  const canEdit = useCanEdit();
  const { show } = useToast();
  const { addLink } = useLinkMutations();
  const lift = useLiftEntry();
  const archive = useArchiveEntry();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuLabelId = useId();

  // Same contract as the row's ⋯ menu: opening moves focus into the popover,
  // Escape closes it and hands focus straight back to the trigger.
  useEffect(() => {
    if (!menuOpen) return;
    firstItemRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // The edit drawer and the modals are one route away — a cancelled menu
      // must not close them too.
      event.stopPropagation();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeNaming = useCallback(() => setNamingOpen(false), []);

  if (selectedIds.length === 0) return null;

  // Every verb on this bar changes the trip — there is no read-only half of it
  // worth leaving behind, so a viewer gets no bar at all rather than a pill
  // holding one greyed row. FilterBar hides the way into select mode too, so
  // this is the second lock on a door that is already shut.
  if (!canEdit) return null;

  const failed = () => show("That didn't save. It's still here — try again.", 'error');

  /** Everything a completed bulk action does, in the order the design asks for. */
  function finish(message: string) {
    onClear();
    setMenuOpen(false);
    onExitSelectMode?.();
    onToast(message);
  }

  async function linkAllTo(bundle: Entry) {
    // Already-members are skipped rather than re-linked: the link is unique per
    // (bundle, idea), so asking twice is an error response, not a no-op.
    const already = new Set((members?.get(bundle.id) ?? []).map((member) => member.id));
    const toLink = selectedIds.filter((id) => !already.has(id));
    await Promise.all(toLink.map((id) => addLink.mutateAsync({ parentId: bundle.id, childId: id })));
    finish(`Added ${ideaCount(selectedIds.length)} to ${bundle.title}.`);
  }

  async function addAllToBundle(bundle: Entry) {
    try {
      await linkAllTo(bundle);
    } catch {
      failed();
    }
  }

  async function liftOut() {
    const count = selectedIds.length;
    try {
      await Promise.all(selectedIds.map((id) => lift.mutateAsync(id)));
    } catch {
      failed();
      return;
    }
    onToast(`Lifted ${ideaCount(count)} out — each is a trip of its own now.`);
    onClear();
  }

  async function setAside() {
    const count = selectedIds.length;
    try {
      await Promise.all(selectedIds.map((id) => archive.mutateAsync(id)));
    } catch {
      failed();
      return;
    }
    onToast(`Set aside ${ideaCount(count)}.`);
    onClear();
  }

  return (
    <div className={styles.bar}>
      <span className={styles.count}>{ideaCount(selectedIds.length)} selected</span>

      <div className={styles.actions}>
        <button type="button" className={styles.quiet} onClick={liftOut}>
          Make separate trips
        </button>
        <button type="button" className={styles.quiet} onClick={setAside}>
          Move to Set aside
        </button>
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
          Add to a bundle
        </button>
      </div>

      {menuOpen && (
        <>
          {/* Click anywhere else and the menu goes away. Hidden from assistive
              tech and out of the tab order — it is a pointer convenience, and
              Escape is the keyboard's way out. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles.catcher}
            onClick={() => setMenuOpen(false)}
          />

          {/* Not role="menu": these are ordinary buttons and Tab already walks
              them in order — see IdeaActionsMenu for the same reasoning. */}
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
                onClick={() => addAllToBundle(bundle)}
              >
                {bundle.title}
              </button>
            ))}

            {/* The last row, styled exactly like the bundles above it — starting
                one is the same kind of act as choosing one, so it gets no
                separator, no icon and no special pleading. */}
            {tripId !== undefined && (
              <button
                type="button"
                ref={bundles.length === 0 ? firstItemRef : undefined}
                className={styles.panelItem}
                onClick={() => {
                  setMenuOpen(false);
                  setNamingOpen(true);
                }}
              >
                A new bundle
              </button>
            )}

            {bundles.length === 0 && tripId === undefined && <p className={styles.empty}>No bundles yet.</p>}
          </div>
        </>
      )}

      {tripId !== undefined && (
        <NewBundleModal
          open={namingOpen}
          onClose={closeNaming}
          tripId={tripId}
          onCreated={(bundle) => {
            setNamingOpen(false);
            // A bundle that has just been created has no members, so this is the
            // plain link path — nothing to skip.
            linkAllTo(bundle).catch(failed);
          }}
        />
      )}
    </div>
  );
}
