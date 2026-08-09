import { Modal } from '../../components/Modal';
import { Row, Stack } from '../../components/layout/Stack';
import { Button } from '../../design/components/core/Button';
import type { Entry } from '../../api/types';
import styles from './CompareBundles.module.css';

export interface CompareBundlesProps {
  bundleA: Entry;
  bundleB: Entry;
  membersA: Entry[];
  membersB: Entry[];
  onClose: () => void;
}

/** Two bundles, side by side — "two versions sit side by side until someone decides." */
export function CompareBundles({ bundleA, bundleB, membersA, membersB, onClose }: CompareBundlesProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Compare bundles"
      actions={
        <Button variant="quiet" onClick={onClose}>
          Done comparing
        </Button>
      }
    >
      <Row gap={6} align="start" className={styles.columns}>
        <Stack gap={2} className={styles.column}>
          <p className={styles.heading}>{bundleA.title}</p>
          {membersA.length === 0 ? (
            <p className={styles.empty}>Nothing kept here yet.</p>
          ) : (
            membersA.map((m) => (
              <p key={m.id} className={styles.item}>
                {m.title}
              </p>
            ))
          )}
        </Stack>
        <Stack gap={2} className={styles.column}>
          <p className={styles.heading}>{bundleB.title}</p>
          {membersB.length === 0 ? (
            <p className={styles.empty}>Nothing kept here yet.</p>
          ) : (
            membersB.map((m) => (
              <p key={m.id} className={styles.item}>
                {m.title}
              </p>
            ))
          )}
        </Stack>
      </Row>
    </Modal>
  );
}
