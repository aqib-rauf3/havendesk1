/**
 * HavenDesk Public Embeddable Website Widget Routes (/api/v1/widget)
 * Enforces per-client public key, subscription active status, and domain allow-listing.
 */

import express from 'express';
import { db } from '../db/database.js';
import { receptionistEngine } from '../services/engine.js';
import { widgetRateLimiter } from '../middleware/security.js';

const router = express.Router();
router.use(widgetRateLimiter);

// GET /api/v1/widget/check
router.get('/check', (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing widget public key.' });

  const tenant = db.get("SELECT * FROM tenants WHERE widget_public_key = ?", [key]);
  if (!tenant) return res.status(404).json({ error: 'Invalid widget key.' });

  // Check subscription status
  const isRestricted = ['suspended', 'canceled', 'past_due'].includes(tenant.subscription_status);
  if (isRestricted) {
    return res.status(200).json({
      active: false,
      fallback: true,
      businessName: tenant.business_name,
      message: 'Receptionist temporarily unavailable, please call back soon.'
    });
  }

  // Domain allow-listing check
  const origin = req.get('origin') || req.get('referer');
  if (tenant.allowed_domains && tenant.allowed_domains !== '*' && origin) {
    const isAllowed = tenant.allowed_domains.split(',').some(d => origin.includes(d.trim()));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Domain unauthorized for this widget.' });
    }
  }

  let config = {};
  try { config = JSON.parse(tenant.receptionist_config || '{}'); } catch (e) { config = {}; }

  res.json({
    active: true,
    businessName: tenant.business_name,
    niche: tenant.niche,
    phone: tenant.phone,
    whatsapp: tenant.whatsapp,
    persona: config.receptionistPersona || { name: 'Sarah', greeting: 'Hello' },
    services: config.services || []
  });
});

// POST /api/v1/widget/chat
router.post('/chat', async (req, res) => {
  const { key, message, sessionId, customerName, phone } = req.body;
  if (!key || !message) return res.status(400).json({ error: 'Key and message are required.' });

  const tenant = db.get("SELECT * FROM tenants WHERE widget_public_key = ?", [key]);
  if (!tenant) return res.status(404).json({ error: 'Invalid widget key.' });

  const isRestricted = ['suspended', 'canceled', 'past_due'].includes(tenant.subscription_status);
  if (isRestricted) {
    return res.status(200).json({
      active: false,
      fallback: true,
      text: 'Receptionist temporarily unavailable, please call back soon or contact our office directly.'
    });
  }

  try {
    const userPhone = phone || `web_${sessionId || 'guest'}`;
    const result = await receptionistEngine.processTurn({
      tenantId: tenant.id,
      phone: userPhone,
      message,
      channel: 'web',
      customerName
    });

    // Record in messages table
    const msgId = `msg_${Date.now()}`;
    db.run(`
      INSERT INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text)
      VALUES (?, ?, 'web', ?, ?, 'inbound', ?)
    `, [msgId, tenant.id, userPhone, customerName || 'Website Visitor', message]);

    db.run(`
      INSERT INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text)
      VALUES (?, ?, 'web', ?, 'HavenDesk Receptionist', 'outbound', ?)
    `, [`msg_bot_${Date.now()}`, tenant.id, userPhone, result.text]);

    res.json({
      text: result.text,
      toolCalls: result.toolCalls,
      triageStatus: result.triageStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
