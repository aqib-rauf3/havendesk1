/**
 * Verification test for Portal Enhancements:
 * 1. Leads CRUD (POST & PUT)
 * 2. 5 Automation Dispatches with simulation payload
 * 3. Integrations domain allow-list update
 * 4. Enriched Reports KPIs and export-leads.csv
 * 5. Selective scenario responses in AI engine
 */

import assert from 'node:assert';
import { db } from '../server/db/database.js';
import { receptionistEngine } from '../server/services/engine.js';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Verifying Portal Enhancements & New Endpoints...');

  // Log in as Vanguard Roofing owner
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@vanguardroofing.com', password: 'ClientPass2026!' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  const token = loginData.token;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 1. Test POST /leads
  console.log('\n1. Testing POST /api/v1/portal/leads...');
  const testPhone = `+1 (555) 777-${Math.floor(1000 + Math.random() * 9000)}`;
  const addLeadRes = await fetch(`${BASE_URL}/api/v1/portal/leads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Alexander Hamilton',
      phone: testPhone,
      address: '55 Wall St, New York',
      triageStatus: 'HIGH_EMERGENCY',
      status: 'NEW',
      estimatedValue: 14500,
      initialNote: 'Severe hail damage reported on historic slate roof.'
    })
  });
  const addLeadData = await addLeadRes.json();
  assert.strictEqual(addLeadData.success, true);
  console.log('   ✓ Lead created successfully with ID:', addLeadData.leadId);

  // 2. Test PUT /leads/:id
  console.log('\n2. Testing PUT /api/v1/portal/leads/:id...');
  const updateLeadRes = await fetch(`${BASE_URL}/api/v1/portal/leads/${addLeadData.leadId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: 'Alexander Hamilton',
      status: 'ESTIMATE_SCHEDULED',
      estimated_value: 16000
    })
  });
  const updateLeadData = await updateLeadRes.json();
  assert.strictEqual(updateLeadData.success, true);
  const verifyLead = db.get("SELECT status, estimated_value FROM leads WHERE id = ?", [addLeadData.leadId]);
  assert.strictEqual(verifyLead.status, 'ESTIMATE_SCHEDULED');
  assert.strictEqual(verifyLead.estimated_value, 16000);
  console.log('   ✓ Lead updated successfully to ESTIMATE_SCHEDULED ($16,000)');

  // 3. Test 5 Automation Dispatches
  console.log('\n3. Testing 5 Automation Dispatches (/automations/trigger)...');
  const autoTypes = ['MORNING_BRIEFING', '24H_REMINDER', 'SPEED_TO_LEAD', 'REVIEW_REQUEST', 'EMERGENCY_DISPATCH'];
  for (const type of autoTypes) {
    const res = await fetch(`${BASE_URL}/api/v1/portal/automations/trigger`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.automation, `Automation response for ${type} should have automation payload`);
    assert.ok(data.automation.previewText, `Automation should have preview text`);
    console.log(`   ✓ ${type} triggered: [${data.automation.channel}] -> ${data.automation.recipient}`);
  }

  // 4. Test POST /integrations/domains
  console.log('\n4. Testing Allowed Domains Update (/integrations/domains)...');
  const domainRes = await fetch(`${BASE_URL}/api/v1/portal/integrations/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ allowedDomains: 'vanguardroofing.com, *.vanguardroofing.com' })
  });
  const domainData = await domainRes.json();
  assert.strictEqual(domainData.success, true);
  const tenant = db.get("SELECT allowed_domains FROM tenants WHERE id = 'tnt_roofing_01'");
  assert.strictEqual(tenant.allowed_domains, 'vanguardroofing.com, *.vanguardroofing.com');
  console.log('   ✓ Allowed domains updated and verified in database');

  // 5. Test Enriched Reports & CSV Exports
  console.log('\n5. Testing Enriched Reports & CSV Exports...');
  const reportsRes = await fetch(`${BASE_URL}/api/v1/portal/reports`, { headers });
  const reportsData = await reportsRes.json();
  assert.ok(reportsData.kpis, 'Reports should contain kpis object');
  assert.ok(reportsData.kpis.conversionRate !== undefined, 'KPIs should have conversionRate');
  assert.ok(reportsData.channelBreakdown, 'Reports should have channelBreakdown');
  console.log(`   ✓ Reports KPIs verified: Conversion=${reportsData.kpis.conversionRate}%, EmergencyRate=${reportsData.kpis.emergencyRate}%`);

  const exportLeadsRes = await fetch(`${BASE_URL}/api/v1/portal/reports/export-leads.csv`, { headers });
  assert.strictEqual(exportLeadsRes.status, 200);
  const csvContent = await exportLeadsRes.text();
  assert.ok(csvContent.includes('Alexander Hamilton'), 'CSV should contain newly added lead');
  console.log('   ✓ Leads CSV exported successfully (' + csvContent.split('\n').length + ' rows)');

  // 6. Test Selective Engine Scenario Replies
  console.log('\n6. Testing Selective Emergency & Scenario Replies in AI Engine...');
  const tid = 'tnt_roofing_01';

  // Leak
  const leakTurn = await receptionistEngine.processTurn({
    tenantId: tid, phone: '+15550000001', message: 'Water is leaking through my ceiling right now from the storm!'
  });
  assert.ok(/water is actively leaking|emergency tarping/i.test(leakTurn.text), 'Leak should trigger water/tarping reply');
  console.log('   ✓ Leak scenario response verified');

  // Toothache
  const toothTurn = await receptionistEngine.processTurn({
    tenantId: tid, phone: '+15550000002', message: 'I have a severe throbbing toothache and swelling!'
  });
  assert.ok(/dental emergencies|severe pain/i.test(toothTurn.text), 'Toothache should trigger dental relief reply');
  console.log('   ✓ Toothache scenario response verified');

  // Furnace
  const furnaceTurn = await receptionistEngine.processTurn({
    tenantId: tid, phone: '+15550000003', message: 'My furnace broke down and we have no heat in freezing cold!'
  });
  assert.ok(/no heat or a furnace failure|HVAC technician/i.test(furnaceTurn.text), 'Furnace should trigger HVAC reply');
  console.log('   ✓ Furnace scenario response verified');

  // Pricing
  const priceTurn = await receptionistEngine.processTurn({
    tenantId: tid, phone: '+15550000004', message: 'How much do you charge for a full inspection?'
  });
  assert.ok(/inspection are 100% free|free inspection/i.test(priceTurn.text), 'Pricing should trigger free inspection reply');
  console.log('   ✓ Pricing scenario response verified');

  // Short Greeting
  const greetingTurn = await receptionistEngine.processTurn({
    tenantId: tid, phone: '+15550000005', message: 'hello'
  });
  assert.ok(greetingTurn.text.split(' ').length < 15, 'Greeting should be under 15 words');
  console.log(`   ✓ Short greeting verified (${greetingTurn.text.split(' ').length} words): "${greetingTurn.text}"`);

  console.log('\n============================================================');
  console.log('🎉 ALL PORTAL ENHANCEMENT TESTS PASSED 100%!');
  console.log('============================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
