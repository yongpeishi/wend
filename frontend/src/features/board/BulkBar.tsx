import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Chip } from '../../design/components/core/Chip';
import { Row } from '../../components/layout/Stack';
import { useArchiveEntry, useLiftEntry } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './BulkBar.module.css';

export interface BulkBarProps {
  selectedIds: number[];
  bundles: Entry[];
  onClear: () => void;
  onToast: (message: string) => void;
}

/** Multi-select: Add to bundle · Lift out · Set aside — the same three verbs, all one click deep. */
export function BulkBar({ selectedIds, bundles, onClear, onToast }: BulkBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { addLink } = useLinkMutations();
  const lift = useLiftEntry();
  const archive = useArchiveEntry();

  if (selectedIds.length === 0) return null;

  async function addAllToBundle(bundle: Entry) {
    await Promise.all(selectedIds.map((id) => addLink.mutateAsync({ parentId: bundle.id, childId: id })));
    onToast(`Added ${selectedIds.length} to ${bundle.title}.`);
    setMenuOpen(false);
    onClear();
  }

  async function liftOut() {
    const count = selectedIds.length;
    await Promise.all(selectedIds.map((id) => lift.mutateAsync(id)));
    onToast(`Lifted ${count} out — each is a trip of its own now.`);
    onClear();
  }

  async function setAside() {
    const count = selectedIds.length;
    await Promise.all(selectedIds.map((id) => archive.mutateAsync(id)));
    onToast(`Set aside ${count}.`);
    onClear();
  }

  return (
    <Row className={styles.bar} justify="between" gap={3}>
      <span className={styles.count}>{selectedIds.length} selected</span>
      <Row gap={2} wrap>
        <div className={styles.menuWrap}>
          <Button variant="secondary" onClick={() => setMenuOpen((value) => !value)}>
            Add to bundle
          </Button>
          {menuOpen && (
            <div className={styles.menu} role="menu" aria-label="Add selected ideas to a bundle">
              {bundles.length === 0 ? (
                <p className={styles.empty}>No bundles yet.</p>
              ) : (
                bundles.map((bundle) => (
                  <Chip key={bundle.id} onClick={() => addAllToBundle(bundle)}>
                    {bundle.title}
                  </Chip>
                ))
              )}
            </div>
          )}
        </div>
        <Button variant="secondary" onClick={liftOut}>
          Lift out
        </Button>
        <Button variant="quiet" onClick={setAside}>
          Set aside
        </Button>
      </Row>
    </Row>
  );
}
