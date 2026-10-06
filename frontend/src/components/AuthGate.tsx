import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getCurrentAdmin, logout, sessionQueryKey } from '../api/auth';
import type { Admin } from '../api/auth';
import LoginPage from '../pages/auth/LoginPage';
import { endSession } from '../session';

export type SignOutControl = {
  signOut: () => void;
  pending: boolean;
  error: string;
};

type AuthGateProps = {
  children: (admin: Admin, signOut: SignOutControl) => ReactNode;
};

function signOutMessage(error: unknown) {
  // fetch rejects with a TypeError when the server cannot be reached.
  if (error instanceof TypeError) return 'Could not sign out. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Could not sign out. Please try again.';
}

export default function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: sessionQueryKey,
    queryFn: getCurrentAdmin,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => endSession(queryClient, 'signed-out'),
  });

  if (session.isPending) {
    return <main className="session-loading" aria-label="Loading admin session"><span /></main>;
  }

  if (session.isError) {
    return (
      <main className="session-error">
        <p>{session.error.message}</p>
        <button onClick={() => void session.refetch()}>Try again</button>
      </main>
    );
  }

  if (!session.data) return <LoginPage />;
  return children(session.data, {
    signOut: () => logoutMutation.mutate(),
    pending: logoutMutation.isPending,
    error: logoutMutation.isError ? signOutMessage(logoutMutation.error) : '',
  });
}
