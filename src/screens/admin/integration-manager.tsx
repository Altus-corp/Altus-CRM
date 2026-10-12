import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";

type Integration = { id: string; name: string; provider: string; kind: string; enabled: boolean; last_received_at: string | null; webhook_url: string };
type CreatedIntegration = Integration & { secret: string };
const requestExample = "POST https://your-webhook-url\\nContent-Type: application/json\\nX-Integration-Secret: your-webhook-secret";
const payloadExample = "{\\n  \\\"name\\\": \\\"Jane Smith\\\",\\n  \\\"email\\\": \\\"jane@example.com\\\",\\n  \\\"phone\\\": \\\"+1 555 0100\\\",\\n  \\\"company\\\": \\\"Example Ltd\\\",\\n  \\\"source_ref\\\": \\\"website-123\\\"\\n}";

export function IntegrationManager() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("Website form");
  const [secret, setSecret] = useState<CreatedIntegration | null>(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { try { const result = await api<{ integrations: Integration[] }>("/api/integrations"); setIntegrations(result.integrations || []); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load integrations."); } }
  useEffect(() => { void load(); }, []);
  async function create(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api<{ integration: Integration; secret: string }>("/api/integrations", { method: "POST", body: JSON.stringify({ name, provider }) }); setName(""); setProvider("Website form"); setSecret({ ...result.integration, secret: result.secret }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create integration."); } finally { setBusy(false); } }
  async function toggle(integration: Integration) { setError(""); try { await api(`/api/integrations/${encodeURIComponent(integration.id)}`, { method: "POST", body: JSON.stringify({ enabled: !integration.enabled }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update integration."); } }
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1800); } catch { setError("Copy failed. Select the value and copy it manually."); } }
  return <section className="admin-integration-manager">
    <div className="admin-section-heading"><div><h2>Connect a platform</h2><p>Create a secure webhook for website forms, Zapier, Make, n8n, or any platform that can send JSON.</p></div></div>
    <form className="admin-integration-form" onSubmit={(event) => void create(event)}><label>Integration name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main website" /></label><label>Platform<select value={provider} onChange={(event) => setProvider(event.target.value)}><option>Website form</option><option>Zapier</option><option>Make</option><option>n8n</option><option>Custom REST API</option></select></label><button className="admin-create-submit" type="submit" disabled={busy}>{busy ? "Creating..." : "Add integration"}</button></form>
    {error && <p className="admin-reset-error" role="alert">{error}</p>}
    {secret && <section className="admin-integration-secret" aria-live="polite"><h3>Integration created</h3><p>Copy these values now. The webhook secret is shown only once and cannot be recovered later.</p><div className="admin-integration-copy-row"><label>Webhook URL<input readOnly value={secret.webhook_url} /></label><button type="button" onClick={() => void copy(secret.webhook_url, "url")}>{copied === "url" ? "Copied" : "Copy URL"}</button></div><div className="admin-integration-copy-row"><label>Webhook secret<input readOnly value={secret.secret} /></label><button type="button" onClick={() => void copy(secret.secret, "secret")}>{copied === "secret" ? "Copied" : "Copy secret"}</button></div><button type="button" onClick={() => setSecret(null)}>Close</button></section>}
    <section className="admin-integration-guide"><h2>Setup process</h2><ol><li>Create an integration above and choose the platform sending your leads.</li><li>Copy the generated Webhook URL and Webhook secret. Store the secret in your platform's secret/API-key field.</li><li>Configure the platform to send a <strong>POST</strong> request with the header <code>X-Integration-Secret</code>.</li><li>Send JSON with at least a <code>name</code> field. Test with the example below, then check the connected platform's last received time.</li></ol><div className="admin-integration-guide-grid"><div><h3>Required request</h3><pre>{requestExample}</pre></div><div><h3>Example JSON payload</h3><pre>{payloadExample}</pre></div></div><p className="admin-integration-help"><strong>Do I need an API key?</strong> No separate CRM API key is required. Altus CRM creates a unique webhook secret for each integration. Provider-specific API keys belong in the external provider and should never be entered into this page.</p></section>
    <div className="admin-integration-list"><h2>Connected platforms</h2>{integrations.length ? integrations.map((integration) => <article key={integration.id}><div><strong>{integration.name}</strong><span>{integration.provider} · {integration.enabled ? "Enabled" : "Disabled"}</span><small>{integration.last_received_at ? `Last lead received ${new Date(integration.last_received_at).toLocaleString()}` : "No leads received yet"}</small></div><button type="button" onClick={() => void toggle(integration)}>{integration.enabled ? "Disable" : "Enable"}</button></article>) : <p className="admin-note">No platforms connected yet.</p>}</div>
  </section>;
}
