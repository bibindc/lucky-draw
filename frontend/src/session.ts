import { MutationCache, QueryCache, QueryClient, type Query, type QueryKey } from '@tanstack/react-query';
import { sessionQueryKey } from './api/auth';

export type AuthNotice = 'signed-out' | 'expired' | null;

export const authNoticeKey = ['auth-notice'];

export const authNoticeMessages: Record<Exclude<AuthNotice, null>, string> = {
  'signed-out': 'You have been signed out.',
  expired: 'Your session has ended. Please sign in again.',
};

const isAuthKey = (key: QueryKey) => key[0] === sessionQueryKey[0] || key[0] === authNoticeKey[0];

export function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}

/**
 * Ends the session in the browser: shows sign-in with a notice, then drops every cached query and mutation
 * (including in-flight requests) so the next person on this device never sees the previous user's data.
 */
export async function endSession(queryClient: QueryClient, notice: Exclude<AuthNotice, null>) {
  queryClient.setQueryData(authNoticeKey, notice);
  queryClient.setQueryData(sessionQueryKey, null);
  const others = { predicate: (query: Query) => !isAuthKey(query.queryKey) };
  await queryClient.cancelQueries(others);
  queryClient.removeQueries(others);
  queryClient.getMutationCache().clear();
}

export function createAppQueryClient() {
  // A 401 on any signed-in request means the session expired or was revoked (AC-AUTH-7).
  const handleError = (error: unknown, queryKey?: QueryKey) => {
    if (!isUnauthorized(error) || (queryKey && isAuthKey(queryKey))) return;
    if (!queryClient.getQueryData(sessionQueryKey)) return;
    void endSession(queryClient, 'expired');
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handleError(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => handleError(error) }),
    defaultOptions: {
      // Retrying cannot fix an ended session; fail fast so the user is sent to sign in.
      queries: { retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3 },
    },
  });
  return queryClient;
}
