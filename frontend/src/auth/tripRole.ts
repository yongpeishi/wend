import type { TripRole } from '../api/types';

/**
 * The only place in the frontend where a capability is named. Components ask
 * "can I edit?", never "am I a viewer?" — so a role added later changes this
 * file and nothing else.
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
