import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";

type Integration = { id: string; name: string; provider: string; kind: string; enabled: boolean; last_received_at: string | null; webhook_url: string };
type CreatedIntegration = Integration & { secret: string };

export function IntegrationManager() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("Website form");
  const [secret, setSecret] = useState<CreatedIntegration | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { try { const result = await api<{ integrations: Integration[] }>("/api/integrations"); setIntegrations(result.integrations || []); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load integrations."); } }
  useEffect(() => { void load(); }, []);
  async function create(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api<{ integration: Integration; secret: string }>("/api/integrations", { method: "POST", body: JSON.stringify({ name, provider }) }); setName(""); setProvider("Website form"); setSecret({ ...result.integration, secret: result.secret }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create integration."); } finally { setBusy(false); } }
  async function toggle(integration: Integration) { setError(""); try { await api(`/api/integrations/${encodeURIComponent(integration.id)}`, { method: "POST", body: JSON.stringify({ enabled: !integration.enabled }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update integration."); } }
  return <section className="admin-integration-manager">
    <div className="admin-section-heading"><div><h2>Connect a platform</h2><p>Create a secure webhook for website forms, Zapier, Make, n8n, or any platform that can send JSON.</p></div></div>
    <form className="admin-integration-form" onSubmit={(event) => void create(event)}><label>Integration name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main website" /></label><label>Platform<select value={provider} onChange={(event) => setProvider(event.target.value)}><option>Website form</option><option>Zapier</option><option>Make</option><option>n8n</option><option>Custom REST API</option></select></label><button className="admin-create-submit" type="submit" disabled={busy}>{busy ? "Creating…" : "Add integration"}</button></form>
    {error && <p className="admin-reset-error" role="alert">{error}</p>}
    {secret && <section className="admin-integration-secret" aria-live="polite"><h3>Integration created</h3><p>Copy this secret now. It is shown only once.</p><label>Webhook URL<input readOnly value={secret.webhook_url} /></label><label>Webhook secret<input readOnly value={secret.secret} /></label><button type="button" onClick={() => setSecret(null)}>Close</button></section>}
    <div className="admin-integration-list"><h2>Connected platforms</h2>{integrations.length ? integrations.map((integration) => <article key={integration.id}><div><strong>{integration.name}</strong><span>{integration.provider} · {integration.enabled ? "Enabled" : "Disabled"}</span><small>{integration.last_received_at ? `Last lead received ${new Date(integration.last_received_at).toLocaleString()}` : "No leads received yet"}</small></div><button type="button" onClick={() => void toggle(integration)}>{integration.enabled ? "Disable" : "Enable"}</button></article>) : <p className="admin-note">No platforms connected yet.</p>}</div>
  </section>;
}
