# HavenDesk Security & Architecture Whitepaper

This document details the security model, cryptographic standards, multi-tenant isolation guarantees, and vulnerability reporting procedures for HavenDesk.

---

## 1. Multi-Tenant Isolation Guarantee

HavenDesk is designed from the ground up for strict multi-tenant software-as-a-service (SaaS) isolation:

1. **Logical Separation on Every Query**:
   - Every single database table storing operational data (`users`, `calls`, `messages`, `leads`, `appointments`, `automations`, `usage_records`) includes a `tenant_id` foreign key.
   - All SQL queries in `server/routes/portal.js` and `server/services/engine.js` enforce `WHERE tenant_id = ?`.
   - Automated test suite (`tests/tenant-isolation.test.js`) verifies that Client A cannot query, read, update, or delete data belonging to Client B.

2. **Tenant Context Enforced by Middleware**:
   - `server/middleware/tenant.js` validates that requests originating from non-admin accounts strictly resolve to `req.user.tenant_id`. Any client attempt to query another tenant ID results in an immediate `403 Forbidden: Tenant isolation violation`.

3. **Admin Impersonation Safeguards**:
   - Only users with the `super_admin` or `support` role can impersonate a client.
   - When impersonation is active, an audit record (`AUDIT_IMPERSONATE_START`) is permanently written to `audit_logs` with the admin's identity, client ID, and IP address.
   - An un-dismissible high-visibility banner is shown across the client portal to ensure total transparency.

---

## 2. Cryptography & Data Protection

1. **Password Hashing (Scrypt)**:
   - User passwords are never stored in plaintext.
   - HavenDesk uses Node.js's native cryptographic implementation of **scrypt** with unique 16-byte cryptographically secure random salts and cost parameters ($N=16384, r=8, p=1$).
   - Password verification is performed using `crypto.timingSafeEqual` to eliminate timing attack vectors.

2. **Encryption at Rest for External API Keys**:
   - Third-party credentials (Stripe secrets, Twilio auth tokens, Meta tokens, LLM API keys) are encrypted before writing to SQLite using **AES-256-GCM** (Galois/Counter Mode).
   - Each encrypted value contains an authentication tag and unique initialization vector (IV) to prevent tampering.
   - In the Management Console UI, API keys are always masked (e.g., `sk_live_••••••••38f1`) and never transmitted back to the browser in cleartext.

3. **Session Tokens**:
   - Sessions are signed with 64-character cryptographically random tokens (`crypto.randomBytes(32)`).
   - Super admins have mandatory Two-Factor Authentication (TOTP) enabled.

---

## 3. Web & Network Security Hardening

1. **Security HTTP Headers**:
   - `Content-Security-Policy`: Restricts script and asset origins to self and trusted font CDNs.
   - `X-Frame-Options: SAMEORIGIN`: Prevents clickjacking and unauthorized iframe framing.
   - `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing exploits.
   - `X-XSS-Protection: 1; mode=block`: Activates browser XSS filtering.
   - `Referrer-Policy: strict-origin-when-cross-origin`: Minimizes referrer leakage.

2. **Rate Limiting**:
   - **Authentication Endpoints**: Max 5 failed login attempts per 15 minutes per IP address. Exceeding this blocks requests with `429 Too Many Requests` to protect against brute-force attacks.
   - **Website Widget**: Max 60 requests per minute per IP address to prevent denial-of-service and bot spam.

3. **Input Sanitization**:
   - All inbound JSON payloads pass through recursive sanitization (`server/middleware/security.js`), stripping `<script>` tags, pseudo-protocols, and unsafe HTML injection.
   - All database queries use parameterized SQL placeholders (`?`), preventing SQL injection completely.

4. **Public Widget Token Validation**:
   - Every embeddable widget requires a unique per-tenant public key (`pk_live_...`).
   - Domain allow-listing is enforced: if configured, requests from unauthorized domains are rejected with `403 Forbidden`.

---

## 4. Security Checklist for Production

Before launching HavenDesk for paying customers, confirm the following:
- [ ] Change `SESSION_SECRET` in `.env` to a long, random string.
- [ ] Generate a unique `MASTER_ENCRYPTION_KEY` hex string in `.env`.
- [ ] Change default Super Admin password from `HavenAdmin2026!` to a unique passphrase.
- [ ] Ensure HTTPS/SSL is active via Caddy or Nginx reverse proxy.
- [ ] Set up automated daily database backups as described in `DEPLOY.md`.

---

## 5. Reporting Security Vulnerabilities

If you discover a security vulnerability in HavenDesk, please email **security@havendesk.com**. Do not disclose vulnerabilities in public issue trackers. We aim to acknowledge reports within 24 hours.
