import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useMe, useSignIn, useSignOut, useSignUp } from '../api/session';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null | undefined;
  /** True only while the initial GET /api/me is in flight. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const signInMutation = useSignIn();
  const signUpMutation = useSignUp();
  const signOutMutation = useSignOut();

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data,
      isLoading: me.isLoading,
      signIn: (email, password) => signInMutation.mutateAsync({ email, password }),
      signUp: (name, email, password) => signUpMutation.mutateAsync({ name, email, password }),
      signOut: () => signOutMutation.mutateAsync(),
    }),
    [me.data, me.isLoading, signInMutation, signUpMutation, signOutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
