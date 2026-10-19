/**
 * HavenDesk Authentication & RBAC Middleware
 * Handles session tokens, roles, and admin impersonation.
 */

import { db } from '../db/database.js';

// In-memory active session token store (fast & revocable)
export const sessions = new Map();

export function createSession(user, impersonatedTenantId = null) {
  const token = `hvn_sess_${Math.random().toString(36).substring(2)}_${Date.now()}`;
  const sessionData = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id,
    name: user.name,
    impersonatedTenantId,
    createdAt: Date.now()
  };
  sessions.set(token, sessionData);
  return { token, session: sessionData };
}

export function destroySession(token) {
  return sessions.delete(token);
}

/**
 * Main auth middleware: extracts user and attaches to req
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  }

  if (!token || !sessions.has(token)) {
    req.user = null;
    return next();
  }

  const sess = sessions.get(token);
  // Verify user still exists in DB
  const user = db.get('SELECT id, email, name, role, tenant_id FROM users WHERE id = ?', [sess.userId]);
  if (!user) {
    sessions.delete(token);
    req.user = null;
    return next();
  }

  req.user = {
    ...user,
    impersonatedTenantId: sess.impersonatedTenantId || null,
    sessionToken: token
  };

  next();
}

/**
 * Require valid logged-in user
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

/**
 * Require specific roles (e.g. ['super_admin', 'support'])
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient privileges.' });
    }
    next();
  };
}
