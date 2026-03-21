"use client";

import { useState, useEffect, type FormEvent } from "react";
import { NavHeader } from "@/app/components/NavHeader";

interface MeData { username: string; ip: string; city?: string; country?: string; }

export default function ProfilePage() {
  const [me, setMe] = useState<MeData | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => d && setMe(d));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setMessage("");
    if (next !== confirm) { setStatus("error"); setMessage("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus("error"); setMessage(data.error); return; }
      setStatus("ok");
      setMessage("Password changed successfully.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch { setStatus("error"); setMessage("Network error"); }
    finally { setLoading(false); }
  }

  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      <main className="max-w-lg w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-muted text-sm mt-1">Manage your account settings.</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted uppercase tracking-wider">Username</p>
          <p className="font-mono font-semibold">{me?.username ?? "…"}</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Change Password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1.5">Current Password</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5">New Password</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={8} className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5">Confirm New Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
            </div>
            {status === "error" && <div className="px-3 py-2 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">{message}</div>}
            {status === "ok" && <div className="px-3 py-2 bg-success/10 border border-success/20 rounded-lg text-success text-sm">{message}</div>}
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading ? "Saving…" : "Change Password"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
