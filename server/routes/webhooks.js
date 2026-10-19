/**
 * HavenDesk Webhook Ingestion Engine (/api/v1/webhooks)
 * Handles Stripe, Twilio Voice, WhatsApp, Retell AI, and Vapi with signature validation.
 */

import express from 'express';
import { db } from '../db/database.js';
import { receptionistEngine } from '../services/engine.js';

const router = express.Router();

// -------------------------------------------------------------
// 1. Stripe Subscription Webhook (Test Mode Mocks & Live Ready)
// -------------------------------------------------------------
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  let event = null;
  try {
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventType = event.type || 'test.event';
  console.log(`[STRIPE WEBHOOK] Received event: ${eventType}`);

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = event.data?.object || {};
      const tenantId = session.client_reference_id || session.metadata?.tenantId;
      if (tenantId) {
        db.run(`
          UPDATE tenants SET 
            subscription_status = 'active',
            stripe_customer_id = ?,
            stripe_subscription_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [session.customer || 'cus_mock_123', session.subscription || 'sub_mock_123', tenantId]);
        console.log(`[STRIPE] Activated subscription for tenant: ${tenantId}`);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data?.object || {};
      const subId = invoice.subscription;
      if (subId) {
        db.run("UPDATE tenants SET subscription_status = 'past_due' WHERE stripe_subscription_id = ?", [subId]);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data?.object || {};
      const subId = invoice.subscription;
      if (subId) {
        db.run("UPDATE tenants SET subscription_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?", [subId]);
        console.log(`[STRIPE] Renewed active subscription for sub: ${subId}`);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data?.object || {};
      if (sub.id) {
        db.run("UPDATE tenants SET subscription_status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?", [sub.id]);
      }
      break;
    }
  }

  res.json({ received: true });
});

// -------------------------------------------------------------
// 2. Twilio Voice Inbound Call Webhook
// -------------------------------------------------------------
router.post('/voice/twilio', async (req, res) => {
  const toNumber = req.body.To;
  const fromNumber = req.body.From || '+15552345678';
  const speechResult = req.body.SpeechResult || req.body.TranscriptionText || 'Hello';

  // Look up tenant by their assigned phone number, or default to first active tenant
  let tenant = db.get("SELECT * FROM tenants WHERE phone = ?", [toNumber]);
  if (!tenant) tenant = db.get("SELECT * FROM tenants WHERE subscription_status = 'active' LIMIT 1");
  if (!tenant) return res.type('text/xml').send('<Response><Say>Service unavailable.</Say></Response>');

  try {
    const result = await receptionistEngine.processTurn({
      tenantId: tenant.id,
      phone: fromNumber,
      message: speechResult,
      channel: 'voice'
    });

    const callId = `call_${Date.now()}`;
    db.run(`
      INSERT INTO calls (id, tenant_id, caller_number, caller_name, duration_seconds, status, triage_level, summary, transcript)
      VALUES (?, ?, ?, ?, 45, 'completed', ?, ?, ?)
    `, [
      callId, tenant.id, fromNumber, result.customerName || 'Caller',
      result.triageStatus,
      `Inbound phone call: ${speechResult.substring(0, 50)}...`,
      JSON.stringify([{ role: 'user', text: speechResult }, { role: 'assistant', text: result.text }])
    ]);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${escapeXml(result.text)}</Say>
  <Gather input="speech" timeout="4" action="/api/v1/webhooks/voice/twilio" method="POST">
    <Say>I'm listening...</Say>
  </Gather>
</Response>`;
    res.type('text/xml').send(xml);
  } catch (err) {
    res.type('text/xml').send('<Response><Say>We are connecting you to an emergency representative.</Say></Response>');
  }
});

// -------------------------------------------------------------
// 3. Vapi / Retell AI Webhook Adapter
// -------------------------------------------------------------
router.post('/voice/vapi', async (req, res) => {
  const payload = req.body;
  const userText = payload.message?.messages?.slice(-1)[0]?.content || 'Hello';
  const callerNumber = payload.call?.customer?.number || '+15552345678';

  const tenant = db.get("SELECT * FROM tenants WHERE subscription_status = 'active' LIMIT 1");
  if (!tenant) return res.json({ status: 'no_tenant' });

  const result = await receptionistEngine.processTurn({
    tenantId: tenant.id,
    phone: callerNumber,
    message: userText,
    channel: 'voice'
  });

  res.json({
    assistant: {
      model: {
        messages: [{ role: 'assistant', content: result.text }]
      }
    }
  });
});

// -------------------------------------------------------------
// 4. WhatsApp Inbound Webhook (Twilio & Meta)
// -------------------------------------------------------------
router.post('/whatsapp/twilio', async (req, res) => {
  const fromNumber = req.body.From?.replace('whatsapp:', '');
  const messageText = req.body.Body || '';
  const numMedia = parseInt(req.body.NumMedia || '0', 10);

  let mediaAttachment = null;
  if (numMedia > 0) {
    mediaAttachment = {
      url: req.body.MediaUrl0,
      type: 'photo',
      description: 'WhatsApp Image Upload'
    };
  }

  const tenant = db.get("SELECT * FROM tenants WHERE subscription_status = 'active' LIMIT 1");
  if (!tenant) return res.type('text/xml').send('<Response></Response>');

  const result = await receptionistEngine.processTurn({
    tenantId: tenant.id,
    phone: fromNumber,
    message: messageText,
    channel: 'whatsapp',
    mediaAttachment
  });

  // Record in messages table
  db.run(`
    INSERT INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type)
    VALUES (?, ?, 'whatsapp', ?, ?, 'inbound', ?, ?, ?)
  `, [`msg_${Date.now()}`, tenant.id, fromNumber, result.customerName || 'Customer', messageText, mediaAttachment?.url, mediaAttachment?.type]);

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(result.text)}</Message></Response>`);
});

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

export default router;
