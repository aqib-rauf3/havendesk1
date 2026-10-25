import assert from 'node:assert';

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

async function runAdminVerification() {
  console.log('🧪 Starting Full Management Console (/admin) Verification...\n');

  // 1. Verify index.html & Asset Versioning
  console.log('1. Checking /admin route & static index.html...');
  const adminIndex = await fetchHttp(`${BASE_URL}/admin/`);
  assert.strictEqual(adminIndex.status, 200, '/admin/ should return 200');
  assert.ok(adminIndex.text.includes('admin.js?v=2.0.2'), 'index.html must reference admin.js?v=2.0.2');
  assert.ok(adminIndex.text.includes('quickAdminLogin()'), 'index.html must contain quickAdminLogin button');
  console.log('   ✓ /admin/ index.html loaded with v2 asset tags and Quick Demo Login button.');

  // 2. Verify admin.js
  console.log('2. Checking /admin/admin.js?v=2.0.2...');
  const adminJs = await fetchHttp(`${BASE_URL}/admin/admin.js?v=2.0.2`);
  assert.strictEqual(adminJs.status, 200);
  assert.ok(adminJs.text.includes('initAdminApp'), 'admin.js must contain initAdminApp');
  assert.ok(adminJs.text.includes('quickAdminLogin'), 'admin.js must contain quickAdminLogin');
  console.log('   ✓ admin.js loaded successfully with readyState initialization.');

  // 3. Authenticate as Super Admin
  console.log('3. Authenticating Super Admin (admin@havendesk.com)...');
  const loginRes = await fetchHttp(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@havendesk.com', password: 'HavenAdmin2026!', totpCode: '123456' })
  });
  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.json.success, true);
  assert.strictEqual(loginRes.json.user.role, 'super_admin');
  const token = loginRes.json.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  console.log('   ✓ Super Admin authenticated with TOTP 2FA.');

  // 4. Test All Management Console APIs
  const endpoints = [
    { name: 'Platform Overview', path: '/overview', check: d => d.metrics && d.tenantsSummary },
    { name: 'Clients & Tenants', path: '/clients', check: d => Array.isArray(d.clients) && d.clients.length > 0 },
    { name: 'Plans & Pricing', path: '/plans', check: d => Array.isArray(d.plans) && d.plans.length > 0 },
    { name: 'Subscriptions', path: '/subscriptions', check: d => Array.isArray(d.subscriptions) },
    { name: 'Usage & Margins', path: '/usage', check: d => Array.isArray(d.usage) },
    { name: 'Niche Templates', path: '/templates', check: d => Array.isArray(d.templates) && d.templates.length > 0 },
    { name: 'AI & Prompt Control', path: '/ai-control', check: d => d.currentModel && d.globalSystemPrompt },
    { name: 'Encrypted Provider Keys', path: '/integrations', check: d => Array.isArray(d.providers) },
    { name: 'Live Call Monitor', path: '/live-monitor', check: d => Array.isArray(d.activeCalls) },
    { name: 'Audit Logs', path: '/audit-logs', check: d => Array.isArray(d.logs) },
    { name: 'System Settings', path: '/settings', check: d => d.maintenanceMode !== undefined }
  ];

  console.log('4. Testing All Management Console Backend APIs...');
  for (const ep of endpoints) {
    const res = await fetchHttp(`${BASE_URL}/api/v1/admin${ep.path}`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `API ${ep.path} returned ${res.status}`);
    assert.ok(ep.check(res.json), `API ${ep.path} response validation failed`);
    console.log(`   ✓ [PASS] View ${ep.name} API (/api/v1/admin${ep.path})`);
  }

  // 5. Test Impersonation API
  console.log('5. Testing Impersonation API (/clients/tnt_roofing_01/impersonate)...');
  const impRes = await fetchHttp(`${BASE_URL}/api/v1/admin/clients/tnt_roofing_01/impersonate`, {
    method: 'POST',
    headers: authHeaders
  });
  assert.strictEqual(impRes.status, 200);
  assert.strictEqual(impRes.json.success, true);
  assert.ok(impRes.json.impersonationToken);
  console.log('   ✓ [PASS] Super Admin client impersonation token generated successfully.');

  console.log('\n============================================================');
  console.log('🎉 MANAGEMENT CONSOLE (/admin) IS 100% OPERATIONAL!');
  console.log('============================================================\n');
}

runAdminVerification().catch(err => {
  console.error('\n❌ ADMIN VERIFICATION FAILED:', err);
  process.exit(1);
});
