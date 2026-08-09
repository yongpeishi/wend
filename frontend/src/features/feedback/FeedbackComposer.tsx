import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Crosshair, X } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { useCreateFeedback } from '../../api/feedback';
import { ApiError } from '../../api/client';
import { ElementPickerOverlay } from './ElementPickerOverlay';
import { useElementPicker } from './useElementPicker';
import type { ElementCapture } from './describeElement';
import styles from './FeedbackComposer.module.css';

export interface FeedbackComposerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The message box. While the element picker is running the composer unmounts
 * (the whole page has to be reachable to point at), but its draft state lives
 * here and so survives the round trip — losing a half-written sentence to the
 * act of illustrating it would be the worst possible bug in this feature.
 */
export function FeedbackComposer({ open, onClose }: FeedbackComposerProps) {
  const [message, setMessage] = useState('');
  const [capture, setCapture] = useState<ElementCapture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageId = useId();
  const location = useLocation();
  const toast = useToast();
  const createFeedback = useCreateFeedback();

  const handlePick = useCallback((picked: ElementCapture) => setCapture(picked), []);
  // Destructured, not held as one object: `target` changes on every mousemove,
  // and anything memoised against the whole picker would churn with it.
  const { picking, target, start: startPicking, cancel: cancelPicking } = useElementPicker(handlePick);

  // Focus the box whenever it comes (back) into view — including on return
  // from a pick, so typing can resume without reaching for the mouse.
  useEffect(() => {
    if (open && !picking) textareaRef.current?.focus();
  }, [open, picking]);

  const reset = useCallback(() => {
    setMessage('');
    setCapture(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    cancelPicking();
    reset();
    onClose();
  }, [onClose, cancelPicking, reset]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Write a line or two first.');
      textareaRef.current?.focus();
      return;
    }

    createFeedback.mutate(
      {
        message: trimmed,
        path: location.pathname,
        element_selector: capture?.selector,
        element_label: capture?.label,
      },
      {
        onSuccess: () => {
          toast.show('Thank you — that has been noted.', 'success');
          reset();
          onClose();
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'That did not send. Try again in a moment.');
        },
      },
    );
  };

  if (!open) return null;

  // Picking takes over the page: the composer steps aside entirely rather than
  // competing with the highlight for attention.
  if (picking) {
    return <ElementPickerOverlay target={target} onCancel={cancelPicking} />;
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title="How is this going?"
      actions={
        <>
          <Button variant="quiet" onClick={handleClose} disabled={createFeedback.isPending}>
            Not now
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={createFeedback.isPending}>
            {createFeedback.isPending ? 'Sending…' : 'Send it'}
          </Button>
        </>
      }
    >
      <label className={styles.label} htmlFor={messageId}>
        Tell us what you noticed
      </label>
      <textarea
        id={messageId}
        ref={textareaRef}
        className={styles.textarea}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
          if (error) setError(null);
        }}
        rows={5}
        placeholder="What worked, what got in the way, what you expected instead…"
        aria-describedby={error ? `${messageId}-error` : undefined}
        aria-invalid={error ? true : undefined}
      />

      {error && (
        <p className={styles.error} id={`${messageId}-error`} role="alert">
          {error}
        </p>
      )}

      {capture ? (
        <div className={styles.capture}>
          <span className={styles.captureLabel}>About this:</span>
          <span className={styles.captureValue} title={capture.selector}>
            {capture.label}
          </span>
          <button type="button" className={styles.captureClear} onClick={() => setCapture(null)} aria-label="Remove the selected element">
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <Button variant="secondary" className={styles.pickButton} onClick={startPicking}>
          <Crosshair size={16} strokeWidth={1.5} aria-hidden="true" />
          Point at something
        </Button>
      )}

      <p className={styles.context}>Sent along with the page you are on: {location.pathname}</p>
    </Modal>
  );
}
