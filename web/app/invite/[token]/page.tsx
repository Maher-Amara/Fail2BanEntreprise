"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";

export default function InvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [valid, setValid] = useState<boolean | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkToken = useCallback(async () => {
    const res = await fetch(`/api/invitations/${token}`);
    const data = await res.json();
    setValid(data.valid);
    if (data.valid) setExpiresAt(data.expires_at);
  }, [token]);

  useEffect(() => { checkToken(); }, [checkToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push("/");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">You&apos;re Invited</h1>
          <p className="text-muted text-sm mt-1">Set up your Fail2BanEntreprise account</p>
        </div>

        {valid === null && <div className="text-center text-muted">Checking invitation…</div>}

        {valid === false && (
          <div className="text-center space-y-4">
            <div className="px-4 py-3 bg-danger/10 border border-danger/20 rounded-xl text-danger">
              This invitation is invalid or has expired.
            </div>
            <a href="/login" className="text-sm text-accent hover:text-accent-hover">← Go to login</a>
          </div>
        )}

        {valid === true && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {expiresAt && (
              <p className="text-xs text-muted text-center">Expires {new Date(expiresAt).toLocaleString()}</p>
            )}
            <div>
              <label className="block text-sm text-muted mb-1.5">Choose a username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} placeholder="username" className="w-full px-3 py-2.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters" className="w-full px-3 py-2.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} placeholder="Repeat password" className="w-full px-3 py-2.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            {error && <div className="px-3 py-2 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading ? "Creating account…" : "Create Account & Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
