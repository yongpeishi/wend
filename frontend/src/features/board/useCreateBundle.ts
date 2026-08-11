import { useMutation } from '@tanstack/react-query';
import { useCreateEntry } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';

/**
 * The `useDroppable` id of the inline "start a bundle" box (NewBundleBox).
 *
 * Every other drop target on the board is a bundle that already exists, and
 * carries `{ bundleId, title }` in its droppable data. This one carries
 * `{ newBundle: true }` instead, so TripBoard's `onDragEnd` can tell the two
 * apart without string-matching ids:
 *
 *   const over = event.over?.data.current as BundleDropData | undefined;
 *   if (over?.newBundle) { ...create-then-link... } else if (over?.bundleId) { ...addLink... }
 *
 * The id is exported anyway because tests and any future drag overlay want a
 * name for it, and because a stray literal in two files is how these drift.
 */
export const NEW_BUNDLE_DROP_ID = 'new-bundle';

/**
 * What a board drop target puts in `over.data.current`. Union rather than two
 * unrelated shapes: the handler reads one object and narrows on `newBundle`.
 */
export interface BundleDropData {
  /** Present on an existing bundle's card (BundleCard). */
  bundleId?: number;
  /** The bundle's own title, for the confirmation toast. */
  title?: string;
  /** Present only on the inline new-bundle box. */
  newBundle?: boolean;
}

export interface CreateBundleWithIdeaVars {
  /** The trip the new bundle nests under — the same `parent_id` every bundle gets. */
  tripId: number;
  /** The dropped idea; it becomes the new bundle's first (and only) member. */
  entryId: number;
  /** That idea's title, which seeds the placeholder bundle name. */
  ideaTitle: string;
}

/**
 * A bundle born from a drop has no name yet — the gesture carried an idea, not
 * a word. Rather than block the drop on a modal (the whole point of the inline
 * box is that dropping is one uninterrupted gesture), it is named after the
 * idea that started it and stays renameable from the card. The name is a
 * placeholder that is already meaningful, never a bare "Untitled" that would
 * collide with the next three drops.
 */
export function bundleTitleForIdea(ideaTitle: string): string {
  return `${ideaTitle} bundle`;
}

/**
 * Drop an idea on the new-bundle box and two things have to happen, in order:
 * create the bundle, then link the idea into it — the link needs the bundle's
 * id, which only exists once the POST comes back. That sequencing lives here,
 * inside one mutation, so the caller (TripBoard's `onDragEnd`) sees a single
 * atomic-looking action with one `onSuccess`/`onError` pair, and so a failure
 * halfway through surfaces as one failed action rather than a silent
 * half-state the handler has to reason about.
 *
 * It composes the existing `useCreateEntry` and `useLinkMutations().addLink`
 * rather than posting to `/entries` and `/entries/:id/links` directly: those
 * two already carry the request shapes and the `['entries']` invalidation, and
 * duplicating either here is how the cache key and the endpoint drift apart.
 * Both invalidations firing (one per step) is harmless — react-query dedupes
 * the refetch, and the worst intermediate render is a bundle that is empty for
 * one frame before its member lands.
 *
 * Note it does NOT show its own toast. The caller owns that, because only the
 * caller knows the idea's title; it can read the created bundle off the
 * mutation result to name it.
 */
export function useCreateBundleWithIdea() {
  const createEntry = useCreateEntry();
  const { addLink } = useLinkMutations();

  return useMutation<Entry, Error, CreateBundleWithIdeaVars>({
    mutationFn: async ({ tripId, entryId, ideaTitle }) => {
      const bundle = await createEntry.mutateAsync({
        entry: { kind: 'bundle', title: bundleTitleForIdea(ideaTitle) },
        parent_id: tripId,
      });
      await addLink.mutateAsync({ parentId: bundle.id, childId: entryId });
      return bundle;
    },
  });
}
