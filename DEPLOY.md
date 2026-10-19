# HavenDesk — Production Deployment Guide

This guide explains how to deploy HavenDesk to a live server on the internet so your clients can access the portal at `app.yourdomain.com` and you can access the admin console at `admin.yourdomain.com`.

---

## 1. What You Need (VPS Server)

- **A cheap VPS (Virtual Private Server)**:
  - Recommended: **DigitalOcean**, **Hetzner**, or **Linode** ($5 to $10/month).
  - Operating System: **Ubuntu 22.04 LTS** or **Debian 12**.
  - Minimum specs: 1 vCPU, 1 GB RAM, 20 GB SSD.
- **A Domain Name**:
  - Example: `havendesk.com` from Namecheap, Cloudflare, or GoDaddy.

---

## 2. Server Setup (First 5 Minutes)

Log in to your VPS via SSH from your terminal:
```bash
ssh root@YOUR_SERVER_IP
```

Update packages and install Docker:
```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose git curl
systemctl enable --now docker
```

---

## 3. Upload or Clone HavenDesk

Clone your HavenDesk repository into `/opt/havendesk`:
```bash
git clone https://github.com/your-username/havendesk.git /opt/havendesk
cd /opt/havendesk
```

Copy the environment file and configure your domain:
```bash
cp .env.example .env
nano .env
```
*(Save changes with `Ctrl + O`, then exit with `Ctrl + X`)*.

---

## 4. Run HavenDesk with Docker (One Command)

Start the entire platform in the background:
```bash
docker compose up -d
```

Verify that it is running and healthy:
```bash
docker ps
curl http://localhost:3000/api/health
```
*(You will see `{"status":"ok","brand":"HavenDesk"}`)*.

---

## 5. Domain & Free SSL Setup (Caddy Reverse Proxy)

We recommend **Caddy** because it provisions and renews free SSL certificates (HTTPS) automatically with zero configuration.

### A. Point your DNS records
In your domain registrar (e.g., Cloudflare, Namecheap), create two `A` records pointing to your server's IP address:
- `app.yourdomain.com` &rarr; `YOUR_SERVER_IP`
- `admin.yourdomain.com` &rarr; `YOUR_SERVER_IP`

### B. Install Caddy on Ubuntu
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### C. Configure Caddyfile
Edit `/etc/caddy/Caddyfile`:
```caddy
app.yourdomain.com {
    reverse_proxy localhost:3000
}

admin.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Reload Caddy:
```bash
systemctl reload caddy
```
That's it! Your site is now live with automatic HTTPS encryption.

---

## 6. Alternative: Running Directly with Systemd (Without Docker)

If you prefer running directly on the host using Node.js 24:

1. Install Node.js 24:
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

2. Install dependencies:
```bash
cd /opt/havendesk
npm install --omit=dev
```

3. Create systemd service file `/etc/systemd/system/havendesk.service`:
```ini
[Unit]
Description=HavenDesk AI Receptionist
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/havendesk
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

4. Enable and start:
```bash
systemctl daemon-reload
systemctl enable --now havendesk
```

---

## 7. Automated SQLite Database Backups

HavenDesk stores all tenant records, calls, leads, and bookings safely in `server/db/havendesk.sqlite`.

To set up an automated daily backup:
1. Create a backup script at `/opt/havendesk/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/havendesk/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)

# Use SQLite's online vacuum backup command (safe even while database is active)
sqlite3 /opt/havendesk/server/db/havendesk.sqlite ".backup '$BACKUP_DIR/havendesk_$DATE.sqlite'"

# Delete backups older than 14 days
find "$BACKUP_DIR" -type f -name "*.sqlite" -mtime +14 -delete
```

2. Make executable:
```bash
chmod +x /opt/havendesk/backup.sh
```

3. Add to daily crontab:
```bash
crontab -e
# Add this line to run every night at 3:00 AM:
0 3 * * * /opt/havendesk/backup.sh
```

---

## 8. Updating to New Versions

When you pull new code or updates:
```bash
cd /opt/havendesk
git pull
docker compose build
docker compose up -d
```
Your database and tenant settings will remain completely intact in the persistent storage volume.
