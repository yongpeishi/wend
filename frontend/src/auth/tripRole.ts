import type { Entry, TripRole } from '../api/types';

/**
 * The only place in the frontend where a capability is named. Components ask
 * "can I edit?", never "am I a viewer?" — so a role added later changes this
 * file and nothing else.
 *
 * Most of these take a bare role, because a role is all they need.
 * `canDeleteForGood` takes the entry: it is the first capability here that
 * authorship can grant, so it needs `created_by_me` alongside the role. The
 * rule is still named once, and still only here.
 *
 * `null` means editable on purpose. Null is the not-in-a-trip case: an idea in
 * `/library`, a loose entry on `/`, or a trip payload from before the role
 * shipped. Those are yours, so they stay editable. Only an explicit `viewer`
 * takes something away.
 */

/** Add, change and rearrange things. Owners and members. */
export const canEdit = (r: TripRole | null) => r === null || r === 'owner' || r === 'member';

/** Set a trip aside for good. Owners only — a member can unmake their own work,
 * but not the trip everyone else is standing on. */
export const canDelete = (r: TripRole | null) => r === null || r === 'owner';

/**
 * Bring someone else along. Owners and members — but *not* the null case:
 * there is nobody to share with until an entry is a trip, and an entry with no
 * trip has no collaborators endpoint behind it.
 */
export const canShare = (r: TripRole | null) => r === 'owner' || r === 'member';

/**
 * Delete something for good. The trip's owner, or whoever wrote it. A trip
 * answers to its owner alone — authorship grants nothing on a trip.
 *
 * `canEdit` is the floor on the authorship branch, not decoration: a member
 * demoted to viewer does not keep a destroy verb on the ideas they wrote
 * before the demotion. And this is a convenience only — the server runs the
 * same rule as `EntryPolicy#destroy_permanently?` and answers a hidden button
 * pressed anyway with a 404.
 */
export const canDeleteForGood = (e: Pick<Entry, 'kind' | 'my_role' | 'created_by_me'>) =>
  e.kind === 'trip'
    ? canDelete(e.my_role ?? null)
    : canDelete(e.my_role ?? null) || (e.created_by_me === true && canEdit(e.my_role ?? null));
