import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Chip } from '../../design/components/core/Chip';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './AddToBundleMenu.module.css';

export interface AddToBundleMenuProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  onToast?: (message: string) => void;
}

/**
 * The keyboard/pointer-free equivalent of dragging an idea onto a bundle.
 * Every drag interaction on the board needs this — this is it. A chip per
 * bundle: selected means the idea is already linked; toggling it on or off
 * costs the same one click either way, so ungrouping one idea from one
 * bundle is exactly as reachable as grouping it.
 */
export function AddToBundleMenu({ entry, bundles, members, onToast }: AddToBundleMenuProps) {
  const [open, setOpen] = useState(false);
  const { addLink, removeLink } = useLinkMutations();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function isMember(bundleId: number): boolean {
    return (members.get(bundleId) ?? []).some((member) => member.id === entry.id);
  }

  function toggle(bundle: Entry) {
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
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Add ${entry.title} to a bundle`}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        Add to bundle
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label={`Bundles for ${entry.title}`}>
          {bundles.length === 0 ? (
            <p className={styles.empty}>No bundles yet. Make one in the bundles column.</p>
          ) : (
            bundles.map((bundle) => (
              <Chip key={bundle.id} selected={isMember(bundle.id)} onClick={() => toggle(bundle)}>
                {bundle.title}
              </Chip>
            ))
          )}
        </div>
      )}
    </div>
  );
}
