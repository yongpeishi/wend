import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '../design/components/core/Button';
import { Modal } from '../components/Modal';
import { Field } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ApiError, useEntries } from '../api';
import { useLinkMutations } from '../features/board/useLinkMutations';
import type { Entry, EntryKind, EntrySummary } from '../api/types';
import detailStyles from './EntryDetail.module.css';
import styles from './AppearsInEditor.module.css';

export interface AppearsInEditorProps {
  entry: Entry;
  /** The detail payload's `parents`, in the order the server sends them. */
  parents: EntrySummary[];
  canEdit: boolean;
  /**
   * The "Add to…" picker, controlled by the caller rather than owned here.
   * The detail panel is itself a modal, and both dialogs listen for Escape at
   * the document; with the open state lifted, the detail panel can route its
   * own Escape/close to the picker while it is up, so one Escape closes one
   * dialog instead of the whole stack.
   */
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}

/** trip/idea/bundle, said quietly beside the name — a word in a small pill,
 * never a colour alone. */
function KindBadge({ kind }: { kind: EntryKind }) {
  return <span className={styles.kindBadge}>{kind}</span>;
}

const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * "Appears in" — the parents this entry hangs under, with the editor for them.
 *
 * The detail response has always carried `data.parents`; this is the first
 * surface to render it. Each parent is a link (the same navigation the "Holds"
 * list has always offered downwards, now offered upwards) with its kind beside
 * it, because "Six days in Kyoto" the trip and "Six days in Kyoto" the bundle
 * would otherwise be indistinguishable rows.
 *
 * A viewer with no parents to read gets no section at all. Someone who can
 * edit gets the section even when it is empty — "Add to…" is how the first
 * parent arrives, so the empty state has to hold the door open rather than
 * vanish.
 *
 * Removing is one ✕ per row. Adding opens a picker over this panel: the
 * user's visible entries, searched server-side via the same `q` the library
 * uses, minus this entry itself and the parents it already has. Linking never
 * moves or copies anything — the same promise TakeSomewhereModal makes — and a
 * link the server refuses as a cycle comes back as the server's own sentence,
 * because "would create a cycle: A → B → A" is the only version of that error
 * a person can act on.
 */
export function AppearsInEditor({ entry, parents, canEdit, addOpen, onAddOpenChange }: AppearsInEditorProps) {
  const { show } = useToast();
  const { addLink, removeLink } = useLinkMutations();
  const [search, setSearch] = useState('');

  const q = search.trim();
  // Only asked for while the picker is up — the section itself never needs it.
  const candidatesQuery = useEntries(q ? { q } : undefined, { enabled: addOpen });
  const parentIds = new Set(parents.map((p) => p.id));
  const candidates = (candidatesQuery.data ?? []).filter((c) => c.id !== entry.id && !parentIds.has(c.id));

  // Nothing to read and nothing you may do about it: no section at all.
  if (parents.length === 0 && !canEdit) return null;

  function remove(parent: EntrySummary) {
    removeLink.mutate(
      { parentId: parent.id, childId: entry.id },
      { onError: () => show(SAVE_FAILED, 'error') },
    );
  }

  function add(candidate: Entry) {
    addLink.mutate(
      { parentId: candidate.id, childId: entry.id },
      {
        onSuccess: () => show(`Added to ${candidate.title}.`, 'success'),
        onError: (error) => {
          // A 422 is the server explaining itself — "would create a cycle: …"
          // — and that sentence must reach the person as written. fieldErrors
          // holds it clean; the flattened message (prefixed "base ") is the
          // fallback. Anything else gets the panel's usual save-failed line.
          const refusal =
            error instanceof ApiError && error.status === 422
              ? (error.fieldErrors?.base?.join(' ') ?? error.message)
              : SAVE_FAILED;
          show(refusal, 'error');
        },
      },
    );
  }

  return (
    <section className={detailStyles.section}>
      <h3 className={detailStyles.sectionLabel}>Appears in</h3>

      {parents.length === 0 ? (
        <p className={styles.empty}>Not filed anywhere yet.</p>
      ) : (
        <ul className={styles.list}>
          {parents.map((parent) => (
            <li key={parent.id} className={styles.row}>
              <Link className={detailStyles.link} to={`/entries/${parent.id}`}>
                {parent.title}
              </Link>
              <KindBadge kind={parent.kind} />
              {canEdit && (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove from ${parent.title}`}
                  onClick={() => remove(parent)}
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              // A fresh opening starts a fresh search — last time's filter
              // must not silently hide this time's candidates.
              setSearch('');
              onAddOpenChange(true);
            }}
          >
            Add to…
          </Button>
        </div>
      )}

      {canEdit && (
        <Modal
          open={addOpen}
          onClose={() => onAddOpenChange(false)}
          title="Add to…"
          actions={
            <Button variant="quiet" onClick={() => onAddOpenChange(false)}>
              Done
            </Button>
          }
        >
          <div className={styles.pickerBody}>
            <Field
              label="Search"
              placeholder="Trip, bundle or idea"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              description="Linking never moves or copies it — it will appear in both places."
            />
            {candidatesQuery.isLoading ? (
              <Spinner label="Looking" />
            ) : candidates.length === 0 ? (
              <p className={styles.empty}>Nothing here to add it to.</p>
            ) : (
              <ul className={styles.candidateList}>
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button type="button" className={styles.candidate} onClick={() => add(candidate)}>
                      <span className={styles.candidateTitle}>{candidate.title}</span>
                      <KindBadge kind={candidate.kind} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
