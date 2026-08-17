import { describe, expect, it } from 'vitest';
import { canDelete, canEdit, canShare } from './tripRole';
import type { TripRole } from '../api/types';

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

  it('never grants more than the role above it', () => {
    for (const role of ROLES) {
      if (canDelete(role)) expect(canEdit(role)).toBe(true);
      if (canShare(role)) expect(canEdit(role)).toBe(true);
    }
  });
});
