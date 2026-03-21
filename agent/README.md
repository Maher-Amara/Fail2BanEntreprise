# Fail2BanEntreprise Agent — Manual Installation

> Supported platforms:
> **ViciDial / ViciBox** (openSUSE/SLES)
> **FusionPBX** (Debian)
> **Generic Debian/Ubuntu**

---

## Files

| File                  | Destination                             | Purpose                    |
| --------------------- | ----------------------------------------|----------------------------|
| `agent.py`            | `/usr/local/bin/f2b-agent`              | Agent binary               |
| `f2b-agent.conf`      | `/etc/f2b-agent.conf`                   | Agent configuration        |
| `f2be.conf`           | `/etc/fail2ban/action.d/f2be.conf`      | Fail2Ban action definition |
| `vicidial.conf`       | `/etc/fail2ban/jail.local`              | jail.local for ViciDial    |
| `fusionpbx.conf`      | `/etc/fail2ban/jail.local`              | jail.local for FusionPBX   |
| `debian.conf`         | `/etc/fail2ban/jail.local`              | jail.local for  Debian     |
| `f2b-agent.service`   | `/etc/systemd/system/f2b-agent.service` | Systemd sync-loop daemon   |

---

## Step 1 — Clone the Repository in Home Directory

```bash
cd ~
git clone https://github.com/Maher-Amara/Fail2BanEntreprise.git
cd ~/Fail2BanEntreprise/agent
```

---

## Step 2 — Install Fail2Ban and ipset

**ViciDial / ViciBox (openSUSE / SLES):**

```bash
zypper install fail2ban ipset
```

**FusionPBX / Debian / Ubuntu:**

```bash
apt-get update && apt-get install -y fail2ban ipset
```

---

## Step 3 — Register This Server in the Dashboard

1. Log in at **<https://f2b.scopcall.com>**
2. Go to **Servers → Register New Server**
3. Enter this server's hostname (e.g. `dialer1.callpro.be`)
4. Copy the generated token — **shown only once**

---

## Step 4 — Install the Agent

```bash
# Copy agent binary
cp agent.py /usr/local/bin/f2b-agent
chmod +x /usr/local/bin/f2b-agent

# Verify
f2b-agent help
```

---

## Step 5 — Configure the Agent

```bash
cp f2b-agent.conf /etc/f2b-agent.conf
nano /etc/f2b-agent.conf
```

Set your token:

```ini
F2B_API_URL="https://f2b.scopcall.com"
F2B_API_KEY="your-server-token-here"   # from Step 2
F2B_SYNC_INTERVAL=60
F2B_IPSET_NAME="f2b-global"
```

---

## Step 6 — Install Fail2Ban Action

```bash
cp f2be.conf /etc/fail2ban/action.d/f2be.conf
```

---

## Step 7 — Install jail.local

Choose the file that matches your platform:

```bash
# ViciDial / ViciBox
cp vicidial.conf /etc/fail2ban/jail.local

# FusionPBX
cp fusionpbx.conf /etc/fail2ban/jail.local

# Generic Debian
cp debian.conf /etc/fail2ban/jail.local
```

> **⚠️ Before reloading:** Edit `jail.local` and verify the `ignoreip` line includes your office IP and VPN exit IP. Getting blocked by any jail locks out SSH + web + SIP simultaneously.

```ini
# Already set in all configs — adjust if needed:
ignoreip = 127.0.0.1/8 ::1 196.179.222.182 213.144.214.192/26 81.95.124.53/26
```

---

## Step 8 — Install Systemd Service

```bash
sudo cp f2b-agent.service /etc/systemd/system/f2b-agent.service
sudo systemctl daemon-reload
sudo systemctl enable f2b-agent
sudo systemctl restart f2b-agent
sudo systemctl status f2b-agent --no-pager
```

---

## Step 9 — Enable and Reload Fail2Ban

```bash
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Verify jails are active
sudo fail2ban-client status

# Verify agent is syncing
sudo journalctl -u f2b-agent -f
```

---

## Verify

```bash
# Active jails
sudo fail2ban-client status

# Agent sync log
sudo tail -f /var/log/f2b-agent.log

# Global ipset contents
sudo ipset list f2b-global | head -20

# iptables DROP rule for ipset
sudo iptables -L INPUT -n | grep f2b
```

---

## Maintenance

| Task | Command |
| --- | --- |
| Check a specific jail | `fail2ban-client status <jail>` |
| Reload Fail2Ban config | `fail2ban-client reload` |
| View blocked IPs | `iptables -L -n \| grep f2b` |
| Manual ban | `fail2ban-client set <jail> banip <ip>` |
| Unban locally | `fail2ban-client set <jail> unbanip <ip>` |
| Unban globally | Dashboard → Bans tab → Unban |
| Restart agent | `systemctl restart f2b-agent` |
| View agent log | `tail -f /var/log/f2b-agent.log` |

---

## Auth Model

| Endpoint | Auth | Called by |
| --- | --- | --- |
| `POST /api/ban` | `x-api-key` (per-server token) | Agent on Fail2Ban ban event |
| `GET /api/sync` | `x-api-key` (per-server token) | Agent sync-loop (every 60s) |
| `POST /api/unban` | JWT cookie | Dashboard admin only |

Ban expiry is handled by **Redis TTL** — agents do not need to call `/api/unban`.
