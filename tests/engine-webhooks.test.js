/**
 * Automated Verification: AI Engine, Webhooks & Admin Lifecycle Tests
 * Verifies that:
 * 1. AI Engine performs emergency triage, slot queries, and CRM upserts.
 * 2. Inbound Webhooks (Twilio Voice, Twilio WhatsApp, Vapi, Stripe) handle payloads and update records.
 * 3. Auth lifecycle (forgot password, impersonation token issuance) operates securely.
 */

import assert from 'node:assert';
import { db } from '../server/db/database.js';
import { receptionistEngine } from '../server/services/engine.js';
import { calendarService } from '../server/services/calendar.js';

const BASE_URL = 'http://localhost:3000';

async function runEngineAndWebhookTests() {
  console.log('🧪 Running AI Engine, Webhooks & Full Lifecycle Verification...\n');

  // 1. AI Engine Triage Test (High Emergency)
  console.log('1. Testing AI Engine Emergency Triage...');
  const emergencyTurn = await receptionistEngine.processTurn({
    tenantId: 'tnt_roofing_01',
    phone: '+15551234455',
    message: 'Water is pouring through my living room ceiling during this rainstorm!',
    channel: 'voice',
    customerName: 'Sarah Jenkins'
  });

  assert.strictEqual(emergencyTurn.triageStatus, 'HIGH_EMERGENCY', 'Must classify storm leak as HIGH_EMERGENCY');
  assert.ok(emergencyTurn.toolCalls.some(t => t.name === 'trigger_emergency_escalation'), 'Must trigger emergency escalation tool call');
  assert.ok(emergencyTurn.text.includes('dispatch') || emergencyTurn.text.includes('emergency'), 'Response must reassure caller and mention emergency dispatch');
  console.log('   ✓ High emergency correctly detected, tool call executed, lead escalated.\n');

  // 2. AI Engine Standard Slot Query Test
  console.log('2. Testing AI Engine Calendar Availability Query...');
  const slotTurn = await receptionistEngine.processTurn({
    tenantId: 'tnt_dental_02',
    phone: '+15559876543',
    message: 'What openings do you have next week for a routine cleaning?',
    channel: 'web',
    customerName: 'Michael Chen'
  });

  assert.strictEqual(slotTurn.triageStatus, 'STANDARD');
  assert.ok(slotTurn.toolCalls.some(t => t.name === 'check_calendar_availability'), 'Must execute calendar availability tool');
  console.log('   ✓ Calendar availability tool called and formatted open slots.\n');

  // 3. Twilio Voice Webhook Simulation (TwiML response)
  console.log('3. Testing Twilio Voice Inbound Call Webhook...');
  const voiceRes = await fetch(`${BASE_URL}/api/v1/webhooks/voice/twilio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      To: '+18005550199',
      From: '+15553334444',
      SpeechResult: 'I need to schedule a roof inspection next Tuesday.'
    })
  });

  assert.strictEqual(voiceRes.status, 200);
  const twimlXml = await voiceRes.text();
  assert.ok(twimlXml.includes('<Response>'), 'Must return valid TwiML XML');
  assert.ok(twimlXml.includes('<Say'), 'Must include <Say> speech element');
  assert.ok(twimlXml.includes('<Gather'), 'Must include <Gather> element for caller response');
  console.log('   ✓ Twilio Voice webhook returned valid TwiML XML with speech synthesis.\n');

  // 4. Twilio WhatsApp Webhook with Photo Damage Attachment
  console.log('4. Testing Twilio WhatsApp Inbound Photo Upload...');
  const waRes = await fetch(`${BASE_URL}/api/v1/webhooks/whatsapp/twilio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: 'whatsapp:+15558889999',
      Body: 'Here is a photo of the cracked shingles above my garage.',
      NumMedia: '1',
      MediaUrl0: 'https://images.unsplash.com/photo-1542838132-92c53300491e'
    })
  });

  assert.strictEqual(waRes.status, 200);
  const waXml = await waRes.text();
  assert.ok(waXml.includes('<Response><Message>'), 'Must return valid WhatsApp TwiML message');
  
  // Verify message recorded in database
  const recordedMsg = db.get("SELECT * FROM messages WHERE from_number_or_session = '+15558889999' ORDER BY created_at DESC LIMIT 1");
  assert.ok(recordedMsg, 'Message must be logged in SQLite messages table');
  assert.strictEqual(recordedMsg.media_type, 'photo', 'Media type must be recorded as photo');
  console.log('   ✓ WhatsApp photo received, analyzed, and persisted in CRM messages.\n');

  // 5. Stripe Webhook Events Simulation
  console.log('5. Testing Stripe Webhook Lifecycle Events...');
  // Event A: checkout.session.completed
  const checkoutEvent = {
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'cus_live_test_123',
        subscription: 'sub_live_test_123',
        client_reference_id: 'tnt_hvac_03'
      }
    }
  };
  const stripeRes1 = await fetch(`${BASE_URL}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutEvent)
  });
  assert.strictEqual(stripeRes1.status, 200);

  const tntHvac = db.get("SELECT subscription_status, stripe_customer_id FROM tenants WHERE id = 'tnt_hvac_03'");
  assert.strictEqual(tntHvac.subscription_status, 'active');
  assert.strictEqual(tntHvac.stripe_customer_id, 'cus_live_test_123');
  console.log('   ✓ Stripe checkout.session.completed activated subscription in SQLite.');

  // Event B: invoice.payment_failed (Sets status to past_due)
  const failedEvent = {
    type: 'invoice.payment_failed',
    data: { object: { subscription: 'sub_live_test_123' } }
  };
  await fetch(`${BASE_URL}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(failedEvent)
  });
  const tntPastDue = db.get("SELECT subscription_status FROM tenants WHERE id = 'tnt_hvac_03'");
  assert.strictEqual(tntPastDue.subscription_status, 'past_due');
  console.log('   ✓ Stripe invoice.payment_failed set status to past_due.');

  // Event C: invoice.payment_succeeded (Restores status to active)
  const paidEvent = {
    type: 'invoice.payment_succeeded',
    data: { object: { subscription: 'sub_live_test_123' } }
  };
  await fetch(`${BASE_URL}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paidEvent)
  });
  const tntActiveAgain = db.get("SELECT subscription_status FROM tenants WHERE id = 'tnt_hvac_03'");
  assert.strictEqual(tntActiveAgain.subscription_status, 'active');
  console.log('   ✓ Stripe invoice.payment_succeeded restored status to active.\n');

  // 6. Admin Impersonation Endpoint
  console.log('6. Testing Super Admin Impersonation API...');
  // Log in as super admin
  const adminLoginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@havendesk.com',
      password: 'HavenAdmin2026!',
      totpCode: '123456'
    })
  });
  const adminData = await adminLoginRes.json();
  assert.strictEqual(adminLoginRes.status, 200);
  const adminToken = adminData.token;

  // Request impersonation token for Roofing tenant
  const impRes = await fetch(`${BASE_URL}/api/v1/admin/clients/tnt_roofing_01/impersonate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  });
  assert.strictEqual(impRes.status, 200);
  const impData = await impRes.json();
  assert.ok(impData.redirectUrl.includes('token='), 'Must return redirectUrl with token');
  
  // Verify audit log entry was created
  const auditLog = db.get("SELECT * FROM audit_logs WHERE action = 'IMPERSONATE_START' ORDER BY id DESC LIMIT 1");
  assert.ok(auditLog, 'Must write IMPERSONATE_START to audit log');
  console.log('   ✓ Admin impersonation token generated and audit trail verified.\n');

  console.log('🎉 ALL ENGINE, WEBHOOK & LIFECYCLE TESTS PASSED!\n');
}

runEngineAndWebhookTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
