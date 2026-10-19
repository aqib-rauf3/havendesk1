/**
 * HavenDesk Strict Multi-Tenant Isolation Middleware
 * Guarantees that clients can NEVER query, view, or modify another tenant's data.
 */

import { db } from '../db/database.js';

export function enforceTenantIsolation(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required for tenant context.' });
  }

  let effectiveTenantId = null;

  // Super Admin / Support with active impersonation
  if (['super_admin', 'support'].includes(req.user.role)) {
    if (req.user.impersonatedTenantId) {
      effectiveTenantId = req.user.impersonatedTenantId;
    } else if (req.headers['x-tenant-id']) {
      effectiveTenantId = req.headers['x-tenant-id'];
    } else if (req.query.tenantId) {
      effectiveTenantId = req.query.tenantId;
    }
  } else {
    // Client users (client_owner, client_staff) MUST ONLY use their own assigned tenant_id
    effectiveTenantId = req.user.tenant_id;

    // Reject any unauthorized attempt to spoof or query another tenant
    if (req.body && req.body.tenant_id && req.body.tenant_id !== effectiveTenantId) {
      return res.status(403).json({ error: 'Tenant isolation violation: cross-tenant access forbidden.' });
    }
    if (req.query && req.query.tenantId && req.query.tenantId !== effectiveTenantId) {
      return res.status(403).json({ error: 'Tenant isolation violation: cross-tenant query forbidden.' });
    }
  }

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'Missing tenant context for this operation.' });
  }

  // Load tenant record
  const tenant = db.get('SELECT * FROM tenants WHERE id = ?', [effectiveTenantId]);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant business not found.' });
  }

  req.tenantId = effectiveTenantId;
  req.tenant = tenant;
  next();
}

/**
 * Subscription Status Guard
 * Enforces lockout on mutation routes while allowing past data viewing
 * when subscription is suspended, canceled, or past_due.
 */
export function checkSubscriptionActive(req, res, next) {
  if (!req.tenant) return next();

  // Exclude billing/subscription routes from lockout so client can pay/update card
  const isBillingRoute = req.path.includes('/billing') || req.path.includes('/subscription') || req.path.includes('/plans');
  if (isBillingRoute) return next();

  const status = req.tenant.subscription_status;
  const isRestricted = ['suspended', 'canceled', 'past_due'].includes(status);

  if (isRestricted) {
    // Read-only access allowed for past data (GET)
    // Mutation actions (POST, PUT, DELETE, PATCH) are locked until payment is updated
    if (req.method !== 'GET') {
      return res.status(402).json({
        error: `Subscription is ${status}. Account editing and live receptionist actions are currently locked. Please update your payment method in Billing to restore full access.`,
        subscriptionStatus: status,
        paymentRequired: true
      });
    }
  }

  next();
}
