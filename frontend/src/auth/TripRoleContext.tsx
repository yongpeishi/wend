import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { canDelete, canEdit, canShare } from './tripRole';
import type { TripRole } from '../api/types';

export interface TripRoleContextValue {
  /** Null outside a trip — see tripRole.ts for why that reads as "yours". */
  role: TripRole | null;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

/**
 * Deliberately unlike `useAuth`, which throws without a provider. Every screen
 * outside a trip — `/library`, `/`, the design gallery — renders these same
 * components, and none of them should have to wrap themselves in a provider to
 * say "there is no trip here". So the default is the null role, which is
 * editable.
 */
const DEFAULT: TripRoleContextValue = {
  role: null,
  canEdit: canEdit(null),
  canDelete: canDelete(null),
  canShare: canShare(null),
};

const TripRoleContext = createContext<TripRoleContextValue>(DEFAULT);

export function TripRoleProvider({ role, children }: { role: TripRole | null; children: ReactNode }) {
  const value = useMemo<TripRoleContextValue>(
    () => ({ role, canEdit: canEdit(role), canDelete: canDelete(role), canShare: canShare(role) }),
    [role],
  );

  return <TripRoleContext.Provider value={value}>{children}</TripRoleContext.Provider>;
}

/** Your capabilities here. Safe with no provider: you get the editable default. */
export function useTripRole(): TripRoleContextValue {
  return useContext(TripRoleContext);
}

/** The common case, spelled short. */
export function useCanEdit(): boolean {
  return useContext(TripRoleContext).canEdit;
}
