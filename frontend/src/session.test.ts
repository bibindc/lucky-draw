import { describe, expect, it, vi } from 'vitest';
import { CampaignApiError } from './api/campaigns';
import { sessionQueryKey } from './api/auth';
import { authNoticeKey, createAppQueryClient, endSession, isUnauthorized } from './session';

const admin = { id: 'admin-id', name: 'Meera', email: 'meera@example.com', role: 'SUPER_ADMIN' as const };

describe('session handling', () => {
  it('AC-AUTH-3/4 ending a session shows sign-in with a notice and drops all cached data', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(sessionQueryKey, admin);
    queryClient.setQueryData(['participants', 'campaign-id'], { participants: [{ name: 'Riya' }] });
    queryClient.getMutationCache().build(queryClient, { mutationFn: async () => null });

    await endSession(queryClient, 'signed-out');

    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull();
    expect(queryClient.getQueryData(authNoticeKey)).toBe('signed-out');
    expect(queryClient.getQueryData(['participants', 'campaign-id'])).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('AC-AUTH-7 a 401 on a signed-in request ends the session without retrying', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(sessionQueryKey, admin);
    const queryFn = vi.fn().mockRejectedValue(new CampaignApiError('Admin authentication is required.', undefined, 401));

    await queryClient.fetchQuery({ queryKey: ['winners'], queryFn }).catch(() => undefined);

    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(queryClient.getQueryData(sessionQueryKey)).toBeNull());
    expect(queryClient.getQueryData(authNoticeKey)).toBe('expired');
  });

  it('ignores other errors and 401s when nobody is signed in', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(sessionQueryKey, admin);
    await queryClient.fetchQuery({
      queryKey: ['agents'], retry: false, queryFn: () => Promise.reject(new CampaignApiError('Forbidden', undefined, 403)),
    }).catch(() => undefined);
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(admin);

    queryClient.setQueryData(sessionQueryKey, null);
    await queryClient.fetchQuery({
      queryKey: ['agents'], queryFn: () => Promise.reject(new CampaignApiError('Unauthorized', undefined, 401)),
    }).catch(() => undefined);
    expect(queryClient.getQueryData(authNoticeKey)).toBeUndefined();

    expect(isUnauthorized({ status: 401 })).toBe(true);
    expect(isUnauthorized(new Error('network'))).toBe(false);
  });
});
