import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentsPage from './AgentsPage';
import { createAgent, listAgents, updateAgent } from '../../api/agents';

vi.mock('../../api/agents', () => ({
  createAgent: vi.fn(),
  listAgents: vi.fn(),
  updateAgent: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AgentsPage /></QueryClientProvider>);
}

const newAgent = {
  id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One', email: 'agent@example.com',
  mobile: '9876543210', isActive: true, createdAt: new Date().toISOString(), _count: { participants: 0 },
};

describe('agent management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAgents).mockResolvedValue([]);
    vi.mocked(createAgent).mockResolvedValue(newAgent);
    vi.mocked(updateAgent).mockResolvedValue({ ...newAgent, isActive: false });
  });

  it('creates an agent and displays the generated agent ID', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add an agent' }));
    await user.type(screen.getByLabelText('Name'), 'Agent One');
    await user.type(screen.getByLabelText('Email'), 'agent@example.com');
    await user.type(screen.getByLabelText('Mobile'), '9876543210');
    await user.type(screen.getByLabelText('Initial password'), 'a-secure-agent-password');
    await user.click(screen.getByRole('button', { name: 'Create agent' }));

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Agent One', email: 'agent@example.com', mobile: '9876543210', password: 'a-secure-agent-password',
    });
  });

  it('allows super admins to deactivate an agent', async () => {
    vi.mocked(listAgents).mockResolvedValue([newAgent]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));

    expect(updateAgent).toHaveBeenCalledWith('agent-id', { isActive: false });
  });
});
