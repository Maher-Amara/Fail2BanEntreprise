"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";

interface ServerRecord {
  id: number;
  name: string;
  owner_id: number;
  last_seen: string | null;
  registered_ip: string | null;
  registered_domain: string | null;
  last_ip: string | null;
  created_at: string;
  ip_mismatch?: boolean;
  fqdn_mismatch?: boolean;
  token_reused?: boolean;
}

interface FailedAuthEntry {
  ip: string;
  token: string;
  url: string;
  fqdn?: string;
  timestamp: string;
  reason?: "no_token" | "token_mismatch" | "ip_mismatch" | "fqdn_mismatch" | "fqdn_not_allowed";
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
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);

  // Register new server form
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newDomain, setNewDomain] = useState("");

  // Token reveals
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{ id: number; token: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Authorize inline form
  const [authorizingTs, setAuthorizingTs] = useState<string | null>(null);
  const [authorizeName, setAuthorizeName] = useState("");
  const [authorizeError, setAuthorizeError] = useState("");

  // FQDN diagnostic panel
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
    fetch("/api/servers/allowed-origins")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.origins?.length) {
          setAllowedOrigins(d.origins);
          setNewDomain(d.origins[0]);
        }
      });
  }, [fetchServers, fetchFailedAuths]);

  async function handleCreate() {
    if (!newName.trim()) return;
    if (!newIp.trim()) { setError("Registered IP is required"); return; }
    if (!newDomain) { setError("Domain is required"); return; }
    setError("");
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), ip: newIp.trim(), domain: newDomain }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setNewToken({ name: data.server.name, token: data.token });
    setNewName("");
    setNewIp("");
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
  const detectedFqdn = me?.publicBaseUrl;
  const isCloudflare = !!(me?.headers?.["cf-connecting-ip"] || me?.headers?.["x-forwarded-host"]);
  const agentApiUrl = detectedFqdn ?? "https://f2b.callcenter-erp.com";

  function reasonBadge(reason?: FailedAuthEntry["reason"], server?: string) {
    switch (reason) {
      case "ip_mismatch":
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20 rounded-full">
            ⚠ IP Mismatch{server ? ` — ${server}` : ""}
          </span>
        );
      case "fqdn_mismatch":
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full">
            ⚠ FQDN Mismatch{server ? ` — ${server}` : ""}
          </span>
        );
      case "fqdn_not_allowed":
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger border border-danger/20 rounded-full">
            ✕ FQDN Not Allowed
          </span>
        );
      case "token_mismatch":
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger border border-danger/20 rounded-full">
            ✕ Unknown Token
          </span>
        );
      case "no_token":
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-card-border/40 text-muted border border-card-border rounded-full">
            — No Token
          </span>
        );
      default:
        return null;
    }
  }

  // Can we authorize this failed attempt?
  function canAuthorize(entry: FailedAuthEntry): boolean {
    return (
      entry.token !== "<none>" &&
      entry.ip !== "unknown" &&
      !!entry.fqdn
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted text-sm mt-1">Each registered server is authenticated by <strong>token + IP + FQDN</strong>. All three must match.</p>
        </div>

        {/* ── FQDN / Tunnel Diagnostic Banner ─────────────────────────── */}
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
                <code className="font-mono">x-forwarded-host</code> /{" "}
                <code className="font-mono">cf-visitor</code> headers.
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
            <p className="text-sm text-muted">This token is now active. Copy it — it will <strong>never</strong> be shown again.</p>
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

        {/* ── Register New Server ───────────────────────────────────────── */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-muted">Register New Server</h2>
            <p className="text-xs text-muted mt-0.5">All three fields are required. A token will be auto-generated.</p>
          </div>
          <div className="flex flex-col lg:flex-row gap-2">
            {/* Name */}
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Name — e.g. dialer1.callpro.be"
              className="flex-1 min-w-0 px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent"
            />
            {/* IP — required */}
            <input
              type="text"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Agent IP — e.g. 1.2.3.4"
              title="The source IP address the agent will authenticate from. Required."
              className="w-full lg:w-44 px-3 py-2 bg-background border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:border-accent"
            />
            {/* Domain — dropdown from ALLOWED_ORIGINS */}
            {allowedOrigins.length > 0 ? (
              <select
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                title="The FQDN this server will authenticate through."
                className="w-full lg:w-56 px-3 py-2 bg-background border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:border-accent"
              >
                {allowedOrigins.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                placeholder="Domain (ALLOWED_ORIGINS not set)"
                className="w-full lg:w-56 px-3 py-2 bg-background border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:border-accent"
              />
            )}
            <button onClick={handleCreate} className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0">
              Register
            </button>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        {/* ── Server List ──────────────────────────────────────────────── */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center text-muted py-8">Loading…</div>
          ) : servers.length === 0 ? (
            <div className="text-center text-muted py-8">No servers registered yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-48">Name</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell w-36">Registered IP</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Domain</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Last Seen · Login IP</th>
                  <th className="text-left px-4 py-3 hidden xl:table-cell w-28">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map(s => (
                  <tr key={s.id} className="border-b border-card-border/50 hover:bg-card-border/10">
                    {/* Name */}
                    <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">{s.name}</td>
                    {/* Registered IP */}
                    <td className="px-4 py-3 font-mono text-xs hidden md:table-cell text-muted">
                      {s.registered_ip ?? <span className="opacity-40 italic">—</span>}
                    </td>
                    {/* Domain */}
                    <td className="px-4 py-3 font-mono text-xs hidden lg:table-cell text-muted">
                      {s.registered_domain ?? <span className="opacity-40 italic">—</span>}
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
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {s.token_reused ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger border border-danger/20 rounded-full" title="Token has been used by multiple distinct IP addresses">
                          ⚠️ Token Reused
                        </span>
                      ) : s.fqdn_mismatch ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full" title={`FQDN mismatch — registered on ${s.registered_domain}`}>
                          ⚠️ FQDN Mismatch
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

        {/* ── Failed Auth Attempts ──────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Failed Auth Attempts</h2>
            <p className="text-muted text-sm mt-0.5">
              Requests that failed token, IP, or FQDN verification. Authorize to register the server immediately using the recorded credentials.
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
                      <div className="space-y-1.5 min-w-0 flex-1">

                        {/* IP + time + reason badge */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="font-semibold text-foreground font-mono">{entry.ip}</span>
                          <span title={new Date(entry.timestamp).toLocaleString()}>{relativeTime(entry.timestamp)}</span>
                          {reasonBadge(entry.reason, entry.server)}
                        </div>

                        {/* 3 factors grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs">
                          {/* FQDN */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">FQDN</span>
                            <code className="font-mono text-foreground truncate">
                              {entry.fqdn ?? <span className="text-muted italic opacity-60">unknown</span>}
                            </code>
                          </div>
                          {/* IP */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">IP</span>
                            <code className="font-mono text-foreground">{entry.ip}</code>
                          </div>
                          {/* Token (truncated) */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">Token</span>
                            <code className="font-mono text-foreground truncate max-w-[160px]" title={entry.token}>
                              {entry.token}
                            </code>
                            {entry.token !== "<none>" && (
                              <button
                                onClick={() => navigator.clipboard.writeText(entry.token)}
                                className="px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent hover:bg-accent/20 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                Copy
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Full URL */}
                        <p className="text-[10px] text-muted font-mono truncate" title={entry.url}>
                          {entry.url}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {canAuthorize(entry) && authorizingTs !== entry.timestamp && (
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
                      <div className="bg-background border border-accent/30 rounded-lg p-3 space-y-3">
                        <p className="text-xs text-muted">
                          Give this server a name. The token, IP, and FQDN from this attempt will be stored as-is.
                        </p>
                        {/* Prefilled auth factors (read-only) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs bg-card border border-card-border rounded-lg px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">FQDN</span>
                            <code className="font-mono text-success">{entry.fqdn ?? "—"}</code>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">IP</span>
                            <code className="font-mono text-success">{entry.ip}</code>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted shrink-0 w-12">Token</span>
                            <code className="font-mono text-success truncate max-w-[160px]" title={entry.token}>{entry.token}</code>
                          </div>
                        </div>
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

        {/* ── Agent Configuration ───────────────────────────────────────── */}
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
