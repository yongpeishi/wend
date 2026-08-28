import { useId, useState } from 'react';
import { Button } from '../design/components/core/Button';
import { Chip } from '../design/components/core/Chip';
import { Select } from '../design/components/core/Select';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import {
  adminFeedbackExportUrl,
  useAdminFeedbacks,
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
 */
export function AdminFeedback() {
  const { show } = useToast();
  const feedbacksQuery = useAdminFeedbacks();
  const updateStatus = useUpdateAdminFeedbackStatus();
  const [selected, setSelected] = useState<FeedbackStatus[]>([]);
  const filterLabelId = useId();

  const feedbacks = feedbacksQuery.data ?? [];
  const narrowed = selected.length > 0;
  const shown: AdminFeedbackRow[] = narrowed
    ? feedbacks.filter((f) => selected.includes(f.status))
    : feedbacks;

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
                onClick={() => setSelected((current) => toggleStatus(current, status))}
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
        <Button
          variant="secondary"
          aria-label={narrowed ? 'Export CSV — only the notes shown' : 'Export CSV'}
          onClick={() => window.location.assign(adminFeedbackExportUrl(selected))}
        >
          Export CSV
        </Button>
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
                  <th scope="col">Received</th>
                  <th scope="col">From</th>
                  <th scope="col">Message</th>
                  <th scope="col">Where</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((feedback) => (
                  <tr key={feedback.id}>
                    <td className={styles.received}>{formatReceived(feedback.created_at)}</td>
                    <td>
                      <div className={styles.reporter}>{feedback.user.name}</div>
                      <div className={styles.reporterEmail}>{feedback.user.email}</div>
                    </td>
                    <td className={styles.message}>{feedback.message}</td>
                    <td className={styles.where}>
                      {/* The URL and, when the reporter pointed at something,
                          the capture under it — a grep hint, so it reads as
                          code. Both may be absent; an empty cell is honest. */}
                      {feedback.url && <div className={styles.url}>{feedback.url}</div>}
                      {feedback.element_selector && (
                        <code className={styles.capture}>
                          {feedback.element_selector}
                          {feedback.element_classes ? ` · ${feedback.element_classes}` : ''}
                        </code>
                      )}
                    </td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryGate>
    </div>
  );
}
