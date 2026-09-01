import { Fragment, useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../design/components/core/Button';
import { Chip } from '../design/components/core/Chip';
import { Select } from '../design/components/core/Select';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import {
  adminFeedbackExportUrl,
  useAdminFeedbacks,
  useDeleteAdminFeedback,
  useUpdateAdminFeedbackStatus,
} from '../api/admin';
import type { AdminFeedback as AdminFeedbackRow, FeedbackStatus } from '../api/types';
import { formatDay } from '../lib/formatDates';
import styles from './AdminFeedback.module.css';

/** In triage order: what it arrives as, the one that says someone has picked it
 * up, and the two ways it ends. */
const STATUSES: FeedbackStatus[] = ['new', 'in_progress', 'rejected', 'done'];

/** Sentence case for the chips and the row selects alike — one vocabulary, so
 * the filter and the thing it filters on are visibly the same words. */
const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  rejected: 'Rejected',
  done: 'Done',
};

/** `2026-08-22T09:15:00Z` -> `22 Aug 2026`. Feedback outlives a season, so the
 * year stays — unlike trip dates, which live inside one. */
function formatReceived(iso: string): string {
  return `${formatDay(iso.slice(0, 10))} ${iso.slice(0, 4)}`;
}

function noteCount(n: number): string {
  return n === 1 ? '1 note' : `${n} notes`;
}

/** The delete gate, the server's rule mirrored so the checkbox never offers
 * what the request would refuse: only feedback triage has finished with —
 * done or rejected — may be destroyed. */
function deletable(status: FeedbackStatus): boolean {
  return status === 'done' || status === 'rejected';
}

const NOT_DELETABLE = 'Only done or rejected feedback can be deleted';

/** Flip one id in or out, leaving every other member however it was — the
 * whole point of holding a set rather than a single "which row". The open
 * disclosures and the delete selection are both sets of row ids, so both
 * toggles are this one. A new Set each time, because React compares by
 * identity and a mutated one never re-renders. */
function toggleId(ids: Set<number>, id: number): Set<number> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Everything the confirm dialog says, singular and plural written out rather
 * than pluralised with an "(s)" — DateShiftWarningModal's rule: one note going
 * is a different sentence from three. Unexported for the same reason as that
 * modal's copy: a second export costs a Fast Refresh warning for something the
 * test already reads through the rendered dialog.
 */
function deleteFeedbackCopy(count: number) {
  const one = count === 1;
  return {
    title: `Delete ${one ? '1 note' : `${count} notes`}?`,
    line: `${one ? 'It comes' : 'They come'} off the server, screenshots and all, and there is no undo.`,
    cancelLabel: one ? 'No, keep it' : 'No, keep them',
    confirmLabel: one ? 'Yes, delete it' : 'Yes, delete them',
  };
}

/** Add or drop one status, keeping STATUSES' order however they were clicked —
 * so the export URL and the chip row read the same for the same selection. */
function toggleStatus(selected: FeedbackStatus[], status: FeedbackStatus): FeedbackStatus[] {
  return selected.includes(status)
    ? selected.filter((s) => s !== status)
    : STATUSES.filter((s) => s === status || selected.includes(s));
}

/**
 * /admin/feedback — everyone's feedback, newest first, as a desktop table:
 * scanning fifty of these is column work, not card work. Each row carries its
 * own status select; changing it is the whole of triage. The CSV button is a
 * plain navigation — the response is a file, the session cookie rides along,
 * and the browser's own download UI does the rest.
 *
 * One filter, over the one column that sorts the pile: status. Any number of
 * chips at once, the board's `FilterBar` idiom — "new or rejected" is a normal
 * thing to want, and each chip is an independent on/off rather than a mode.
 * None lit is no narrowing, not an empty table: an untouched filter must leave
 * the page's promise ("what travellers have told us") intact, and it is also
 * the only reading of "I have not chosen anything" that anyone means.
 *
 * The export follows the filter. A file that disagreed with the screen it was
 * downloaded from is the kind of quiet wrongness nobody checks for, so the lit
 * chips ride along in the URL and the server narrows by the same set.
 *
 * Every row is a disclosure. Once reports carry screenshots there is more in
 * one of them than a table row can hold without the scan going to pieces, and
 * the evidence — where they were, what they had pointed at, what the browser
 * was, the images — is all the same kind of thing: not what you read fifty of,
 * but what you read one of, once a message has earned a closer look. So the
 * five always-visible columns stay the ones you triage by, "Where" moves down
 * into the detail beside the screenshots, and a leading chevron opens it.
 *
 * Several rows open at once, held as a Set of ids rather than one open row.
 * Comparing two reports is the ordinary reason to open anything here — the two
 * people who hit the same bug, the note and the note that answers it — and a
 * disclosure that closes the row you were reading to open the next one makes
 * that impossible by construction.
 *
 * Deleting is triage's other ending: once a note is done or rejected it may be
 * cleared out, screenshots and all, and nothing in any other status may be —
 * the server refuses, so the checkboxes refuse first. Selection is another Set
 * of ids, pruned whenever the filter changes so "Delete selected" can never
 * quietly include a row the admin can no longer see, and the destructive
 * button stands behind the house confirm dialog because there is no undo.
 */
export function AdminFeedback() {
  const { show } = useToast();
  const feedbacksQuery = useAdminFeedbacks();
  const updateStatus = useUpdateAdminFeedbackStatus();
  const deleteFeedback = useDeleteAdminFeedback();
  const [selected, setSelected] = useState<FeedbackStatus[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const filterLabelId = useId();
  // One prefix for the page, one detail id per row off it: `aria-controls` has
  // to point somewhere unique in the document, and `useId` cannot be called
  // per row from inside a map.
  const detailIdPrefix = useId();

  const feedbacks = feedbacksQuery.data ?? [];
  const narrowed = selected.length > 0;
  const shown: AdminFeedbackRow[] = narrowed
    ? feedbacks.filter((f) => selected.includes(f.status))
    : feedbacks;

  // What "Delete selected" would actually delete: the checked set read through
  // what is on screen and still deletable. The set is pruned when the filter
  // moves, but a row can also leave through triage — its select turning it back
  // to `new` mid-selection — and reading through `shown` keeps the count, the
  // header checkbox and the confirm dialog honest without chasing every path.
  const deletableShown = shown.filter((f) => deletable(f.status));
  const chosen = deletableShown.filter((f) => checked.has(f.id));
  const allChosen = deletableShown.length > 0 && chosen.length === deletableShown.length;

  /** The chips' handler, grown a second job: whatever the new narrowing hides
   * leaves the selection too, so nothing off screen can be deleted. */
  function toggleFilter(status: FeedbackStatus) {
    const next = toggleStatus(selected, status);
    const visible = next.length > 0 ? feedbacks.filter((f) => next.includes(f.status)) : feedbacks;
    const keep = new Set(visible.filter((f) => deletable(f.status)).map((f) => f.id));
    setSelected(next);
    setChecked((current) => new Set([...current].filter((id) => keep.has(id))));
  }

  /** BulkBar's shape: every delete in flight at once, one toast either way. On
   * failure the selection stays — whatever survived is still checked, so the
   * admin can simply try again — and the invalidation the hook already does
   * refreshes the table to show what did go. */
  async function deleteChosen() {
    const ids = chosen.map((f) => f.id);
    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteFeedback.mutateAsync(id)));
    } catch {
      show("That didn't all delete. Whatever remains is still here, still selected — try again.", 'error');
      return;
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
    setChecked(new Set());
    show(`Deleted ${noteCount(ids.length)} and ${ids.length === 1 ? 'its' : 'their'} screenshots.`);
  }

  const confirmCopy = deleteFeedbackCopy(chosen.length);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.pageTitle}>Feedback</h1>
        <p className={styles.pageDescription}>
          What travellers have told us, newest first.
        </p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {/* Chips, not a multi-select box: `Chip` renders a real button with
              `aria-pressed`, which is the announcement a set of independent
              on/off narrowings wants, and all three states stay visible so
              none of them is a dead end. */}
          <span className={styles.filterLabel} id={filterLabelId}>
            Status
          </span>
          <div className={styles.chips} role="group" aria-labelledby={filterLabelId}>
            {STATUSES.map((status) => (
              <Chip
                key={status}
                selected={selected.includes(status)}
                onClick={() => toggleFilter(status)}
              >
                {STATUS_LABELS[status]}
              </Chip>
            ))}
          </div>
          {/* Filtered, not gone — while anything is lit the count names the
              whole pile too, rather than quietly shrinking. */}
          <p className={styles.count}>
            {narrowed ? `${shown.length} of ${noteCount(feedbacks.length)}` : noteCount(feedbacks.length)}
          </p>
        </div>
        <div className={styles.toolbarActions}>
          {chosen.length > 0 && (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Delete selected ({chosen.length})
            </Button>
          )}
          <Button
            variant="secondary"
            aria-label={narrowed ? 'Export CSV — only the notes shown' : 'Export CSV'}
            onClick={() => window.location.assign(adminFeedbackExportUrl(selected))}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <QueryGate
        query={feedbacksQuery}
        loadingLabel="Gathering everyone's feedback"
        errorMessage="The feedback didn't load. Nothing is lost — every note is still on the server."
      >
        {shown.length === 0 ? (
          <EmptyState
            message={
              feedbacks.length === 0
                ? 'Nothing yet. When a traveller sends feedback, it lands here.'
                : 'Nothing in those statuses. The rest is still here — unlight a chip to widen again.'
            }
          />
        ) : (
          <div className={styles.card}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {/* The column's header is its control: one checkbox that
                      takes or releases every deletable row the filter is
                      showing, indeterminate while it holds only some of them —
                      which a checkbox can only say through the DOM property,
                      hence the ref. Its own label names the column too. */}
                  <th scope="col" className={styles.selectCell}>
                    <input
                      type="checkbox"
                      className={styles.selectBox}
                      checked={allChosen}
                      disabled={deletableShown.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = chosen.length > 0 && !allChosen;
                      }}
                      aria-label="Select all deletable notes shown"
                      onChange={() =>
                        setChecked(allChosen ? new Set() : new Set(deletableShown.map((f) => f.id)))
                      }
                    />
                  </th>
                  {/* The chevron column has no name worth printing over it, but
                      a nameless header cell leaves the whole column unlabelled
                      in a screen reader's table mode — so it gets its name
                      visually hidden, the house .srOnly idiom. */}
                  <th scope="col">
                    <span className={styles.srOnly}>Details</span>
                  </th>
                  <th scope="col">Received</th>
                  <th scope="col">From</th>
                  <th scope="col">Message</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((feedback) => {
                  const open = expanded.has(feedback.id);
                  const canDelete = deletable(feedback.status);
                  const detailId = `${detailIdPrefix}-${feedback.id}`;
                  return (
                    <Fragment key={feedback.id}>
                      <tr className={open ? styles.rowOpen : undefined}>
                        <td className={styles.selectCell}>
                          {/* The LibraryRow checkbox, named for whose note it
                              takes. A row triage has not finished with cannot
                              be selected at all — the server would refuse the
                              delete, so the checkbox refuses first and says
                              why in the same words the API would. */}
                          <input
                            type="checkbox"
                            className={styles.selectBox}
                            checked={canDelete && checked.has(feedback.id)}
                            disabled={!canDelete}
                            aria-label={
                              canDelete
                                ? `Select feedback from ${feedback.user.name}`
                                : `Select feedback from ${feedback.user.name} — ${NOT_DELETABLE.toLowerCase()}`
                            }
                            title={canDelete ? undefined : NOT_DELETABLE}
                            onChange={() => setChecked((current) => toggleId(current, feedback.id))}
                          />
                        </td>
                        <td className={styles.toggleCell}>
                          {/* A bare chevron announces nothing, so the button
                              carries the row's own name — which reporter's
                              note this opens — and swaps its icon rather than
                              rotating one, the SetAsideSection idiom. */}
                          <button
                            type="button"
                            className={styles.toggle}
                            aria-expanded={open}
                            aria-controls={detailId}
                            aria-label={`${open ? 'Hide' : 'Show'} details of feedback from ${feedback.user.name}`}
                            onClick={() => setExpanded((current) => toggleId(current, feedback.id))}
                          >
                            {open ? (
                              <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                            )}
                          </button>
                        </td>
                        <td className={styles.received}>{formatReceived(feedback.created_at)}</td>
                        <td>
                          <div className={styles.reporter}>{feedback.user.name}</div>
                          <div className={styles.reporterEmail}>{feedback.user.email}</div>
                        </td>
                        <td className={styles.message}>{feedback.message}</td>
                        <td className={styles.statusCell}>
                          <Select
                            aria-label={`Status of feedback from ${feedback.user.name}`}
                            value={feedback.status}
                            onChange={(event) =>
                              updateStatus.mutate(
                                { id: feedback.id, status: event.target.value as FeedbackStatus },
                                {
                                  onError: () =>
                                    show('Could not change the status — it is still what it was.', 'error'),
                                },
                              )
                            }
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                      {open && (
                        <tr id={detailId} className={styles.detailRow}>
                          <td className={styles.detail} colSpan={6}>
                            <div className={styles.detailInner}>
                              {/* Where, verbatim from the column it used to be:
                                  the URL, and when the reporter pointed at
                                  something the capture under it — a grep hint,
                                  so it reads as code. Either may be absent, and
                                  a block with nothing in it is not worth a
                                  heading, so the heading comes with them. */}
                              {(feedback.url || feedback.element_selector) && (
                                <div className={styles.detailBlock}>
                                  <h3 className={styles.detailLabel}>Where</h3>
                                  <div className={styles.where}>
                                    {feedback.url && <div className={styles.url}>{feedback.url}</div>}
                                    {feedback.element_selector && (
                                      <code className={styles.capture}>
                                        {feedback.element_selector}
                                        {feedback.element_classes ? ` · ${feedback.element_classes}` : ''}
                                      </code>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Thumbnails that open the real thing. The signed
                                  URL expires fifteen minutes after the row was
                                  fetched, so nothing here is stored or rebuilt —
                                  it is the link the query handed us, used now.
                                  The image is decorative next to its own link,
                                  hence alt=""; the accessible name is the
                                  filename, which is the only thing that tells
                                  two shots of the same screen apart. */}
                              {feedback.screenshots.length > 0 && (
                                <div className={styles.detailBlock}>
                                  <h3 className={styles.detailLabel}>Screenshots</h3>
                                  <ul className={styles.shots}>
                                    {feedback.screenshots.map((shot) => (
                                      <li key={shot.id}>
                                        <a
                                          className={styles.shot}
                                          href={shot.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <img className={styles.shotImage} src={shot.url} alt="" />
                                          <span className={styles.srOnly}>{shot.filename}</span>
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* The serializer has always sent this and the
                                  table has never had room for it. It is the
                                  answer to "on what?" and nothing else, so it
                                  sits last, quiet, and on one line. */}
                              {feedback.user_agent && (
                                <p className={styles.userAgent}>{feedback.user_agent}</p>
                              )}

                              {/* A report can arrive with none of the above —
                                  no page, nothing pointed at, no images, no
                                  browser string. Saying so is better than an
                                  expanded row that looks broken. */}
                              {!feedback.url &&
                                !feedback.element_selector &&
                                feedback.screenshots.length === 0 &&
                                !feedback.user_agent && (
                                  <p className={styles.detailEmpty}>
                                    Nothing else came with this note — just the message.
                                  </p>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryGate>

      {/* The house confirm idiom, DateShiftWarningModal's shape: nothing has
          happened yet, so cancelling has nothing to undo. Nothing to confirm
          with nothing chosen — the button that opens this is gone by then. */}
      <Modal
        open={confirming && chosen.length > 0}
        onClose={() => setConfirming(false)}
        title={confirmCopy.title}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {confirmCopy.cancelLabel}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteChosen}
              disabled={deleting}
              aria-busy={deleting || undefined}
            >
              {confirmCopy.confirmLabel}
            </Button>
          </>
        }
      >
        <p className={styles.confirmLine}>{confirmCopy.line}</p>
      </Modal>
    </div>
  );
}
