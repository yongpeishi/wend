import { describe, expect, it } from 'vitest';
import { canDelete, canDeleteForGood, canEdit, canShare } from './tripRole';
import type { Entry, TripRole } from '../api/types';

const ROLES: (TripRole | null)[] = ['owner', 'member', 'viewer', null];

describe('tripRole', () => {
  describe('canEdit', () => {
    it('lets an owner edit', () => expect(canEdit('owner')).toBe(true));
    it('lets a member edit', () => expect(canEdit('member')).toBe(true));
    it('stops a viewer editing', () => expect(canEdit('viewer')).toBe(false));
    it('treats no role as yours — the not-in-a-trip case', () => expect(canEdit(null)).toBe(true));
  });

  describe('canDelete', () => {
    it('lets an owner delete', () => expect(canDelete('owner')).toBe(true));
    it('stops a member deleting the trip', () => expect(canDelete('member')).toBe(false));
    it('stops a viewer deleting', () => expect(canDelete('viewer')).toBe(false));
    it('treats no role as yours', () => expect(canDelete(null)).toBe(true));
  });

  describe('canShare', () => {
    it('lets an owner share', () => expect(canShare('owner')).toBe(true));
    it('lets a member share', () => expect(canShare('member')).toBe(true));
    it('stops a viewer sharing', () => expect(canShare('viewer')).toBe(false));
    it('is false with no role: nothing outside a trip has anyone to share with', () =>
      expect(canShare(null)).toBe(false));
  });

  // The only capability authorship can grant, so it takes the entry rather
  // than a bare role. Two things it must never do: hand a viewer a destroy
  // verb on their own old work, and let anyone but the owner delete a trip.
  describe('canDeleteForGood', () => {
    const entry = (o: Pick<Entry, 'kind' | 'my_role' | 'created_by_me'>) => o;

    it("lets a trip's owner delete it for good", () =>
      expect(canDeleteForGood(entry({ kind: 'trip', my_role: 'owner', created_by_me: true }))).toBe(true));

    it('stops a member deleting the trip for good, even one they created', () =>
      expect(canDeleteForGood(entry({ kind: 'trip', my_role: 'member', created_by_me: true }))).toBe(false));

    it("lets a trip's owner delete an idea somebody else wrote", () =>
      expect(canDeleteForGood(entry({ kind: 'idea', my_role: 'owner', created_by_me: false }))).toBe(true));

    it('lets a member delete an idea they wrote', () =>
      expect(canDeleteForGood(entry({ kind: 'idea', my_role: 'member', created_by_me: true }))).toBe(true));

    it("stops a member deleting a co-traveller's idea", () =>
      expect(canDeleteForGood(entry({ kind: 'idea', my_role: 'member', created_by_me: false }))).toBe(false));

    // The `canEdit` floor: authorship is not a right you keep after demotion.
    it('stops a viewer deleting an idea they wrote before being demoted', () =>
      expect(canDeleteForGood(entry({ kind: 'idea', my_role: 'viewer', created_by_me: true }))).toBe(false));

    it('treats no role as yours — the library case', () =>
      expect(canDeleteForGood(entry({ kind: 'idea', my_role: null, created_by_me: false }))).toBe(true));

    // `undefined` is a fixture that predates the field, never "somebody else
    // wrote it": it must not decide the answer on its own.
    it('grants nothing on authorship the payload never carried', () =>
      expect(canDeleteForGood({ kind: 'idea', my_role: 'member' })).toBe(false));

    it('reads a bundle exactly as it reads an idea', () =>
      expect(canDeleteForGood(entry({ kind: 'bundle', my_role: 'member', created_by_me: true }))).toBe(true));
  });

  it('never grants more than the role above it', () => {
    for (const role of ROLES) {
      if (canDelete(role)) expect(canEdit(role)).toBe(true);
      if (canShare(role)) expect(canEdit(role)).toBe(true);
    }
  });
});
