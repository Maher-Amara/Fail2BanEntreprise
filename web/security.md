# Next.js Security Reference

**Last Updated:** 21/03/2026
**Purpose:** Security reference for the Next.js applications based on observed attack patterns and implemented defenses.

---

## Observed Attack Patterns

### 1. Command Injection Attempts

- Base64-encoded shell scripts
- Malware downloads from suspicious IPs: `94.154.35.154`, `193.142.147.209`, `91.200.220.168`, `5.181.2.123`
- **Mitigation:** Zod schema validation on all API inputs, no user input ever reaches shell commands

### 2. Malware Installation Attempts

- Cryptocurrency miners (`xmrig`, `c3pool`)
- Botnet binaries (`yamaha.x86_64`, `cARM`, `cX86`)
- System persistence (cron jobs, systemd services)
- **Mitigation:** Container hardening — read-only filesystem, `cap_drop: ALL`, non-root user

### 3. Reverse Shell Attempts

- Netcat reverse shells to `193.142.147.209:12323`
- Persistent backdoor attempts
- **Mitigation:** Cloudflare Tunnel (no exposed ports), internal Docker network, container isolation

### 4. Code Injection Attempts

- `ReferenceError: returnNaN is not defined`
- Permission denied errors (`/dev/lrt`, `//lrt`)
- **Mitigation:** Strict CSP with nonces (no `unsafe-inline`/`unsafe-eval`), input sanitization via zod

---

## Implemented Security Measures

### ✅ Container & Infrastructure Security

**Docker Compose Hardening:**

- Non-root user: `1001:1001` (nextjs:nodejs)
- Read-only filesystem: `read_only: true`
- Capability dropping: `cap_drop: ALL`
- No new privileges: `no-new-privileges:true`
- Resource limits: Memory (256M), CPU (0.50)
- Temporary filesystem: `/app/.next/cache` with `noexec,nosuid`
- Node security flags: `--no-warnings --disable-proto=delete`
- Telemetry disabled: `NEXT_TELEMETRY_DISABLED=1`
- Internal Docker network: Redis not exposed externally
- GeoIP data mounted read-only

**Dockerfile (multi-stage):**

- `deps` → `builder` → `runner` stages
- Minimal Alpine-based production image
- Standalone output for reduced attack surface
- Proper file ownership (nextjs:nodejs)
- Server Actions encryption key passed as build arg

### ✅ Network Security — Cloudflare Tunnel (no nginx)

- **No ports exposed to the internet** — Cloudflare Tunnel (`cloudflared`) creates an outbound-only connection to Cloudflare's edge
- **No nginx reverse proxy** — eliminated as attack surface; Cloudflare handles TLS, DDoS, WAF
- **Client IP via `cf-connecting-ip`** — trusted header set by Cloudflare edge (cannot be spoofed)
- **All containers on internal Docker network** — Redis, web, and cloudflared communicate privately

### ✅ Content Security Policy (CSP)

**Strict CSP with per-request nonces:**

- Implemented in `middleware.ts` with cryptographically secure nonces
- Nonce generated per request using `crypto.randomUUID()` → base64
- No `unsafe-inline` or `unsafe-eval` in production
- `'strict-dynamic'` enabled for script loading
- Development mode allows `unsafe-eval` for HMR

**CSP Directives:**

```text
default-src 'self'
script-src 'self' 'nonce-{nonce}' 'strict-dynamic'
style-src 'self' 'nonce-{nonce}'
img-src 'self' blob: data: https:
font-src 'self' data:
connect-src 'self'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

### ✅ HTTP Security Headers

Set in both middleware (per-request) and `next.config.ts` (static):

| Header | Value | Purpose |
| --- | --- | --- |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `origin-when-cross-origin` | Limits referrer leakage |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=()` | Restricts browser APIs |
| `Content-Security-Policy` | Per-request with nonce | Prevents injection |

### ✅ Server Actions Security

**Encryption Key:**

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` configured via env and build arg
- AES-GCM encrypted for consistent encryption across deployments
- Prevents sensitive data exposure in closures

**Allowed Origins:**

- `ALLOWED_ORIGINS` env var restricts Server Action invocation to trusted domains
- Prevents CSRF attacks from untrusted origins

### ✅ Authentication & Authorization

**API Key Auth (Fail2Ban agents):**

- Timing-safe comparison via `crypto.timingSafeEqual` — prevents timing attacks
- Checked on every agent-facing route (`/api/ban`, `/api/unban`, `/api/sync`)

**JWT Auth (admin dashboard):**

- `jose` library for JWT sign/verify (HS256)
- 24h expiration
- HttpOnly, SameSite=Lax cookies (`Secure` flag in production)
- Middleware-level enforcement — unauthenticated requests redirected to `/login`

**Credential Checks:**

- Timing-safe comparison for admin username and password
- Empty password always rejected

### ✅ Input Validation (zod)

All API routes validate input with strict zod schemas before processing:

| Route | Schema | Validated Fields |
| --- | --- | --- |
| `POST /api/ban` | `banSchema` | `ip` (IPv4), `jail` (alphanum), `server` (hostname), `bantime` (int 1–31536000) |
| `POST /api/unban` | `unbanSchema` | `ip` (IPv4), optional `jail`, `server` |
| `POST /api/whitelist` | `whitelistSchema` | `ip` (IPv4/CIDR), `action` (enum: add/remove) |
| `POST /api/auth/login` | `loginSchema` | `username` (alphanum 1–64), `password` (1–128) |
| `GET /api/geoip` | `geoipQuerySchema` | `ip` (IPv4) |

**Validation features:**

- Strict IPv4 regex — prevents injection via IP fields
- Jail/server names: alphanumeric + `_-.` only
- Length limits on all fields
- Enum validation for action fields
- JSON parse errors caught and returned as 400

### ✅ Cookie Security

| Flag | Value | Purpose |
| --- | --- | --- |
| `HttpOnly` | `true` | Prevents JavaScript access (XSS protection) |
| `SameSite` | `Lax` | CSRF protection |
| `Secure` | `true` (production) | HTTPS only |
| `Path` | `/` | Scoped to entire app |
| `Max-Age` | `86400` | 24h expiration |

---

## Security Checklist

- [x] Container hardening (non-root, read-only, cap-drop, no-new-privileges)
- [x] Cloudflare Tunnel (no exposed ports, no nginx)
- [x] Server Actions encryption key
- [x] Strict CSP with per-request nonces (no unsafe-inline/unsafe-eval)
- [x] HTTP security headers (middleware + next.config)
- [x] Timing-safe API key and credential comparison
- [x] Secure cookies (HttpOnly, SameSite, Secure in production)
- [x] Zod validation on all API inputs
- [x] Client IP from `cf-connecting-ip` (Cloudflare trusted header)
- [x] Internal Docker network (Redis not exposed)
- [x] Node.js `--disable-proto=delete` flag
- [x] Telemetry disabled

---

## Best Practices

### Input Validation

- Always validate with zod schemas — never trust client input
- Use strict regex for IP addresses, hostnames, jail names
- Catch JSON parse errors explicitly
- Return clear error messages for validation failures

### CSP

- Never use `unsafe-inline` or `unsafe-eval` in production
- Generate fresh nonce per request via `crypto.randomUUID()`
- Use `'strict-dynamic'` for script loading chains
- Set CSP in middleware, not in static config

### Container Security

- Always run as non-root user (UID 1001)
- Use read-only filesystem with explicit tmpfs for cache
- Drop ALL capabilities
- Set resource limits (memory, CPU)
- Mount data volumes as read-only

### Cloudflare Tunnel

- No ports exposed to the internet — outbound-only tunnel
- Trust `cf-connecting-ip` header for real client IP
- Let Cloudflare handle TLS termination, DDoS, WAF
- Set `ALLOWED_ORIGINS` to match your Cloudflare domain

---

## References

- [Next.js Data Security Guide](https://nextjs.org/docs/15/app/guides/data-security)
- [Next.js Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
- [Next.js Forms & Server Actions](https://nextjs.org/docs/15/app/guides/forms)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
