import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackComposer } from './FeedbackComposer';
import { PICKER_IGNORE_ATTR } from './useElementPicker';
import styles from './FeedbackButton.module.css';

/**
 * The floating way in. Mounted once inside the authenticated shell, so it
 * follows the user across every screen and the composer can record which one
 * they were on.
 *
 * Bottom-LEFT on purpose: the toast stack owns bottom-right (Toast.module.css),
 * and a button that transient messages slide over is a button you cannot press
 * at the exact moment something just went wrong — which is when feedback gets
 * written.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...{ [PICKER_IGNORE_ATTR]: 'true' }}
      >
        <MessageSquarePlus size={20} strokeWidth={1.5} aria-hidden="true" />
        <span className={styles.text}>Feedback</span>
      </button>

      <FeedbackComposer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
