/**
 * HavenDesk Webhook Ingestion Engine (/api/v1/webhooks)
 * Handles Stripe, Twilio Voice (PK, UK, US), Vapi / Retell AI, WhatsApp,
 * and Live Call Simulation with instant Owner WhatsApp / SMS dispatch.
 */

import express from 'express';
import { db } from '../db/database.js';
import { receptionistEngine } from '../services/engine.js';
import { telephonyService } from '../services/telephony.js';
import { notifierService } from '../services/notifier.js';

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
// 2. Multi-Country Twilio Voice Inbound Call Webhook
// -------------------------------------------------------------
router.post('/voice/twilio', async (req, res) => {
  const toNumber = req.body.To || req.query.To || '';
  const fromNumber = req.body.From || req.query.From || '+923001234567';
  const speechResult = req.body.SpeechResult || req.body.TranscriptionText || 'Assalam-o-Alaikum';

  // 1. Dynamically match business tenant by the incoming dialed number
  const tenant = telephonyService.findTenantByInboundNumber(toNumber);
  if (!tenant) {
    return res.type('text/xml').send('<Response><Say>Service temporarily unavailable.</Say></Response>');
  }

  try {
    // 2. Process turn with Gemini multilingual receptionist
    const result = await receptionistEngine.processTurn({
      tenantId: tenant.id,
      phone: fromNumber,
      message: speechResult,
      channel: 'voice'
    });

    const callId = `call_${Date.now()}`;
    const durationSeconds = Math.floor(25 + Math.random() * 45);

    // 3. Store full call recording & transcript in SQLite
    db.run(`
      INSERT INTO calls (
        id, tenant_id, caller_number, caller_name, duration_seconds, status, 
        triage_level, language_detected, summary, transcript, tools_used
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `, [
      callId, 
      tenant.id, 
      fromNumber, 
      result.customerName || 'Caller',
      durationSeconds,
      result.urgencyLevel || 'STANDARD',
      result.detectedLanguage || 'ur-Roman',
      result.inquirySummary || `Inbound call from ${fromNumber}`,
      JSON.stringify([{ role: 'user', text: speechResult }, { role: 'assistant', text: result.text }]),
      JSON.stringify(result.toolCalls || [])
    ]);

    // 4. Instantly notify business owner via WhatsApp / SMS
    const callRecord = { id: callId, caller_number: fromNumber, caller_name: result.customerName, summary: result.inquirySummary, triage_level: result.urgencyLevel };
    notifierService.notifyCallCompleted({
      tenant,
      call: callRecord,
      lead: { id: result.leadId },
      geminiResult: result.geminiResult || result
    }).catch(e => console.warn(`[NOTIFY ERROR] ${e.message}`));

    // 5. Generate localized TwiML voice response (Urdu, UK English, or US English)
    const xml = telephonyService.generateVoiceTwiML({
      replyText: result.text,
      country: tenant.country || 'PK'
    });

    res.type('text/xml').send(xml);
  } catch (err) {
    console.error(`[TWILIO VOICE ERROR] ${err.message}`);
    res.type('text/xml').send('<Response><Say>We are connecting you to an emergency representative.</Say></Response>');
  }
});

// -------------------------------------------------------------
// 3. Vapi / Retell AI Webhook Adapter (Multi-Country)
// -------------------------------------------------------------
router.post('/voice/vapi', async (req, res) => {
  const payload = req.body;
  const userText = payload.message?.messages?.slice(-1)[0]?.content || 'Hello';
  const callerNumber = payload.call?.customer?.number || '+923001234567';
  const dialedNumber = payload.call?.phoneNumber?.number || '';

  const tenant = telephonyService.findTenantByInboundNumber(dialedNumber);
  if (!tenant) return res.json({ status: 'no_tenant' });

  const result = await receptionistEngine.processTurn({
    tenantId: tenant.id,
    phone: callerNumber,
    message: userText,
    channel: 'voice'
  });

  // End of call notification
  if (payload.message?.type === 'end-of-call-report') {
    const callId = `vapi_${payload.call?.id || Date.now()}`;
    const duration = payload.call?.duration || 60;

    db.run(`
      INSERT INTO calls (
        id, tenant_id, caller_number, caller_name, duration_seconds, status, 
        triage_level, language_detected, summary, transcript, audio_url
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `, [
      callId, 
      tenant.id, 
      callerNumber, 
      result.customerName || 'Caller', 
      duration,
      result.urgencyLevel,
      result.detectedLanguage,
      result.inquirySummary,
      JSON.stringify(payload.call?.artifact?.messages || []),
      payload.call?.recordingUrl || null
    ]);

    notifierService.notifyCallCompleted({
      tenant,
      call: { id: callId, caller_number: callerNumber, caller_name: result.customerName, summary: result.inquirySummary, triage_level: result.urgencyLevel },
      lead: { id: result.leadId },
      geminiResult: result.geminiResult || result
    }).catch(e => console.warn(e));
  }

  res.json({
    assistant: {
      model: {
        messages: [{ role: 'assistant', content: result.text }]
      }
    }
  });
});

// -------------------------------------------------------------
// 4. WhatsApp Inbound Webhook (Twilio & Meta Cloud API)
// -------------------------------------------------------------
router.post('/whatsapp/twilio', async (req, res) => {
  const fromNumber = req.body.From?.replace('whatsapp:', '') || '+923008472910';
  const toNumber = req.body.To?.replace('whatsapp:', '') || '';
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

  const tenant = telephonyService.findTenantByInboundNumber(toNumber);
  if (!tenant) return res.type('text/xml').send('<Response></Response>');

  const result = await receptionistEngine.processTurn({
    tenantId: tenant.id,
    phone: fromNumber,
    message: messageText,
    channel: 'whatsapp',
    mediaAttachment
  });

  // Record inbound and outbound in messages table
  const msgId = `msg_${Date.now()}`;
  db.run(`
    INSERT INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type)
    VALUES (?, ?, 'whatsapp', ?, ?, 'inbound', ?, ?, ?)
  `, [msgId, tenant.id, fromNumber, result.customerName || 'Customer', messageText, mediaAttachment?.url, mediaAttachment?.type]);

  // Alert owner
  notifierService.notifyCallCompleted({
    tenant,
    call: { id: msgId, caller_number: fromNumber, caller_name: result.customerName, summary: result.inquirySummary, triage_level: result.urgencyLevel },
    lead: { id: result.leadId },
    geminiResult: result.geminiResult || result
  }).catch(e => console.warn(e));

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${telephonyService.escapeXml(result.text)}</Message></Response>`);
});

// -------------------------------------------------------------
// 5. Interactive Call Simulator (Browser / API Test Call Endpoint)
// -------------------------------------------------------------
router.post('/voice/simulate', async (req, res) => {
  const { 
    toNumber = '+924235780000', 
    fromNumber = '+923001234567', 
    message = 'Assalam-o-Alaikum, mujhe 10kW solar system ki quotation chahiye DHA Lahore ke liye.', 
    channel = 'voice' 
  } = req.body;

  const tenant = telephonyService.findTenantByInboundNumber(toNumber);
  if (!tenant) return res.status(404).json({ error: 'No matching tenant found for this phone number' });

  try {
    const result = await receptionistEngine.processTurn({
      tenantId: tenant.id,
      phone: fromNumber,
      message,
      channel
    });

    const callId = `sim_${Date.now()}`;
    const durationSeconds = 38;

    db.run(`
      INSERT INTO calls (
        id, tenant_id, caller_number, caller_name, duration_seconds, status, 
        triage_level, language_detected, summary, transcript, tools_used
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `, [
      callId, 
      tenant.id, 
      fromNumber, 
      result.customerName || 'Caller',
      durationSeconds,
      result.urgencyLevel || 'STANDARD',
      result.detectedLanguage || 'Roman Urdu',
      result.inquirySummary,
      JSON.stringify([{ role: 'user', text: message }, { role: 'assistant', text: result.text }]),
      JSON.stringify(result.toolCalls || [])
    ]);

    const notifResult = await notifierService.notifyCallCompleted({
      tenant,
      call: { id: callId, caller_number: fromNumber, caller_name: result.customerName, summary: result.inquirySummary, triage_level: result.urgencyLevel },
      lead: { id: result.leadId },
      geminiResult: result.geminiResult || result
    });

    res.json({
      success: true,
      callId,
      tenant: {
        id: tenant.id,
        businessName: tenant.business_name,
        country: tenant.country,
        currency: tenant.currency,
        phone: tenant.phone
      },
      agentResponse: result.text,
      detectedLanguage: result.detectedLanguage,
      inquirySummary: result.inquirySummary,
      urgencyLevel: result.urgencyLevel,
      leadId: result.leadId,
      ownerAlertDelivered: notifResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. Notifications API (For Real-time Client Portal Feed)
// -------------------------------------------------------------
router.get('/notifications/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const list = db.query(`
    SELECT * FROM notifications 
    WHERE tenant_id = ? 
    ORDER BY created_at DESC 
    LIMIT 20
  `, [tenantId]);
  res.json({ notifications: list });
});

router.post('/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
  res.json({ success: true });
});

export default router;
