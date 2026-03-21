"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";

interface UserRecord { id: number; username: string; role: string; created_at: string; }
interface InvRecord { id: number; token: string; expires_at: string; used_at: string | null; created_by: number; }
interface MeData { id?: number; username: string; ip: string; city?: string; country?: string; }

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [invitations, setInvitations] = useState<InvRecord[]>([]);
  const [me, setMe] = useState<MeData | null>(null);
  const [invLink, setInvLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [uRes, iRes] = await Promise.all([fetch("/api/auth/users"), fetch("/api/invitations")]);
    if (uRes.ok) setUsers((await uRes.json()).users);
    if (iRes.ok) setInvitations((await iRes.json()).invitations);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => d && setMe(d));
  }, [fetchAll]);

  async function handleCreateInvite() {
    const res = await fetch("/api/invitations", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const link = `${window.location.origin}/invite/${data.invitation.token}`;
      setInvLink(link);
      fetchAll();
    }
  }

  async function handleRevokeInvite(id: number) {
    await fetch("/api/invitations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setInvitations(i => i.filter(inv => inv.id !== id));
  }

  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted text-sm mt-1">Manage team members. Invite new users via a one-time link.</p>
        </div>

        {/* Invite banner */}
        {invLink && (
          <div className="bg-success/5 border border-success/30 rounded-xl p-4 space-y-3">
            <p className="text-success font-semibold">✓ Invitation link generated</p>
            <p className="text-sm text-muted">Share this link with the user <strong>offline</strong>. It expires in 72 hours and can only be used once.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background px-3 py-2 rounded-lg text-xs font-mono break-all border border-card-border">{invLink}</code>
              <button onClick={() => navigator.clipboard.writeText(invLink)} className="px-3 py-2 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors whitespace-nowrap">Copy</button>
            </div>
            <button onClick={() => setInvLink(null)} className="text-xs text-muted hover:text-foreground">Dismiss</button>
          </div>
        )}

        {/* Users table */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
            <h2 className="text-sm font-semibold">Team Members</h2>
            <button onClick={handleCreateInvite} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors">
              + Invite User
            </button>
          </div>
          {loading ? (
            <div className="text-center text-muted py-8">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Username</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-card-border/50">
                    <td className="px-4 py-3 font-mono">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md">{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending invitations */}
        {invitations.filter(i => !i.used_at).length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-card-border">
              <h2 className="text-sm font-semibold">Pending Invitations</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Token</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Expires</th>
                  <th className="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.filter(i => !i.used_at).map(inv => (
                  <tr key={inv.id} className="border-b border-card-border/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{inv.token.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">
                      {new Date(inv.expires_at) < new Date()
                        ? <span className="text-danger">Expired</span>
                        : new Date(inv.expires_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleRevokeInvite(inv.id)} className="px-3 py-1 text-xs bg-danger/10 text-danger hover:bg-danger/20 rounded-md transition-colors">Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
