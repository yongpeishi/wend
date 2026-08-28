import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Crosshair, ImagePlus, X } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  FEEDBACK_SCREENSHOT_CONTENT_TYPES,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_COUNT,
  useCreateFeedback,
} from '../../api/feedback';
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
 * A file the user has attached, paired with the blob URL its thumbnail is drawn
 * from. The URL is made once, when the file arrives, and held here rather than
 * derived during render: `URL.createObjectURL` mints a new entry in the
 * document's blob registry on every call and nothing but `revokeObjectURL` ever
 * frees it, so calling it in the render body would leak one image-sized
 * allocation per keystroke for as long as the tab is open. Holding it in state
 * means there is exactly one URL per file, and exactly one place — `revoke`
 * below — that has to let it go.
 */
interface Attachment {
  /** Stable across re-renders, so React keys never reuse a removed row's DOM. */
  id: number;
  file: File;
  previewUrl: string;
}

const MAX_MEGABYTES = FEEDBACK_SCREENSHOT_MAX_BYTES / (1024 * 1024);

/** Every extension the picker, a paste and a drop are all willing to take. */
const ACCEPT_ATTRIBUTE = FEEDBACK_SCREENSHOT_CONTENT_TYPES.join(',');

/**
 * True when what is being dragged is files rather than, say, selected text from
 * another part of the page. Checked before the composer paints itself as a drop
 * target, so dragging a word across the textarea does not light up the modal.
 */
function isFileDrag(transfer: DataTransfer | null): boolean {
  return transfer !== null && Array.from(transfer.types).includes('Files');
}

/**
 * The message box. While the element picker is running the composer unmounts
 * (the whole page has to be reachable to point at), but its draft state lives
 * here and so survives the round trip — losing a half-written sentence to the
 * act of illustrating it would be the worst possible bug in this feature.
 *
 * The same is true of attachments: `picking` swaps the Modal subtree for the
 * overlay, but this component keeps running, so the files and their blob URLs
 * are still here — and still owned by the same unmount cleanup — when the
 * composer comes back.
 */
export function FeedbackComposer({ open, onClose }: FeedbackComposerProps) {
  const [message, setMessage] = useState('');
  const [capture, setCapture] = useState<ElementCapture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextAttachmentId = useRef(0);
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

  // The live attachment list, for the handlers that need to read it without
  // being rebuilt every time it changes — and for the unmount cleanup, which
  // must not list `attachments` as a dependency: an effect that did would revoke
  // on every change, including the change that *added* a file, tearing down the
  // URL of the thumbnail it had just painted. This runs once, at unmount, and
  // the ref makes sure "once" still means "whatever is attached by then".
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) URL.revokeObjectURL(attachment.previewUrl);
    },
    [],
  );

  const reset = useCallback(() => {
    setMessage('');
    setCapture(null);
    setError(null);
    // Revoked, not merely dropped: a sent or abandoned report must not leave
    // its images alive in the blob registry for the life of the page, and the
    // next report must start empty rather than quietly carrying the last one's
    // screenshots.
    for (const attachment of attachmentsRef.current) URL.revokeObjectURL(attachment.previewUrl);
    setAttachments([]);
  }, []);

  const handleClose = useCallback(() => {
    cancelPicking();
    reset();
    onClose();
  }, [onClose, cancelPicking, reset]);

  // Revoking sits outside the state updater on purpose: an updater is expected
  // to be pure and React runs it twice under StrictMode, so anything with an
  // effect on the blob registry belongs out here where it happens once.
  const removeAttachment = useCallback((id: number) => {
    const going = attachmentsRef.current.find((attachment) => attachment.id === id);
    if (going) URL.revokeObjectURL(going.previewUrl);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

  /**
   * Take what we can from a batch and say what we could not take.
   *
   * A batch is one gesture — a multi-select in the picker, a drop of four
   * files, a paste — and a gesture is rarely uniformly wrong: someone drags a
   * folder's worth of images and one of them is a .tiff. Refusing the whole
   * batch for that would make them redo the gesture minus one file, so the good
   * files attach and the rest are named in the error line.
   *
   * These checks are a courtesy, not the authority. The server validates the
   * same three rules and its 422 is what actually decides; doing it here is the
   * difference between "that one is too big" said instantly and said after the
   * upload of a 20 MB image.
   */
  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      // Deliberately computed against the rendered `attachments` rather than
      // inside a `setAttachments` updater. An updater must be a pure function of
      // its argument: React invokes it twice under StrictMode, so minting the
      // blob URLs in there would create two per file and leak the copy that
      // never reaches state — the precise leak the rest of this component is
      // careful about.
      const room = FEEDBACK_SCREENSHOT_MAX_COUNT - attachmentsRef.current.length;
      const accepted: Attachment[] = [];
      const problems: string[] = [];
      const overflowed: string[] = [];

      for (const file of incoming) {
        if (!FEEDBACK_SCREENSHOT_CONTENT_TYPES.includes(file.type)) {
          problems.push(`${file.name} is not a PNG, JPEG, WebP or GIF image.`);
          continue;
        }
        if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
          problems.push(`${file.name} is larger than ${MAX_MEGABYTES} MB.`);
          continue;
        }
        if (accepted.length >= room) {
          overflowed.push(file.name);
          continue;
        }
        accepted.push({ id: nextAttachmentId.current++, file, previewUrl: URL.createObjectURL(file) });
      }

      if (overflowed.length > 0) {
        problems.push(
          `Only ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots per report — left out ${overflowed.join(', ')}.`,
        );
      }

      // One error surface for the whole composer: the same paragraph that
      // reports a blank message and a failed send. A second one would leave the
      // user watching two places for the reason nothing happened.
      setError(problems.length > 0 ? problems.join(' ') : null);
      if (accepted.length > 0) setAttachments((current) => [...current, ...accepted]);
    },
    [],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(event.target.files ?? []));
      // Cleared so that choosing the same file again still fires `change` —
      // otherwise removing a screenshot and re-picking it silently does nothing.
      event.target.value = '';
    },
    [addFiles],
  );

  /**
   * The paste path, and the reason it exists: a feedback box is the place
   * someone lands two seconds after Cmd-Shift-4 or PrtSc, with the image on the
   * clipboard and nothing on disk to point a file picker at. `clipboardData.files`
   * is that image. The default is prevented only when there were files, so
   * pasting ordinary text into the textarea is untouched.
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (createFeedback.isPending) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
    },
    [addFiles, createFeedback.isPending],
  );

  // Drag tracking is a depth count, not a boolean set by enter and cleared by
  // leave. `dragenter`/`dragleave` fire for every child the pointer crosses, so
  // moving from the textarea to the button below it fires a leave the naive
  // version would read as "the file left the modal", and the drop state would
  // flicker off while the file is still over it.
  const dragDepth = useRef(0);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (createFeedback.isPending || !isFileDrag(event.dataTransfer)) return;
      dragDepth.current += 1;
      setDraggingFiles(true);
    },
    [createFeedback.isPending],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (createFeedback.isPending || !isFileDrag(event.dataTransfer)) return;
      // Without this the browser refuses the drop and reverts to its default
      // behaviour: navigating the tab to the dropped file.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [createFeedback.isPending],
  );

  const handleDragLeave = useCallback(() => {
    if (dragDepth.current === 0) return;
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setDraggingFiles(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (createFeedback.isPending) return;
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDraggingFiles(false);
      addFiles(Array.from(event.dataTransfer.files));
    },
    [addFiles, createFeedback.isPending],
  );

  // Built from the router rather than read off `window.location`, so it is
  // correct the instant a route changes and stays honest under a MemoryRouter.
  const route = `${location.pathname}${location.search}${location.hash}`;
  const url = `${window.location.origin}${route}`;

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
        url,
        element_selector: capture?.selector,
        // Field by field, never `...capture`: the capture also carries a label
        // read from page text, and that must not leave the browser.
        element_classes: capture?.classes,
        // The files themselves, not the previews: the blob URLs are a browser
        // handle to the same bytes and mean nothing to the server. An empty
        // array keeps the request JSON, exactly as it was before screenshots.
        screenshots: attachments.map((attachment) => attachment.file),
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

  const full = attachments.length >= FEEDBACK_SCREENSHOT_MAX_COUNT;

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
      {/* The drop target is the whole body rather than a dedicated well: someone
          dragging an image at a feedback form is aiming at the form, and a
          postage-stamp target that rejects a near miss by navigating the tab
          away from the page they were reporting on is the worst outcome here. */}
      <div
        className={draggingFiles ? [styles.dropZone, styles.dropZoneActive].join(' ') : styles.dropZone}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          onPaste={handlePaste}
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

        <div className={styles.attach}>
          <Button
            variant="secondary"
            className={styles.attachButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={full || createFeedback.isPending}
          >
            <ImagePlus size={16} strokeWidth={1.5} aria-hidden="true" />
            Add screenshots
          </Button>
          {/* Hidden by clipping rather than by `display: none`, so it keeps its
              name in the accessibility tree, and taken out of the tab order so
              the button in front of it is the only stop — two tab stops that
              open the same file dialog is a keyboard user wondering what the
              second one does. */}
          <input
            ref={fileInputRef}
            type="file"
            className={styles.fileInput}
            accept={ACCEPT_ATTRIBUTE}
            multiple
            tabIndex={-1}
            aria-label="Choose screenshot files"
            disabled={full || createFeedback.isPending}
            onChange={handleFileInputChange}
          />
          <p className={styles.hint}>
            {full
              ? `That's the limit — ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots.`
              : `Up to ${FEEDBACK_SCREENSHOT_MAX_COUNT} images, ${MAX_MEGABYTES} MB each. Paste or drop them here too.`}
          </p>
        </div>

        {attachments.length > 0 && (
          <ul className={styles.thumbs}>
            {attachments.map((attachment) => (
              <li key={attachment.id} className={styles.thumb}>
                {/* Empty alt: the image is a visual confirmation of a file the
                    user picked seconds ago, and its own remove button already
                    names it. Describing it twice would make a list of five
                    screenshots read as ten items. */}
                <img className={styles.thumbImage} src={attachment.previewUrl} alt="" title={attachment.file.name} />
                <button
                  type="button"
                  className={styles.thumbRemove}
                  onClick={() => removeAttachment(attachment.id)}
                  disabled={createFeedback.isPending}
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {capture ? (
          <div className={styles.capture}>
            <span className={styles.captureLabel}>About this:</span>
            {/* The label names the thing on screen so the user can confirm they
                pointed at the right one. It is not what gets sent — the title
                spells out what is: the selector and the class attribute. */}
            <span
              className={styles.captureValue}
              title={capture.classes ? `${capture.selector} — ${capture.classes}` : capture.selector}
            >
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

        <p className={styles.context}>Sent along with the page you are on: {route}</p>
      </div>
    </Modal>
  );
}
