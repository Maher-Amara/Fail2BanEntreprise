# Fail2Ban — ViciDial / ViciBox Hardening Guide

> **What is Fail2Ban?** A log-parsing intrusion-prevention daemon that monitors service logs for attack symptoms (brute-force, credential stuffing, scanning) and dynamically adds iptables rules to ban offending IPs.
>
> **Why on ViciDial?** A production dialer exposes Asterisk SIP/IAX, AMI, WebRTC-WSS, Apache (admin UI), MySQL, SSH, and optionally mail services — all prime targets for automated attacks. A single compromised SIP account can generate thousands of dollars in toll fraud within minutes.
>
> **Monitoring:** Ban activity is visualised in real-time via a [Grafana Fail2Ban dashboard](#15-grafana-monitoring-dashboard) (Loki + GeoIP heatmap).
>
> **Incident Report:** See [Security.md](Security.md) for the full forensic analysis of a real-world DoS incident (`vic-incident`) that drove many of the hardening requirements below.

---

## Table of Contents

0. [Mandatory Security Prerequisites](#0-mandatory-security-prerequisites)
1. [Installation](#1-installation)
2. [Global Defaults — jail.local](#2-global-defaults--jaillocal)
3. [Jail 1 — Asterisk SIP / IAX (Brute-Force & Registration Attacks)](#3-jail-1--asterisk-sip--iax-brute-force--registration-attacks)
4. [Jail 2 — SSH](#4-jail-2--ssh)
5. [Jail 3 — Apache (ViciDial Web UI / Admin Portal)](#5-jail-3--apache-vicidial-web-ui--admin-portal)
6. [Jail 4 — Apache Bad Bots & Scanners](#6-jail-4--apache-bad-bots--scanners)
7. [Jail 5 — MySQL / MariaDB](#7-jail-5--mysql--mariadb)
8. [Jail 6 — Asterisk Manager Interface (AMI)](#8-jail-6--asterisk-manager-interface-ami)
9. [Jail 7 — WebRTC (WSS on Port 8089)](#9-jail-7--webrtc-wss-on-port-8089)
10. [Jail 8 — ViciBox Dynamic Portal](#10-jail-8--vicibox-dynamic-portal)
11. [Jail 9 — Dovecot (IMAP / POP3)](#11-jail-9--dovecot-imap--pop3)
12. [Jail 10 — Postfix (SMTP / SASL)](#12-jail-10--postfix-smtp--sasl)
13. [Jail 11 — Recidive (Repeat Offenders)](#13-jail-11--recidive-repeat-offenders)
14. [Custom Filters](#14-custom-filters)
15. [Grafana Monitoring Dashboard](#15-grafana-monitoring-dashboard)
16. [Verification & Management](#16-verification--management)
17. [Maintenance Commands](#17-maintenance-commands)
18. [References](#18-references)

---

## 0. Mandatory Security Prerequisites

> **Fail2Ban is a reactive defence** — it bans IPs **after** detecting failed attempts. It is NOT a substitute for proper security configuration. The following prerequisites **must** be in place before or alongside Fail2Ban deployment.
>
> These requirements are derived from the forensic analysis of a real DoS incident ([Security.md](Security.md)) where the absence of Fail2Ban and basic security hygiene allowed a SIP brute-force flood (~204,000 attempts) to cascade into a complete ViciDial platform outage.

### 0.1 — SSH Hardening

| Setting                  | Value                   | Why                                                               |
| ------------------------ | ----------------------- | ----------------------------------------------------------------- |
| `PermitRootLogin`        | `prohibit-password`     | Prevents brute-force of root password; keys only                  |
| `PasswordAuthentication` | `no`                    | Eliminates password-based attacks entirely                        |
| `MaxAuthTries`           | `3`                     | Limits per-connection auth attempts before disconnect             |

Deploy SSH keys for all team members **before** disabling password authentication:

```bash
# On each operator's workstation:
ssh-keygen -t ed25519 -C "operator@example.com"
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<server-ip>

# Then on the server:
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
systemctl restart sshd
```

> **Incident note:** The affected server had `PermitRootLogin yes` with password authentication and an empty `authorized_keys` file — SSH was open to brute-force from the entire internet.

#### Individual User Accounts (No Shared Root)

Each team member must have their **own named account** with `sudo` privileges. Shared `root` login makes it impossible to attribute actions and increases the blast radius of a compromised credential.

```bash
# Create individual accounts with sudo access:
useradd -m -s /bin/bash -G wheel operator1
useradd -m -s /bin/bash -G wheel operator2
useradd -m -s /bin/bash -G wheel operator3

# Deploy SSH keys for each user:
su - operator1 -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
# Copy each operator's public key to their ~/.ssh/authorized_keys

# Once all keys are deployed, disable direct root login entirely:
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd
```

> **Incident note:** All 3 team members logged in as `root` using the same shared password — no individual accounts existed. Actions could not be attributed to specific team members during incident response.

### 0.2 — SSH Logging (openSUSE / SLES)

On openSUSE and SLES systems (including ViciBox), SSH authentication events are logged **only to the systemd journal** (`journalctl -u sshd.service`). No file-based logs exist at `/var/log/secure`, `/var/log/auth.log`, or `/var/log/messages`.

**Option A — Configure Fail2Ban to read from systemd journal (recommended):**

Set `backend = systemd` in the SSH jail configuration (see [Section 4](#4-jail-2--ssh)).

**Option B — Forward SSH events to a log file via rsyslog:**

```bash
# Create /etc/rsyslog.d/sshd.conf
cat > /etc/rsyslog.d/sshd.conf << 'EOF'
:programname, isequal, "sshd" /var/log/sshd.log
& stop
EOF

systemctl restart rsyslog
```

Then use `logpath = /var/log/sshd.log` in the SSH jail.

> **Incident note:** The forensics runbook found zero SSH auth events in any file-based log. The 87 brute-force attempts were only visible via `lastb` (utmp accounting).

### 0.3 — Service Binding

Ensure services that should NOT be internet-facing are bound to localhost:

| Service        | Config File                     | Setting                      | Default Risk                                              |
| -------------- | ------------------------------- | ---------------------------- | --------------------------------------------------------- |
| MySQL/MariaDB  | `/etc/my.cnf`                   | `bind-address = 127.0.0.1`  | Exposed on `0.0.0.0` — allows remote auth attacks         |
| AMI (Asterisk) | `/etc/asterisk/manager.conf`    | `bindaddr = 127.0.0.1`      | Exposed AMI allows call origination and data exfiltration |

#### Multi-Server MySQL (When Remote Access Is Required)

If a second ViciDial server requires remote database access, MySQL must remain bound to `0.0.0.0` — but the firewall **must** restrict port 3306 to the specific remote server IP:

```bash
# Allow ONLY the remote ViciDial server to reach MySQL:
iptables -I INPUT -p tcp --dport 3306 -s <remote-server-ip> -j ACCEPT
iptables -I INPUT -p tcp --dport 3306 -j DROP

# IMPORTANT: When the remote server changes IP, update the firewall immediately.
# Use a domain name (DNS) for the remote server and a cron-based DNS resolver
# to avoid stale IP rules.
```

> **Incident note:** MySQL was correctly firewalled to a single remote server IP — but the remote server was migrated to a new IP and the firewall rule was never updated. The old (now uncontrolled) IP remained whitelisted.

### 0.4 — Firewall Rule Ordering

> **Lesson from incident:** A manual `DROP` rule for attacker IP `202.93.142.22` was added **after** the final `REJECT` rule — making it a dead rule that never matches traffic.

iptables rules are evaluated **top-to-bottom, first match wins**:

```bash
# CORRECT — specific block BEFORE the catch-all reject
iptables -I INPUT 1 -s <attacker-ip> -j DROP

# WRONG — appending after REJECT (dead rule, never reached)
iptables -A INPUT -s <attacker-ip> -j DROP
```

When using Fail2Ban, **never manually append** iptables rules — let Fail2Ban manage its own chains. If you must add manual rules, use `-I` (insert at top) not `-A` (append at bottom).

### 0.5 — Asterisk Security Logging

Asterisk must log security events for the SIP, AMI, and WebRTC jails to work. See [Section 3 — Prerequisite](#prerequisite--asterisk-security-logging) for the required `/etc/asterisk/logger.conf` changes.

### 0.6 — Operating System

Run a **supported** OS version with active security patches:

| Distribution   | Minimum Version       | Notes                        |
| -------------- | --------------------- | ---------------------------- |
| openSUSE Leap  | 15.6+                 | Active community support     |
| SLES           | 15 SP5+               | Active LTSS available        |
| ViciBox        | 11+                   | Based on SLES 15 SP4+        |

> **Incident note:** The affected server ran openSUSE Leap 15.1 (EOL since January 2021) with kernel 4.12.14 — no security patches available. DAHDI instability under load may be partially attributable to unpatched kernel bugs.

### 0.7 — SSH Access Policy (VPN / Static IP Only)

SSH access must be restricted to **static IPs only** — either a VPN exit IP or a fixed office IP. Dynamic residential IPs are **not permitted** for SSH access. This provides defence in depth alongside Fail2Ban and SSH keys.

```bash
# Allow SSH only from VPN and office IPs:
iptables -I INPUT -p tcp --dport 22 -s <vpn-exit-ip> -j ACCEPT
iptables -I INPUT -p tcp --dport 22 -s <office-ip> -j ACCEPT
iptables -I INPUT -p tcp --dport 22 -j DROP
```

| Access Method    | Allowed | Notes                                        |
| ---------------- | ------- | -------------------------------------------- |
| VPN static IP    | ✅ Yes  | Preferred — all team members connect via VPN |
| Office static IP | ✅ Yes  | Secondary — for on-site access               |
| Dynamic home IP  | ❌ No   | Cannot be reliably whitelisted or audited    |
| Open to internet | ❌ No   | Exposed to scanning and brute-force          |

> **Incident note:** During the `vic-incident`, team members connected from 8+ different dynamic IPs across Tunisia and Belgium. This made it impossible to apply IP-based access controls and complicated the forensic analysis.

### 0.8 — Proactive Monitoring (node_exporter + Grafana)

> **Why?** Fail2Ban is reactive — it blocks attackers after detecting failures. **Monitoring is proactive** — it detects resource anomalies (CPU spikes, process accumulation, connection floods) **before** they cascade into a full outage. During the `vic-incident`, the team only detected the attack after agents reported call failures — automated alerting would have caught the spike within minutes.

`node_exporter` exposes system metrics on port 9100 for Prometheus to scrape. These metrics feed Grafana dashboards and alerting rules.

#### Step 1 — Verify node_exporter is Running

```bash
# node_exporter is typically already installed on ViciBox:
systemctl status node_exporter

# Verify metrics are accessible:
curl -s http://localhost:9100/metrics | head -20
```

#### Step 2 — Configure Prometheus Scrape Target

Add the ViciDial server to your Prometheus `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'vicidial'
    static_configs:
      - targets: ['<vicidial-server-ip>:9100']
        labels:
          instance: 'dialer.callpro.be'
          environment: 'production'
```

> **Security:** Port 9100 should be firewalled to allow access **only** from the Prometheus/Grafana server IP.

#### Step 3 — Grafana Alert Rules for Early Detection

Configure the following alerting thresholds in Grafana to catch resource spikes early:

| Alert                         | PromQL Expression                                                                    | Threshold    | Severity |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------ | -------- |
| **CPU sustained high**        | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`      | > 80% for 5m | Warning  |
| **Memory pressure**           | `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100`            | > 85%        | Warning  |
| **Process count spike**       | `node_procs_running + node_procs_blocked`                                            | > 500        | Critical |
| **Disk I/O saturation**       | `rate(node_disk_io_time_seconds_total[5m])`                                          | > 0.9        | Warning  |
| **Open file descriptors**     | `node_filefd_allocated / node_filefd_maximum * 100`                                  | > 80%        | Warning  |
| **Network connections spike** | `node_netstat_Tcp_CurrEstab`                                                         | > 1000       | Warning  |

#### Step 4 — Recommended Grafana Dashboards

| Dashboard              | Grafana ID | Purpose                                               |
| ---------------------- | ---------- | ----------------------------------------------------- |
| **Node Exporter Full** | `1860`     | Comprehensive system metrics (CPU, memory, disk, net) |
| **Fail2Ban**           | `22741`    | Ban activity, GeoIP heatmap, jail hit-rates           |

> **Incident impact:** With these alerts in place, the CPU and process count alerts would have fired within **5 minutes** of the SIP flood starting — giving the team time to investigate and deploy manual blocks before the cascading failure reached critical levels.

### 0.9 — Hostname & Domain Configuration

Use a **domain name** (e.g., `dialer.callpro.be`) instead of a direct IP address for all service access. This allows:

- **Seamless IP migration** — update DNS instead of reconfiguring every client, firewall rule, and SIP trunk
- **Avoids stale firewall rules** — the `vic-incident` MySQL firewall issue (allowing the old server IP) would not have occurred with domain-based resolution
- **TLS certificate management** — Let's Encrypt certificates require a domain name

```bash
# Update the server hostname:
hostnamectl set-hostname dialer.callpro.be

# Update Asterisk SIP domain in /etc/asterisk/sip.conf or pjsip.conf:
# externhost=dialer.callpro.be
# externrefresh=180
```

---

## 1. Installation

```bash
yast2 -i fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 2. Global Defaults — jail.local

> **Rule:** Never edit `/etc/fail2ban/jail.conf` directly — always create/edit `/etc/fail2ban/jail.local`. The `.local` file overrides `.conf` and survives package upgrades.

Create or edit `/etc/fail2ban/jail.local`:

```ini
# /etc/fail2ban/jail.local
# ─────────────────────────────────────────────────────────────
# ViciDial / ViciBox — Global Fail2Ban Configuration
# ─────────────────────────────────────────────────────────────

[DEFAULT]
# ── IPs that will NEVER be banned ──
# Office IP  |  Datacenter FR (server subnet)  |  Datacenter BE
ignoreip = 127.0.0.1/8 ::1 196.179.222.182 213.144.214.192/26 81.95.124.53/26

# ── Ban Parameters ──
bantime   = 86400       ; 24 hours default (override per-jail as needed)
findtime  = 600         ; 10-minute sliding window
maxretry  = 5           ; failures in findtime before ban

# ── Log Backend ──
backend   = auto

# ── Ban Action ──
banaction = iptables-multiport

# ── Action (ban only — monitoring via Grafana dashboard) ──
action    = %(action_)s
```

### Key Parameters Explained

| Parameter   | Value         | Meaning                                                                    |
| ----------- | ------------- | -------------------------------------------------------------------------- |
| `ignoreip`  | IPs/CIDRs     | IPs that are **never** banned — loopback, office IP, datacenter subnets    |
| `bantime`   | `86400`       | Ban duration in seconds (86 400 = 24 h). Per-jail overrides below          |
| `findtime`  | `600`         | Sliding window in seconds to count failures (600 = 10 min)                 |
| `maxretry`  | `5`           | Number of failures within `findtime` that triggers a ban                   |
| `backend`   | `auto`        | Log monitoring method — `auto` picks the best available                    |
| `action`    | `%(action_)s` | Ban-only action. All alerting is handled by the Grafana Fail2Ban dashboard |

### Traffic Direction Behavior (Important)

When Fail2Ban bans an IP with `iptables-allports` or `iptables-multiport`, traffic from that remote IP is dropped/rejected on the protected ports. Operationally, this means communication with that endpoint is blocked for the ban duration.

- If the blocked endpoint is a SIP/WebRTC client, that client cannot register, place calls, or receive calls during the ban.
- If the blocked endpoint is an attacker, this is the intended protection behavior.
- Always whitelist trusted infrastructure and office/VPN IPs in `ignoreip` to avoid self-inflicted service interruption.

### Whitelisted IPs

| Label            | IP / CIDR            | Purpose                                    |
| ---------------- | -------------------- | ------------------------------------------ |
| Loopback         | `127.0.0.1`          | Localhost                                  |
| Office           | `196.179.222.182`    | Management / admin access                  |
| Datacenter FR    | `213.144.214.192/26` | Server subnet — prevents self-banning      |
| Datacenter BE    | `81.95.124.53/26`    | Secondary datacenter / replication traffic |

> **No Dynamic IPs:** Team members must **not** access the server from dynamic residential IPs. All access must come from a **static VPN exit IP** or **office IP** (see [Section 0.7](#07--ssh-access-policy-vpn--static-ip-only)). This eliminates the problem of whitelisting changing IPs and ensures all team access can be reliably firewalled and audited. Add the VPN and office IPs to the `ignoreip` list above.
>
> **Agent device IPs:** If agents connect via WebRTC/SIP from office IPs, ensure those IPs are whitelisted. During the `vic-incident` DoS, Asterisk logged 1,599 "Failed to authenticate" events from a legitimate Belgium agent IP (`81.95.119.151`) because the server was too overloaded to process registrations — without a whitelist, Fail2Ban would have banned the agents on top of the DoS.

---

## 3. Jail 1 — Asterisk SIP / IAX (Brute-Force & Registration Attacks)

> **Why?** SIP registration attacks and credential brute-force are the #1 threat to any VoIP server. A successful attack leads to toll fraud. The built-in Asterisk filter catches failed registrations, wrong passwords, peer mismatches, and ACL violations.

### Prerequisite — Asterisk Security Logging

Ensure Asterisk is logging security events. Edit `/etc/asterisk/logger.conf`:

```ini
[logfiles]
messages => notice,warning,error,security
```

Reload logger:

```bash
asterisk -rx "logger reload"
```

### Jail Configuration

```ini
[asterisk-iptables]
enabled  = true
filter   = asterisk
action   = iptables-allports[name=ASTERISK, protocol=all]
logpath  = /var/log/asterisk/messages
maxretry = 3
findtime = 600
bantime  = 6048000    ; ~70 days — SIP attackers are persistent
```

### What the Built-in Filter Catches

The filter at `/etc/fail2ban/filter.d/asterisk.conf` matches log lines such as:

- `Registration from '...' failed for '<HOST>' - Wrong password`
- `Registration from '...' failed for '<HOST>' - Username/auth name mismatch`
- `Registration from '...' failed for '<HOST>' - No matching peer found`
- `Registration from '...' failed for '<HOST>' - Device does not match ACL`
- `NOTICE[...]: chan_sip.c: Failed to authenticate device <...>@<HOST>`
- `SECURITY[...]: SecurityEvent="FailedACL"` entries

---

## 4. Jail 2 — SSH

> **Why?** SSH is the most scanned service on the internet. Any publicly reachable ViciDial server will see thousands of SSH brute-force attempts per day. In the `vic-incident` DoS case, 87 failed SSH login attempts from 4 IPs went completely unblocked.

### Configuration — systemd Backend (openSUSE / SLES / ViciBox)

> **Important:** On openSUSE and SLES-based systems (including ViciBox), SSH logs are only available in the systemd journal — not in `/var/log/messages` or `/var/log/secure`. You **must** use `backend = systemd` or the SSH jail will be **blind** (see [Section 0.2](#02--ssh-logging-opensuse--sles)).

```ini
[ssh-iptables]
enabled  = true
filter   = sshd[mode=normal]
action   = iptables-allports[name=SSH, protocol=tcp]
backend  = systemd
maxretry = 3
findtime = 600
bantime  = 6048000    ; ~70 days
```

### Configuration — File-Based Backend (if rsyslog forwards SSH events)

If you have configured rsyslog to forward SSH events to a file (see [Section 0.2](#02--ssh-logging-opensuse--sles)):

```ini
[ssh-iptables]
enabled  = true
filter   = sshd
action   = iptables-allports[name=SSH, protocol=tcp]
logpath  = /var/log/messages
maxretry = 3
findtime = 600
bantime  = 6048000    ; ~70 days
```

### Verify SSH Logging

Before enabling the jail, confirm that SSH failures are visible to Fail2Ban:

```bash
# systemd backend — check journal has SSH events:
journalctl -u sshd.service --since "1 hour ago" | grep -i "failed\|invalid"

# File-based backend — check log file has SSH events:
grep -i "failed\|invalid" /var/log/messages | grep sshd
```

If neither command returns results, SSH events are not being captured — fix logging first (see [Section 0.2](#02--ssh-logging-opensuse--sles)).

> **Tip:** Combine with `AllowUsers` / `AllowGroups` in `/etc/ssh/sshd_config` and key-based authentication for defense-in-depth.

---

## 5. Jail 3 — Apache (ViciDial Web UI / Admin Portal)

> **Why?** The ViciDial admin interface (`/vicidial/admin.php`) and agent screen run on Apache. Failed HTTP auth attempts appear in the Apache error log.

```ini
[apache-auth]
enabled  = true
filter   = apache-auth
action   = iptables-allports[name=APACHE-AUTH, protocol=tcp]
logpath  = /var/log/apache2/error_log
maxretry = 5
findtime = 600
bantime  = 3600       ; 1 hour — legitimate agents may mistype passwords
```

---

## 6. Jail 4 — Apache Bad Bots & Scanners

> **Why?** Automated scanners and bad bots probe for vulnerabilities in the ViciDial web interface. This jail bans them on the first hit.

```ini
[apache-badbots]
enabled  = true
filter   = apache-badbots
action   = iptables-multiport[name=APACHE-BADBOTS, port="http,https"]
logpath  = /var/log/apache2/*access_log
maxretry = 1
findtime = 600
bantime  = 6048000
```

### Optional — Apache Overflow & Script Injection

```ini
[apache-overflows]
enabled  = true
filter   = apache-overflows
action   = iptables-allports[name=APACHE-OVERFLOW, protocol=tcp]
logpath  = /var/log/apache2/error_log
maxretry = 2
bantime  = 6048000

[apache-noscript]
enabled  = true
filter   = apache-noscript
action   = iptables-allports[name=APACHE-NOSCRIPT, protocol=tcp]
logpath  = /var/log/apache2/error_log
maxretry = 3
bantime  = 6048000
```

---

## 7. Jail 5 — MySQL / MariaDB

> **Why?** ViciDial's database contains call records, agent credentials, and campaign configurations. An exposed MySQL port (3306) with weak passwords is a prime target.

### Prerequisite — Enable Verbose Error Logging

Edit `/etc/my.cnf` (or `/etc/my.cnf.d/server.cnf` on ViciBox):

```ini
[mysqld]
log_error          = /var/log/mysql/error.log
log_error_verbosity = 3
log_warnings        = 2
```

Restart MariaDB:

```bash
systemctl restart mariadb
```

Verify failed logins are logged:

```bash
grep "Access denied" /var/log/mysql/error.log
```

### Custom Filter

Create `/etc/fail2ban/filter.d/mysqld-auth.conf`:

```ini
# /etc/fail2ban/filter.d/mysqld-auth.conf
# Fail2Ban filter for MySQL/MariaDB authentication failures

[INCLUDES]
before = common.conf

[Definition]
_daemon = mysqld|mariadbd

failregex = ^%(__prefix_line)s.*Access denied for user '[^']*'@'<HOST>' \(using password: .*\)$
            ^%(__prefix_line)s.*\[Warning\].*Access denied for user '[^']*'@'<HOST>'.*$

ignoreregex =
```

### Jail Configuration

```ini
[mysqld-auth]
enabled  = true
filter   = mysqld-auth
action   = iptables-multiport[name=MYSQL, port="3306", protocol=tcp]
logpath  = /var/log/mysql/error.log
maxretry = 5
findtime = 600
bantime  = 86400
```

> **Best Practice:** ViciDial's MySQL should **never** be exposed to the public internet. Use `bind-address = 127.0.0.1` in `my.cnf` unless you have a multi-server cluster (in which case, bind only to the private network interface and use firewall rules to whitelist cluster IPs).

---

## 8. Jail 6 — Asterisk Manager Interface (AMI)

> **Why?** AMI (port 5038) is used by ViciDial to control Asterisk. If exposed, attackers can originate calls, modify dial plans, and exfiltrate data. Failed AMI logins are logged to the Asterisk messages log.

### Custom Filter

Create `/etc/fail2ban/filter.d/asterisk-ami.conf`:

```ini
# /etc/fail2ban/filter.d/asterisk-ami.conf
# Fail2Ban filter for Asterisk Manager Interface (AMI) authentication failures

[INCLUDES]
before = common.conf

[Definition]
failregex = ^.*NOTICE.*manager\.c:.*<HOST> failed to authenticate.*$
            ^.*NOTICE.*manager\.c:.*<HOST>.*tried to authenticate with nonexistent user.*$
            ^.*SECURITY.*SecurityEvent="FailedACL".*RemoteAddress.*IPV4/TCP/<HOST>/.*$
            ^.*SECURITY.*SecurityEvent="InvalidPassword".*RemoteAddress.*IPV4/TCP/<HOST>/.*$

ignoreregex =
```

### Jail Configuration

```ini
[asterisk-ami]
enabled  = true
filter   = asterisk-ami
action   = iptables-allports[name=AMI, protocol=tcp]
logpath  = /var/log/asterisk/messages
maxretry = 3
findtime = 600
bantime  = 6048000
```

> **Best Practice:** AMI should **never** be exposed to the public internet. Bind AMI to `127.0.0.1` in `/etc/asterisk/manager.conf` and use SSH tunnels or a private VLAN for multi-server setups. The fail2ban jail is a safety net.

---

## 9. Jail 7 — WebRTC (WSS on Port 8089)

> **Why?** WebRTC endpoints (used by ViciPhone / browser-based agent softphones) run over secure WebSocket (WSS) on port 8089. Authentication failures are logged by Asterisk's HTTP server and SIP subsystem. The same Asterisk filter catches WebRTC SIP authentication failures.

### Custom Filter

Create `/etc/fail2ban/filter.d/asterisk-webrtc.conf`:

```ini
# /etc/fail2ban/filter.d/asterisk-webrtc.conf
# Fail2Ban filter for Asterisk WebRTC / HTTP / WSS authentication failures

[INCLUDES]
before = common.conf

[Definition]
failregex = ^.*NOTICE.*chan_sip\.c:.*Failed to authenticate device.*<HOST>.*$
            ^.*NOTICE.*res_pjsip.*Failed to authenticate.*<HOST>.*$
            ^.*SECURITY.*SecurityEvent="InvalidPassword".*RemoteAddress.*IPV4/TCP/<HOST>/.*$
            ^.*SECURITY.*SecurityEvent="ChallengeResponseFailed".*RemoteAddress.*IPV4/TCP/<HOST>/.*$
            ^.*SECURITY.*SecurityEvent="FailedACL".*RemoteAddress.*IPV4/TCP/<HOST>/.*$
            ^.*WARNING.*res_http_websocket\.c:.*WebSocket connection from <HOST>.*rejected.*$

ignoreregex =
```

### Jail Configuration

```ini
[asterisk-webrtc]
enabled  = true
filter   = asterisk-webrtc
action   = iptables-multiport[name=WEBRTC, port="8088,8089", protocol=tcp]
logpath  = /var/log/asterisk/messages
maxretry = 5
findtime = 600
bantime  = 86400
```

---

## 10. Jail 8 — ViciBox Dynamic Portal

> **Why?** The ViciBox Dynamic Portal (typically served on port 446 via Apache) provides a web-based login for managing ViciBox settings. Brute-force attempts on this portal appear in the Apache SSL error log.

### Custom Filter

Create `/etc/fail2ban/filter.d/vicibox-portal.conf`:

```ini
# /etc/fail2ban/filter.d/vicibox-portal.conf
# Fail2Ban filter for ViciBox Dynamic Portal login failures

[INCLUDES]
before = common.conf

[Definition]
failregex = ^.*client <HOST>.*user .* authentication failure.*$
            ^.*client <HOST>.*Authorization not granted.*$
            ^<HOST> -.*"POST.*/vicibox-portal/login.*" (401|403).*$
            ^<HOST> -.*"POST.*/admin/login.*" (401|403).*$

ignoreregex =
```

### Jail Configuration

```ini
[vicibox-portal]
enabled  = true
filter   = vicibox-portal
action   = iptables-multiport[name=VICIBOX-PORTAL, port="443,446", protocol=tcp]
logpath  = /var/log/apache2/ssl_error_log
           /var/log/apache2/error_log
maxretry = 5
findtime = 600
bantime  = 86400
```

---

## 11. Jail 9 — Dovecot (IMAP / POP3)

> **Why?** If the ViciDial server also handles email (voicemail-to-email, inbound email campaigns), Dovecot handles IMAP/POP3. Brute-force attacks on email credentials are extremely common.

```ini
[dovecot]
enabled  = true
filter   = dovecot
action   = iptables-multiport[name=DOVECOT, port="110,143,993,995", protocol=tcp]
logpath  = /var/log/dovecot.log
           /var/log/mail.log
maxretry = 5
findtime = 600
bantime  = 86400
```

> **Note:** Only enable this jail if Dovecot is installed and running. Most pure ViciDial servers do not run an IMAP/POP3 service.

---

## 12. Jail 10 — Postfix (SMTP / SASL)

> **Why?** If Postfix is configured for outbound email (voicemail notifications, campaign reports), SASL authentication failures indicate brute-force attempts to relay spam through your server.

```ini
[postfix]
enabled  = true
filter   = postfix
action   = iptables-multiport[name=POSTFIX, port="25,465,587", protocol=tcp]
logpath  = /var/log/mail.log
           /var/log/maillog
maxretry = 5
findtime = 600
bantime  = 86400

[postfix-sasl]
enabled  = true
filter   = postfix[mode=auth]
action   = iptables-multiport[name=POSTFIX-SASL, port="25,465,587", protocol=tcp]
logpath  = /var/log/mail.log
           /var/log/maillog
maxretry = 3
findtime = 600
bantime  = 6048000
```

> **Note:** Only enable if Postfix is installed. Adjust `logpath` to match your mail log location.

---

## 13. Jail 11 — Recidive (Repeat Offenders)

> **Why?** The recidive jail monitors Fail2Ban's own log. If an IP gets banned by **any** jail multiple times, recidive issues a longer (or permanent) ban across **all ports**. This catches persistent attackers who rotate attack vectors.

```ini
# ─── WARNING ───
# Ensure fail2ban.conf loglevel is NOT set to DEBUG
# or this jail will feed itself in an infinite loop.

[recidive]
enabled  = true
filter   = recidive
action   = iptables-allports[name=RECIDIVE, protocol=all]
logpath  = /var/log/fail2ban.log
maxretry = 5
findtime = 43200      ; 12 hours
bantime  = 6048000    ; ~70 days
```

### 13.1 — Centralized Fail2Ban (Multi-Server Ban Propagation)

> **Goal:** If an IP is banned on one server, it is banned on all servers.

For multi-server ViciDial environments, deploy a central ban feed so each node enforces the same threat intelligence. This prevents attackers from rotating across nodes after being blocked on one dialer.

#### Option A — Shared Ban List via Config Management (Simple)

1. Ship `fail2ban.log` from all nodes to Loki/ELK/SIEM.
2. Extract ban events (`Ban <IP>`) into a central list.
3. Distribute the list back to all nodes every 1-5 minutes.
4. Apply to a dedicated firewall set (e.g., `ipset f2b-global`) referenced by iptables.

#### Option B — Message Bus / API Fan-Out (Real-Time)

1. Each node publishes ban/unban events to a central service (Redis, NATS, RabbitMQ, or webhook API).
2. All nodes subscribe and apply events immediately to local firewall sets.
3. Use TTL equal to `bantime` so bans expire consistently.

#### Example: Global `ipset` + iptables Hook

```bash
# One-time setup on each dialer:
ipset create f2b-global hash:ip timeout 0 -exist
iptables -I INPUT -m set --match-set f2b-global src -j DROP

# Add/remove replicated bans:
ipset add f2b-global 203.0.113.10 timeout 86400 -exist
ipset del f2b-global 203.0.113.10
```

> **Architecture recommendation:** If the platform is currently multi-tenant, split into single-tenant instances and apply centralized ban propagation across those instances. This gives stronger security isolation and cleaner operational boundaries per tenant.

---

## 14. Custom Filters

All custom filters created in this guide should be placed in `/etc/fail2ban/filter.d/`. Here is a summary:

| Filter File               | Purpose                                    | Section |
| ------------------------- | ------------------------------------------ | ------- |
| `asterisk.conf`           | SIP/IAX registration attacks (built-in)    | 3       |
| `sshd.conf`               | SSH brute-force (built-in)                 | 4       |
| `apache-auth.conf`        | Apache HTTP auth failures (built-in)       | 5       |
| `apache-badbots.conf`     | Bot/scanner blocking (built-in)            | 6       |
| `mysqld-auth.conf`        | MySQL/MariaDB login failures (custom)      | 7       |
| `asterisk-ami.conf`       | AMI authentication failures (custom)       | 8       |
| `asterisk-webrtc.conf`    | WebRTC/WSS auth failures (custom)          | 9       |
| `vicibox-portal.conf`     | ViciBox Portal login failures (custom)     | 10      |
| `dovecot.conf`            | IMAP/POP3 auth failures (built-in)         | 11      |
| `postfix.conf`            | SMTP/SASL auth failures (built-in)         | 12      |
| `recidive.conf`           | Repeat ban detection (built-in)            | 13      |

### Testing Filters Before Deployment

Always validate a custom filter against the actual log file before enabling the jail:

```bash
# Syntax: fail2ban-regex <logfile> <filter>
fail2ban-regex /var/log/asterisk/messages /etc/fail2ban/filter.d/asterisk-ami.conf
fail2ban-regex /var/log/mysql/error.log /etc/fail2ban/filter.d/mysqld-auth.conf
fail2ban-regex /var/log/asterisk/messages /etc/fail2ban/filter.d/asterisk-webrtc.conf
fail2ban-regex /var/log/apache2/ssl_error_log /etc/fail2ban/filter.d/vicibox-portal.conf
```

The output will show how many lines matched (`failregex`) vs how many were ignored (`ignoreregex`). If you see `0 matches`, the regex needs adjusting for your specific log format.

---

## 15. Grafana Monitoring Dashboard

> **Why Grafana instead of email?** Email alerts are noisy, easy to miss, and provide no historical context. A Grafana dashboard gives you real-time and historical visibility into ban activity, attacker geolocation, jail hit-rates, and trends — all from a single pane of glass.

### Dashboard

Import the **Fail2Ban Grafana Dashboard** (ID `22741`):

> <https://grafana.com/grafana/dashboards/22741-fail2ban/>

This dashboard provides:

- **Live ban/unban event feed** per jail
- **GeoIP heatmap** of attacker locations (requires GeoLite2 City database)
- **Ban count timeseries** per jail (Asterisk, SSH, Apache, MySQL, etc.)
- **Top banned IPs** table with country, city, and ban count
- **Jail breakdown** pie chart showing attack distribution across services

### Prerequisites

| Component              | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| **Grafana**            | Dashboard visualisation                              |
| **Loki**               | Log aggregation backend (receives fail2ban logs)     |
| **Grafana Alloy**      | Log collector (ships `/var/log/fail2ban.log` → Loki) |
| **GeoLite2-City.mmdb** | MaxMind GeoIP database for attacker heatmap          |

### Step 1 — Install Grafana Alloy

```bash
zypper install grafana-alloy
systemctl enable alloy
```

### Step 2 — Configure Alloy to Ship Fail2Ban Logs

Create or edit `/etc/alloy/config.alloy`:

```hcl
// ─────────────────────────────────────────────────────
// Fail2Ban log → Loki with GeoIP enrichment
// ─────────────────────────────────────────────────────

local.file_match "fail2ban" {
    path_targets = [{
        __address__ = "localhost",
        __path__    = "/var/log/fail2ban.log",
        job         = "fail2ban",
    }]
}

loki.process "fail2ban" {
    forward_to = [loki.write.loki.receiver]

    // ── Parse multi-line log entries ──
    stage.multiline {
        firstline     = "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}"
        max_wait_time = "10s"
    }

    // ── Extract structured fields ──
    stage.regex {
        expression = "^(?s)(?P<time>\\S+? \\S+?) (fail2ban\\.)(?P<component>\\S+)\\s* \\[(?P<pid>\\S+)\\]: (?P<priority>\\S+)\\s* (?P<message>.*?)$"
    }

    stage.timestamp {
        source = "time"
        format = "2006-01-02 15:04:05,000"
    }

    stage.labels {
        values = {
            component = null,
            priority  = null,
        }
    }

    stage.output {
        source = "message"
    }

    // ── Extract jail name ──
    stage.match {
        selector = "{job=\"fail2ban\"} |~ \"\\\\[\\\\S+\\\\] .*\""

        stage.regex {
            expression = "(\\[(?P<jail>\\S+)\\] )?(?P<message>.*?)$"
        }

        stage.labels {
            values = {
                jail = null,
            }
        }

        stage.output {
            source = "message"
        }
    }

    // ── Extract IP address ──
    stage.regex {
        expression = ".*?(?P<remote_addr>\\d+\\.\\d+\\.\\d+\\.\\d+).*"
    }

    // ── GeoIP enrichment (heatmap) ──
    stage.geoip {
        db      = "/etc/alloy/GeoLite2-City.mmdb"
        source  = "remote_addr"
        db_type = "city"
    }

    stage.labels {
        values = {
            geoip_city_name          = "",
            geoip_country_name       = "",
            geoip_country_code       = "",
            geoip_continent_name     = "",
            geoip_continent_code     = "",
            geoip_location_latitude  = "",
            geoip_location_longitude = "",
            geoip_postal_code        = "",
            geoip_timezone           = "",
            geoip_subdivision_name   = "",
            geoip_subdivision_code   = "",
        }
    }

    stage.label_drop {
        values = ["filename"]
    }
}

loki.source.file "fail2ban" {
    targets    = local.file_match.fail2ban.targets
    forward_to = [loki.process.fail2ban.receiver]
}

loki.write "loki" {
    endpoint {
        url = "http://localhost:3100/loki/api/v1/push"
    }
}
```

### Step 3 — Download GeoLite2 Database

Use the `wp-statistics/GeoLite2-City` mirror/CDN database (`.mmdb.gz`) and extract it locally:

```bash
# Download compressed GeoLite2 City database from jsDelivr CDN
wget -O /tmp/GeoLite2-City.mmdb.gz "https://cdn.jsdelivr.net/npm/geolite2-city/GeoLite2-City.mmdb.gz"

# Decompress and place where Alloy can read it
gunzip -c /tmp/GeoLite2-City.mmdb.gz > /etc/alloy/GeoLite2-City.mmdb

# Optional cleanup
rm -f /tmp/GeoLite2-City.mmdb.gz
```

> Source repository: <https://github.com/wp-statistics/GeoLite2-City>

### Step 4 — Start Alloy & Import Dashboard

```bash
systemctl restart alloy

# Verify logs are flowing
journalctl -u alloy -f
```

In Grafana:

1. Go to **Dashboards → Import**
2. Enter dashboard ID **`22741`**
3. Select your **Loki** data source
4. Click **Import**

### What You Get

| Panel                     | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| **World Heatmap**         | Geographic distribution of banned IPs (GeoIP)              |
| **Ban Timeline**          | Time-series graph of bans per jail over time               |
| **Active Bans**           | Current number of active bans per jail                     |
| **Top Attackers**         | Table of most-banned IPs with country and hit count        |
| **Jail Distribution**     | Pie chart showing which services are targeted most         |
| **Event Log**             | Live feed of ban/unban events with IP, jail, and timestamp |

---

## 16. Verification & Management

### Apply Configuration

```bash
# Restart Fail2Ban to load all changes
systemctl restart fail2ban

# Check service status
systemctl status fail2ban
```

### Verify Active Jails

```bash
fail2ban-client status
```

Expected output (all jails enabled):

```txt
Status
|- Number of jail:      11
`- Jail list:   asterisk-iptables, ssh-iptables, apache-auth, apache-badbots,
                mysqld-auth, asterisk-ami, asterisk-webrtc, vicibox-portal,
                dovecot, postfix-sasl, recidive
```

### Check a Specific Jail

```bash
fail2ban-client status asterisk-iptables
```

Output:

```txt
Status for the jail: asterisk-iptables
|- Filter
|  |- Currently failed: 2
|  |- Total failed:     147
|  `- File list:        /var/log/asterisk/messages
`- Actions
   |- Currently banned: 5
   |- Total banned:     23
   `- Banned IP list:   203.0.113.10 198.51.100.42 ...
```

### Enable at Boot

```bash
systemctl enable fail2ban
```

---

## 17. Maintenance Commands

| Task                            | Command                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| Ban an IP manually              | `fail2ban-client set <JAIL> banip <IP>`                    |
| Unban an IP                     | `fail2ban-client set <JAIL> unbanip <IP>`                  |
| Unban from all jails            | `fail2ban-client unban <IP>`                               |
| List all banned IPs in a jail   | `fail2ban-client status <JAIL>`                            |
| Reload config (no restart)      | `fail2ban-client reload`                                   |
| Check fail2ban log for errors   | `tail -f /var/log/fail2ban.log`                            |
| Test a filter against a log     | `fail2ban-regex /path/to/log /path/to/filter.conf`         |
| Show iptables rules (banned)    | `iptables -L -n --line-numbers \| grep f2b`                |
| Flush all Fail2Ban iptables     | `fail2ban-client unban --all`                              |

### Periodic Log Rotation

Ensure `/var/log/fail2ban.log` is rotated to prevent disk-fill issues. Create or verify `/etc/logrotate.d/fail2ban`:

```txt
/var/log/fail2ban.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        fail2ban-client flushlogs >/dev/null 2>&1 || true
    endscript
}
```

---

## 18. References

- <https://www.vicidial.org/VICIDIALforum/viewtopic.php?t=38060> — ViciBox 8 Fail2Ban setup (100% working)
- <https://github.com/ashloverscn/Vicidial-Scratch-Install-AlmaLinux-8.8-x86_64-Minimal-Server/blob/main/install-fail2ban.sh> — Automated install script reference
- <https://www.dbvis.com/thetable/how-to-protect-mysql-with-fail2ban/> — MySQL Fail2Ban protection
- <https://www.linuxmaker.com/en/asterisk-pbx/firewall-on-the-asterisk.html> — Asterisk firewall hardening
- <https://oneuptime.com/blog/post/2026-03-02-how-to-configure-fail2ban-jails-for-ssh-apache-and-nginx-on-ubuntu/view> — SSH, Apache & Nginx jail configuration
- <https://www.nurango.ca/blog/securing-asterisk-using-fail2ban> — Securing Asterisk with Fail2Ban
- <https://grafana.com/grafana/dashboards/22741-fail2ban/> — Grafana Fail2Ban dashboard (Loki + GeoIP heatmap)
