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

interface MeData { username: string; ip: string; city?: string; country?: string; }

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [me, setMe] = useState<MeData | null>(null);
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{ id: number; token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchServers = useCallback(async () => {
    const res = await fetch("/api/servers");
    if (res.ok) setServers((await res.json()).servers);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchServers();
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => d && setMe(d));
  }, [fetchServers]);

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

  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted text-sm mt-1">Each registered server gets a unique API token used by its Fail2Ban agent.</p>
        </div>

        {/* Token reveal after create */}
        {newToken && (
          <div className="bg-success/5 border border-success/30 rounded-xl p-4 space-y-3">
            <p className="text-success font-semibold">✓ Server &quot;{newToken.name}&quot; created</p>
            <p className="text-sm text-muted">Copy this token now — it will <strong>never</strong> be shown again.</p>
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

        {/* Agent config snippet */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-muted">Agent Configuration</h2>
          <p className="text-xs text-muted">Add to <code className="font-mono">/etc/f2b-agent.conf</code> on each server:</p>
          <pre className="bg-background rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto border border-card-border">
{`F2B_API_URL="https://f2b.scopcall.com"
F2B_API_KEY="<token-from-above>"
F2B_SERVER_NAME="<server-name>"`}
          </pre>
        </div>
      </main>
    </div>
  );
}
