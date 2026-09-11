import { useState } from 'react';
import { ApiError } from '../api/client';
import { useDeleteEntryForGood } from '../api/entries';
import type { DeleteForGoodPreview } from '../api/entries';
import type { DeleteForGoodModalProps } from './DeleteForGoodModal';
import type { Entry } from '../api/types';

const FALLBACK_ERROR = "That didn't go through. Try again in a moment.";
/** The server's answer to "you can't see it" and to "it isn't there" is the
 *  same 404, deliberately, so this sentence has to be true of both. */
const GONE_ERROR = "That's gone already, or it isn't yours to delete.";

/**
 * The server's error codes are for the client, not for a person. Only one of
 * them is reachable in practice — and it means the UI sent a request it should
 * not have — so the rest fall back to the sentence the rest of the app uses.
 */
function readableError(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_ERROR;
  if (error.status === 404) return GONE_ERROR;
  if (error.message === 'must_be_set_aside_first') return 'Set it aside first, then you can delete it for good.';
  return FALLBACK_ERROR;
}

export interface UseDeleteForGoodOptions {
  /** The entry that was destroyed. Show the toast and repaint from here. */
  onDeleted?: (entry: Entry) => void;
  /** A sentence fit for a toast — never a raw error code. */
  onError?: (message: string) => void;
}

export interface UseDeleteForGood {
  /** Fire the unconfirmed attempt; the modal opens on the refusal. */
  request: (entry: Entry) => void;
  /** The entry being confirmed, or null. */
  target: Entry | null;
  /** Spread onto <DeleteForGoodModal />. Does not include `currentTripId`. */
  modalProps: Pick<DeleteForGoodModalProps, 'open' | 'preview' | 'onCancel' | 'onConfirm' | 'deleting'>;
}

/**
 * The whole delete-for-good gesture, once.
 *
 * Four surfaces offer this verb (the board rail, the plan panel, the trips
 * list and the entry detail screen), and every one of them has to do the same
 * two-step dance: send the attempt, catch the refusal, show the counts it came
 * back with, then send the same call again with `confirm`. Four hand-rolled
 * copies of that is where the copy and the error handling start to drift, so
 * it lives here and each screen supplies only the two things that are actually
 * its own — where the toast goes, and (on the modal itself) which trip's
 * screen this is.
 *
 * `currentTripId` is deliberately NOT in `modalProps`: this hook has no
 * idea which board it is mounted on, and a caller that forgot to pass it would
 * get a modal naming the trip you are standing on back to you.
 */
export function useDeleteForGood(options?: UseDeleteForGoodOptions): UseDeleteForGood {
  const deleteForGood = useDeleteEntryForGood();
  // Target and preview move together, but they are two states rather than one
  // object because the preview arrives one round trip after the target does.
  const [target, setTarget] = useState<Entry | null>(null);
  const [preview, setPreview] = useState<DeleteForGoodPreview | null>(null);

  const close = () => {
    setTarget(null);
    setPreview(null);
  };

  const request = (entry: Entry) => {
    deleteForGood.mutate(
      { id: entry.id },
      {
        onSuccess: (result) => {
          // A 204 to an unconfirmed attempt would mean the server destroyed
          // something without asking, which the contract forbids. Nothing
          // useful to show, and nothing to confirm.
          if (result.status !== 'needs_confirmation') return;
          setTarget(entry);
          setPreview(result.preview);
        },
        onError: (error) => options?.onError?.(readableError(error)),
      },
    );
  };

  const confirm = () => {
    const entry = target;
    if (!entry) return;
    deleteForGood.mutate(
      { id: entry.id, confirm: true },
      {
        onSuccess: (result) => {
          // A second refusal is the server changing its mind mid-gesture —
          // someone else touched the thing in between. Keep the dialog open on
          // the new counts rather than closing on a deletion that never
          // happened.
          if (result.status !== 'deleted') {
            setPreview(result.preview);
            return;
          }
          close();
          options?.onDeleted?.(entry);
        },
        // The dialog stays open and the confirm button comes back to life:
        // `deleting` is the mutation's own pending flag, which a failure
        // clears, and the target is untouched so nothing has closed.
        onError: (error) => options?.onError?.(readableError(error)),
      },
    );
  };

  return {
    target,
    request,
    modalProps: {
      open: target !== null && preview !== null,
      preview,
      onCancel: close,
      onConfirm: confirm,
      // Only ever the confirm: the first, unconfirmed attempt runs while the
      // dialog is still closed.
      deleting: deleteForGood.isPending && target !== null,
    },
  };
}
