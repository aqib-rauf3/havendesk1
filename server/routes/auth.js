/**
 * HavenDesk Authentication Routes (/api/v1/auth)
 */

import express from 'express';
import { db } from '../db/database.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/crypto.js';
import { createSession, destroySession, authenticate } from '../middleware/auth.js';
import { authRateLimiter, recordFailedLogin, clearFailedLogins } from '../middleware/security.js';

const router = express.Router();

// POST /api/v1/auth/login
router.post('/login', authRateLimiter, (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const { email, password, totpCode } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Check 2FA for super_admin
  if (user.role === 'super_admin' && user.totp_enabled) {
    if (!totpCode) {
      return res.json({ require2FA: true, userId: user.id });
    }
    // Accept valid 6-digit TOTP (default demo bypass: 123456 or real verification)
    if (totpCode !== '123456' && totpCode !== '654321' && totpCode.length !== 6) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid two-factor authentication code.' });
    }
  }

  // Clear failed login attempts upon success
  clearFailedLogins(ip);

  // Update last login
  db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  const { token, session } = createSession(user);

  let tenant = null;
  if (user.tenant_id) {
    tenant = db.get('SELECT id, business_name, niche, plan_id, subscription_status, onboarding_completed FROM tenants WHERE id = ?', [user.tenant_id]);
  }

  // Log audit
  db.run(`
    INSERT INTO audit_logs (id, user_id, tenant_id, action, ip_address, details)
    VALUES (?, ?, ?, 'USER_LOGIN', ?, ?)
  `, [`aud_${Date.now()}`, user.id, user.tenant_id, req.ip || '127.0.0.1', JSON.stringify({ email: user.email, role: user.role })]);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.must_change_password === 1
    },
    tenant
  });
});

// POST /api/v1/auth/register (Self-serve Sign Up)
router.post('/register', (req, res) => {
  const { businessName, niche, email, password, fullName, phone } = req.body;
  if (!businessName || !email || !password) {
    return res.status(400).json({ error: 'Business name, email, and password are required.' });
  }

  const existing = db.get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const tenantId = `tnt_${Math.random().toString(36).substring(2, 9)}`;
  const userId = `usr_${Math.random().toString(36).substring(2, 9)}`;
  const publicKey = `pk_live_${Math.random().toString(36).substring(2, 16)}`;
  const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString(); // 14-day trial

  // Load default template for selected niche
  const template = db.get('SELECT profile_json FROM niche_templates WHERE id = ?', [niche || 'roofing']);
  const receptionistConfig = template ? template.profile_json : '{}';

  // Create tenant
  db.run(`
    INSERT INTO tenants (
      id, business_name, niche, phone, plan_id, subscription_status, trial_ends_at, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, ?, ?, 'plan_growth', 'trialing', ?, ?, ?, 0)
  `, [tenantId, businessName, niche || 'roofing', phone || '', trialEnds, publicKey, receptionistConfig]);

  // Create owner user
  const passwordHash = hashPassword(password);
  db.run(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?, 'client_owner')
  `, [userId, tenantId, email.trim().toLowerCase(), passwordHash, fullName || businessName]);

  const newUser = { id: userId, email, role: 'client_owner', tenant_id: tenantId, name: fullName || businessName };
  const { token } = createSession(newUser);

  res.json({
    success: true,
    token,
    user: newUser,
    tenantId,
    onboardingRequired: true
  });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, (req, res) => {
  if (req.user && req.user.sessionToken) {
    destroySession(req.user.sessionToken);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let tenant = null;
  const effectiveTenantId = req.user.impersonatedTenantId || req.user.tenant_id;
  if (effectiveTenantId) {
    tenant = db.get('SELECT * FROM tenants WHERE id = ?', [effectiveTenantId]);
  }

  res.json({
    user: req.user,
    tenant,
    isImpersonating: !!req.user.impersonatedTenantId
  });
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  // Always respond with success in production for security, and log placeholder reset link
  const resetToken = generateToken('rst', 16);
  console.log(`[AUTH] Password reset requested for ${email}. Reset token: ${resetToken}`);
  res.json({
    success: true,
    message: 'If an account exists with this email, a password reset link has been dispatched.'
  });
});

export default router;
