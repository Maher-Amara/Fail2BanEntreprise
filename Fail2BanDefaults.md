# Fail2Ban Defaults

## Vicidial Log Files

```bash
crm231:/etc/fail2ban # tree /var/log/
/var/log/
├── acme-renew.log
├── acpid
├── alternatives.log
├── apache2
│   ├── access_log
│   ├── dynportal-error_log
│   ├── error_log
│   └── error_log-20260328.xz
├── apparmor
├── asterisk
│   ├── cdr-csv
│   ├── cdr-custom
│   ├── cel-custom
│   ├── messages
│   ├── messages.2026-03-27---121637.xz
│   ├── messages.2026-03-28---212458
│   ├── messages.2026-03-28---220435
│   ├── messages.2026-03-28---222516
│   └── queue_log
├── astguiclient
│   ├── action_process.2026-03-27.xz
│   ├── action_process.2026-03-28
│   ├── action_process.2026-03-29
│   ├── adapt.2026-03-27.xz
│   ├── adapt.2026-03-28
│   ├── adapt.2026-03-29
│   ├── adapt.2026-03-30
│   ├── archive
│   ├── audiostore.2026-03-27.xz
│   ├── congest.2026-03-27.xz
│   ├── congest.2026-03-28
│   ├── congest.2026-03-29
│   ├── congest.2026-03-30
│   ├── hopper.2026-03-27.xz
│   ├── hopper.2026-03-28
│   ├── hopper.2026-03-29
│   ├── hopper.2026-03-30
│   ├── listen.2026-03-27.xz
│   ├── listen.2026-03-28
│   ├── listen.2026-03-29
│   ├── listen.2026-03-30
│   ├── listen_process.2026-03-27.xz
│   ├── listen_process.2026-03-28
│   ├── listen_process.2026-03-29
│   ├── remoteagent.2026-03-27.xz
│   ├── remoteagent.2026-03-28
│   ├── remoteagent.2026-03-29
│   ├── remoteagent.2026-03-30
│   ├── screenlog.0
│   ├── screenlog.0.2026-03-27---121637.xz
│   ├── screenlog.0.2026-03-28---212458
│   ├── screenlog.0.2026-03-28---220435
│   ├── screenlog.0.2026-03-28---222516
│   ├── timeclockautologout.2026-03-27.xz
│   ├── timeclockautologout.2026-03-28.xz
│   ├── timeclockautologout.2026-03-29
│   ├── timeclockautologout.2026-03-30
│   ├── update.2026-03-27.xz
│   ├── update.2026-03-28
│   ├── update.2026-03-29
│   ├── VDadaptive---CALLBACK-QUEUE--.2026-03-27.xz
│   ├── VDadaptive---CALLBACK-QUEUE--.2026-03-28
│   ├── VDadaptive---CALLBACK-QUEUE--.2026-03-29
│   ├── VDadaptive---CALLBACK-QUEUE--.2026-03-30
│   ├── vdautodial.2026-03-27.xz
│   ├── vdautodial.2026-03-28
│   ├── vdautodial.2026-03-29
│   ├── vdautodial.2026-03-30
│   ├── vdautodial_FILL.2026-03-27.xz
│   ├── vdautodial_FILL.2026-03-28
│   ├── vdautodial_FILL.2026-03-29
│   └── vdautodial_FILL.2026-03-30
├── audit
│   ├── audit.log
│   ├── audit.log.1
│   ├── audit.log.2
│   ├── audit.log.3
├── boot.log
├── boot.log-20260328.xz
├── boot.log-20260329.xz
├── boot.msg
├── boot.omsg
├── btmp
├── btmp-20260327.xz
├── btmp-20260328.xz
├── btmp-20260329.xz
├── btmp-20260330.xz
├── chrony
├── cups
├── fail2ban.log
├── firewall
├── firewalld
├── krb5
├── lastlog
├── mail
├── mail.err
├── mail.info
├── mail.warn
├── messages
├── messages-20260328.xz
├── messages-20260329.xz
├── messages-20260330.xz
├── mysql
│   └── mysqld.log
├── NetworkManager
├── numad.log
├── pbl.log
├── plymouth-debug.log
├── plymouth-shutdown-debug.log
├── private
├── sa
├── samba
├── snapper.log
├── tallylog
├── tuned
│   └── tuned.log
├── vicibox.log
├── vicidial.log
├── warn
├── wtmp
├── YaST2
│   ├── config_diff_2025_01_21.log
│   ├── config_diff_2026_03_27.log
│   ├── control
│   │   ├── control.xml
│   │   └── README
│   ├── control-01
│   │   ├── control.xml
│   │   └── README
│   ├── control-02
│   │   ├── control.xml
│   │   └── README
│   ├── control-03
│   │   ├── control.xml
│   │   └── README
│   └── y2log
├── zypp
│   └── history
├── zypper.log
└── zypper.log-20260328.xz

23 directories, 118 files
crm231:/etc/fail2ban #
```

### phpMyAdmin

```bash
crm231:~ # sudo journalctl -t phpMyAdmin
Mar 30 18:04:31 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
Mar 30 18:04:34 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
Mar 30 18:04:37 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
crm231:~ # journalctl | grep phpMyAdmin
Mar 30 18:03:43 crm231 sudo[25948]:     root : TTY=pts/0 ; PWD=/root ; USER=root ; COMMAND=/usr/bin/journalctl -t phpMyAdmin
Mar 30 18:03:48 crm231 sudo[25959]:     root : TTY=pts/0 ; PWD=/root ; USER=root ; COMMAND=/usr/bin/journalctl -t phpMyAdmin
Mar 30 18:04:31 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
Mar 30 18:04:34 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
Mar 30 18:04:37 crm231 phpMyAdmin[21456]: user denied: test (mysql-denied) from 102.159.239.148
Mar 30 18:04:42 crm231 sudo[26067]:     root : TTY=pts/0 ; PWD=/root ; USER=root ; COMMAND=/usr/bin/journalctl -t phpMyAdmin
```

## Dovecot

```bash
journalctl -t dovecot
```

## FusionPBX Log files

```bash
maher@pbx153:~$ sudo tree /var/log/
/var/log/
|-- alternatives.log
|-- alternatives.log.1
|-- alternatives.log.2.gz
|-- alternatives.log.3.gz
|   |-- eipp.log.xz
|   |-- history.log
|   |-- history.log.1.gz
|   |-- history.log.2.gz
|   |-- history.log.3.gz
|   |-- term.log
|   |-- term.log.1.gz
|   |-- term.log.2.gz
|   `-- term.log.3.gz
|-- auth.log
|-- auth.log.1
|-- auth.log.2.gz
|-- auth.log.3.gz
|-- btmp
|-- btmp.1
|-- daemon.log
|-- daemon.log.1
|-- daemon.log.2.gz
|-- daemon.log.3.gz
|-- dpkg.log
|-- dpkg.log.1
|-- dpkg.log.2.gz
|-- f2b-agent.log
|-- fail2ban.log
|-- fail2ban.log.1
|-- fail2ban.log.2.gz
|-- fail2ban.log.3.gz
|-- freeswitch
|   |-- freeswitch.log
|   |-- freeswitch.log.1
|   |-- freeswitch.log.2
|   |-- freeswitch.log.3
|   |-- freeswitch.xml.fsxml
|   `-- xml_cdr
|-- kern.log
|-- kern.log.1
|-- kern.log.2.gz
|-- kern.log.3.gz
|-- lastlog
|-- mail.info
|-- mail.info.1
|-- mail.info.2.gz
|-- mail.info.3.gz
|-- mail.log
|-- mail.log.1
|-- mail.log.2.gz
|-- mail.log.3.gz
|-- mail.warn
|-- mail.warn.1
|-- messages
|-- messages.1
|-- messages.2.gz
|-- messages.3.gz
|-- nginx
|   |-- access.log
|   |-- access.log.1
|   |-- access.log.2.gz
|   |-- access.log.3.gz
|   |-- error.log
|   |-- error.log.1
|   |-- error.log.2.gz
|   |-- error.log.3.gz
|-- ntpstats
|-- php7.1-fpm.log
|-- php7.1-fpm.log.1
|-- php7.1-fpm.log.2.gz
|-- php7.1-fpm.log.3.gz
|-- postgresql
|   |-- postgresql-13-main.log
|   |-- postgresql-13-main.log.1
|   |-- postgresql-13-main.log.2.gz
|   |-- postgresql-13-main.log.3.gz
|-- syslog
|-- syslog.1
|-- syslog.2.gz
|-- syslog.3.gz
|-- sysstat
|-- user.log
|-- user.log.1
|-- user.log.2.gz
|-- wtmp
`-- wtmp.1

7 directories, 146 files
```

## already existing filtes

### Vicidial

```bash
crm231:/etc/fail2ban> ls /etc/fail2ban/filter.d/ | sort
3proxy.conf
apache-auth.conf
apache-badbots.conf
apache-botsearch.conf
apache-fakegooglebot.conf
apache-modsecurity.conf
apache-nohome.conf
apache-noscript.conf
apache-overflows.conf
apache-pass.conf
apache-shellshock.conf
assp.conf
asterisk.conf
bitwarden.conf
centreon.conf
counter-strike.conf
courier-auth.conf
courier-smtp.conf
cyrus-imap.conf
directadmin.conf
domino-smtp.conf
dovecot.conf
dropbear.conf
drupal-auth.conf
ejabberd-auth.conf
exim.conf
exim-spam.conf
freeswitch.conf
froxlor-auth.conf
gitlab.conf
grafana.conf
groupoffice.conf
gssftpd.conf
guacamole.conf
haproxy-http-auth.conf
horde.conf
ignorecommands
kerio.conf
lighttpd-auth.conf
mongodb-auth.conf
monit.conf
murmur.conf
mysqld-auth.conf
nagios.conf
named-refused.conf
nginx-botsearch.conf
nginx-http-auth.conf
nginx-limit-req.conf
nsd.conf
openhab.conf
openwebmail.conf
oracleims.conf
pam-generic.conf
perdition.conf
phpmyadmin-syslog.conf
php-url-fopen.conf
portsentry.conf
postfix.conf
proftpd.conf
pure-ftpd.conf
qmail.conf
recidive.conf
roundcube-auth.conf
screensharingd.conf
selinux-ssh.conf
sendmail-auth.conf
sendmail-reject.conf
sieve.conf
slapd.conf
softethervpn.conf
sogo-auth.conf
solid-pop3d.conf
squid.conf
squirrelmail.conf
sshd.conf
stunnel.conf
suhosin.conf
tine20.conf
traefik-auth.conf
uwimap-auth.conf
vsftpd.conf
webmin-auth.conf
wuftpd.conf
xinetd-fail.conf
znc-adminlog.conf
zoneminder.conf
```

### FusionPBX

```bash
maher@pbx244:~$ ls /etc/fail2ban/filter.d/ | sort
3proxy.conf
apache-auth.conf
apache-badbots.conf
apache-botsearch.conf
apache-common.conf
apache-fakegooglebot.conf
apache-modsecurity.conf
apache-nohome.conf
apache-noscript.conf
apache-overflows.conf
apache-pass.conf
apache-shellshock.conf
assp.conf
asterisk.conf
auth-challenge-ip.conf
bitwarden.conf
botsearch-common.conf
centreon.conf
common.conf
counter-strike.conf
courier-auth.conf
courier-smtp.conf
cyrus-imap.conf
directadmin.conf
domino-smtp.conf
dovecot.conf
dropbear.conf
drupal-auth.conf
ejabberd-auth.conf
exim-common.conf
exim-spam.conf
exim.conf
freeswitch-acl.conf
freeswitch-ip.conf
freeswitch.conf
froxlor-auth.conf
fusionpbx-404.conf
fusionpbx-mac.conf
fusionpbx.conf
gitlab.conf
grafana.conf
groupoffice.conf
gssftpd.conf
guacamole.conf
haproxy-http-auth.conf
horde.conf
ignorecommands
kerio.conf
lighttpd-auth.conf
mongodb-auth.conf
monit.conf
monitorix.conf
mssql-auth.conf
murmur.conf
mysqld-auth.conf
nagios.conf
named-refused.conf
nginx-404.conf
nginx-bad-request.conf
nginx-botsearch.conf
nginx-dos.conf
nginx-http-auth.conf
nginx-limit-req.conf
nsd.conf
openhab.conf
openwebmail.conf
oracleims.conf
pam-generic.conf
perdition.conf
php-url-fopen.conf
phpmyadmin-syslog.conf
portsentry.conf
postfix.conf
proftpd.conf
pure-ftpd.conf
qmail.conf
recidive.conf
roundcube-auth.conf
scanlogd.conf
screensharingd.conf
selinux-common.conf
selinux-ssh.conf
sendmail-auth.conf
sendmail-reject.conf
sieve.conf
sip-auth-challenge.conf
sip-auth-failure.conf
slapd.conf
softethervpn.conf
sogo-auth.conf
solid-pop3d.conf
squid.conf
squirrelmail.conf
sshd.conf
stunnel.conf
suhosin.conf
tine20.conf
traefik-auth.conf
uwimap-auth.conf
vsftpd.conf
webmin-auth.conf
wuftpd.conf
xinetd-fail.conf
znc-adminlog.conf
zoneminder.conf
```
