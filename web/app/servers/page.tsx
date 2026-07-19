"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";

interface ServerRecord {
  id: number;
  name: string;
  owner_id: number;
  last_seen: string | null;
  created_at: string;
}

interface FailedAuthEntry {
  ip: string;
  token: string;
  url: string;
  timestamp: string;
}

interface MeData { username: string; ip: string; city?: string; country?: string; }

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [failedAuths, setFailedAuths] = useState<FailedAuthEntry[]>([]);
  const [me, setMe] = useState<MeData | null>(null);
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{ id: number; token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorizingTs, setAuthorizingTs] = useState<string | null>(null);
  const [authorizeName, setAuthorizeName] = useState("");
  const [authorizeError, setAuthorizeError] = useState("");

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
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setNewToken({ name: data.server.name, token: data.token });
    setNewName("");
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

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted text-sm mt-1">Each registered server gets a unique API token used by its Fail2Ban agent.</p>
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
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="e.g. dialer1.callpro.be"
              className="flex-1 px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent"
            />
            <button onClick={handleCreate} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors">
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
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Last Seen</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Created</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map(s => (
                  <tr key={s.id} className="border-b border-card-border/50 hover:bg-card-border/10">
                    <td className="px-4 py-3 font-mono font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">
                      {s.last_seen ? new Date(s.last_seen).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleRotate(s.id)} className="px-3 py-1 text-xs bg-warning/10 text-warning hover:bg-warning/20 rounded-md transition-colors">
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
                        </div>
                        {/* Full FQDN URL */}
                        <p className="text-xs text-muted font-mono truncate max-w-lg" title={entry.url}>
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
{`F2B_API_URL="https://f2b.callcenter-erp.com"
F2B_API_KEY="<token-from-above>"
F2B_SERVER_NAME="<server-name>"`}
          </pre>
        </div>
      </main>
    </div>
  );
}
