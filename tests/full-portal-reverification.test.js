import assert from 'node:assert';
import http from 'node:http';

const BASE_URL = 'http://localhost:3000';

async function fetchHttp(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {}
  return { status: res.status, headers: res.headers, text, json };
}

async function runReverification() {
  console.log('🧪 Starting Full Portal Re-Verification...\n');

  // 1. Verify index.html & Cache-Busting Tags
  console.log('1. Checking /app (index.html) and asset cache headers...');
  const appIndex = await fetchHttp(`${BASE_URL}/app/`);
  assert.strictEqual(appIndex.status, 200, '/app should return 200');
  assert.ok(appIndex.text.includes('portal.css?v=2.0.2'), 'index.html must reference portal.css?v=2.0.2');
  assert.ok(appIndex.text.includes('portal.js?v=2.0.2'), 'index.html must reference portal.js?v=2.0.2');
  assert.ok(appIndex.text.includes('havendesk-portal-v1'), 'index.html must contain legacy SW cache purger');
  console.log('   ✓ index.html cache-busting and legacy cache purger verified.');

  // 2. Verify portal.js Content & Headers
  console.log('2. Checking /app/portal.js?v=2.0.2...');
  const portalJs = await fetchHttp(`${BASE_URL}/app/portal.js?v=2.0.2`);
  assert.strictEqual(portalJs.status, 200);
  const ccHeader = portalJs.headers.get('cache-control') || '';
  assert.ok(ccHeader.includes('no-cache') || ccHeader.includes('no-store'), 'portal.js must have no-cache headers');
  
  // Verify all essential functions exist in portal.js
  const requiredFunctions = [
    'selectThread',
    'openImageLightbox',
    'closeLightbox',
    'openAddLeadModal',
    'openManageLeadModal',
    'filterCrmByStatus',
    'filterCrmTable',
    'runLiveBookingTest',
    'openRescheduleModal',
    'previewVoiceSample',
    'openDispatchPreviewModal',
    'triggerAutomationTest',
    'saveAllowedDomains'
  ];
  for (const fn of requiredFunctions) {
    assert.ok(portalJs.text.includes(fn), `portal.js must contain ${fn}`);
  }
  console.log(`   ✓ portal.js verified (${portalJs.text.length} bytes, no-cache headers active, all ${requiredFunctions.length} handlers present).`);

  // 3. Verify portal.css Content & Styles
  console.log('3. Checking /app/portal.css?v=2.0.2...');
  const portalCss = await fetchHttp(`${BASE_URL}/app/portal.css?v=2.0.2`);
  assert.strictEqual(portalCss.status, 200);
  const requiredStyles = [
    '.stat-card.interactive',
    '.stat-click-hint',
    '.photo-attachment-card',
    '.lightbox-overlay',
    '.crm-toolbar',
    '.filter-pill',
    '.dispatch-phone-mockup'
  ];
  for (const selector of requiredStyles) {
    assert.ok(portalCss.text.includes(selector), `portal.css must contain ${selector}`);
  }
  console.log(`   ✓ portal.css verified (all ${requiredStyles.length} modern UI selectors present).`);

  // 4. Verify Service Worker (sw.js)
  console.log('4. Checking /app/sw.js...');
  const swJs = await fetchHttp(`${BASE_URL}/app/sw.js?v=2.0.2`);
  assert.strictEqual(swJs.status, 200);
  assert.ok(swJs.text.includes('havendesk-portal-v2'), 'sw.js must use v2 cache name');
  assert.ok(swJs.text.includes('fetch(event.request)'), 'sw.js must use network-first strategy');
  console.log('   ✓ Service Worker sw.js verified with network-first and cache cleanup.');

  // 5. Authenticate Session
  console.log('5. Authenticating as Vanguard Roofing (owner@vanguardroofing.com)...');
  const loginRes = await fetchHttp(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@vanguardroofing.com', password: 'ClientPass2026!' })
  });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.json.token, 'Login should return auth token');
  const token = loginRes.json.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  console.log('   ✓ Authenticated successfully.');

  // 6. Test Overview API (Interactive Stat Cards Data)
  console.log('6. Testing Overview Data API (/api/v1/portal/overview)...');
  const overviewRes = await fetchHttp(`${BASE_URL}/api/v1/portal/overview`, { headers: authHeaders });
  assert.strictEqual(overviewRes.status, 200);
  const m = overviewRes.json.metrics;
  assert.ok(m.totalCalls >= 0);
  assert.ok(m.emergencyCalls >= 0);
  assert.ok(m.totalBookings >= 0);
  assert.ok(m.estimatedRevenue >= 0);
  console.log(`   ✓ Overview data verified: ${m.totalCalls} calls, ${m.emergencyCalls} emergencies, ${m.totalBookings} bookings, $${m.estimatedRevenue} revenue.`);

  // 7. Test Messages & Threads API
  console.log('7. Testing Messages & WhatsApp Threads API (/api/v1/portal/messages)...');
  const messagesRes = await fetchHttp(`${BASE_URL}/api/v1/portal/messages`, { headers: authHeaders });
  assert.strictEqual(messagesRes.status, 200);
  const threads = messagesRes.json.threads;
  assert.ok(Array.isArray(threads), 'threads must be an array');
  assert.ok(threads.length >= 2, 'Should have multiple threads seeded');
  const photoThread = threads.find(t => t.messages.some(m => m.media_url));
  assert.ok(photoThread, 'Should find at least one thread with inspection photo');
  console.log(`   ✓ Threads verified: ${threads.length} threads active, photo attachments present.`);

  // 8. Test CRM Leads API & Manage Actions
  console.log('8. Testing Leads CRM API (/api/v1/portal/leads)...');
  const leadsRes = await fetchHttp(`${BASE_URL}/api/v1/portal/leads`, { headers: authHeaders });
  assert.strictEqual(leadsRes.status, 200);
  const leads = leadsRes.json.leads;
  assert.ok(Array.isArray(leads));
  assert.ok(leads.length >= 3);
  
  // Test Adding a Lead
  const testPhone = `+1 (555) 888-${Math.floor(1000 + Math.random() * 9000)}`;
  const addLeadRes = await fetchHttp(`${BASE_URL}/api/v1/portal/leads`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Verification Customer',
      phone: testPhone,
      address: '100 Broadway, New York, NY',
      status: 'NEW',
      triageStatus: 'STANDARD',
      estimatedValue: 8500,
      initialNote: 'Automated reverification test lead note.'
    })
  });
  assert.strictEqual(addLeadRes.status, 200);
  assert.strictEqual(addLeadRes.json.success, true);
  const newLeadId = addLeadRes.json.leadId;

  // Test Managing / Updating the Lead
  const updateLeadRes = await fetchHttp(`${BASE_URL}/api/v1/portal/leads/${newLeadId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      status: 'ESTIMATE_SCHEDULED',
      estimated_value: 9200
    })
  });
  assert.strictEqual(updateLeadRes.status, 200);
  assert.strictEqual(updateLeadRes.json.success, true);
  console.log(`   ✓ CRM verified: Directory loaded (${leads.length} leads), created and updated lead ${newLeadId}.`);

  // 9. Test Calendar & Live Booking Test API
  console.log('9. Testing Calendar & Live Booking API...');
  const calRes = await fetchHttp(`${BASE_URL}/api/v1/portal/calendar`, { headers: authHeaders });
  assert.strictEqual(calRes.status, 200);
  
  const testBookingRes = await fetchHttp(`${BASE_URL}/api/v1/portal/calendar/book`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerName: 'Emma Watson',
      phone: '+1 (555) 432-8765',
      serviceName: 'Emergency Tarp & Leak Mitigation',
      timeSlot: 'Tomorrow at 11:00 AM'
    })
  });
  assert.strictEqual(testBookingRes.status, 200);
  assert.strictEqual(testBookingRes.json.success, true);
  console.log(`   ✓ Calendar verified: Live booking test passed (Code: ${testBookingRes.json.appointment.confirmationCode}).`);

  // 10. Test All 5 Scenarios in Live Simulator
  console.log('10. Testing Selective Scenarios in Live Call Simulator (/api/v1/portal/settings/test-call)...');
  const scenarios = [
    { name: 'Storm Leak', text: 'Water is pouring through my ceiling right now!', match: /water is actively leaking|emergency tarping/i },
    { name: 'Severe Toothache', text: 'I have a severe throbbing toothache and swelling!', match: /dental emergencies|severe pain/i },
    { name: 'Furnace Breakdown', text: 'My furnace broke down and we have no heat in freezing cold!', match: /no heat or a furnace failure|HVAC technician/i },
    { name: 'Pricing & Inspection', text: 'How much do you charge for an inspection?', match: /100% free|free inspection/i },
    { name: 'Confirm Booking', text: 'Yes please confirm and book the appointment', match: /confirmed your appointment|confirmation code/i }
  ];

  for (const s of scenarios) {
    const res = await fetchHttp(`${BASE_URL}/api/v1/portal/settings/test-call`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ speechInput: s.text })
    });
    assert.strictEqual(res.status, 200);
    assert.ok(s.match.test(res.json.text), `Scenario "${s.name}" response did not match expected regex. Got: "${res.json.text}"`);
    console.log(`   ✓ Scenario [${s.name}] answered correctly.`);
  }

  // 11. Test 5 Automations Dispatches
  console.log('11. Testing 5 Automations Dispatches (/api/v1/portal/automations/trigger)...');
  const autoTypes = ['MORNING_BRIEFING', '24H_REMINDER', 'SPEED_TO_LEAD', 'REVIEW_REQUEST', 'EMERGENCY_DISPATCH'];
  for (const type of autoTypes) {
    const res = await fetchHttp(`${BASE_URL}/api/v1/portal/automations/trigger`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.automation.previewText && res.json.automation.previewText.length > 20);
    console.log(`   ✓ Automation [${type}] triggered -> ${res.json.automation.channel}`);
  }

  // 12. Test Reports & CSV Exports
  console.log('12. Testing Reports & CSV Exports (/api/v1/portal/reports)...');
  const repRes = await fetchHttp(`${BASE_URL}/api/v1/portal/reports`, { headers: authHeaders });
  assert.strictEqual(repRes.status, 200);
  assert.ok(repRes.json.kpis);
  assert.ok(repRes.json.channelBreakdown);

  const csvCalls = await fetchHttp(`${BASE_URL}/api/v1/portal/reports/export.csv`, { headers: authHeaders });
  assert.strictEqual(csvCalls.status, 200);
  assert.ok(csvCalls.text.includes('CallID,CallerName'));

  const csvLeads = await fetchHttp(`${BASE_URL}/api/v1/portal/reports/export-leads.csv`, { headers: authHeaders });
  assert.strictEqual(csvLeads.status, 200);
  assert.ok(csvLeads.text.includes('LeadID,Name,Phone'));
  console.log('   ✓ Reports & CSV exports verified.');

  console.log('\n============================================================');
  console.log('🎉 RE-VERIFICATION 100% SUCCESSFUL — ALL ENHANCEMENTS ARE LIVE!');
  console.log('============================================================\n');
}

runReverification().catch(err => {
  console.error('\n❌ RE-VERIFICATION FAILED:', err);
  process.exit(1);
});
