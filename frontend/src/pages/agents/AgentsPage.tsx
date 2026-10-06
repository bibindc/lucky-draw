import { useDeferredValue, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, UsersRound } from 'lucide-react';
import { createAgent, listAgents, updateAgent, type Agent, type NewAgent } from '../../api/agents';

const agentDefaults: NewAgent = { name: '', email: '', mobile: '', password: '' };

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState(agentDefaults);
  const [notice, setNotice] = useState('');
  const deferredSearch = useDeferredValue(search);
  const agentsQueryKey = ['agents', deferredSearch];
  const agentsQuery = useQuery({ queryKey: agentsQueryKey, queryFn: () => listAgents(deferredSearch) });

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? updateAgent(editing.id, { name: form.name, email: form.email, mobile: form.mobile })
      : createAgent(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      setFormOpen(false);
      setEditing(null);
      setForm(agentDefaults);
      setNotice(editing ? 'Agent profile updated.' : 'Agent created.');
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateAgent(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  function openCreate() {
    setEditing(null);
    setForm(agentDefaults);
    saveMutation.reset();
    setNotice('');
    setFormOpen(true);
  }

  function openEdit(agent: Agent) {
    setEditing(agent);
    setForm({ name: agent.name, email: agent.email, mobile: agent.mobile, password: '' });
    saveMutation.reset();
    setNotice('');
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(agentDefaults);
    saveMutation.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <section className="agents-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">TEAM ACCESS</div><h1>Agents</h1><p>Create and manage agent accounts and participant assignments.</p></div>
        {!formOpen && <button className="primary-button" onClick={openCreate}><Plus size={16} /> Add agent</button>}
      </div>

      {notice && <div className="prize-notice" role="status">{notice}</div>}
      <div className="agent-toolbar">
        <div className="participant-search"><Search size={16} /><input aria-label="Search agents" onChange={(event) => setSearch(event.target.value)} placeholder="Search agent ID, name, email, or mobile" value={search} /></div>
      </div>

      {formOpen && <form className="agent-form" onSubmit={submit}>
        <div className="participant-form-heading"><div><h2>{editing ? 'Edit agent' : 'New agent'}</h2><p>{editing ? `Agent ID ${editing.agentCode} is permanent.` : 'Agent ID is generated automatically.'}</p></div><button className="quiet-button" onClick={cancelForm} type="button">Cancel</button></div>
        <div className="participant-form-fields">
          <label>Name<input autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
          <label>Email<input onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} /></label>
          <label>Mobile<input inputMode="numeric" maxLength={10} onChange={(event) => setForm({ ...form, mobile: event.target.value.replace(/\D/g, '') })} pattern="[6-9][0-9]{9}" required value={form.mobile} /></label>
          {!editing && <label>Initial password<input autoComplete="new-password" minLength={12} onChange={(event) => setForm({ ...form, password: event.target.value })} required type="password" value={form.password} /></label>}
        </div>
        {saveMutation.isError && <div className="campaign-error" role="alert">{saveMutation.error.message}</div>}
        <div className="participant-form-actions"><button className="quiet-button" onClick={cancelForm} type="button">Cancel</button><button className="primary-button" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Saving…' : editing ? 'Save profile' : 'Create agent'}</button></div>
      </form>}

      <div className="agent-list-panel">
        <div className="participant-list-heading"><div><h2>Agent accounts</h2><p>{agentsQuery.data?.length ?? 0} agents</p></div><span className="participant-list-note">Agents can access only their assigned participants</span></div>
        {agentsQuery.isPending ? <div className="campaign-loading">Loading agents…</div> : agentsQuery.isError ? <div className="campaign-error">{agentsQuery.error.message}</div> : agentsQuery.data.length === 0 ? (
          <div className="prize-empty"><UsersRound size={21} /><strong>{search ? 'No matching agents' : 'No agents yet'}</strong><span>Create an agent account to begin assigning participants.</span><button className="text-button" onClick={openCreate}><Plus size={14} /> Add an agent</button></div>
        ) : <div className="schedule-table-wrap"><table className="agent-table"><thead><tr><th>AGENT ID</th><th>NAME</th><th>CONTACT</th><th>PARTICIPANTS</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>{agentsQuery.data.map((agent) => <tr key={agent.id}>
            <td><span className="agent-code">{agent.agentCode}</span></td>
            <td><strong className="agent-name">{agent.name}</strong></td>
            <td><span className="agent-contact">{agent.email}</span><small className="agent-contact">{agent.mobile}</small></td>
            <td>{agent._count?.participants ?? 0}</td>
            <td><span className={`participant-status ${agent.isActive ? 'eligible' : 'completed'}`}>{agent.isActive ? 'Active' : 'Deactivated'}</span></td>
            <td><div className="agent-actions"><button className="quiet-button" onClick={() => openEdit(agent)} type="button">Edit</button><button className="agent-toggle" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: agent.id, isActive: !agent.isActive })} type="button">{agent.isActive ? 'Deactivate' : 'Activate'}</button></div></td>
          </tr>)}</tbody></table></div>}
        {statusMutation.isError && <div className="campaign-error" role="alert">{statusMutation.error.message}</div>}
      </div>
    </section>
  );
}
