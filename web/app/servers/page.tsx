"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";

interface ServerRecord {
  id: number;
  name: string;
  owner_id: number;
  last_seen: string | null;
  registered_ip: string | null;
  last_ip: string | null;
  created_at: string;
  ip_mismatch?: boolean;
  token_reused?: boolean;
}

interface FailedAuthEntry {
  ip: string;
  token: string;
  url: string;
  timestamp: string;
  reason?: "no_token" | "token_mismatch" | "ip_mismatch";
  server?: string;
}

interface MeData {
  username: string;
  ip: string;
  city?: string;
  country?: string;
  publicBaseUrl?: string;
  headers?: Record<string, string | null>;
}

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [failedAuths, setFailedAuths] = useState<FailedAuthEntry[]>([]);
  const [me, setMe] = useState<MeData | null>(null);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [newTokenInput, setNewTokenInput] = useState("");
  const [rotatedToken, setRotatedToken] = useState<{ id: number; token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorizingTs, setAuthorizingTs] = useState<string | null>(null);
  const [authorizeName, setAuthorizeName] = useState("");
  const [authorizeError, setAuthorizeError] = useState("");
  const [showHeaderDiag, setShowHeaderDiag] = useState(false);

  const fetchServers = useCallback(async () => {
    const res = await fetch("/api/servers");
    if (res.ok) setServers((await res.json()).servers);
    setLoading(false);
  }, []);

  const fetchFailedAuths = useCallback(async () => {
    const res = await fetch("/api/failed-auths");
    if (res.ok) setFailedAuths((await res.json()).attempts ?? []);
  }, []);

  useEffect(() => {
    fetchServers();
    fetchFailedAuths();
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => d && setMe(d));
  }, [fetchServers, fetchFailedAuths]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setError("");
    const body: Record<string, string> = { name: newName.trim() };
    if (newIp.trim()) body.ip = newIp.trim();
    if (newTokenInput.trim()) body.token = newTokenInput.trim();
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setNewToken({ name: data.server.name, token: data.token });
    setNewName("");
    setNewIp("");
    setNewTokenInput("");
    fetchServers();
  }

  async function handleRotate(id: number) {
    if (!confirm("Rotate this server's token? The current token will immediately stop working.")) return;
    const res = await fetch(`/api/servers/${id}/rotate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setRotatedToken({ id, token: data.token });
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete server "${name}"? This cannot be undone.`)) return;
    await fetch("/api/servers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setServers(servers.filter(s => s.id !== id));
  }

  async function handleDismiss(timestamp: string) {
    await fetch("/api/failed-auths", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp }),
    });
    setFailedAuths(prev => prev.filter(a => a.timestamp !== timestamp));
  }

  function startAuthorize(timestamp: string) {
    setAuthorizingTs(timestamp);
    setAuthorizeName("");
    setAuthorizeError("");
  }

  async function handleAuthorize(entry: FailedAuthEntry) {
    if (!authorizeName.trim()) { setAuthorizeError("Server name is required"); return; }
    setAuthorizeError("");
    const res = await fetch("/api/failed-auths/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: entry.timestamp, name: authorizeName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setAuthorizeError(data.error); return; }
    setNewToken({ name: authorizeName.trim(), token: data.token });
    setAuthorizingTs(null);
    setFailedAuths(prev => prev.filter(a => a.timestamp !== entry.timestamp));
    fetchServers();
  }

  function relativeTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;
  // Determine if the FQDN was resolved via Cloudflare headers or fell back to internal
  const detectedFqdn = me?.publicBaseUrl;
  const isCloudflare = !!(me?.headers?.["cf-connecting-ip"] || me?.headers?.["x-forwarded-host"]);
  const agentApiUrl = detectedFqdn ?? "https://f2b.callcenter-erp.com";

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted text-sm mt-1">Each registered server gets a unique API token used by its Fail2Ban agent.</p>
        </div>

        {/* ── FQDN / Tunnel Diagnostic Banner ───────────────────────── */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-muted">Detected Public URL</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-medium text-foreground">
                  {detectedFqdn ?? <span className="text-muted italic">loading…</span>}
                </code>
                {detectedFqdn && (
                  isCloudflare ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-success/10 text-success border border-success/20 rounded-full">
                      ✓ Cloudflare headers
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20 rounded-full">
                      ⚠ No CF headers — internal fallback
                    </span>
                  )
                )}
              </div>
              <p className="text-xs text-muted">
                This is the FQDN agents must reach, resolved from{" "}
                <code className="font-mono">x-forwarded-host</code> /
                {" "}<code className="font-mono">cf-visitor</code> headers.
              </p>
            </div>
            <button
              onClick={() => setShowHeaderDiag(v => !v)}
              className="px-3 py-1.5 text-xs bg-card-border/30 hover:bg-card-border/60 rounded-md transition-colors whitespace-nowrap"
            >
              {showHeaderDiag ? "Hide" : "Show"} raw headers
            </button>
          </div>

          {showHeaderDiag && me?.headers && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted text-left border-b border-card-border">
                    <th className="py-1 pr-4 font-semibold">Header</th>
                    <th className="py-1 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(me.headers).map(([k, v]) => (
                    <tr key={k} className="border-b border-card-border/30">
                      <td className="py-1 pr-4 text-muted whitespace-nowrap">{k}</td>
                      <td className="py-1 break-all">
                        {v ?? <span className="text-muted italic opacity-50">not present</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Token reveal after create / authorize */}
        {newToken && (
          <div className="bg-success/5 border border-success/30 rounded-xl p-4 space-y-3">
            <p className="text-success font-semibold">✓ Server &quot;{newToken.name}&quot; authorized</p>
            <p className="text-sm text-muted">This token is now active. Copy it if you need it — it will <strong>never</strong> be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background px-3 py-2 rounded-lg text-xs font-mono break-all border border-card-border">
                {newToken.token}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(newToken.token)}
                className="px-3 py-2 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <button onClick={() => setNewToken(null)} className="text-xs text-muted hover:text-foreground">Dismiss</button>
          </div>
        )}

        {/* Token reveal after rotate */}
        {rotatedToken && (
          <div className="bg-warning/5 border border-warning/30 rounded-xl p-4 space-y-3">
            <p className="text-warning font-semibold">⚠ Token rotated — update your agent config</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background px-3 py-2 rounded-lg text-xs font-mono break-all border border-card-border">
                {rotatedToken.token}
              </code>
              <button onClick={() => navigator.clipboard.writeText(rotatedToken.token)} className="px-3 py-2 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors whitespace-nowrap">Copy</button>
            </div>
            <button onClick={() => setRotatedToken(null)} className="text-xs text-muted hover:text-foreground">Dismiss</button>
          </div>
        )}

        {/* Add server */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-muted">Register New Server</h2>
          {/* Single-row layout on wide screens: Name · IP · Token · Button */}
          <div className="flex flex-col lg:flex-row gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Name — e.g. dialer1.callpro.be"
              className="flex-1 min-w-0 px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              placeholder="Registered IP (optional)"
              title="Lock this server to a specific source IP. Leave blank to auto-detect on first connection."
              className="w-full lg:w-44 px-3 py-2 bg-background border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={newTokenInput}
              onChange={e => setNewTokenInput(e.target.value)}
              placeholder="Token (optional — auto-generated if blank)"
              title="Bring your own token, or leave blank to auto-generate one."
              className="w-full lg:w-72 px-3 py-2 bg-background border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:border-accent"
            />
            <button onClick={handleCreate} className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0">
              Register
            </button>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        {/* Server list */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center text-muted py-8">Loading…</div>
          ) : servers.length === 0 ? (
            <div className="text-center text-muted py-8">No servers registered yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-56">Name</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell w-36">Registered IP</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Last Seen · Login IP</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell w-28">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map(s => (
                  <tr key={s.id} className="border-b border-card-border/50 hover:bg-card-border/10">
                    {/* Name — never wrap so long hostnames stay on one line */}
                    <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">{s.name}</td>
                    {/* Registered IP — the locked-in expected source IP */}
                    <td className="px-4 py-3 font-mono text-xs hidden md:table-cell text-muted">
                      {s.registered_ip ?? <span className="opacity-40 italic">auto</span>}
                    </td>
                    {/* Last Seen + last login IP stacked */}
                    <td className="px-4 py-3 text-xs hidden sm:table-cell">
                      {s.last_seen ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-foreground">{new Date(s.last_seen).toLocaleString()}</span>
                          {s.last_ip && (
                            <span className="font-mono text-[10px] text-muted">from {s.last_ip}</span>
                          )}
                        </div>
                      ) : <span className="text-muted">Never</span>}
                    </td>
                    {/* Status badge */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.token_reused ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger border border-danger/20 rounded-full" title="Token has been used by multiple distinct IP addresses">
                          ⚠️ Token Reused
                        </span>
                      ) : s.ip_mismatch ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20 rounded-full" title={`IP changed from registered ${s.registered_ip}`}>
                          ⚠️ IP Mismatch
                        </span>
                      ) : s.last_seen ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-success/10 text-success border border-success/20 rounded-full">
                          ✓ Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-card-border/30 text-muted border border-card-border rounded-full">
                          Pending
                        </span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleRotate(s.id)} className="px-3 py-1 text-xs bg-warning/10 text-warning hover:bg-warning/20 rounded-md transition-colors font-medium whitespace-nowrap">
                          Rotate Token
                        </button>
                        <button onClick={() => handleDelete(s.id, s.name)} className="px-3 py-1 text-xs bg-danger/10 text-danger hover:bg-danger/20 rounded-md transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Failed Auth Attempts ─────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Failed Auth Attempts</h2>
            <p className="text-muted text-sm mt-0.5">
              Requests to agent endpoints that used an unrecognized token. Authorize to register the server immediately.
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {failedAuths.length === 0 ? (
              <div className="text-center text-muted py-8 text-sm">No failed attempts recorded</div>
            ) : (
              <div className="divide-y divide-card-border/50">
                {failedAuths.map((entry) => (
                  <div key={entry.timestamp} className="p-4 space-y-3">
                    {/* Attempt summary row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="font-semibold text-foreground font-mono">{entry.ip}</span>
                          <span title={new Date(entry.timestamp).toLocaleString()}>{relativeTime(entry.timestamp)}</span>
                          {/* Reason badge */}
                          {entry.reason === "ip_mismatch" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20 rounded-full">
                              ⚠ IP Mismatch{entry.server ? ` — ${entry.server}` : ""}
                            </span>
                          )}
                          {entry.reason === "token_mismatch" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger border border-danger/20 rounded-full">
                              ✕ Unknown Token
                            </span>
                          )}
                          {entry.reason === "no_token" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-card-border/40 text-muted border border-card-border rounded-full">
                              — No Token
                            </span>
                          )}
                        </div>
                        {/* Full FQDN URL */}
                        <p className="text-xs text-muted font-mono truncate" title={entry.url}>
                          {entry.url}
                        </p>
                        {/* Full token */}
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono bg-background border border-card-border px-2 py-1 rounded break-all">
                            {entry.token}
                          </code>
                          {entry.token !== "<none>" && (
                            <button
                              onClick={() => navigator.clipboard.writeText(entry.token)}
                              className="px-2 py-1 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded transition-colors whitespace-nowrap"
                            >
                              Copy
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.token !== "<none>" && authorizingTs !== entry.timestamp && (
                          <button
                            onClick={() => startAuthorize(entry.timestamp)}
                            className="px-3 py-1.5 text-xs bg-success/10 text-success hover:bg-success/20 rounded-md transition-colors font-medium"
                          >
                            Authorize
                          </button>
                        )}
                        <button
                          onClick={() => handleDismiss(entry.timestamp)}
                          className="px-3 py-1.5 text-xs bg-danger/10 text-danger hover:bg-danger/20 rounded-md transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>

                    {/* Inline authorize form */}
                    {authorizingTs === entry.timestamp && (
                      <div className="bg-background border border-accent/30 rounded-lg p-3 space-y-2">
                        <p className="text-xs text-muted">
                          Give this server a name. Its existing token will be stored and will start working immediately.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={authorizeName}
                            onChange={e => setAuthorizeName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAuthorize(entry)}
                            placeholder="e.g. dialer2.callpro.be"
                            autoFocus
                            className="flex-1 px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent"
                          />
                          <button
                            onClick={() => handleAuthorize(entry)}
                            className="px-3 py-1.5 text-xs bg-success hover:bg-success/80 text-white rounded-md transition-colors font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setAuthorizingTs(null)}
                            className="px-3 py-1.5 text-xs bg-card-border/30 hover:bg-card-border/60 rounded-md transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {authorizeError && <p className="text-danger text-xs">{authorizeError}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent config snippet */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-muted">Agent Configuration</h2>
          <p className="text-xs text-muted">Add to <code className="font-mono">/etc/f2b-agent.conf</code> on each server:</p>
          <pre className="bg-background rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto border border-card-border">
{`F2B_API_URL="${agentApiUrl}"
F2B_API_KEY="<token-from-above>"
F2B_SERVER_NAME="<server-name>"`}
          </pre>
          {!isCloudflare && detectedFqdn && (
            <p className="text-xs text-warning">
              ⚠ Cloudflare headers were not detected — the URL above may be the internal address.
              Ensure <code className="font-mono">x-forwarded-host</code> is forwarded by your tunnel.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
