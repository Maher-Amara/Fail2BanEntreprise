"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface BanStatus {
  ip: string;
  banned: boolean;
  ban: {
    jail?: string;
    server?: string;
    timestamp?: string;
    country?: string;
    city?: string;
  } | null;
  country?: string;
  city?: string;
}

interface UnbanResult {
  status: string;
  ip: string;
  was_banned: boolean;
  whitelisted_until: string;
  message: string;
}

export default function UnbanMePage() {
  const [status, setStatus] = useState<BanStatus | null>(null);
  const [result, setResult] = useState<UnbanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/unban-me");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Could not check ban status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function handleUnban() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/unban-me", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unban failed");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:block">Fail2BanEntreprise</span>
          </div>
          <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10 border border-warning/20 mb-4">
              <svg className="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Unban My IP</h1>
            <p className="text-muted text-sm mt-1">Self-service unban &amp; 24-hour whitelist</p>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-6">
            {loading ? (
              <div className="text-center text-muted py-8">
                <div className="inline-block w-6 h-6 border-2 border-muted/30 border-t-accent rounded-full animate-spin mb-3" />
                <p>Detecting your IP…</p>
              </div>
            ) : result ? (
              /* Success */
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10">
                  <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-success text-lg">Done!</p>
                  <p className="text-muted text-sm mt-1">{result.message}</p>
                </div>
                <div className="bg-background rounded-lg p-4 text-sm space-y-2 text-left">
                  <div className="flex justify-between">
                    <span className="text-muted">IP</span>
                    <span className="font-mono">{result.ip}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Was banned</span>
                    <span>{result.was_banned ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Whitelisted until</span>
                    <span className="font-mono text-xs">{new Date(result.whitelisted_until).toLocaleString()}</span>
                  </div>
                </div>
                <Link href="/" className="inline-block text-sm text-accent hover:text-accent-hover transition-colors">
                  ← Back to Dashboard
                </Link>
              </div>
            ) : (
              /* Detection / Action */
              <div className="space-y-5">
                {/* Detected IP */}
                <div className="bg-background rounded-lg p-4">
                  <p className="text-xs text-muted uppercase tracking-wider mb-1">Your IP Address</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-mono font-semibold">{status?.ip || "Unknown"}</p>
                    {(status?.city || status?.country) && (
                      <span className="text-sm text-muted">
                        {[status.city, status.country].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ban Status */}
                {status?.banned ? (
                  <div className="bg-danger/5 border border-danger/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                      <span className="text-danger font-semibold text-sm">Currently Banned</span>
                    </div>
                    <div className="text-sm text-muted space-y-1">
                      {status.ban?.jail && <p>Jail: <span className="text-foreground font-mono">{status.ban.jail}</span></p>}
                      {status.ban?.server && <p>Server: <span className="text-foreground font-mono">{status.ban.server}</span></p>}
                    </div>
                  </div>
                ) : (
                  <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-success font-semibold text-sm">Not Banned</span>
                    </div>
                    <p className="text-sm text-muted mt-1">
                      Your IP is not currently blocked. You can still whitelist it for 24 hours.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="px-3 py-2 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleUnban}
                  disabled={submitting}
                  className="w-full py-3 bg-warning hover:bg-warning/90 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? "Processing…"
                    : status?.banned
                      ? "Unban Me & Whitelist 24h"
                      : "Whitelist Me for 24h"}
                </button>

                <p className="text-xs text-muted text-center">
                  Removes any active ban on your IP and adds a 24-hour temporary whitelist across all servers.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
