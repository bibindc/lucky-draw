import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import { listCampaigns } from '../../api/campaigns';
import { getSiteSettings, publicSiteUrl, saveSiteSettings, type SiteSettings, type SiteSettingsInput } from '../../api/site';

type Form = Record<keyof SiteSettingsInput, string>;
const toForm = (settings: SiteSettings): Form => ({
  featuredCampaignId: settings.featuredCampaignId ?? '',
  organizerName: settings.organizerName ?? '',
  contactPhone: settings.contactPhone ?? '',
  whatsappNumber: settings.whatsappNumber ?? '',
  contactEmail: settings.contactEmail ?? '',
  joinNote: settings.joinNote ?? '',
});

const joinNoteLimit = 600;

/** Field messages from a VALIDATION_ERROR's Zod issues. */
function fieldErrors(details: unknown): Partial<Record<keyof Form, string>> {
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((issue: { path?: unknown[]; message?: string }) => [String(issue.path?.[0] ?? ''), issue.message ?? 'Check this field.']));
}

/** Super admin settings for the public showcase website (AC-PUB-1, 07-public-website.md §7). */
export default function SiteSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['site-settings'], queryFn: getSiteSettings });
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !form) setForm(toForm(settingsQuery.data));
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (input: SiteSettingsInput) => saveSiteSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(['site-settings'], settings);
      setForm(toForm(settings));
      setSaved(true);
    },
  });

  function update(field: keyof Form, value: string) {
    setForm((current) => current && { ...current, [field]: value });
    setSaved(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const blank = (value: string) => value.trim() || null;
    saveMutation.mutate({
      featuredCampaignId: form.featuredCampaignId || null,
      organizerName: blank(form.organizerName),
      contactPhone: blank(form.contactPhone),
      whatsappNumber: blank(form.whatsappNumber),
      contactEmail: blank(form.contactEmail),
      joinNote: blank(form.joinNote),
    });
  }

  const errors = saveMutation.isError ? fieldErrors((saveMutation.error as { details?: unknown }).details) : {};
  const featured = campaignsQuery.data?.find((campaign) => campaign.id === form?.featuredCampaignId);
  const field = (name: keyof Form, label: string, props: { type?: string; inputMode?: 'tel' | 'email'; placeholder?: string; maxLength?: number } = {}) => (
    <label>{label} <span className="optional-label">OPTIONAL</span>
      <input aria-invalid={Boolean(errors[name])} aria-label={label} onChange={(event) => update(name, event.target.value)} value={form?.[name] ?? ''} {...props} />
      {errors[name] && <small className="field-error">{errors[name]}</small>}
    </label>
  );

  return (
    <section className="site-settings-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">SHOWCASE</div><h1>Public website</h1><p>Choose what the public sees: one featured campaign and how to reach you.</p></div>
        <a className="quiet-button site-open-link" href={publicSiteUrl} rel="noreferrer" target="_blank"><ExternalLink size={14} /> Open public website</a>
      </div>

      {settingsQuery.isPending || !form ? <div className="campaign-loading">Loading settings…</div> : settingsQuery.isError ? <div className="campaign-error" role="alert">{settingsQuery.error.message}</div> : (
        <div className="site-settings-layout">
          <form aria-label="Public website settings" className="participant-history-panel site-settings-form" onSubmit={submit}>
            <div className="participant-panel-heading"><h2>Featured campaign</h2></div>
            <div className="site-settings-fields">
              <label className="site-settings-wide">Campaign shown on the website
                <select aria-label="Featured campaign" onChange={(event) => update('featuredCampaignId', event.target.value)} value={form.featuredCampaignId}>
                  <option value="">None — the website shows only contact details</option>
                  {campaignsQuery.data?.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.status.toLowerCase()}</option>)}
                </select>
                {errors.featuredCampaignId && <small className="field-error">{errors.featuredCampaignId}</small>}
              </label>
            </div>

            <div className="participant-panel-heading"><h2>Contact and joining</h2></div>
            <div className="site-settings-fields">
              {field('organizerName', 'Organiser name', { maxLength: 120, placeholder: 'e.g. Lakshmi Chit Funds' })}
              {field('contactEmail', 'Email', { type: 'email', inputMode: 'email', maxLength: 160, placeholder: 'hello@example.com' })}
              {field('contactPhone', 'Phone', { inputMode: 'tel', placeholder: '+91 98765 43210' })}
              {field('whatsappNumber', 'WhatsApp number', { inputMode: 'tel', placeholder: '+91 98765 43210' })}
              <label className="site-settings-wide">How to join <span className="optional-label">{form.joinNote.length}/{joinNoteLimit}</span>
                <textarea aria-invalid={Boolean(errors.joinNote)} aria-label="How to join" maxLength={joinNoteLimit} onChange={(event) => update('joinNote', event.target.value)} placeholder="e.g. Contact your area agent or call us to join the next campaign." rows={4} value={form.joinNote} />
                {errors.joinNote && <small className="field-error">{errors.joinNote}</small>}
              </label>
            </div>

            {saveMutation.isError && <p className="payment-error site-settings-message" role="alert">{saveMutation.error.message}</p>}
            {saved && <p className="site-settings-saved site-settings-message" role="status"><Check size={14} /> Saved. The public website shows the change within a minute.</p>}
            <div className="draw-confirm-actions site-settings-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Saving…' : 'Save settings'}</button>
            </div>
          </form>

          <aside className="participant-history-panel site-settings-aside" aria-label="What the public sees">
            <div className="participant-panel-heading"><h2>What the public sees</h2></div>
            <div className="site-settings-summary">
              <p className={`site-status ${featured ? 'live' : ''}`}><Globe size={15} />{featured ? <>Showcasing <strong>{featured.name}</strong></> : 'No campaign is featured'}</p>
              <ul>
                <li>Next draw with a live countdown</li>
                <li>Every draw and its prizes, with images</li>
                <li>Active complimentary gifts</li>
                <li>Recent winners and past results</li>
                <li>How it works, using the campaign’s amounts</li>
                <li>Your contact details and join note</li>
              </ul>
              <p className="site-privacy"><ShieldCheck size={15} /><span>Winners appear as first name and last initial with their serial number (e.g. “Asha R. · #1042”). Phone numbers, emails, addresses, agents and payments are never shown.</span></p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
