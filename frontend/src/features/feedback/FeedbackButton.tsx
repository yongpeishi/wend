import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackComposer } from './FeedbackComposer';
import { PICKER_IGNORE_ATTR } from './useElementPicker';
import styles from './FeedbackButton.module.css';

export interface FeedbackButtonProps {
  /** Extra class for the trigger button, appended after the component's own base class. */
  className?: string;
  /** Class for the "Feedback" label span, so the host can hide it responsively. */
  labelClassName?: string;
}

/**
 * A nav control. Mounted once inside the authenticated shell, so it follows the
 * traveller across every screen and the composer can record which one they were
 * on.
 *
 * It takes its look and its place from whoever renders it, holding on to nothing
 * but the row of icon and label. That way it can be a quiet line in the sidebar
 * beside Sign out — somewhere the traveller goes looking when they have
 * something to say — rather than something painted over the page they are
 * trying to read.
 */
export function FeedbackButton({ className, labelClassName }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...{ [PICKER_IGNORE_ATTR]: 'true' }}
      >
        <MessageSquarePlus size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className={labelClassName}>Feedback</span>
      </button>

      <FeedbackComposer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
