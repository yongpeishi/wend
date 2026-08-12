import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Chip } from '../../design/components/core/Chip';
import { useToast } from '../../components/Toast';
import { useArchiveEntry } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './IdeaActionsMenu.module.css';

export interface IdeaActionsMenuProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  /** Opens the edit drawer for this idea. */
  onEdit: () => void;
  onToast?: (message: string) => void;
}

/**
 * Everything you can do to one idea from the board, behind one ⋯ button on the
 * right of its row.
 *
 * The row used to wear its actions on its sleeve — an "Add to bundle" pill, a
 * set-aside icon, a drag handle — and editing had no button at all: you clicked
 * the row and a drawer appeared, which read as something that had happened to
 * you rather than something you asked for. So the actions are gathered here and
 * editing is named among them.
 *
 * The drag handle deliberately stays outside: you cannot drag a thing out of a
 * menu, and dragging an idea onto a bundle is the board's core gesture. Its
 * pointer-free equivalent is in here, as the bundle chips.
 *
 * Not `role="menu"`. That role promises arrow-key traversal and a single tab
 * stop, and half of this popup is a set of toggles rather than commands
 * (selecting a bundle chip adds the idea to it; selecting it again takes it out
 * — ungrouping is as cheap as grouping). A labelled group of ordinary buttons
 * is what this actually is, and Tab already walks it in order.
 */
export function IdeaActionsMenu({ entry, bundles, members, onEdit, onToast }: IdeaActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const { show } = useToast();
  const archiveEntry = useArchiveEntry();
  const { addLink, removeLink } = useLinkMutations();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const bundlesLabelId = useId();

  // Opening moves focus into the popup so a keyboard reaches the actions
  // without tabbing past the trigger, and Escape hands it straight back.
  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    function onDocPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function isMember(bundleId: number): boolean {
    return (members.get(bundleId) ?? []).some((member) => member.id === entry.id);
  }

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

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Actions for ${entry.title}`}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="group" aria-label={`Actions for ${entry.title}`}>
          <button
            type="button"
            ref={firstItemRef}
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>

          {/* Set aside, never delete — SetAsideSection at the foot of the board
              is the way back, on the same screen as the way out. */}
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              archiveEntry.mutate(entry.id, {
                onSuccess: () => show('Set aside.', 'success'),
                onError: () => show("That didn't save. It's still here — try again.", 'error'),
              });
            }}
          >
            Set aside
          </button>

          <div className={styles.section}>
            <p className={styles.sectionLabel} id={bundlesLabelId}>
              Add to bundle
            </p>
            {bundles.length === 0 ? (
              <p className={styles.empty}>No bundles yet. Start one in the bundles column.</p>
            ) : (
              <div className={styles.chips} aria-labelledby={bundlesLabelId}>
                {bundles.map((bundle) => (
                  <Chip key={bundle.id} selected={isMember(bundle.id)} onClick={() => toggleBundle(bundle)}>
                    {bundle.title}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
