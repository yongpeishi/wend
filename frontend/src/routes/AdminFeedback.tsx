import { Button } from '../design/components/core/Button';
import { Select } from '../design/components/core/Select';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import {
  ADMIN_FEEDBACK_EXPORT_URL,
  useAdminFeedbacks,
  useUpdateAdminFeedbackStatus,
} from '../api/admin';
import type { FeedbackStatus } from '../api/types';
import { formatDay } from '../lib/formatDates';
import styles from './AdminFeedback.module.css';

/** In triage order: what it arrives as, what it becomes, what it ends as. */
const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'done'];

/** `2026-08-22T09:15:00Z` -> `22 Aug 2026`. Feedback outlives a season, so the
 * year stays — unlike trip dates, which live inside one. */
function formatReceived(iso: string): string {
  return `${formatDay(iso.slice(0, 10))} ${iso.slice(0, 4)}`;
}

/**
 * /admin/feedback — everyone's feedback, newest first, as a desktop table:
 * scanning fifty of these is column work, not card work. Each row carries its
 * own status select; changing it is the whole of triage. The CSV button is a
 * plain navigation — the response is a file, the session cookie rides along,
 * and the browser's own download UI does the rest.
 */
export function AdminFeedback() {
  const { show } = useToast();
  const feedbacksQuery = useAdminFeedbacks();
  const updateStatus = useUpdateAdminFeedbackStatus();

  const feedbacks = feedbacksQuery.data ?? [];

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.pageTitle}>Feedback</h1>
        <p className={styles.pageDescription}>
          What travellers have told us, newest first.
        </p>
      </div>

      <div className={styles.toolbar}>
        <p className={styles.count}>
          {feedbacks.length === 1 ? '1 note' : `${feedbacks.length} notes`}
        </p>
        <Button variant="secondary" onClick={() => window.location.assign(ADMIN_FEEDBACK_EXPORT_URL)}>
          Export CSV
        </Button>
      </div>

      <QueryGate
        query={feedbacksQuery}
        loadingLabel="Gathering everyone's feedback"
        errorMessage="The feedback didn't load. Nothing is lost — every note is still on the server."
      >
        {feedbacks.length === 0 ? (
          <EmptyState message="Nothing yet. When a traveller sends feedback, it lands here." />
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
                {feedbacks.map((feedback) => (
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
                            {status}
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
